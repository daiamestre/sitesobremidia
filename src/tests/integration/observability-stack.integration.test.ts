import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TESTE DE INTEGRAÇÃO — Stack de Observabilidade Completa
 * FASE 10.2 — Correlation IDs → Logs Estruturados → Métricas → Trace Headers
 *
 * Verifica que os três serviços funcionam de forma coesa em um fluxo real.
 */

describe('Integração: Stack de Observabilidade (Trace → Log → Metrics)', () => {

  it('Fluxo completo: trace → span → log → métrica → header W3C', async () => {
    const { ObservabilityService } = await import('@/modules/crm/services/observability.service');
    const { LoggerService } = await import('@/modules/crm/services/logger.service');
    const { MetricsService } = await import('@/modules/crm/services/metrics.service');

    const obs = new ObservabilityService();
    const log = new LoggerService({ enableConsole: false, enableBuffer: true, service: 'test' });
    const met = new MetricsService();

    // 1. Inicia trace com contexto multi-tenant
    const ctx = obs.startTrace('financeiro.createReceivable', 'empresa-01', 'user-01');
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);

    // 2. Injeta correlation ID no logger
    log.setContext({ correlationId: ctx.correlationId, empresaOperadoraId: 'empresa-01', traceId: ctx.traceId });

    // 3. Inicia span para a operação no banco
    const dbSpan = obs.startSpan('supabase.insert', { 'db.table': 'contas_receber' });

    // Simula operação no banco
    await new Promise(resolve => setTimeout(resolve, 5));

    obs.endSpan(dbSpan.spanId, 'OK');
    log.info('Recebível criado com sucesso', { contaId: 'c-01', valor: 5000 });
    met.recordAPICall('createReceivable', 'empresa-01', dbSpan.durationMs || 5, true);
    met.recordFinancialTransaction('RECEBIVEL', 'empresa-01');

    // 4. Verifica headers W3C para propagação
    const headers = obs.getTraceHeaders();
    expect(headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(headers['x-correlation-id']).toBe(ctx.correlationId);
    expect(headers['x-tenant-id']).toBe('empresa-01');

    // 5. Verifica log estruturado
    const logs = log.getBuffer();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].correlationId).toBe(ctx.correlationId);
    expect(logs[0].empresaOperadoraId).toBe('empresa-01');
    expect(logs[0].traceId).toBe(ctx.traceId);

    // 6. Verifica métricas
    const counter = met.getCounter('erp_api_calls_total', {
      operation: 'createReceivable', tenant: 'empresa-01', status: 'success',
    });
    expect(counter).toBe(1);
    const txCounter = met.getCounter('erp_financial_transactions_total', { type: 'RECEBIVEL', tenant: 'empresa-01' });
    expect(txCounter).toBe(1);
  });

  it('Fluxo de erro: falha instrumentada deve aparecer em log ERROR e métrica de erro', async () => {
    const { ObservabilityService } = await import('@/modules/crm/services/observability.service');
    const { LoggerService } = await import('@/modules/crm/services/logger.service');
    const { MetricsService } = await import('@/modules/crm/services/metrics.service');

    const obs = new ObservabilityService();
    const log = new LoggerService({ enableConsole: false, enableBuffer: true, service: 'test' });
    const met = new MetricsService();

    const ctx = obs.startTrace('billing.generatePix', 'empresa-02');
    log.setContext({ correlationId: ctx.correlationId, empresaOperadoraId: 'empresa-02' });

    const span = obs.startSpan('pix.gateway.call');

    try {
      throw new Error('PIX gateway unavailable');
    } catch (err: any) {
      obs.endSpan(span.spanId, 'ERROR', err.message);
      log.error('Falha ao gerar PIX', err, { txid: 'PIX-FAIL', gateway: 'GERENCIANET' });
      met.recordAPICall('generatePix', 'empresa-02', 5000, false);
    }

    // Span deve ser ERROR
    const completed = obs.getCompletedSpans();
    const errorSpans = completed.filter(s => s.status === 'ERROR');
    expect(errorSpans.length).toBeGreaterThanOrEqual(1);
    expect(errorSpans[0].error).toContain('PIX gateway unavailable');

    // Log deve ter nível ERROR com correlationId
    const errors = log.getBufferByLevel('ERROR');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].correlationId).toBe(ctx.correlationId);

    // Métrica de erro deve estar incrementada
    expect(met.getCounter('erp_api_errors_total', { operation: 'generatePix', tenant: 'empresa-02' })).toBe(1);
  });

  it('Trace summary deve refletir spans OK e ERROR corretamente', async () => {
    const { ObservabilityService } = await import('@/modules/crm/services/observability.service');
    const obs = new ObservabilityService();
    obs.startTrace('batch-operation', 'empresa-01');

    const s1 = obs.startSpan('op-ok');
    obs.endSpan(s1.spanId, 'OK');
    const s2 = obs.startSpan('op-error');
    obs.endSpan(s2.spanId, 'ERROR', 'timeout');
    const s3 = obs.startSpan('op-ok-2');
    obs.endSpan(s3.spanId, 'OK');

    const summary = obs.getTraceSummary();
    expect(summary.spanCount).toBe(3);
    expect(summary.errorCount).toBe(1);
  });

  it('Isolamento multi-tenant: dois traces paralelos com tenants diferentes devem ser independentes', async () => {
    const { ObservabilityService } = await import('@/modules/crm/services/observability.service');
    const obsA = new ObservabilityService();
    const obsB = new ObservabilityService();

    const ctxA = obsA.startTrace('op-tenant-a', 'empresa-A');
    const ctxB = obsB.startTrace('op-tenant-b', 'empresa-B');

    expect(ctxA.traceId).not.toBe(ctxB.traceId);
    expect(ctxA.correlationId).not.toBe(ctxB.correlationId);
    expect(ctxA.empresaOperadoraId).toBe('empresa-A');
    expect(ctxB.empresaOperadoraId).toBe('empresa-B');

    const headersA = obsA.getTraceHeaders();
    const headersB = obsB.getTraceHeaders();
    expect(headersA['x-tenant-id']).toBe('empresa-A');
    expect(headersB['x-tenant-id']).toBe('empresa-B');
  });
});
