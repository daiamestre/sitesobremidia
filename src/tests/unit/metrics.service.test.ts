import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsService } from '@/modules/crm/services/metrics.service';

// ─── MetricsService: Contadores ──────────────────────────────────────────────
describe('MetricsService — Contadores (Counters)', () => {
  let metrics: MetricsService;

  beforeEach(() => { metrics = new MetricsService(); });

  it('deve ser instanciado corretamente', () => {
    expect(metrics).toBeInstanceOf(MetricsService);
  });

  it('increment deve iniciar contador em 0 e incrementar para 1', () => {
    metrics.increment('requests_total', { service: 'financeiro' });
    expect(metrics.getCounter('requests_total', { service: 'financeiro' })).toBe(1);
  });

  it('increment deve acumular múltiplas chamadas', () => {
    metrics.increment('api_calls', {}, 1);
    metrics.increment('api_calls', {}, 1);
    metrics.increment('api_calls', {}, 3);
    expect(metrics.getCounter('api_calls', {})).toBe(5);
  });

  it('counters com labels diferentes devem ser independentes', () => {
    metrics.increment('errs', { service: 'a' });
    metrics.increment('errs', { service: 'b' });
    metrics.increment('errs', { service: 'b' });
    expect(metrics.getCounter('errs', { service: 'a' })).toBe(1);
    expect(metrics.getCounter('errs', { service: 'b' })).toBe(2);
  });

  it('getCounter para chave inexistente deve retornar 0', () => {
    expect(metrics.getCounter('inexistente', {})).toBe(0);
  });
});

// ─── MetricsService: Gauges ───────────────────────────────────────────────────
describe('MetricsService — Gauges', () => {
  let metrics: MetricsService;

  beforeEach(() => { metrics = new MetricsService(); });

  it('setGauge deve definir o valor exato', () => {
    metrics.setGauge('players_online', 18, { empresa: 'emp-01' });
    expect(metrics.getGauge('players_online', { empresa: 'emp-01' })).toBe(18);
  });

  it('setGauge deve sobrescrever valor anterior', () => {
    metrics.setGauge('conexoes_ativas', 5);
    metrics.setGauge('conexoes_ativas', 12);
    expect(metrics.getGauge('conexoes_ativas')).toBe(12);
  });

  it('getGauge para chave inexistente deve retornar 0', () => {
    expect(metrics.getGauge('inexistente')).toBe(0);
  });
});

// ─── MetricsService: Histogramas de Latência ─────────────────────────────────
describe('MetricsService — Histogramas de Latência', () => {
  let metrics: MetricsService;

  beforeEach(() => { metrics = new MetricsService(); });

  it('observeDuration deve criar histogram com count=1', () => {
    metrics.observeDuration('api_latency', 45, { endpoint: '/crm' });
    const h = metrics.getHistogram('api_latency', { endpoint: '/crm' });
    expect(h).not.toBeNull();
    expect(h!.count).toBe(1);
    expect(h!.sum).toBe(45);
  });

  it('observeDuration deve classificar em bucket correto (<=50ms)', () => {
    metrics.observeDuration('latency', 30);
    const h = metrics.getHistogram('latency');
    expect(h!.le_50ms).toBe(1);
    expect(h!.le_inf).toBe(1);
  });

  it('observeDuration 150ms deve ir para <=250ms mas não <=100ms', () => {
    metrics.observeDuration('latency', 150);
    const h = metrics.getHistogram('latency');
    expect(h!.le_100ms).toBe(0);
    expect(h!.le_250ms).toBe(1);
  });

  it('getP95 com todas obs <=50ms deve retornar 50', () => {
    for (let i = 0; i < 100; i++) metrics.observeDuration('fast', 20);
    expect(metrics.getP95('fast')).toBe(50);
  });

  it('getP95 em histogram vazio deve retornar null', () => {
    expect(metrics.getP95('nonexistent')).toBeNull();
  });

  it('múltiplas observações devem acumular sum corretamente', () => {
    [10, 50, 100, 200].forEach(d => metrics.observeDuration('mix', d));
    const h = metrics.getHistogram('mix');
    expect(h!.count).toBe(4);
    expect(h!.sum).toBe(360);
  });
});

// ─── MetricsService: Métricas de Negócio ERP ─────────────────────────────────
describe('MetricsService — Métricas de Negócio ERP', () => {
  let metrics: MetricsService;

  beforeEach(() => { metrics = new MetricsService(); });

  it('recordAPICall sucesso deve incrementar erp_api_calls_total', () => {
    metrics.recordAPICall('createReceivable', 'empresa-01', 45, true);
    expect(metrics.getCounter('erp_api_calls_total', { operation: 'createReceivable', tenant: 'empresa-01', status: 'success' })).toBe(1);
  });

  it('recordAPICall falha deve incrementar erp_api_errors_total', () => {
    metrics.recordAPICall('generatePix', 'empresa-01', 5000, false);
    expect(metrics.getCounter('erp_api_errors_total', { operation: 'generatePix', tenant: 'empresa-01' })).toBe(1);
  });

  it('recordAPICall deve registrar duração no histogram', () => {
    metrics.recordAPICall('createReceivable', 'empresa-01', 120, true);
    const h = metrics.getHistogram('erp_api_duration_ms', { operation: 'createReceivable', tenant: 'empresa-01' });
    expect(h!.count).toBe(1);
    expect(h!.sum).toBe(120);
  });

  it('recordFinancialTransaction deve incrementar contador por tipo', () => {
    metrics.recordFinancialTransaction('BOLETO', 'empresa-01');
    metrics.recordFinancialTransaction('PIX', 'empresa-01');
    metrics.recordFinancialTransaction('BOLETO', 'empresa-01');
    expect(metrics.getCounter('erp_financial_transactions_total', { type: 'BOLETO', tenant: 'empresa-01' })).toBe(2);
    expect(metrics.getCounter('erp_financial_transactions_total', { type: 'PIX', tenant: 'empresa-01' })).toBe(1);
  });

  it('recordAIQuery deve registrar chamadas de IA por provedor', () => {
    metrics.recordAIQuery('GEMINI', 250, true);
    metrics.recordAIQuery('OPENAI', 380, true);
    metrics.recordAIQuery('GEMINI', 5000, false);
    expect(metrics.getCounter('erp_ai_queries_total', { provider: 'GEMINI', status: 'success' })).toBe(1);
    expect(metrics.getCounter('erp_ai_queries_total', { provider: 'GEMINI', status: 'error' })).toBe(1);
    expect(metrics.getCounter('erp_ai_queries_total', { provider: 'OPENAI', status: 'success' })).toBe(1);
  });

  it('recordSignatureEvent deve registrar eventos de assinatura', () => {
    metrics.recordSignatureEvent('CLICKSIGN', 'CREATED');
    metrics.recordSignatureEvent('CLICKSIGN', 'SIGNED');
    metrics.recordSignatureEvent('DOCUSIGN', 'REJECTED');
    expect(metrics.getCounter('erp_signature_events_total', { provider: 'CLICKSIGN', event: 'SIGNED' })).toBe(1);
  });

  it('toPrometheusFormat deve retornar string não vazia após registros', () => {
    metrics.increment('test_counter', {});
    const output = metrics.toPrometheusFormat();
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('test_counter');
  });

  it('getSummary deve retornar sampleCount crescente', () => {
    metrics.increment('a', {});
    metrics.setGauge('b', 10);
    metrics.observeDuration('c', 50);
    const summary = metrics.getSummary();
    expect(summary.sampleCount).toBeGreaterThanOrEqual(3);
  });

  it('reset deve limpar todos os contadores', () => {
    metrics.increment('my_counter', {});
    metrics.reset();
    expect(metrics.getCounter('my_counter', {})).toBe(0);
    expect(metrics.getSummary().sampleCount).toBe(0);
  });
});
