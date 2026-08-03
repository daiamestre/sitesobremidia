import { supabase } from '@/integrations/supabase/client';

export interface CustomerApprovalPayload {
  empresaOperadoraId: string;
  producaoId: string;
  versao: number;
  status: 'APROVADO' | 'REJEITADO';
  comentario?: string;
}

export class CustomerPortalService {
  /**
   * Processa aprovação/rejeição de arte de campanha pelo anunciante
   */
  async submitArtworkApproval(payload: CustomerApprovalPayload): Promise<{ success: boolean }> {
    try {
      await supabase.from('portal_aprovacoes').insert({
        empresa_operadora_id: payload.empresaOperadoraId,
        producao_id: payload.producaoId,
        versao: payload.versao,
        status: payload.status,
        comentario: payload.comentario || null,
        aprovado_em: payload.status === 'APROVADO' ? new Date().toISOString() : null,
      });

      // Atualiza estado da produção no CRM
      const novoStatus = payload.status === 'APROVADO' ? 'APROVADO_PELO_CLIENTE' : 'REJEITADO_PELO_CLIENTE';
      await supabase.from('producao_midia').update({ status: novoStatus }).eq('id', payload.producaoId);

      // Audit Log
      await supabase.from('portal_auditoria').insert({
        empresa_operadora_id: payload.empresaOperadoraId,
        evento: 'APROVACAO',
        detalhes: { producaoId: payload.producaoId, status: payload.status },
      });

      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  /**
   * Busca lista de Proof of Play (Comprovantes de exibição) para o cliente
   */
  async getProofOfPlayList(clienteId: string): Promise<any[]> {
    try {
      const { data } = await supabase.from('dw_operacao').select('*').limit(20);
      return data || [];
    } catch (err) {
      return [];
    }
  }

  /**
   * Abre um novo chamado de suporte pelo cliente
   */
  async createSupportTicket(payload: {
    empresaOperadoraId: string;
    clienteId: string;
    titulo: string;
    descricao: string;
    categoria: string;
  }): Promise<{ success: boolean; ticketId?: string }> {
    try {
      const { data, error } = await supabase
        .from('portal_chamados')
        .insert({
          empresa_operadora_id: payload.empresaOperadoraId,
          cliente_id: payload.clienteId,
          titulo: payload.titulo,
          descricao: payload.descricao,
          categoria: payload.categoria,
          status: 'ABERTO',
        })
        .select('id')
        .single();

      if (error || !data) return { success: false };

      await supabase.from('portal_auditoria').insert({
        empresa_operadora_id: payload.empresaOperadoraId,
        evento: 'CHAMADO',
        detalhes: { ticketId: data.id, titulo: payload.titulo },
      });

      return { success: true, ticketId: data.id };
    } catch (err) {
      return { success: false };
    }
  }

  /**
   * Lista chamados de suporte do cliente
   */
  async listSupportTickets(clienteId: string): Promise<any[]> {
    try {
      const { data } = await supabase.from('portal_chamados').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false });
      return data || [];
    } catch (err) {
      return [];
    }
  }
}

export const customerPortalService = new CustomerPortalService();
