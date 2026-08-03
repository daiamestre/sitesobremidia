/**
 * SOBRE MÍDIA ERP v3.0 — Structured Logger Service
 * FASE 10.2 — Logs Estruturados (JSON), Níveis, Contexto Multi-Tenant
 *
 * Substitui console.log dispersos por logs auditáveis e parseáveis.
 * Pronto para ingestão em: Grafana Loki, Datadog, AWS CloudWatch, GCP Logging.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface LogEntry {
  timestamp: string;           // ISO 8601
  level: LogLevel;
  service: string;
  message: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  empresaOperadoraId?: string;
  usuarioId?: string;
  module?: string;
  operation?: string;
  durationMs?: number;
  errorCode?: string;
  errorStack?: string;
  metadata?: Record<string, unknown>;
}

export interface LoggerConfig {
  service: string;
  minLevel: LogLevel;
  enableConsole: boolean;
  enableBuffer: boolean;     // mantém logs em memória (útil para diagnóstico e testes)
  bufferMaxSize: number;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

const DEFAULT_CONFIG: LoggerConfig = {
  service: 'sobre-midia-erp',
  minLevel: import.meta.env.PROD ? 'INFO' : 'DEBUG',
  enableConsole: true,
  enableBuffer: true,
  bufferMaxSize: 1000,
};

// ─── LoggerService ────────────────────────────────────────────────────────────
export class LoggerService {
  private config: LoggerConfig;
  private buffer: LogEntry[] = [];
  private defaultContext: Partial<LogEntry> = {};

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Define contexto padrão para todos os logs desta instância ────────────
  setContext(context: Partial<Pick<LogEntry, 'empresaOperadoraId' | 'usuarioId' | 'correlationId' | 'traceId' | 'module'>>): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  clearContext(): void {
    this.defaultContext = {};
  }

  // ── Core: loga uma entrada estruturada ───────────────────────────────────
  private log(level: LogLevel, message: string, extra: Partial<LogEntry> = {}): LogEntry {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.config.minLevel]) {
      return {} as LogEntry; // below min level — skip
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.config.service,
      message,
      ...this.defaultContext,
      ...extra,
    };

    // Buffer em memória
    if (this.config.enableBuffer) {
      this.buffer.push(entry);
      if (this.buffer.length > this.config.bufferMaxSize) {
        this.buffer.shift(); // circular buffer
      }
    }

    // Console com formatação adequada por nível
    if (this.config.enableConsole) {
      const formatted = JSON.stringify(entry);
      switch (level) {
        case 'DEBUG': console.debug(formatted); break;
        case 'INFO':  console.info(formatted);  break;
        case 'WARN':  console.warn(formatted);  break;
        case 'ERROR':
        case 'FATAL': console.error(formatted); break;
      }
    }

    return entry;
  }

  // ── API Pública ──────────────────────────────────────────────────────────
  debug(message: string, metadata?: Record<string, unknown>): LogEntry {
    return this.log('DEBUG', message, { metadata });
  }

  info(message: string, metadata?: Record<string, unknown>): LogEntry {
    return this.log('INFO', message, { metadata });
  }

  warn(message: string, metadata?: Record<string, unknown>): LogEntry {
    return this.log('WARN', message, { metadata });
  }

  error(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): LogEntry {
    const errorEntry: Partial<LogEntry> = { metadata };
    if (error instanceof Error) {
      errorEntry.errorStack = error.stack;
      errorEntry.errorCode = error.name;
    } else if (error) {
      errorEntry.metadata = { ...metadata, rawError: String(error) };
    }
    return this.log('ERROR', message, errorEntry);
  }

  fatal(message: string, error?: Error | unknown): LogEntry {
    const errorEntry: Partial<LogEntry> = {};
    if (error instanceof Error) {
      errorEntry.errorStack = error.stack;
      errorEntry.errorCode = error.name;
    }
    return this.log('FATAL', message, errorEntry);
  }

  // ── Log de operação com duração (para auditoria de performance) ──────────
  operation(operation: string, durationMs: number, status: 'SUCCESS' | 'FAILURE', metadata?: Record<string, unknown>): LogEntry {
    const level: LogLevel = status === 'FAILURE' ? 'ERROR' : 'INFO';
    return this.log(level, `[${operation}] ${status} (${durationMs}ms)`, { operation, durationMs, metadata });
  }

  // ── Log de evento de negócio ──────────────────────────────────────────────
  businessEvent(event: string, empresaOperadoraId: string, metadata?: Record<string, unknown>): LogEntry {
    return this.log('INFO', `[BUSINESS_EVENT] ${event}`, {
      empresaOperadoraId,
      module: 'business',
      metadata: { event, ...metadata },
    });
  }

  // ── Diagnóstico ───────────────────────────────────────────────────────────
  getBuffer(): LogEntry[] {
    return [...this.buffer];
  }

  getBufferByLevel(level: LogLevel): LogEntry[] {
    return this.buffer.filter(e => e.level === level);
  }

  clearBuffer(): void {
    this.buffer = [];
  }

  getStats(): { total: number; byLevel: Record<LogLevel, number> } {
    const byLevel: Record<LogLevel, number> = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 };
    this.buffer.forEach(e => { if (e.level) byLevel[e.level]++; });
    return { total: this.buffer.length, byLevel };
  }
}

export const logger = new LoggerService();
