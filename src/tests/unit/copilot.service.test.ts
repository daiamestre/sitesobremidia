import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopilotService } from '@/modules/crm/services/copilot.service';

// ─── Mock da dependência AIService ───────────────────────────────────────────
vi.mock('@/modules/crm/services/ai.service', () => ({
  aiService: {
    askExecutiveCopilot: vi.fn().mockResolvedValue({
      answer: 'O MRR projetado é R$ 165.000/mês com crescimento de +13.7%.',
      confidenceScore: 98.5,
      sources: ['dw_receita', 'dw_operacao'],
      executionTimeMs: 42,
    }),
  },
  AIService: vi.fn(),
}));

// ─── Testes Unitários: CopilotService ────────────────────────────────────────
describe('CopilotService', () => {
  let service: CopilotService;

  beforeEach(() => {
    service = new CopilotService();
  });

  it('deve ser instanciado corretamente', () => {
    expect(service).toBeInstanceOf(CopilotService);
  });

  it('deve delegar para AIService.askExecutiveCopilot', async () => {
    const { aiService } = await import('@/modules/crm/services/ai.service');
    await service.askQuestion('Qual é o MRR?', 'empresa-01');
    expect(aiService.askExecutiveCopilot).toHaveBeenCalledWith('Qual é o MRR?', 'empresa-01');
  });

  it('deve retornar AIResponse com campo answer', async () => {
    const result = await service.askQuestion('Qual é o status da rede?');
    expect(result).toHaveProperty('answer');
    expect(typeof result.answer).toBe('string');
  });

  it('deve retornar confidenceScore numérico', async () => {
    const result = await service.askQuestion('Uptime?');
    expect(typeof result.confidenceScore).toBe('number');
  });

  it('deve retornar sources como array', async () => {
    const result = await service.askQuestion('Fontes?');
    expect(Array.isArray(result.sources)).toBe(true);
  });

  it('deve retornar executionTimeMs como número', async () => {
    const result = await service.askQuestion('Tempo?');
    expect(typeof result.executionTimeMs).toBe('number');
  });

  it('deve funcionar sem empresaOperadoraId (consulta anônima)', async () => {
    const result = await service.askQuestion('Pergunta sem tenant');
    expect(result).toHaveProperty('answer');
  });

  it('deve repassar empresaOperadoraId para o AIService', async () => {
    const { aiService } = await import('@/modules/crm/services/ai.service');
    vi.clearAllMocks();
    (aiService.askExecutiveCopilot as ReturnType<typeof vi.fn>).mockResolvedValue({
      answer: 'ok', confidenceScore: 95, sources: [], executionTimeMs: 10,
    });
    await service.askQuestion('teste', 'tenant-xyz');
    expect(aiService.askExecutiveCopilot).toHaveBeenCalledWith('teste', 'tenant-xyz');
  });
});
