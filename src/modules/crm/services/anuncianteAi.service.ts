import { supabase } from '@/integrations/supabase/client';
import { aiService, AIResponse } from './ai.service';
import { campanhaService } from './campanha.service';
import { customerPortalDataService } from './customerPortalData.service';
import { formatCurrency } from '@/utils/formatters';

export type AnuncianteAIProvider = 'GEMINI' | 'OPENAI' | 'ANTHROPIC';

export interface AnuncianteAIResponse {
  answer: string;
  confidenceScore: number;
  sources: string[];
  executionTimeMs: number;
  metadata?: Record<string, any>;
}

export interface GerarTituloOptions {
  objetivo?: string;
  produto_servico?: string;
  publico_alvo?: string;
  estilo?: 'profissional' | 'criativo' | 'direto' | 'emocional';
}

export interface GerarTextoAnuncioOptions {
  descricao?: string;
  produto_servico?: string;
  beneficios?: string;
  chamado_acao?: string;
  tono?: 'profissional' | 'amistoso' | 'urgente' | 'emocional';
}

export interface GerarCTAOptions {
  estilo?: 'direto' | 'suave' | 'urgente' | 'questionamento';
  contexto?: string;
}

export interface DadosCampanhaContexto {
  titulo?: string;
  objetivo?: string;
  periodo?: string;
  telasQuantidade?: number;
  valorInvestimento?: number;
  status?: string;
}

export class AnuncianteAIService {
  constructor(private provider: AnuncianteAIProvider = 'GEMINI') {}

  /**
   * Gera um título de campanha baseado em objetivos e contexto
   */
  async gerarTitulo(opts: GerarTituloOptions): Promise<string> {
    const { objetivo, produto_servico, publico_alvo, estilo = 'profissional' } = opts;

    const prompt = `
Você é um especialista em mídia e marketing para gerar títulos de campanha para digital signage.

Contexto:
- Objetivo: "${objetivo || 'Não especificado'}"
- Produto/Serviço: "${produto_servico || 'Não especificado'}"
- Público-Alvo: "${publico_alvo || 'Não especificado'}"
- Estilo: ${estilo}

 Gere APENAS um título de campanha curto e impactante (máximo 80 caracteres).
 O título deve ser atrativo para mídia digital em telas LED/TVs.
 Não inclua aspas, aspas duplas ou explicações. Apenas o título em si.
`;

    try {
      const response = await aiService.askExecutiveCopilot(prompt);
      const titulo = response.answer.trim();
      return titulo || `Campanha ${new Date().getMonth() + 1}/${new Date().getFullYear()}`;
    } catch {
      return `Promoção ${new Date().getFullYear()}`;
    }
  }

  /**
   * Gera texto de anúncio/artes baseado em descrição e benefícios
   */
  async gerarTextoAnuncio(opts: GerarTextoAnuncioOptions): Promise<string> {
    const { descricao, produto_servico, beneficios, chamado_acao, tono = 'profissional' } = opts;

    const prompt = `
Você é um copywriter especializado em mídia out-of-digital e digital signage.

Contexto:
- Produto/Serviço: "${produto_servico || 'Não especificado'}"
- Descrição: "${descricao || 'Não especificada'}"
- Benefícios Principais: "${beneficios || 'Não especificados'}"
- Chamado para Ação (CTA): "${chamado_acao || 'Não especificado'}"
- Tono: ${tono}

 Gere um texto de anúncio persuasivo para ser exibido em telas digitais.
 O texto deve ser conciso (máximo 300 caracteres), focado em benefícios e incluir o CMA.
 Use uma linguagem adequada ao tono especificado.
 Retorne APENAS o texto do anúncio, sem aspas ou explicações.
`;

    try {
      const response = await aiService.askExecutiveCopilot(prompt);
      return response.answer.trim() || `Descubra ${produto_servico || 'nossas soluções de mídia'}`;
    } catch {
      return `Conheça ${produto_servico || 'nossas soluções de mídia'}`;
    }
  }

  /**
   * Gera um CTA (Call-to-Action) baseado no contexto
   */
  async gerarCTA(opts: GerarCTAOptions): Promise<string> {
    const { estilo = 'direto', contexto } = opts;

    const ctaMap: Record<string, string[]> = {
      direto: ['Compre Agora', 'Saiba Mais', 'Conheça nossas Ofertas'],
      suave: ['Conheça mais', 'Veja as Vantagens', 'Saiba Mais sobre'],
      urgente: ['Oferta por Tempo Limitado', 'Garanta Agora', 'Não Perca esta Oportunidade'],
      questionamento: ['Você sabia?', 'Quer economizar?', 'Qual seu objetivo?']
    };

    const ctas = ctaMap[estilo] || ctaMap.direto;
    const cta = ctas[Math.floor(Math.random() * ctas.length)];

    const prompt = `
Gerar um CTA (Call-to-Action) para mídia digital:
- Estilo: ${estilo}
- Contexto: ${contexto || 'Campanha geral'}

 Retorne APENAS o texto do CTA, sem aspas ou explicações.
`;

    try {
      const response = await aiService.askExecutiveCopilot(prompt);
      const cta = response.answer.trim();
      return cta || ctas[0];
    } catch {
      return ctas[0];
    }
  }

  /**
   * Gera um script de vídeo para a campanha
   */
  async gerarScriptVideo(contexto: string): Promise<string> {
    const prompt = `
Você é um diretor de criação para mídia digital e vídeos para telas LED.

Contexto: ${contexto}

 Gere um roteiro de vídeo curto (aprox. 30-60 segundos) para ser exibido em telas digitais.
 O script deve ter:
 - Introdução atraente (até 10 segundos)
 - Corpo com os principais benefícios (até 40 segundos)
 - Final com CTA claro (até 10 segundos)
 - Instruções de visual (cenas, transições, elementos na tela)

 Formato: Cada seção marcada com [INÍCIO], [CORPO], [FIM] e descrições de cena.
 Retorne APENAS o roteiro, sem aspas ou explicações extras.
`;

    try {
      const response = await aiService.askExecutiveCopilot(prompt);
      return response.answer.trim() || `Script de vídeo para: ${contexto}`;
    } catch {
      return `Roteiro de vídeo para: ${contexto}`;
    }
  }

  /**
   * Sugere campanhas baseadas no histórico e dados do cliente
   */
  async sugerirCampanhas(empresaOperadoraId?: string): Promise<{
    titulos: string[];
    objetivos: string[];
    beneficios: string[];
    ctas: string[];
  }> {
    try {
      // Buscar campanhas recentes do cliente
      const campanhas = await campanhaService.findAll({
        limit: 10,
        offset: 0,
      });

      const estatisticas = await campanhaService.getEstatisticasCliente(
        campanhas.length > 0 ? (campanhas[0].clienteId || '') : ''
      );

      const prompt = `
Você é um estrategista de mídia analisando o histórico de campanhas da SOBRE MÍDIA.

Estatísticas recentes:
- Total de campanhas: ${estatisticas.total}
- Campanhas ativas: ${estatisticas.ativas}
- Rascunhos: ${estatisticas.rascunho}
- Finalizadas: ${estatisticas.finalizadas}
- Pausadas: ${estatisticas.pausadas}

Contexto geral do mercado de digital signage no Brasil.

Com base nisto, sugira:
1. 3 TÍTULOS de campanhas atraentes para novos anunciantes (máximo 80 chars cada)
2. 3 OBJETIVOS de campanha mais eficazes para mídia digital
3. 3 BENEFÍCIOS principais que anunciar na SOBRE MÍDIA proporciona
4. 3 CTAs (Call-to-Action) mais eficazes para telas digitais

 Formato de retorno: JSON com quatro arrays: titulos, objetivos, beneficios, ctas
 Exemplo: {"titulos": ["...", "...", "..."], "objetivos": ["...", "...", "..."], "beneficios": ["...", "...", "..."], "ctas": ["...", "...", "..."]}
 Apenas o objeto JSON, sem explicações.
`;

      const response = await aiService.askExecutiveCopilot(prompt);
      const parsed = JSON.parse(response.answer.trim());

      return {
        titulos: parsed.titulos || [],
        objetivos: parsed.objetivos || [],
        beneficios: parsed.beneficios || [],
        ctas: parsed.ctas || [],
      };
    } catch (error) {
      console.error('[AnuncianteAIService.sugerirCampanhas] Erro:', error);
      return {
        titulos: ['Promoção de Lançamento', 'Oferta Especial', 'Nova Coleção'],
        objetivos: ['Aumentar Visibilidade', 'Gerar Leads', 'Impulsionar Vendas'],
        beneficios: ['Alcance Segmentado', 'Medição Precisa', 'ROI Atribuível'],
        ctas: ['Saiba Mais', 'Comprar Agora', 'Agendar Visita'],
      };
    }
  }

  /**
   * Gera sugestões de pontos de mídia baseado em linguagem natural
   * Usa a busca IA existente + dados do cliente
   */
  async sugerirPontos(query: string, empresaOperadoraId?: string): Promise<any[]> {
    try {
      // Primeiro tenta a busca IA existente
      const pontos = await (await import('../services/aiPointSearch.service')).aiPointSearchService.searchWithAI(
        query,
        empresaOperadoraId
      );

      if (pontos && pontos.length > 0) return pontos;

      // Fallback: buscar pontos do cliente via serviço
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        const { data: usuarioRecord } = await supabase
          .from('usuarios')
          .select('cliente_id, empresa_operadora_id')
          .eq('id', userData.user.id)
          .maybeSingle();

        if (usuarioRecord?.cliente_id) {
          const pontosCliente = await customerPortalDataService.getPontosDetalhados(
            usuarioRecord.cliente_id
          );
          return pontosCliente?.pontos || [];
        }
      }

      return [];
    } catch (error) {
      console.error('[AnuncianteAIService.sugerirPontos] Erro:', error);
      return [];
    }
  }

  /**
   * Analisa desempenho de campanhas e gera relatório IA
   */
  async analisarDesempenhoCampanhas(empresaOperadoraId?: string): Promise<string> {
    try {
      const campanhas = await campanhaService.findAll({ limit: 20 });

      const prompt = `
Analise o desempenho destas campanhas de mídia digital e gere um relatório executivo em português.

Dados das campanhas:
${campanhas.slice(0, 10).map((c: any) => `- ${c.titulo}: status=${c.status}, objetivo=${c.objetivo}, período=${c.inicio} a ${c.fim}, inserções=${c.insercaoCount || 0}`).join('\n')}

 Gere um relatório com:
 - Visão geral do desempenho
 - Principais aprendizados
 - Recomendações para próximas campanhas
 - Sugestões de otimização

 Formato: Texto estruturado em português, direto e profissional. Apenas o relatório, sem astras ou explicações adicionais.
`;

      const response = await aiService.askExecutiveCopilot(prompt);
      return response.answer.trim() || 'Não foi possível gerar análise neste momento.';
    } catch (error) {
      console.error('[AnuncianteAIService.analisarDesempenho] Erro:', error);
      return 'Não foi possível gerar análise neste momento.';
    }
  }
}

export const anunciateAiService = new AnuncianteAIService();