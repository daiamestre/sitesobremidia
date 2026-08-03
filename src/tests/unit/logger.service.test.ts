import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoggerService } from '@/modules/crm/services/logger.service';

// ─── LoggerService: Logs Estruturados ────────────────────────────────────────
describe('LoggerService — Logs Estruturados (JSON)', () => {
  let logger: LoggerService;

  beforeEach(() => {
    // Silencia o console durante os testes
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    logger = new LoggerService({
      service: 'test-erp',
      minLevel: 'DEBUG',
      enableConsole: true,
      enableBuffer: true,
      bufferMaxSize: 100,
    });
  });

  afterEach(() => { vi.restoreAllMocks(); logger.clearBuffer(); });

  it('deve ser instanciado corretamente', () => {
    expect(logger).toBeInstanceOf(LoggerService);
  });

  it('info deve retornar LogEntry com campos obrigatórios', () => {
    const entry = logger.info('Sistema inicializado');
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('level', 'INFO');
    expect(entry).toHaveProperty('service', 'test-erp');
    expect(entry).toHaveProperty('message', 'Sistema inicializado');
  });

  it('timestamp deve ser ISO 8601 válido', () => {
    const entry = logger.info('test');
    expect(() => new Date(entry.timestamp).toISOString()).not.toThrow();
  });

  it('debug deve criar entrada com level DEBUG', () => {
    const entry = logger.debug('debug message', { key: 'value' });
    expect(entry.level).toBe('DEBUG');
  });

  it('warn deve criar entrada com level WARN', () => {
    const entry = logger.warn('aviso de memória alta');
    expect(entry.level).toBe('WARN');
  });

  it('error deve criar entrada com level ERROR', () => {
    const entry = logger.error('falha crítica', new Error('DB connection refused'));
    expect(entry.level).toBe('ERROR');
  });

  it('error deve capturar errorStack da Error', () => {
    const err = new Error('Test Error');
    const entry = logger.error('falha', err);
    expect(entry.errorStack).toContain('Test Error');
  });

  it('fatal deve criar entrada com level FATAL', () => {
    const entry = logger.fatal('sistema encerrado');
    expect(entry.level).toBe('FATAL');
  });

  it('setContext deve injetar empresaOperadoraId em todos os logs subsequentes', () => {
    logger.setContext({ empresaOperadoraId: 'empresa-uuid-01', module: 'financeiro' });
    const entry = logger.info('Recebível criado');
    expect(entry.empresaOperadoraId).toBe('empresa-uuid-01');
    expect(entry.module).toBe('financeiro');
  });

  it('clearContext deve remover o contexto', () => {
    logger.setContext({ empresaOperadoraId: 'empresa-01' });
    logger.clearContext();
    const entry = logger.info('Sem contexto');
    expect(entry.empresaOperadoraId).toBeUndefined();
  });

  it('getBuffer deve retornar todas as entradas logadas', () => {
    logger.info('msg1');
    logger.warn('msg2');
    logger.error('msg3');
    expect(logger.getBuffer().length).toBe(3);
  });

  it('getBufferByLevel deve filtrar por nível', () => {
    logger.info('info');
    logger.warn('warn');
    logger.error('error');
    const errors = logger.getBufferByLevel('ERROR');
    expect(errors.length).toBe(1);
    expect(errors[0].level).toBe('ERROR');
  });

  it('clearBuffer deve esvaziar o buffer', () => {
    logger.info('msg');
    logger.clearBuffer();
    expect(logger.getBuffer().length).toBe(0);
  });

  it('getStats deve retornar totais por nível', () => {
    logger.info('i1');
    logger.info('i2');
    logger.warn('w1');
    logger.error('e1');
    const stats = logger.getStats();
    expect(stats.total).toBe(4);
    expect(stats.byLevel.INFO).toBe(2);
    expect(stats.byLevel.WARN).toBe(1);
    expect(stats.byLevel.ERROR).toBe(1);
  });

  it('operation deve logar operação com duração', () => {
    const entry = logger.operation('createReceivable', 45, 'SUCCESS', { contaId: 'c-01' });
    expect(entry.durationMs).toBe(45);
    expect(entry.operation).toBe('createReceivable');
  });

  it('operation com FAILURE deve criar log de ERROR', () => {
    const entry = logger.operation('generatePix', 5000, 'FAILURE');
    expect(entry.level).toBe('ERROR');
  });

  it('businessEvent deve criar log de evento de negócio', () => {
    const entry = logger.businessEvent('CONTRATO_ASSINADO', 'empresa-01', { contratoId: 'c-01' });
    expect(entry.level).toBe('INFO');
    expect(entry.empresaOperadoraId).toBe('empresa-01');
    expect(entry.message).toContain('CONTRATO_ASSINADO');
  });

  it('minLevel INFO deve ignorar DEBUG', () => {
    const loggerInfo = new LoggerService({ minLevel: 'INFO', enableConsole: false, enableBuffer: true, service: 'test' });
    loggerInfo.debug('deve ser ignorado');
    expect(loggerInfo.getBuffer().length).toBe(0);
  });
});
