/**
 * SOBRE MÍDIA ERP v3.0 — Observability Service
 * FASE 10.2 — Correlation IDs, Trace Context e Distributed Tracing
 *
 * Compatível com OpenTelemetry Semantic Conventions (OTLP-ready).
 * Funciona no frontend (Vite/React) sem dependência de servidor.
 */

export interface TraceContext {
  traceId: string;
  spanId: string;
  correlationId: string;
  empresaOperadoraId?: string;
  usuarioId?: string;
  startedAt: number;
}

export interface SpanData {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'OK' | 'ERROR' | 'UNSET';
  attributes: Record<string, string | number | boolean>;
  error?: string;
}

export interface ObservabilityConfig {
  serviceName: string;
  serviceVersion: string;
  environment: 'development' | 'staging' | 'production';
  exporterEndpoint?: string; // OTLP endpoint (ex: Grafana, Jaeger)
  enabled: boolean;
}

const DEFAULT_CONFIG: ObservabilityConfig = {
  serviceName: 'sobre-midia-erp',
  serviceVersion: '3.0.0',
  environment: (import.meta.env.MODE as any) || 'development',
  enabled: true,
};

// ─── Geração de IDs compatíveis com OpenTelemetry ────────────────────────────
function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateCorrelationId(): string {
  return `corr-${generateSpanId()}-${Date.now().toString(36)}`;
}

// ─── ObservabilityService ─────────────────────────────────────────────────────
export class ObservabilityService {
  private config: ObservabilityConfig;
  private activeSpans: Map<string, SpanData> = new Map();
  private completedSpans: SpanData[] = [];
  private currentContext: TraceContext | null = null;

  constructor(config: Partial<ObservabilityConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Contexto de Trace Atual ─────────────────────────────────────────────
  getCurrentContext(): TraceContext | null {
    return this.currentContext;
  }

  // ── Inicia um novo Trace (raiz de uma operação completa) ────────────────
  startTrace(operationName: string, empresaOperadoraId?: string, usuarioId?: string): TraceContext {
    const context: TraceContext = {
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      correlationId: generateCorrelationId(),
      empresaOperadoraId,
      usuarioId,
      startedAt: performance.now(),
    };
    this.currentContext = context;

    // Cria o span raiz
    const rootSpan: SpanData = {
      name: operationName,
      traceId: context.traceId,
      spanId: context.spanId,
      startTime: Date.now(),
      status: 'UNSET',
      attributes: {
        'service.name': this.config.serviceName,
        'service.version': this.config.serviceVersion,
        'deployment.environment': this.config.environment,
        'erp.operation': operationName,
        ...(empresaOperadoraId ? { 'erp.tenant_id': empresaOperadoraId } : {}),
        ...(usuarioId ? { 'erp.user_id': usuarioId } : {}),
      },
    };
    this.activeSpans.set(context.spanId, rootSpan);
    return context;
  }

  // ── Inicia um Span filho dentro do Trace atual ──────────────────────────
  startSpan(name: string, attributes: Record<string, string | number | boolean> = {}): SpanData {
    const spanId = generateSpanId();
    const span: SpanData = {
      name,
      traceId: this.currentContext?.traceId || generateTraceId(),
      spanId,
      parentSpanId: this.currentContext?.spanId,
      startTime: Date.now(),
      status: 'UNSET',
      attributes: {
        'service.name': this.config.serviceName,
        ...attributes,
      },
    };
    this.activeSpans.set(spanId, span);
    return span;
  }

  // ── Finaliza um Span ────────────────────────────────────────────────────
  endSpan(spanId: string, status: SpanData['status'] = 'OK', error?: string): SpanData | null {
    const span = this.activeSpans.get(spanId);
    if (!span) return null;

    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = status;
    if (error) span.error = error;

    this.activeSpans.delete(spanId);
    this.completedSpans.push(span);

    // Limite de spans em memória (circular buffer)
    if (this.completedSpans.length > 500) {
      this.completedSpans.shift();
    }

    return span;
  }

  // ── Wrapper: Instrumenta qualquer função assíncrona ─────────────────────
  async instrumentAsync<T>(
    name: string,
    fn: () => Promise<T>,
    attributes: Record<string, string | number | boolean> = {}
  ): Promise<T> {
    const span = this.startSpan(name, attributes);
    try {
      const result = await fn();
      this.endSpan(span.spanId, 'OK');
      return result;
    } catch (err: any) {
      this.endSpan(span.spanId, 'ERROR', err?.message || String(err));
      throw err;
    }
  }

  // ── Cabeçalho W3C Trace Context (para propagar via HTTP) ─────────────────
  getTraceHeaders(): Record<string, string> {
    if (!this.currentContext) return {};
    return {
      'traceparent': `00-${this.currentContext.traceId}-${this.currentContext.spanId}-01`,
      'x-correlation-id': this.currentContext.correlationId,
      ...(this.currentContext.empresaOperadoraId
        ? { 'x-tenant-id': this.currentContext.empresaOperadoraId }
        : {}),
    };
  }

  // ── Relatório de diagnóstico de spans completados ────────────────────────
  getCompletedSpans(): SpanData[] {
    return [...this.completedSpans];
  }

  getActiveSpansCount(): number {
    return this.activeSpans.size;
  }

  // ── Limpa estado (útil em testes) ───────────────────────────────────────
  reset(): void {
    this.activeSpans.clear();
    this.completedSpans = [];
    this.currentContext = null;
  }

  // ── Métricas de duração do trace completo ────────────────────────────────
  getTraceSummary(): { totalDurationMs: number; spanCount: number; errorCount: number } {
    const errorCount = this.completedSpans.filter(s => s.status === 'ERROR').length;
    const totalDurationMs = this.currentContext
      ? performance.now() - this.currentContext.startedAt
      : 0;
    return { totalDurationMs, spanCount: this.completedSpans.length, errorCount };
  }
}

export const observabilityService = new ObservabilityService();
