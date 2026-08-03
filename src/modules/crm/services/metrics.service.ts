/**
 * SOBRE MÍDIA ERP v3.0 — Application Metrics Service
 * FASE 10.2 — Métricas de Aplicação (Prometheus-compatible format)
 *
 * Coleta: contadores, gauges, histogramas de duração.
 * Pronto para export via: Prometheus, Grafana, Datadog, CloudWatch.
 */

export type MetricType = 'COUNTER' | 'GAUGE' | 'HISTOGRAM';

export interface MetricSample {
  name: string;
  type: MetricType;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
  help?: string;
}

export interface HistogramBuckets {
  le_50ms: number;
  le_100ms: number;
  le_250ms: number;
  le_500ms: number;
  le_1000ms: number;
  le_5000ms: number;
  le_inf: number;
  count: number;
  sum: number;
}

// ─── MetricsService ───────────────────────────────────────────────────────────
export class MetricsService {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, HistogramBuckets> = new Map();
  private samples: MetricSample[] = [];

  private key(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels).sort().map(([k, v]) => `${k}="${v}"`).join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  // ── Counter: incrementa monotonicamente (ex: requisições, erros) ─────────
  increment(name: string, labels: Record<string, string> = {}, value = 1): void {
    const k = this.key(name, labels);
    this.counters.set(k, (this.counters.get(k) || 0) + value);
    this.samples.push({ name, type: 'COUNTER', value, labels, timestamp: Date.now() });
  }

  getCounter(name: string, labels: Record<string, string> = {}): number {
    return this.counters.get(this.key(name, labels)) || 0;
  }

  // ── Gauge: valor arbitrário que pode subir/descer (ex: usuários online) ──
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    this.gauges.set(this.key(name, labels), value);
    this.samples.push({ name, type: 'GAUGE', value, labels, timestamp: Date.now() });
  }

  getGauge(name: string, labels: Record<string, string> = {}): number {
    return this.gauges.get(this.key(name, labels)) || 0;
  }

  // ── Histogram: distribui observações em buckets de latência ──────────────
  observeDuration(name: string, durationMs: number, labels: Record<string, string> = {}): void {
    const k = this.key(name, labels);
    const h: HistogramBuckets = this.histograms.get(k) || {
      le_50ms: 0, le_100ms: 0, le_250ms: 0, le_500ms: 0, le_1000ms: 0, le_5000ms: 0, le_inf: 0,
      count: 0, sum: 0,
    };

    h.count++;
    h.sum += durationMs;
    if (durationMs <= 50)   h.le_50ms++;
    if (durationMs <= 100)  h.le_100ms++;
    if (durationMs <= 250)  h.le_250ms++;
    if (durationMs <= 500)  h.le_500ms++;
    if (durationMs <= 1000) h.le_1000ms++;
    if (durationMs <= 5000) h.le_5000ms++;
    h.le_inf++;

    this.histograms.set(k, h);
    this.samples.push({ name, type: 'HISTOGRAM', value: durationMs, labels, timestamp: Date.now() });
  }

  getHistogram(name: string, labels: Record<string, string> = {}): HistogramBuckets | null {
    return this.histograms.get(this.key(name, labels)) || null;
  }

  getP95(name: string, labels: Record<string, string> = {}): number | null {
    const h = this.getHistogram(name, labels);
    if (!h || h.count === 0) return null;
    // Estimativa de p95 pelos buckets disponíveis
    const target = h.count * 0.95;
    if (h.le_50ms >= target) return 50;
    if (h.le_100ms >= target) return 100;
    if (h.le_250ms >= target) return 250;
    if (h.le_500ms >= target) return 500;
    if (h.le_1000ms >= target) return 1000;
    if (h.le_5000ms >= target) return 5000;
    return Infinity;
  }

  // ── Métricas de negócio pré-definidas para o ERP ─────────────────────────
  recordAPICall(operation: string, empresaOperadoraId: string, durationMs: number, success: boolean): void {
    const labels = { operation, tenant: empresaOperadoraId, status: success ? 'success' : 'error' };
    this.increment('erp_api_calls_total', labels);
    this.observeDuration('erp_api_duration_ms', durationMs, { operation, tenant: empresaOperadoraId });
    if (!success) this.increment('erp_api_errors_total', { operation, tenant: empresaOperadoraId });
  }

  recordFinancialTransaction(type: 'BOLETO' | 'PIX' | 'RECEBIVEL' | 'PARCELA', empresaOperadoraId: string): void {
    this.increment('erp_financial_transactions_total', { type, tenant: empresaOperadoraId });
  }

  recordAIQuery(provider: string, durationMs: number, success: boolean): void {
    this.increment('erp_ai_queries_total', { provider, status: success ? 'success' : 'error' });
    this.observeDuration('erp_ai_duration_ms', durationMs, { provider });
  }

  recordSignatureEvent(provider: string, event: 'CREATED' | 'SIGNED' | 'REJECTED'): void {
    this.increment('erp_signature_events_total', { provider, event });
  }

  // ── Export em formato Prometheus text (para scraping) ────────────────────
  toPrometheusFormat(): string {
    const lines: string[] = [];
    this.counters.forEach((value, key) => {
      lines.push(`# TYPE ${key.split('{')[0]} counter`);
      lines.push(`${key} ${value}`);
    });
    this.gauges.forEach((value, key) => {
      lines.push(`# TYPE ${key.split('{')[0]} gauge`);
      lines.push(`${key} ${value}`);
    });
    return lines.join('\n');
  }

  // ── Resumo para diagnóstico ───────────────────────────────────────────────
  getSummary(): { counters: Record<string, number>; gaugeCount: number; histogramCount: number; sampleCount: number } {
    const counters: Record<string, number> = {};
    this.counters.forEach((v, k) => { counters[k] = v; });
    return {
      counters,
      gaugeCount: this.gauges.size,
      histogramCount: this.histograms.size,
      sampleCount: this.samples.length,
    };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.samples = [];
  }
}

export const metricsService = new MetricsService();
