/**
 * SOBRE MÍDIA ERP v3.0 — Resilience Service
 * FASE 10.2 — Retry Exponencial, Timeout, Circuit Breaker
 *
 * Padrões de resiliência para chamadas ao Supabase, gateways PIX/Boleto,
 * provedores de IA e assinatura digital.
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryOn?: (error: unknown) => boolean;
}

export interface TimeoutConfig {
  timeoutMs: number;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;  // nº de falhas para abrir o circuito
  successThreshold: number;  // nº de sucessos em HALF_OPEN para fechar
  timeoutMs: number;         // tempo em OPEN antes de tentar HALF_OPEN
  name: string;
}

export interface CircuitBreakerStatus {
  name: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt?: number;
  nextAttemptAt?: number;
}

// ─── Utilitário: sleep ────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── ResilienceService ────────────────────────────────────────────────────────
export class ResilienceService {

  // ── Retry com Backoff Exponencial ─────────────────────────────────────────
  async withRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig
  ): Promise<T> {
    const { maxAttempts, baseDelayMs, maxDelayMs, backoffMultiplier, retryOn } = config;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;

        // Se há filtro de retry e o erro não passa, lança imediatamente
        if (retryOn && !retryOn(err)) {
          throw err;
        }

        if (attempt === maxAttempts) break;

        // Delay exponencial com jitter
        const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
        const jitter = Math.random() * baseDelayMs * 0.5;
        const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

        await sleep(delay);
      }
    }
    throw lastError;
  }

  // ── Timeout ───────────────────────────────────────────────────────────────
  async withTimeout<T>(fn: () => Promise<T>, config: TimeoutConfig): Promise<T> {
    return Promise.race([
      fn(),
      sleep(config.timeoutMs).then(() => {
        throw new Error(`Operation timed out after ${config.timeoutMs}ms`);
      }),
    ]);
  }

  // ── Retry + Timeout combinados ────────────────────────────────────────────
  async withRetryAndTimeout<T>(
    fn: () => Promise<T>,
    retryConfig: RetryConfig,
    timeoutConfig: TimeoutConfig
  ): Promise<T> {
    return this.withRetry(
      () => this.withTimeout(fn, timeoutConfig),
      retryConfig
    );
  }
}

// ─── CircuitBreaker (classe separada para gerenciar estado por serviço) ───────
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureAt?: number;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  getStatus(): CircuitBreakerStatus {
    return {
      name: this.config.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureAt: this.lastFailureAt,
      nextAttemptAt: this.state === 'OPEN' && this.lastFailureAt
        ? this.lastFailureAt + this.config.timeoutMs
        : undefined,
    };
  }

  isOpen(): boolean {
    if (this.state === 'OPEN') {
      // Verifica se é hora de tentar HALF_OPEN
      const now = Date.now();
      if (this.lastFailureAt && now - this.lastFailureAt >= this.config.timeoutMs) {
        this.state = 'HALF_OPEN';
        return false; // permite uma tentativa
      }
      return true;
    }
    return false;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      const status = this.getStatus();
      throw new Error(
        `Circuit breaker [${this.config.name}] is OPEN. ` +
        `Next attempt at: ${status.nextAttemptAt ? new Date(status.nextAttemptAt).toISOString() : 'unknown'}`
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureAt = Date.now();
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN'; // falhou em HALF_OPEN → volta para OPEN
      this.successCount = 0;
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureAt = undefined;
  }
}

// ─── Circuit Breakers pré-configurados para integrações do ERP ───────────────
export const supabaseCircuit = new CircuitBreaker({
  name: 'supabase', failureThreshold: 5, successThreshold: 2, timeoutMs: 30000,
});

export const pixGatewayCircuit = new CircuitBreaker({
  name: 'pix-gateway', failureThreshold: 3, successThreshold: 1, timeoutMs: 15000,
});

export const aiProviderCircuit = new CircuitBreaker({
  name: 'ai-provider', failureThreshold: 3, successThreshold: 2, timeoutMs: 60000,
});

export const signatureProviderCircuit = new CircuitBreaker({
  name: 'signature-provider', failureThreshold: 3, successThreshold: 1, timeoutMs: 30000,
});

export const resilienceService = new ResilienceService();
