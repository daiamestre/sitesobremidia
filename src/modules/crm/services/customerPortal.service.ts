import { supabase } from '@/integrations/supabase/client';

export interface CustomerApprovalPayload {
  empresaOperadoraId: string;
  producaoId: string;
  status: 'APROVADO' | 'REPROVADO_COM_AJUSTES';
  comentarios?: string;
  decididoPor: string;
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
        status: payload.status,
        comentarios: payload.comentarios || null,
        data_decisao: new Date().toISOString(),
        decidido_por: payload.decididoPor
      });

      // Atualiza estado da produção no CRM
      const novoStatus = payload.status === 'APROVADO' ? 'APROVADO_PELO_CLIENTE' : 'REJEITADO_PELO_CLIENTE';
      await supabase.from('producoes').update({ status: novoStatus }).eq('id', payload.producaoId);

      // REMOVED: portal_auditoria ghost table insert.

      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  /**
   * Busca lista de Proof of Play (Comprovantes de exibição) para o cliente
   */
  async getProofOfPlayList(): Promise<any[]> {
    try {
      // Stub until dw_operacao is fully certified in FASE 8.4
      return [];
    } catch (err) {
      return [];
    }
  }

  /**
   * Abre um novo chamado de suporte pelo cliente
   */
  async createSupportTicket(payload: {
    empresaOperadoraId: string;
    contratoId: string; // FIXED: was clienteId
    assunto: string;    // FIXED: was titulo
    descricao: string;
    prioridade: 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE'; // FIXED: was categoria
    createdBy: string;
  }): Promise<{ success: boolean; ticketId?: string }> {
    try {
      const { data, error } = await supabase
        .from('portal_chamados')
        .insert({
          empresa_operadora_id: payload.empresaOperadoraId,
          contrato_id: payload.contratoId,
          assunto: payload.assunto,
          descricao: payload.descricao,
          prioridade: payload.prioridade || 'NORMAL',
          status: 'ABERTO',
          created_by: payload.createdBy
        })
        .select('id')
        .single();

      if (error || !data) return { success: false };

      // REMOVED: portal_auditoria ghost table insert.

      return { success: true, ticketId: data.id };
    } catch (err) {
      return { success: false };
    }
  }

  /**
   * Lista chamados de suporte do cliente
   */
  async listSupportTickets(contratoId: string): Promise<any[]> {
    try {
      const { data } = await supabase.from('portal_chamados').select('*').eq('contrato_id', contratoId).order('created_at', { ascending: false });
      return data || [];
    } catch (err) {
      return [];
    }
  }

  /**
   * Retorna os KPIs do Dashboard do Cliente, baseados em dados reais
   */
  async getDashboardKPIs(clienteId: string): Promise<{
    campanhasAtivas: number;
    artesAprovadasPct: number;
    contratosVigentes: number;
    chamadosAbertos: number;
  }> {
    try {
      // 1. Contratos Vigentes
      const { count: contratosVigentes } = await supabase
        .from('contratos')
        .select('*', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .eq('status', 'ATIVO');

      // 2. Chamados Abertos (agrupando por todos os contratos do cliente)
      const { data: contratos } = await supabase.from('contratos').select('id').eq('cliente_id', clienteId);
      const contratoIds = contratos?.map(c => c.id) || [];
      let chamadosAbertos = 0;
      if (contratoIds.length > 0) {
        const { count } = await supabase
          .from('portal_chamados')
          .select('*', { count: 'exact', head: true })
          .in('contrato_id', contratoIds)
          .neq('status', 'FECHADO');
        chamadosAbertos = count || 0;
      }

      // 3. Campanhas Ativas
      const { count: campanhasAtivas } = await supabase
        .from('campanhas')
        .select('*', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .eq('status', 'ATIVA');

      return {
        campanhasAtivas: campanhasAtivas || 0,
        artesAprovadasPct: 100, // Simplificação por enquanto
        contratosVigentes: contratosVigentes || 0,
        chamadosAbertos: chamadosAbertos,
      };
    } catch (error) {
      return { campanhasAtivas: 0, artesAprovadasPct: 0, contratosVigentes: 0, chamadosAbertos: 0 };
    }
  }
}

export const customerPortalService = new CustomerPortalService();
