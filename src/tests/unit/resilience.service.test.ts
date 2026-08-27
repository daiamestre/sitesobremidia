import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResilienceService, CircuitBreaker } from '@/modules/crm/services/resilience.service';

// ─── ResilienceService: Retry com Backoff Exponencial ────────────────────────
describe('ResilienceService — Retry com Backoff Exponencial', () => {
  let service: ResilienceService;

  beforeEach(() => { service = new ResilienceService(); });

  it('deve ser instanciado corretamente', () => {
    expect(service).toBeInstanceOf(ResilienceService);
  });

  it('withRetry deve retornar resultado na primeira tentativa bem-sucedida', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await service.withRetry(fn, {
      maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('withRetry deve tentar novamente após falha e retornar na 2ª tentativa', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce('recovered');

    const result = await service.withRetry(fn, {
      maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2,
    });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('withRetry deve lançar após esgotar todas as tentativas', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));
    await expect(service.withRetry(fn, {
      maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2,
    })).rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('withRetry com retryOn deve parar imediatamente em erros não recuperáveis', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('UNAUTHORIZED'));
    const retryOn = (err: unknown) => !(err instanceof Error && err.message.includes('UNAUTHORIZED'));

    await expect(service.withRetry(fn, {
      maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2, retryOn,
    })).rejects.toThrow('UNAUTHORIZED');
    // Não deve tentar mais de 1 vez (erro não recuperável)
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('withRetry deve ter 1 tentativa com maxAttempts=1', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(service.withRetry(fn, {
      maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2,
    })).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ─── ResilienceService: Timeout ───────────────────────────────────────────────
describe('ResilienceService — Timeout', () => {
  let service: ResilienceService;

  beforeEach(() => { service = new ResilienceService(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('withTimeout deve retornar resultado quando operação for mais rápida que o limite', async () => {
    const fn = vi.fn().mockResolvedValue('fast-result');
    const promise = service.withTimeout(fn, { timeoutMs: 5000 });
    vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('fast-result');
  });

  it('withTimeout deve lançar TimeoutError quando operação excede o limite', async () => {
    const fn = () => new Promise<string>(resolve => setTimeout(() => resolve('late'), 10000));
    const promise = service.withTimeout(fn, { timeoutMs: 100 });
    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toThrow(/timed out/i);
  });
});

// ─── CircuitBreaker ───────────────────────────────────────────────────────────
describe('CircuitBreaker — Padrão de Resiliência', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 3,
      successThreshold: 2,
      timeoutMs: 1000,
    });
  });

  it('deve iniciar no estado CLOSED', () => {
    expect(breaker.getStatus().state).toBe('CLOSED');
  });

  it('deve executar função normalmente quando CLOSED', async () => {
    const result = await breaker.execute(async () => 'success');
    expect(result).toBe('success');
  });

  it('deve contar falhas sem abrir antes do threshold', async () => {
    const failFn = async () => { throw new Error('fail'); };
    for (let i = 0; i < 2; i++) {
      try { await breaker.execute(failFn); } catch { /* falha esperada: conta para o breaker */ }
    }
    expect(breaker.getStatus().state).toBe('CLOSED');
    expect(breaker.getStatus().failureCount).toBe(2);
  });

  it('deve abrir o circuito após atingir failureThreshold (3 falhas)', async () => {
    const failFn = async () => { throw new Error('fail'); };
    for (let i = 0; i < 3; i++) {
      try { await breaker.execute(failFn); } catch { /* falha esperada: conta para o breaker */ }
    }
    expect(breaker.getStatus().state).toBe('OPEN');
  });

  it('deve lançar erro imediatamente quando OPEN (sem chamar a função)', async () => {
    const failFn = async () => { throw new Error('fail'); };
    for (let i = 0; i < 3; i++) {
      try { await breaker.execute(failFn); } catch { /* falha esperada: conta para o breaker */ }
    }
    const protectedFn = vi.fn().mockResolvedValue('would succeed');
    await expect(breaker.execute(protectedFn)).rejects.toThrow(/OPEN/);
    expect(protectedFn).not.toHaveBeenCalled(); // short-circuit: função não é chamada
  });

  it('reset deve restaurar estado CLOSED com contadores zerados', async () => {
    const failFn = async () => { throw new Error('fail'); };
    for (let i = 0; i < 3; i++) {
      try { await breaker.execute(failFn); } catch { /* falha esperada: conta para o breaker */ }
    }
    breaker.reset();
    expect(breaker.getStatus().state).toBe('CLOSED');
    expect(breaker.getStatus().failureCount).toBe(0);
  });

  it('getStatus deve incluir name do circuit breaker', () => {
    expect(breaker.getStatus().name).toBe('test-service');
  });

  it('sucesso após reset deve reiniciar contagem de falhas do zero', async () => {
    const failFn = async () => { throw new Error('fail'); };
    try { await breaker.execute(failFn); } catch { /* falha esperada: conta para o breaker */ }
    breaker.reset();
    await breaker.execute(async () => 'ok');
    expect(breaker.getStatus().failureCount).toBe(0);
  });
});

// ─── Integração: Retry + Circuit Breaker ─────────────────────────────────────
describe('Integração: ResilienceService + CircuitBreaker (Padrão Gateway PIX)', () => {
  it('simula retry em gateway PIX com circuit breaker', async () => {
    const service = new ResilienceService();
    const breaker = new CircuitBreaker({
      name: 'pix-gateway-test',
      failureThreshold: 5, successThreshold: 1, timeoutMs: 5000,
    });

    let attempts = 0;
    const pixCall = async () => {
      attempts++;
      if (attempts < 2) throw new Error('PIX gateway timeout');
      return { txid: 'PIX-OK-123', status: 'ATIVA' };
    };

    // Retry com circuit breaker: sucede na 2ª tentativa
    const result = await service.withRetry(
      () => breaker.execute(pixCall),
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5, backoffMultiplier: 2 }
    );

    expect(result.txid).toBe('PIX-OK-123');
    expect(attempts).toBe(2);
    expect(breaker.getStatus().state).toBe('CLOSED');
  });
});
