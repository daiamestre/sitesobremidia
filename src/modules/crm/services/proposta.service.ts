import { supabase } from '@/integrations/supabase/client';

export interface PropostaPayload {
  empresaOperadoraId: string;
  clienteId: string;
  representanteId?: string | null;
  tituloCampanha: string;
  duracaoSegundos: number;
  quantidadeTelas: number;
  valorMensal: number;
  desconto?: number;
  formaPagamento: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'BANK_TRANSFER';
  dataInicio: string;
  dataFim: string;
  observacoes?: string;
}

export class PropostaService {
  /**
   * Obtém ou cria serviço padrão no catalogo_servicos para inserção estruturada de itens
   */
  private async getOrCreateServicoPadrao(empresaOperadoraId: string): Promise<string | null> {
    try {
      const { data: servicoExistente } = await supabase
        .from('catalogo_servicos')
        .select('id')
        .eq('empresa_operadora_id', empresaOperadoraId)
        .eq('codigo_servico', 'MIDIA-DS-HD')
        .maybeSingle();

      if (servicoExistente) return servicoExistente.id;

      const { data: novoServico, error } = await supabase
        .from('catalogo_servicos')
        .insert({
          empresa_operadora_id: empresaOperadoraId,
          codigo_servico: 'MIDIA-DS-HD',
          nome: 'Inserção Mídia Digital Signage HD (Pontos / Telas)',
          descricao: 'Veiculação de mídia corporativa e painéis de LED',
          valor_tabela: 875.00,
          ativo: true,
        })
        .select('id')
        .single();

      if (error || !novoServico) return null;
      return novoServico.id;
    } catch (err) {
      return null;
    }
  }

  private toDateOnly(value: string): string | null {
    const match = value?.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  }

  /**
   * Registra uma proposta comercial de forma 100% estruturada no PostgreSQL
   */
  async create(payload: PropostaPayload): Promise<{ 
    success: boolean; 
    propostaId?: string; 
    numeroProposta?: string; 
    error?: string 
  }> {
    try {
      const desconto = payload.desconto || 0;
      const valorTotal = payload.valorMensal;
      const valorFinal = Math.max(0, valorTotal - desconto);
      const dataInicio = this.toDateOnly(payload.dataInicio);
      const dataFim = this.toDateOnly(payload.dataFim);

      let proposta: { id: string; numero_proposta: string } | null = null;
      let propostaError: { message: string } | null = null;

      for (let attempt = 0; attempt < 12 && !proposta; attempt++) {
        const { data: maxPropData } = await supabase
          .from('propostas')
          .select('numero_proposta')
          .eq('empresa_operadora_id', payload.empresaOperadoraId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const lastDigits = maxPropData?.numero_proposta
          ? (maxPropData.numero_proposta.split('-').pop() || '0').replace(/\D/g, '')
          : '0';
        const lastNum = BigInt(lastDigits || '0');
        const nextNum = (lastNum + BigInt(1 + attempt)).toString();
        const numeroProposta = `PROP-${new Date().getFullYear()}-${nextNum.padStart(4, '0')}`;

        const result = await supabase
          .from('propostas')
          .insert({
            empresa_operadora_id: payload.empresaOperadoraId,
            numero_proposta: numeroProposta,
            cliente_id: payload.clienteId,
            representante_id: payload.representanteId,
            valor_total: valorTotal,
            desconto: desconto,
            valor_final: valorFinal,
            forma_pagamento: payload.formaPagamento,
            validade_dias: 15,
            status: 'DRAFT',
            titulo_campanha: payload.tituloCampanha,
            data_inicio: dataInicio,
            data_fim: dataFim,
            duracao_segundos: payload.duracaoSegundos,
            observacoes: payload.observacoes || `Proposta comercial para a campanha ${payload.tituloCampanha}.`,
          })
          .select('id, numero_proposta')
          .single();

        if (result.data) {
          proposta = result.data;
        } else if (result.error?.code !== '23505') {
          propostaError = result.error;
          break;
        }
      }

      if (!proposta) {
        const fallback = `PROP-${new Date().getFullYear()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const result = await supabase
          .from('propostas')
          .insert({
            empresa_operadora_id: payload.empresaOperadoraId,
            numero_proposta: fallback,
            cliente_id: payload.clienteId,
            representante_id: payload.representanteId,
            valor_total: valorTotal,
            desconto: desconto,
            valor_final: valorFinal,
            forma_pagamento: payload.formaPagamento,
            validade_dias: 15,
            status: 'DRAFT',
            titulo_campanha: payload.tituloCampanha,
            data_inicio: dataInicio,
            data_fim: dataFim,
            duracao_segundos: payload.duracaoSegundos,
            observacoes: payload.observacoes || `Proposta comercial para a campanha ${payload.tituloCampanha}.`,
          })
          .select('id, numero_proposta')
          .single();

        if (result.data) {
          proposta = result.data;
        } else {
          propostaError = result.error || propostaError;
        }
      }

      if (!proposta) {
        return { success: false, error: propostaError?.message || 'Falha ao salvar proposta.' };
      }

      const servicoId = await this.getOrCreateServicoPadrao(payload.empresaOperadoraId);
      if (servicoId) {
        const qtd = Math.max(1, payload.quantidadeTelas);
        const valorUnitario = Number((valorTotal / qtd).toFixed(2));

        await supabase.from('itens_proposta').insert({
          proposta_id: proposta.id,
          servico_id: servicoId,
          quantidade: qtd,
          valor_unitario: valorUnitario,
          desconto: 0,
          valor_total: valorTotal,
        });
      }

      // Invoca a Edge Function server-side para gerar o documento e registrar a versão no R2
      try {
        await supabase.functions.invoke('generate-proposal-pdf', {
          body: { propostaId: proposta.id, isPreview: false, sendEmail: false }
        });
      } catch (funcErr) {
        console.warn('[PropostaService] Edge Function invocada via fallback local:', funcErr);
      }

      return {
        success: true,
        propostaId: proposta.id,
        numeroProposta: proposta.numero_proposta,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao gravar proposta.' };
    }
  }

  /**
   * Solicita a geração da prévia (Preview) server-side sem alterar status para SENT
   */
  async generatePreview(propostaId: string): Promise<{ success: boolean; htmlContent?: string; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('generate-proposal-pdf', {
        body: { propostaId, isPreview: true, sendEmail: false }
      });

      if (error || !data?.success) {
        return { success: false, error: error?.message || data?.error || 'Falha ao gerar prévia.' };
      }

      return { success: true, htmlContent: data.htmlContent };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro na geração de prévia.' };
    }
  }

  /**
   * Executa o envio oficial da proposta comercial via Resend e atualiza o status para SENT
   */
  async sendProposalEmail(propostaId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('generate-proposal-pdf', {
        body: { propostaId, isPreview: false, sendEmail: true }
      });

      if (error || !data?.success) {
        return { success: false, error: error?.message || data?.error || 'Falha no envio da proposta.' };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao disparar e-mail de proposta.' };
    }
  }

  async findAll(representanteId?: string): Promise<any[]> {
    try {
      let query = supabase
        .from('propostas')
        .select(`
          *,
          cliente:clientes(id, empresas(razao_social, nome_fantasia))
        `)
        .order('created_at', { ascending: false });

      if (representanteId) {
        query = query.eq('representante_id', representanteId);
      }

      const { data, error } = await query;
      if (error || !data) {
        return [];
      }
      return data;
    } catch {
      return [];
    }
  }
}

export const propostaService = new PropostaService();

