import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIService, AIProvider } from '@/modules/crm/services/ai.service';

// ─── Mock do módulo Supabase ─────────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => {
  const mockFrom = vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [{ id: 'dw-row-01' }], error: null }),
    insert: vi.fn().mockResolvedValue({ data: [{ id: 'audit-01' }], error: null }),
  }));
  return { supabase: { from: mockFrom } };
});

// ─── Testes Unitários: AIService ─────────────────────────────────────────────
describe('AIService', () => {
  let service: AIService;

  beforeEach(() => {
    service = new AIService('GEMINI');
  });

  it('deve ser instanciado com o provider padrão GEMINI', () => {
    expect(service).toBeInstanceOf(AIService);
  });

  it('deve aceitar diferentes providers na construção', () => {
    const providers: AIProvider[] = ['GEMINI', 'OPENAI', 'ANTHROPIC', 'AZURE_OPENAI', 'AWS_BEDROCK', 'OLLAMA'];
    providers.forEach((provider) => {
      const s = new AIService(provider);
      expect(s).toBeInstanceOf(AIService);
    });
  });

  it('deve retornar uma AIResponse válida para consulta sobre MRR', async () => {
    const response = await service.askExecutiveCopilot('Qual é o MRR projetado?');

    expect(response).toHaveProperty('answer');
    expect(response).toHaveProperty('confidenceScore');
    expect(response).toHaveProperty('sources');
    expect(response).toHaveProperty('executionTimeMs');
    expect(typeof response.answer).toBe('string');
    expect(response.answer.length).toBeGreaterThan(0);
  });

  it('deve incluir projeção de MRR na resposta quando perguntado sobre receita', async () => {
    const response = await service.askExecutiveCopilot('Qual é a receita projetada?');
    expect(response.answer).toContain('MRR');
  });

  it('deve incluir análise de ROI quando perguntado sobre painel', async () => {
    const response = await service.askExecutiveCopilot('Qual painel tem melhor ROI?');
    expect(response.answer).toContain('ROI');
  });

  it('deve incluir informação de uptime na resposta genérica', async () => {
    const response = await service.askExecutiveCopilot('Como está a rede?');
    expect(response.answer).toContain('Uptime');
  });

  it('deve retornar confidenceScore igual a 98.5', async () => {
    const response = await service.askExecutiveCopilot('Status?');
    expect(response.confidenceScore).toBe(98.5);
  });

  it('deve retornar executionTimeMs >= 0', async () => {
    const response = await service.askExecutiveCopilot('Teste');
    expect(response.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('deve referenciar fontes do Data Warehouse nas sources', async () => {
    const response = await service.askExecutiveCopilot('Análise financeira');
    expect(response.sources).toContain('dw_receita');
    expect(response.sources).toContain('dw_operacao');
  });

  it('deve gravar auditoria quando empresaOperadoraId for fornecido', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    await service.askExecutiveCopilot('Consulta auditada', 'empresa-uuid-01');
    expect(supabase.from).toHaveBeenCalledWith('ai_auditoria');
  });

  it('NÃO deve gravar auditoria quando empresaOperadoraId for omitido', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.askExecutiveCopilot('Consulta sem tenant');
    // ai_auditoria não deve ser chamado sem o tenant ID
    const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]);
    expect(fromCalls).not.toContain('ai_auditoria');
  });

  it('deve consultar dw_receita como fonte de dados do Data Warehouse', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.clearAllMocks();
    await service.askExecutiveCopilot('MRR?');
    expect(supabase.from).toHaveBeenCalledWith('dw_receita');
  });
});
