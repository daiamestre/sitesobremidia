import { supabase } from '@/integrations/supabase/client';
import { contratoDocumentoService } from './contratoDocumento.service';

export type SignatureProviderName = 'CLICKSIGN' | 'DOCUSIGN' | 'ADOBESIGN' | 'ASSINAFY' | 'ZAPSIGN' | 'ASSINADOR_INTERNO';
export type SignatureStatus = 'RASCUNHO' | 'ENVIADO' | 'VISUALIZADO' | 'ASSINADO' | 'RECUSADO' | 'EXPIRADO' | 'CANCELADO';

export interface EnvelopePayload {
  empresaOperadoraId: string;
  contratoId: string;
  provedor: SignatureProviderName;
  signatarios: { nome: string; email: string; cpfCnpj?: string }[];
  pdfOriginalObjectKey?: string;
  usuarioId?: string;
}

export interface EnvelopeResult {
  success: boolean;
  assinaturaId?: string;
  envelopeId?: string;
  documentHash?: string;
  secureToken?: string;
  downloadUrl?: string;
  signatarioNome?: string;
  signatarioEmail?: string;
  error?: string;
}

export interface DigitalSignatureProvider {
  createEnvelope(payload: EnvelopePayload): Promise<EnvelopeResult>;
  cancelEnvelope(envelopeId: string): Promise<{ success: boolean; error?: string }>;
  downloadSignedDocument(envelopeId: string): Promise<{ pdfUrl: string; fileName?: string }>;
  checkStatus(envelopeId: string): Promise<{ status: SignatureStatus; eventos?: any[] }>;
}

/**
 * Adaptadores de Provedor de Assinatura Digital.
 *
 * Fluxo REAL:
 *  - ASSINADOR_INTERNO: envelope criado com hash SHA-256 real do PDF original,
 *    persistido em `assinaturas`, contrato marcado ENVIADO e auditoria registrada.
 *  - Provedores externos (CLICKSIGN/DOCUSIGN/ADOBESIGN/ASSINAFY/ZAPSIGN): NÃO
 *    possuem credenciais configuradas nesta instância — recusam explicitamente
 *    em vez de gerar envelope falso.
 */
export class SignatureProviderAdapter implements DigitalSignatureProvider {
  constructor(private provedor: SignatureProviderName = 'ASSINADOR_INTERNO') {}

  async createEnvelope(payload: EnvelopePayload): Promise<EnvelopeResult> {
    if (this.provedor !== 'ASSINADOR_INTERNO') {
      return {
        success: false,
        error: `Provedor externo ${this.provedor} não configurado nesta instância. Utilize ASSINADOR_INTERNO.`,
      };
    }

    const resultado = await contratoDocumentoService.criarEnvelopeInterno(payload.contratoId, payload.usuarioId || '');

    if (!resultado.success) {
      return { success: false, error: resultado.error };
    }

    const { data: ass } = await supabase
      .from('assinaturas')
      .select('id, document_hash, signatario_nome, signatario_email')
      .eq('id', resultado.assinaturaId)
      .single();

    let downloadUrl: string | undefined;
    try {
      const { data: contrato } = await supabase
        .from('contratos')
        .select('pdf_object_key')
        .eq('id', payload.contratoId)
        .single();
      if (contrato?.pdf_object_key) {
        downloadUrl = await contratoDocumentoService.obterUrlDownload(contrato.pdf_object_key);
      }
    } catch {
      downloadUrl = undefined;
    }

    return {
      success: true,
      assinaturaId: resultado.assinaturaId,
      envelopeId: resultado.envelopeId,
      documentHash: ass?.document_hash,
      downloadUrl,
      signatarioNome: ass?.signatario_nome,
      signatarioEmail: ass?.signatario_email,
    };
  }

  async cancelEnvelope(envelopeId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: ass } = await supabase
        .from('assinaturas')
        .select('id')
        .eq('envelope_id', envelopeId)
        .single();

      if (!ass) return { success: false, error: 'Envelope não encontrado.' };

      const { error } = await supabase
        .from('assinaturas')
        .update({
          status: 'CANCELADO',
          cancelado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', ass.id);

      if (error) return { success: false, error: error.message };

      await supabase.from('assinatura_eventos').insert({
        assinatura_id: ass.id,
        evento: 'CANCELADO',
        detalhes: { motivo: 'Cancelado manualmente' },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao cancelar envelope.' };
    }
  }

  async downloadSignedDocument(envelopeId: string): Promise<{ pdfUrl: string; fileName?: string }> {
    try {
      const { data: ass } = await supabase
        .from('assinaturas')
        .select('pdf_assinado_key, pdf_original_key')
        .eq('envelope_id', envelopeId)
        .single();

      const key = ass?.pdf_assinado_key || ass?.pdf_original_key;
      if (!key) return { pdfUrl: '' };

      const pdfUrl = await contratoDocumentoService.obterUrlDownload(key);
      return { pdfUrl, fileName: key.split('/').pop() };
    } catch {
      return { pdfUrl: '' };
    }
  }

  async checkStatus(envelopeId: string): Promise<{ status: SignatureStatus; eventos?: any[] }> {
    const { data: ass } = await supabase
      .from('assinaturas')
      .select('id, status')
      .eq('envelope_id', envelopeId)
      .single();

    const { data: eventos } = await supabase
      .from('assinatura_eventos')
      .select('*')
      .eq('assinatura_id', ass?.id)
      .order('created_at', { ascending: false });

    return {
      status: (ass?.status as SignatureStatus) || 'ENVIADO',
      eventos: eventos || [],
    };
  }
}

/**
 * Busca eventos de assinatura para um envelope
 */
export async function fetchSignatureEvents(envelopeId: string): Promise<any[]> {
  try {
    const { data: ass } = await supabase
      .from('assinaturas')
      .select('id')
      .eq('envelope_id', envelopeId)
      .single();

    if (!ass) return [];

    const { data, error } = await supabase
      .from('assinatura_eventos')
      .select('*')
      .eq('assinatura_id', ass.id)
      .order('created_at', { ascending: false });

    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export class DigitalSignatureService {
  private adapter = new SignatureProviderAdapter('ASSINADOR_INTERNO');

  /**
   * Gera URL presigned de download do documento (assinado ou original) de um
   * envelope, com autorização REAL via Edge Function get-download-url.
   */
  async downloadSignedDocument(envelopeId: string): Promise<{ pdfUrl: string; fileName?: string }> {
    return this.adapter.downloadSignedDocument(envelopeId);
  }

  /**
   * Processa Webhook de provedor externo. Nenhum provedor externo está
   * configurado nesta instância; o ASSINADOR_INTERNO orquestra tudo via
   * contratoDocumentoService. Este método permanece REAL e correto para o
   * caso de um provedor externo ser conectado futuramente.
   */
  async processWebhook(payload: {
    envelopeId: string;
    evento: 'ASSINADO' | 'RECUSADO' | 'EXPIRADO';
    pdfAssinadoKey?: string;
  }): Promise<{ success: boolean; piLiberado?: boolean }> {
    try {
      const { data: ass } = await supabase.from('assinaturas').select('*').eq('envelope_id', payload.envelopeId).single();
      if (!ass) return { success: false };

      if (payload.evento === 'ASSINADO' && ass.status !== 'ASSINADO') {
        const agora = new Date().toISOString();
        if (!payload.pdfAssinadoKey) {
          return { success: false, error: 'Webhook de assinatura sem pdfAssinadoKey.' } as any;
        }

        await supabase
          .from('assinaturas')
          .update({
            status: 'ASSINADO',
            assinado_em: agora,
            pdf_assinado_key: payload.pdfAssinadoKey,
            updated_at: agora,
          })
          .eq('id', ass.id);

        await supabase.from('assinatura_eventos').insert({
          assinatura_id: ass.id,
          evento: 'ASSINADO',
          detalhes: { webhookPayload: payload },
        });

        await supabase
          .from('contratos')
          .update({
            status_documento: 'ASSINADO',
            documento_assinado_em: agora,
            pdf_assinado_key: payload.pdfAssinadoKey,
            status_workflow: 'AGUARDANDO_PAGAMENTO',
            updated_at: agora,
          })
          .eq('id', ass.contrato_id);

        await supabase.from('contrato_auditoria').insert({
          contrato_id: ass.contrato_id,
          evento: 'CONTRATO_ASSINADO',
          usuario_id: ass.assinado_por_usuario_id,
          tipo_contrato: null,
          detalhes: { envelope_id: payload.envelopeId, pdf_assinado_key: payload.pdfAssinadoKey, origem: 'webhook_externo' },
        });

        // Libera PIs para a fila de aprovação (transição válida do enum real)
        await supabase
          .from('pedidos_insercao')
          .update({ status: 'AGUARDANDO_APROVACAO', updated_at: agora })
          .eq('contrato_id', ass.contrato_id)
          .eq('status', 'EM_ELABORACAO');

        await supabase.from('assinatura_auditoria').insert({
          empresa_operadora_id: ass.empresa_operadora_id,
          evento: 'CONTRATO_ASSINADO_WEBHOOK_EXTERNO',
          detalhes: { contrato_id: ass.contrato_id, envelope_id: payload.envelopeId },
        });

        return { success: true, piLiberado: true };
      }

      if (payload.evento === 'RECUSADO' || payload.evento === 'EXPIRADO') {
        const novoStatus: SignatureStatus = payload.evento;
        await supabase
          .from('assinaturas')
          .update({
            status: novoStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ass.id);

        await supabase.from('assinatura_eventos').insert({
          assinatura_id: ass.id,
          evento: novoStatus,
          detalhes: { webhookPayload: payload },
        });
      }

      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  /**
   * Lista Envelopes de Assinatura por Tenant com eventos completos
   */
  async listSignatures(empresaOperadoraId?: string): Promise<any[]> {
    try {
      let query = supabase
        .from('assinaturas')
        .select(`
          *,
          contrato:contratos(id, numero_contrato, tipo_contrato, cliente_id, empresa:empresas(id, nome_fantasia, razao_social, cnpj)),
          eventos:assinatura_eventos(*)
        `)
        .order('created_at', { ascending: false });

      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      const { data } = await query;
      return data || [];
    } catch (err) {
      return [];
    }
  }

  /**
   * Busca uma assinatura específica pelo envelope_id, com dados completos
   */
  async findByEnvelopeId(envelopeId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('assinaturas')
        .select(`
          *,
          contrato:contratos(*),
          eventos:assinatura_eventos(*)
        `)
        .eq('envelope_id', envelopeId)
        .single();

      if (error || !data) return null;
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Marca o documento como visualizado pelo signatário (RPC real com validação
   * de propriedade do cliente).
   */
  async viewDocument(envelopeId: string, usuarioId?: string, clienteId?: string): Promise<{ success: boolean; status?: string; downloadUrl?: string; error?: string }> {
    try {
      const { data: ass } = await supabase
        .from('assinaturas')
        .select('id, pdf_original_key, status')
        .eq('envelope_id', envelopeId)
        .single();

      if (!ass) return { success: false, error: 'Envelope não encontrado.' };

      const vis = await contratoDocumentoService.registrarVisualizacaoAssinatura(ass.id);
      if (!vis.success) return { success: false, error: vis.error };

      let downloadUrl: string | undefined;
      try {
        downloadUrl = ass.pdf_original_key ? await contratoDocumentoService.obterUrlDownload(ass.pdf_original_key) : undefined;
      } catch {
        downloadUrl = undefined;
      }

      return { success: true, status: 'VISUALIZADO', downloadUrl };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao registrar visualização.' };
    }
  }

  /**
   * Assina o documento digitalmente (ASSINADOR INTERNO):
   * overlay de assinatura no PDF (pdf-lib), hash SHA-256 real, upload do documento
   * assinado para o R2 e persistência via RPC fn_assinar_contrato.
   */
  async signDocument(
    envelopeId: string,
    usuarioId: string,
    dadosSignatario?: {
      nome: string;
      email?: string;
      cpfCnpj?: string;
      signatureDataUrl?: string;
      method?: 'DRAWN' | 'TYPED';
    }
  ): Promise<{ success: boolean; signedDownloadUrl?: string; signedDocumentHash?: string; error?: string }> {
    try {
      const { data: ass } = await supabase
        .from('assinaturas')
        .select('id, status, signatario_nome, signatario_email, signatario_cpf_cnpj')
        .eq('envelope_id', envelopeId)
        .single();

      if (!ass) return { success: false, error: 'Envelope não encontrado.' };
      if (ass.status === 'ASSINADO') return { success: false, error: 'Documento já assinado.' };

      const resultado = await contratoDocumentoService.assinarDocumento(
        ass.id,
        {
          nome: dadosSignatario?.nome || ass.signatario_nome || '',
          email: dadosSignatario?.email || ass.signatario_email || '',
          cpfCnpj: dadosSignatario?.cpfCnpj || ass.signatario_cpf_cnpj || '',
          signatureDataUrl: dadosSignatario?.signatureDataUrl,
          method: dadosSignatario?.method,
        },
        undefined,
        typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        usuarioId
      );

      if (!resultado.success) {
        return { success: false, error: resultado.error };
      }

      let signedDownloadUrl: string | undefined;
      try {
        signedDownloadUrl = resultado.pdfAssinadoKey ? await contratoDocumentoService.obterUrlDownload(resultado.pdfAssinadoKey) : undefined;
      } catch {
        signedDownloadUrl = undefined;
      }

      return { success: true, signedDownloadUrl, signedDocumentHash: resultado.documentHash };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao assinar documento.' };
    }
  }
}

export const digitalSignatureService = new DigitalSignatureService();