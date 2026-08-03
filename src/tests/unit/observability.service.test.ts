import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObservabilityService } from '@/modules/crm/services/observability.service';

// ─── ObservabilityService: Trace Context ─────────────────────────────────────
describe('ObservabilityService — Trace Context e Correlation IDs', () => {
  let service: ObservabilityService;

  beforeEach(() => {
    service = new ObservabilityService({ serviceName: 'test-service', serviceVersion: '3.0.0', environment: 'development', enabled: true });
    service.reset();
  });

  it('deve ser instanciado corretamente', () => {
    expect(service).toBeInstanceOf(ObservabilityService);
  });

  it('startTrace deve retornar contexto com traceId, spanId e correlationId', () => {
    const ctx = service.startTrace('test-operation');
    expect(ctx).toHaveProperty('traceId');
    expect(ctx).toHaveProperty('spanId');
    expect(ctx).toHaveProperty('correlationId');
  });

  it('traceId deve ter 32 caracteres hexadecimais (128-bit, W3C compatible)', () => {
    const ctx = service.startTrace('test-operation');
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('spanId deve ter 16 caracteres hexadecimais (64-bit, W3C compatible)', () => {
    const ctx = service.startTrace('test-operation');
    expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('correlationId deve ter prefixo corr-', () => {
    const ctx = service.startTrace('test-operation');
    expect(ctx.correlationId).toMatch(/^corr-/);
  });

  it('dois traces simultâneos devem ter traceIds distintos', () => {
    const ctx1 = service.startTrace('op-1');
    const service2 = new ObservabilityService();
    const ctx2 = service2.startTrace('op-2');
    expect(ctx1.traceId).not.toBe(ctx2.traceId);
  });

  it('startTrace deve incluir empresaOperadoraId no contexto', () => {
    const ctx = service.startTrace('op', 'empresa-uuid-01');
    expect(ctx.empresaOperadoraId).toBe('empresa-uuid-01');
  });

  it('getCurrentContext deve retornar o trace iniciado', () => {
    const ctx = service.startTrace('test');
    expect(service.getCurrentContext()).toEqual(ctx);
  });

  it('reset deve limpar o contexto atual', () => {
    service.startTrace('test');
    service.reset();
    expect(service.getCurrentContext()).toBeNull();
  });
});

// ─── ObservabilityService: Spans ─────────────────────────────────────────────
describe('ObservabilityService — Spans e Instrumentação', () => {
  let service: ObservabilityService;

  beforeEach(() => {
    service = new ObservabilityService();
    service.reset();
    service.startTrace('test-trace', 'empresa-01');
  });

  it('startSpan deve criar um span com name e traceId corretos', () => {
    const span = service.startSpan('database.query', { 'db.table': 'contas_receber' });
    expect(span.name).toBe('database.query');
    expect(span.traceId).toBeDefined();
    expect(span.spanId).toBeDefined();
  });

  it('endSpan deve retornar o span com durationMs calculado', () => {
    const span = service.startSpan('operation');
    const completed = service.endSpan(span.spanId, 'OK');
    expect(completed).not.toBeNull();
    expect(completed!.durationMs).toBeGreaterThanOrEqual(0);
    expect(completed!.status).toBe('OK');
  });

  it('endSpan com status ERROR deve registrar erro', () => {
    const span = service.startSpan('failing-op');
    const completed = service.endSpan(span.spanId, 'ERROR', 'Connection refused');
    expect(completed!.status).toBe('ERROR');
    expect(completed!.error).toBe('Connection refused');
  });

  it('getCompletedSpans deve incluir spans finalizados', () => {
    const span = service.startSpan('my-op');
    service.endSpan(span.spanId, 'OK');
    const completed = service.getCompletedSpans();
    expect(completed.length).toBeGreaterThanOrEqual(1);
  });

  it('getActiveSpansCount deve decrementar após endSpan', () => {
    const span = service.startSpan('active-op');
    const before = service.getActiveSpansCount();
    service.endSpan(span.spanId);
    const after = service.getActiveSpansCount();
    expect(after).toBe(before - 1);
  });

  it('instrumentAsync deve executar a função e retornar resultado', async () => {
    const result = await service.instrumentAsync('test-fn', async () => 42);
    expect(result).toBe(42);
  });

  it('instrumentAsync deve marcar span como ERROR quando função lança exceção', async () => {
    await expect(
      service.instrumentAsync('failing-fn', async () => { throw new Error('simulated failure'); })
    ).rejects.toThrow('simulated failure');
    const completed = service.getCompletedSpans();
    const errorSpans = completed.filter(s => s.status === 'ERROR');
    expect(errorSpans.length).toBeGreaterThanOrEqual(1);
  });

  it('instrumentAsync deve marcar span como OK em caso de sucesso', async () => {
    await service.instrumentAsync('ok-fn', async () => 'done');
    const completed = service.getCompletedSpans();
    const okSpans = completed.filter(s => s.status === 'OK');
    expect(okSpans.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── ObservabilityService: W3C Trace Headers ─────────────────────────────────
describe('ObservabilityService — W3C Trace Headers', () => {
  let service: ObservabilityService;

  beforeEach(() => {
    service = new ObservabilityService();
    service.reset();
  });

  it('getTraceHeaders deve retornar traceparent no formato W3C', () => {
    service.startTrace('http-call', 'empresa-01');
    const headers = service.getTraceHeaders();
    expect(headers).toHaveProperty('traceparent');
    expect(headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it('getTraceHeaders deve incluir x-correlation-id', () => {
    service.startTrace('http-call');
    const headers = service.getTraceHeaders();
    expect(headers).toHaveProperty('x-correlation-id');
    expect(headers['x-correlation-id']).toMatch(/^corr-/);
  });

  it('getTraceHeaders deve incluir x-tenant-id quando empresaOperadoraId fornecido', () => {
    service.startTrace('http-call', 'empresa-uuid-01');
    const headers = service.getTraceHeaders();
    expect(headers['x-tenant-id']).toBe('empresa-uuid-01');
  });

  it('getTraceHeaders deve retornar {} sem trace ativo', () => {
    const headers = service.getTraceHeaders();
    expect(Object.keys(headers).length).toBe(0);
  });

  it('getTraceSummary deve retornar spanCount e errorCount', () => {
    service.startTrace('summary-test');
    const span1 = service.startSpan('op-1');
    service.endSpan(span1.spanId, 'OK');
    const span2 = service.startSpan('op-2');
    service.endSpan(span2.spanId, 'ERROR', 'timeout');
    const summary = service.getTraceSummary();
    expect(summary.spanCount).toBeGreaterThanOrEqual(2);
    expect(summary.errorCount).toBeGreaterThanOrEqual(1);
  });
});
