import { supabase } from '@/integrations/supabase/client';
import { contratoDocumentoService } from './contratoDocumento.service';

export interface ContratoTemplateRecord {
  id: string;
  tipo_contrato: 'ANUNCIANTE' | 'PARCEIRO';
  codigo_template: string;
  nome: string;
  descricao: string;
  versao: number;
  conteudo_html: string;
}

export interface ContratoCompleto {
  id: string;
  empresa_operadora_id: string;
  numero_contrato: string;
  numero_contrato_legivel?: string;
  cliente_id: string;
  empresa_id: string;
  representante_id: string | null;
  proposta_id: string;
  tipo_contrato?: 'ANUNCIANTE' | 'PARCEIRO';
  template_id?: string;
  template_nome?: string;
  template_versao?: number;
  usuario_responsavel_id?: string;
  data_selecao?: string;
  status_documento: 'RASCUNHO' | 'GERADO' | 'ENVIADO' | 'ASSINADO' | 'CANCELADO';
  status_workflow: string;
  pdf_object_key?: string;
  pdf_assinado_key?: string;
  documento_enviado_em?: string | null;
  documento_assinado_em?: string | null;
  assinatura_envelope_id?: string | null;
  assinado_por?: string | null;
  versao_atual: number;
  valor_mensal: number;
  forma_pagamento: string;
  data_inicio: string;
  data_fim: string;
  proposta?: any;
  cliente?: any;
  empresa?: any;
  itens?: any[];
}

export class ContratoService {
  /**
   * Lista os modelos/templates de contrato disponíveis no banco (ANUNCIANTE e PARCEIRO)
   */
  async fetchTemplates(): Promise<ContratoTemplateRecord[]> {
    try {
      const { data, error } = await supabase
        .from('contrato_templates')
        .select('*')
        .eq('ativo', true)
        .order('tipo_contrato');

      if (error) {
        console.error('[ContratoService.fetchTemplates] Erro:', error);
        return [];
      }
      return (data || []) as ContratoTemplateRecord[];
    } catch (err) {
      return [];
    }
  }

  /**
   * Gera número de contrato sequencial com Advisory Lock atômico no PostgreSQL
   */
  private async getNextContractNumberAtomo(empresaOperadoraId: string): Promise<string> {
    try {
      const { data, error } = await supabase.rpc('fn_gerar_numero_contrato_atomo', {
        p_empresa_operadora_id: empresaOperadoraId
      });

      if (!error && data) {
        return data as string;
      }
    } catch (err) {
      console.warn('[ContratoService] Fallback na geração de número de contrato:', err);
    }

    // Fallback compensatório
    const { data: maxCtr } = await supabase
      .from('contratos')
      .select('numero_contrato')
      .eq('empresa_operadora_id', empresaOperadoraId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastNum = maxCtr?.numero_contrato ? parseInt(maxCtr.numero_contrato.replace(/\D/g, ''), 10) : 0;
    const nextNum = (lastNum || 0) + 1;
    return `CTR-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;
  }

  /**
   * Seleciona o modelo de contrato (ANUNCIANTE ou PARCEIRO) para a proposta
   */
  async selectContractModel(payload: {
    propostaId: string;
    tipoContrato: 'ANUNCIANTE' | 'PARCEIRO';
    templateId: string;
    templateNome: string;
    templateVersao: number;
    usuarioResponsavelId: string;
  }): Promise<{ success: boolean; contratoId?: string; error?: string }> {
    try {
      // 1. Busca dados da proposta para vincular contrato
      const { data: proposta, error: propErr } = await supabase
        .from('propostas')
        .select(`*, cliente:clientes(*), empresa:empresas(*)`)
        .eq('id', payload.propostaId)
        .single();

      if (propErr || !proposta) {
        return { success: false, error: 'Proposta não encontrada.' };
      }

      const { data: empresa } = await supabase
        .from('empresas')
        .select('id')
        .eq('cliente_id', proposta.cliente_id)
        .single();

      if (!empresa) {
        return { success: false, error: 'Empresa vinculada ao cliente não encontrada.' };
      }

      // 2. Verifica se contrato já existe para a proposta
      const { data: existingContract } = await supabase
        .from('contratos')
        .select('id, numero_contrato, versao_atual')
        .eq('proposta_id', payload.propostaId)
        .maybeSingle();

      const nowIso = new Date().toISOString();
      let contratoId: string;

      if (existingContract) {
        contratoId = existingContract.id;
        await supabase
          .from('contratos')
          .update({
            tipo_contrato: payload.tipoContrato,
            template_id: payload.templateId,
            template_nome: payload.templateNome,
            template_versao: payload.templateVersao,
            usuario_responsavel_id: payload.usuarioResponsavelId,
            data_selecao: nowIso,
            status_documento: 'RASCUNHO',
            updated_at: nowIso,
          })
          .eq('id', contratoId);
      } else {
        // Gera número de contrato atômico via fn_gerar_numero_contrato_atomo
        const numeroContrato = await this.getNextContractNumberAtomo(proposta.empresa_operadora_id);

        const dataInicio = new Date().toISOString().split('T')[0];
        const dataFim = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const { data: newCtr, error: ctrErr } = await supabase
          .from('contratos')
          .insert({
            empresa_operadora_id: proposta.empresa_operadora_id,
            numero_contrato: numeroContrato,
            cliente_id: proposta.cliente_id,
            empresa_id: empresa.id,
            representante_id: proposta.representante_id,
            proposta_id: proposta.id,
            tipo_contrato: payload.tipoContrato,
            template_id: payload.templateId,
            template_nome: payload.templateNome,
            template_versao: payload.templateVersao,
            usuario_responsavel_id: payload.usuarioResponsavelId,
            data_selecao: nowIso,
            status_documento: 'RASCUNHO',
            status_workflow: 'AGUARDANDO_ASSINATURA',
            valor_mensal: proposta.valor_final,
            forma_pagamento: proposta.forma_pagamento,
            data_inicio: dataInicio,
            data_fim: dataFim,
          })
          .select('id')
          .single();

        if (ctrErr || !newCtr) {
          return { success: false, error: ctrErr?.message || 'Falha ao criar registro de contrato.' };
        }
        contratoId = newCtr.id;
      }

      // 3. Registra Log de Auditoria: CONTRATO_SELECIONADO
      await supabase.from('contrato_auditoria').insert({
        contrato_id: contratoId,
        evento: 'CONTRATO_SELECIONADO',
        usuario_id: payload.usuarioResponsavelId,
        tipo_contrato: payload.tipoContrato,
        versao: payload.templateVersao,
        detalhes: { template_nome: payload.templateNome, proposta_id: payload.propostaId },
      });

      return { success: true, contratoId };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro inesperado na seleção de contrato.' };
    }
  }

  /**
   * Busca dados completos de um contrato pelo seu ID ou pela propostaId
   */
  async findByPropostaId(propostaId: string): Promise<ContratoCompleto | null> {
    try {
      const { data, error } = await supabase
        .from('contratos')
        .select(`
          *,
          proposta:propostas(*),
          cliente:clientes(*),
          empresa:empresas(*)
        `)
        .eq('proposta_id', propostaId)
        .maybeSingle();

      if (error || !data) return null;
      return data as ContratoCompleto;
    } catch (err) {
      return null;
    }
  }

  /**
   * Gera o documento REAL do contrato (PDF vetorial client-side, R2, versão e
   * auditoria). Delega ao contratoDocumentoService — sem edge function não
   * deployed e sem bucket de storage inexistente.
   */
  async generateContractPDF(contratoId: string, usuarioId: string): Promise<{ success: boolean; objectKey?: string; signedDownloadUrl?: string; documentHash?: string; error?: string }> {
    const resultado = await contratoDocumentoService.gerarDocumentoContrato(contratoId, usuarioId);
    if (!resultado.success) {
      return { success: false, error: resultado.error };
    }
    let signedDownloadUrl: string | undefined;
    if (resultado.objectKey) {
      try {
        signedDownloadUrl = await contratoDocumentoService.obterUrlDownload(resultado.objectKey);
      } catch {
        signedDownloadUrl = undefined;
      }
    }
    return {
      success: true,
      objectKey: resultado.objectKey,
      signedDownloadUrl,
      documentHash: resultado.documentHash,
    };
  }

  /**
   * Busca um contrato pelo ID e retorna todos os dados relacionados
   */
  async findByContratoId(contratoId: string): Promise<ContratoCompleto | null> {
    try {
      const { data, error } = await supabase
        .from('contratos')
        .select(`
          *,
          proposta:propostas(*),
          cliente:clientes(*),
          empresa:empresas(*)
        `)
        .eq('id', contratoId)
        .maybeSingle();

      if (error || !data) return null;
      return data as ContratoCompleto;
    } catch (err) {
      console.error('[ContratoService.findByContratoId] Erro:', err);
      return null;
    }
  }

  /**
   * Gera URL presigned de download do PDF original com autorização REAL
   * (Edge Function get-download-url + RLS do banco).
   */
  async getContractDownloadUrl(contratoId: string): Promise<{ success: boolean; downloadUrl?: string; fileName?: string; error?: string }> {
    try {
      const { data: contrato, error: fetchErr } = await supabase
        .from('contratos')
        .select('pdf_object_key, numero_contrato, tipo_contrato, empresa_operadora_id')
        .eq('id', contratoId)
        .single();

      if (fetchErr || !contrato) return { success: false, error: 'Contrato não encontrado.' };
      if (!contrato.pdf_object_key) return { success: false, error: 'PDF do contrato não foi gerado.' };

      const downloadUrl = await contratoDocumentoService.obterUrlDownload(contrato.pdf_object_key);

      const fileName = `Contrato_${contrato.tipo_contrato || 'Anunciante'}_${contrato.numero_contrato}.pdf`;

      return {
        success: true,
        downloadUrl,
        fileName,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao obter URL de download.' };
    }
  }

  /**
   * Gera URL presigned de download do PDF ASSINADO com autorização REAL.
   */
  async getSignedDocumentDownloadUrl(contratoId: string): Promise<{ success: boolean; downloadUrl?: string; fileName?: string; signedAt?: string; error?: string }> {
    try {
      const { data: contrato, error: fetchErr } = await supabase
        .from('contratos')
        .select('pdf_assinado_key, numero_contrato, tipo_contrato, documento_assinado_em')
        .eq('id', contratoId)
        .single();

      if (fetchErr || !contrato) return { success: false, error: 'Contrato não encontrado.' };
      if (!contrato.pdf_assinado_key) return { success: false, error: 'Documento assinado não disponível.' };

      const downloadUrl = await contratoDocumentoService.obterUrlDownload(contrato.pdf_assinado_key);

      const fileName = `Contrato_Assinado_${contrato.tipo_contrato || 'Anunciante'}_${contrato.numero_contrato}.pdf`;

      return {
        success: true,
        downloadUrl,
        fileName,
        signedAt: contrato.documento_assinado_em,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao obter URL de download.' };
    }
  }

  /**
   * Envia o contrato gerado para assinatura interna (ASSINADOR_INTERNO) —
   * fluxo real com hash SHA-256 do PDF original.
   */
  async enviarParaAssinatura(contratoId: string, usuarioId: string): Promise<{ success: boolean; assinaturaId?: string; envelopeId?: string; error?: string }> {
    return contratoDocumentoService.criarEnvelopeInterno(contratoId, usuarioId);
  }

  /**
   * Busca eventos de auditoria do contrato
   */
  async getAuditTrail(contratoId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('contrato_auditoria')
        .select('*')
        .eq('contrato_id', contratoId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[ContratoService.getAuditTrail] Erro:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      return [];
    }
  }

  /**
   * Cancela um contrato registrando evento de auditoria
   */
  async cancelContract(contratoId: string, reason: string, usuarioId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await supabase
        .from('contratos')
        .update({
          status_documento: 'CANCELADO',
          status_workflow: 'CANCELADO',
          deleted_at: new Date().toISOString(),
          delete_reason: reason,
        })
        .eq('id', contratoId);

      await supabase.from('contrato_auditoria').insert({
        contrato_id: contratoId,
        evento: 'CONTRATO_CANCELADO',
        usuario_id: usuarioId,
        detalhes: { motivo: reason },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  async findAll(representanteId?: string): Promise<ContratoCompleto[]> {
    try {
      let query = supabase
        .from('contratos')
        .select(`
          *,
          proposta:propostas(*),
          cliente:clientes(*),
          empresa:empresas(*)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (representanteId) {
        query = query.eq('representante_id', representanteId);
      }

      const { data, error } = await query;
      if (error || !data) return [];
      return data as ContratoCompleto[];
    } catch {
      return [];
    }
  }
}

export const contratoService = new ContratoService();
