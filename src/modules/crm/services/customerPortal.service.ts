import { supabase } from '@/integrations/supabase/client';

export interface CustomerApprovalPayload {
  empresaOperadoraId: string;
  producaoId: string;
  status: 'APROVADO' | 'REPROVADO_COM_AJUSTES';
  comentarios?: string;
  decididoPor: string;
}

export interface ProofOfPlayItem {
  id: string;
  capturedAt: string | null;
  screenshotUrl: string | null;
  deviceName: string | null;
  screenName: string | null;
  cidade: string | null;
  estado: string | null;
  enderecoInstalacao: string | null;
}

const STATUS_WORKFLOW_VIGENTE = ['EM_PRODUCAO', 'AGUARDANDO_APROVACAO', 'CAMPANHA_APROVADA', 'CAMPANHA_ATIVA'];

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

      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  /**
   * Busca a próxima aprovação de arte pendente do tenant (nunca hardcoded).
   * Pendente = registro de portal_aprovacoes do tenant sem data de decisão.
   */
  async getAprovacaoPendente(empresaOperadoraId: string): Promise<{ producaoId: string; titulo: string } | null> {
    try {
      const { data } = await supabase
        .from('portal_aprovacoes')
        .select('producao_id, producao:producoes(titulo)')
        .eq('empresa_operadora_id', empresaOperadoraId)
        .is('data_decisao', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data?.producao_id) return null;
      const titulo = (data as unknown as { producao: { titulo?: string } | null }).producao?.titulo || 'Produção aguardando aprovação';
      return { producaoId: data.producao_id, titulo };
    } catch (err) {
      return null;
    }
  }

  /**
   * Busca lista de Proof of Play (comprovantes de exibição) reais.
   * A RLS (pop_select_own → fn_player_can_access_screen) limita a leitura
   * às telas do tenant; o join com devices/screens resolve a identificação.
   */
  async getProofOfPlayList(): Promise<ProofOfPlayItem[]> {
    try {
      const { data, error } = await supabase
        .from('proof_of_play')
        .select(`
          id,
          captured_at,
          screenshot_url,
          devices!inner (
            id,
            name,
            screen_id,
            screen:screens!inner (
              name,
              cidade,
              estado,
              endereco_instalacao
            )
          )
        `)
        .order('captured_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return (data || []).map((p) => ({
        id: p.id,
        capturedAt: p.captured_at,
        screenshotUrl: p.screenshot_url,
        deviceName: p.devices?.name ?? null,
        screenName: p.devices?.screen?.name ?? null,
        cidade: p.devices?.screen?.cidade ?? null,
        estado: p.devices?.screen?.estado ?? null,
        enderecoInstalacao: p.devices?.screen?.endereco_instalacao ?? null,
      }));
    } catch (err) {
      console.error('[CustomerPortal] getProofOfPlayList:', err);
      return [];
    }
  }

  /**
   * Abre um novo chamado de suporte pelo cliente
   */
  async createSupportTicket(payload: {
    empresaOperadoraId: string;
    contratoId: string;
    assunto: string;
    descricao: string;
    prioridade: 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';
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

      return { success: true, ticketId: data.id };
    } catch (err) {
      return { success: false };
    }
  }

  /**
   * Lista chamados de suporte do cliente
   */
  async listSupportTickets(contratoId: string): Promise<unknown[]> {
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
  async getDashboardKPIs(clienteId: string, empresaOperadoraId?: string | null): Promise<{
    campanhasAtivas: number;
    artesAprovadasPct: number;
    contratosVigentes: number;
    chamadosAbertos: number;
  }> {
    try {
      // 1. Contratos Vigentes (status_workflow oficial)
      const { count: contratosVigentes } = await supabase
        .from('contratos')
        .select('*', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .in('status_workflow', STATUS_WORKFLOW_VIGENTE);

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

      // 3. Campanhas Ativas (status oficial do CRM)
      const { count: campanhasAtivas } = await supabase
        .from('campanhas')
        .select('*', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .in('status', ['APPROVED', 'ACTIVE']);

      // 4. % de artes aprovadas: decisões reais do cliente no tenant
      let artesAprovadasPct = 0;
      if (empresaOperadoraId) {
        const { data: decisoes } = await supabase
          .from('portal_aprovacoes')
          .select('status')
          .eq('empresa_operadora_id', empresaOperadoraId)
          .in('status', ['APROVADO', 'REPROVADO_COM_AJUSTES']);
        const total = decisoes?.length || 0;
        if (total > 0) {
          const aprovadas = decisoes!.filter((d) => d.status === 'APROVADO').length;
          artesAprovadasPct = Math.round((aprovadas / total) * 100);
        }
      }

      return {
        campanhasAtivas: campanhasAtivas || 0,
        artesAprovadasPct,
        contratosVigentes: contratosVigentes || 0,
        chamadosAbertos,
      };
    } catch (error) {
      return { campanhasAtivas: 0, artesAprovadasPct: 0, contratosVigentes: 0, chamadosAbertos: 0 };
    }
  }
}

export const customerPortalService = new CustomerPortalService();
