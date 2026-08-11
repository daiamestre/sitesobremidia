import { supabase } from '@/integrations/supabase/client';

export type SignatureProviderName = 'CLICKSIGN' | 'DOCUSIGN' | 'ADOBESIGN' | 'ASSINAFY' | 'ZAPSIGN' | 'ASSINADOR_INTERNO';
export type SignatureStatus = 'RASCUNHO' | 'ENVIADO' | 'VISUALIZADO' | 'ASSINADO' | 'RECUSADO' | 'EXPIRADO' | 'CANCELADO';

export interface EnvelopePayload {
  empresaOperadoraId: string;
  contratoId: string;
  provedor: SignatureProviderName;
  signatarios: { nome: string; email: string; cpfCnpj?: string }[];
  pdfOriginalObjectKey?: string;
}

export interface EnvelopeResult {
  success: boolean;
  assinaturaId?: string;
  envelopeId?: string;
  documentHash?: string;
  error?: string;
}

export interface DigitalSignatureProvider {
  createEnvelope(payload: EnvelopePayload): Promise<EnvelopeResult>;
  cancelEnvelope(envelopeId: string): Promise<{ success: boolean }>;
  downloadSignedDocument(envelopeId: string): Promise<{ pdfUrl: string }>;
  checkStatus(envelopeId: string): Promise<{ status: SignatureStatus }>;
}

/**
 * Adaptadores de Provedor de Assinatura Digital
 */
export class SignatureProviderAdapter implements DigitalSignatureProvider {
  constructor(private provedor: SignatureProviderName = 'CLICKSIGN') {}

  async createEnvelope(payload: EnvelopePayload): Promise<EnvelopeResult> {
    const envelopeId = `ENV-${this.provedor}-${crypto.randomUUID().toUpperCase()}`;
    const documentHash = `SHA256-${crypto.randomUUID().toUpperCase()}`;

    const { data: ass, error } = await supabase
      .from('assinaturas')
      .insert({
        empresa_operadora_id: payload.empresaOperadoraId,
        contrato_id: payload.contratoId,
        provedor: payload.provedor,
        status: 'ENVIADO',
        envelope_id: envelopeId,
        document_hash: documentHash,
        expira_em: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        pdf_original_key: payload.pdfOriginalObjectKey || `tenants/${payload.empresaOperadoraId}/contratos/${payload.contratoId}/contrato.pdf`,
      })
      .select('id')
      .single();

    if (error || !ass) return { success: false, error: error?.message };

    await supabase.from('assinatura_eventos').insert({
      assinatura_id: ass.id,
      evento: 'ENVIADO',
      detalhes: { provedor: payload.provedor, signatarios: payload.signatarios },
    });

    return { success: true, assinaturaId: ass.id, envelopeId, documentHash };
  }

  async cancelEnvelope(envelopeId: string): Promise<{ success: boolean }> {
    await supabase.from('assinaturas').update({ status: 'CANCELADO', cancelado_em: new Date().toISOString() }).eq('envelope_id', envelopeId);
    return { success: true };
  }

  async downloadSignedDocument(envelopeId: string): Promise<{ pdfUrl: string }> {
    const { data } = await supabase.from('assinaturas').select('pdf_assinado_key').eq('envelope_id', envelopeId).single();
    return { pdfUrl: data?.pdf_assinado_key || '' };
  }

  async checkStatus(envelopeId: string): Promise<{ status: SignatureStatus }> {
    const { data } = await supabase.from('assinaturas').select('status').eq('envelope_id', envelopeId).single();
    return { status: (data?.status as SignatureStatus) || 'ENVIADO' };
  }
}

export class DigitalSignatureService {
  /**
   * Processa Webhook do Provedor de Assinatura e Libera o PI automaticamente
   */
  async processWebhook(payload: {
    envelopeId: string;
    evento: 'ASSINADO' | 'RECUSADO' | 'EXPIRADO';
    pdfAssinadoKey?: string;
  }): Promise<{ success: boolean; piLiberado?: boolean }> {
    try {
      const { data: ass } = await supabase.from('assinaturas').select('*').eq('envelope_id', payload.envelopeId).single();
      if (!ass) return { success: false };

      const novoStatus: SignatureStatus = payload.evento;
      const assinadoEm = payload.evento === 'ASSINADO' ? new Date().toISOString() : null;

      await supabase
        .from('assinaturas')
        .update({
          status: novoStatus,
          assinado_em: assinadoEm,
          pdf_assinado_key: payload.pdfAssinadoKey || `tenants/${ass.empresa_operadora_id}/assinaturas/${ass.envelope_id}_signed.pdf`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ass.id);

      await supabase.from('assinatura_eventos').insert({
        assinatura_id: ass.id,
        evento: novoStatus === 'ASSINADO' ? 'ASSINADO' : 'WEBHOOK_RECEBIDO',
        detalhes: { webhookPayload: payload },
      });

      let piLiberado = false;

      // 2. Se o Contrato foi ASSINADO, atualiza Contrato e Libera Automática o PI (Pedido de Inserção)
      if (novoStatus === 'ASSINADO') {
        await supabase.from('contratos').update({ status: 'ASSINADO' }).eq('id', ass.contrato_id);

        const { data: pis } = await supabase.from('pedidos_insercao').select('id').eq('contrato_id', ass.contrato_id);

        if (pis && pis.length > 0) {
          const piIds = pis.map((p) => p.id);
          await supabase.from('pedidos_insercao').update({ status: 'LIBERADO' }).in('id', piIds);
          piLiberado = true;
        }

        // Auditoria
        await supabase.from('assinatura_auditoria').insert({
          empresa_operadora_id: ass.empresa_operadora_id,
          evento: 'PI_LIBERADO_AUTOMATICO',
          detalhes: { contrato_id: ass.contrato_id, envelope_id: payload.envelopeId },
        });
      }

      return { success: true, piLiberado };
    } catch (err) {
      return { success: false };
    }
  }

  /**
   * Lista Envelopes de Assinatura por Tenant
   */
  async listSignatures(empresaOperadoraId?: string): Promise<any[]> {
    try {
      let query = supabase.from('assinaturas').select('*, contrato:contratos(*)').order('created_at', { ascending: false });
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      const { data } = await query;
      return data || [];
    } catch (err) {
      return [];
    }
  }
}

export const digitalSignatureService = new DigitalSignatureService();
