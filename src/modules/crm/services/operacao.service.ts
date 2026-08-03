import { supabase } from '@/integrations/supabase/client';

export type OperacaoStatus = 'INICIADA' | 'EM_EXECUCAO' | 'FALHA_DETECTADA' | 'RECUPERANDO' | 'ENCERRADA';
export type HealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';
export type AlertaTipo =
  | 'PLAYER_OFFLINE'
  | 'SINCRONIZACAO_ATRASADA'
  | 'CAMPANHA_INTERROMPIDA'
  | 'ARQUIVO_AUSENTE'
  | 'ERRO_REPRODUCAO'
  | 'ESPACO_INSUFICIENTE'
  | 'FALHA_COMUNICACAO';

export interface OperacaoCompleta {
  id: string;
  empresa_operadora_id: string;
  agendamento_id: string;
  pedido_insercao_id?: string;
  producao_id?: string;
  status: OperacaoStatus;
  inicio_execucao: string;
  fim_execucao?: string;
  ultima_sincronizacao: string;
  ultima_exibicao?: string;
  health_status: HealthStatus;
  created_at: string;
  agendamento?: any;
  pedido_insercao?: any;
  producao?: any;
  players?: any[];
  logs?: any[];
  alertas?: any[];
  metricas?: any[];
}

export class OperacaoService {
  /**
   * Inicializa uma Operação de Transmissão da Rede vinculada a um Agendamento válido
   */
  async startOperation(payload: {
    empresaOperadoraId: string;
    agendamentoId: string;
    pedidoInsercaoId?: string;
    producaoId?: string;
  }, usuarioId?: string): Promise<{ success: boolean; operacaoId?: string; error?: string }> {
    try {
      const { data: op, error } = await supabase
        .from('operacoes')
        .insert({
          empresa_operadora_id: payload.empresaOperadoraId,
          agendamento_id: payload.agendamentoId,
          pedido_insercao_id: payload.pedidoInsercaoId || null,
          producao_id: payload.producaoId || null,
          status: 'INICIADA',
          health_status: 'HEALTHY',
        })
        .select('id')
        .single();

      if (error || !op) return { success: false, error: error?.message || 'Falha ao iniciar operação.' };

      // Insere métricas iniciais
      await supabase.from('operacao_metricas').insert({
        operacao_id: op.id,
        quantidade_exibicoes: 0,
        disponibilidade_porcentagem: 100.00,
        taxa_falhas: 0.00,
        uptime_segundos: 0,
      });

      // Auditoria
      await supabase.from('operacao_auditoria').insert({
        operacao_id: op.id,
        evento: 'OPERACAO_INICIADA',
        usuario_id: usuarioId || null,
        detalhes: { agendamento_id: payload.agendamentoId },
      });

      return { success: true, operacaoId: op.id };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Registra Heartbeat periódico do Player e atualiza o estado online/offline
   */
  async registerHeartbeat(payload: {
    operacaoId: string;
    playerId?: string;
    versaoApp?: string;
    isOnline?: boolean;
  }): Promise<{ success: boolean }> {
    try {
      await supabase.from('operacao_players').insert({
        operacao_id: payload.operacaoId,
        player_id: payload.playerId || null,
        versao_app: payload.versaoApp || 'v3.0.4',
        ultimo_heartbeat: new Date().toISOString(),
        is_online: payload.isOnline ?? true,
      });

      await supabase
        .from('operacoes')
        .update({
          ultima_exibicao: new Date().toISOString(),
          status: 'EM_EXECUCAO',
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.operacaoId);

      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  /**
   * Emite alerta operacional imediato na rede
   */
  async createAlert(payload: {
    operacaoId: string;
    playerId?: string;
    tipo: AlertaTipo;
    nivel?: 'INFO' | 'WARNING' | 'CRITICAL';
    mensagem: string;
  }, usuarioId?: string): Promise<{ success: boolean }> {
    try {
      await supabase.from('operacao_alertas').insert({
        operacao_id: payload.operacaoId,
        player_id: payload.playerId || null,
        tipo: payload.tipo,
        nivel: payload.nivel || 'WARNING',
        mensagem: payload.mensagem,
      });

      if (payload.nivel === 'CRITICAL') {
        await supabase
          .from('operacoes')
          .update({ health_status: 'CRITICAL', status: 'FALHA_DETECTADA' })
          .eq('id', payload.operacaoId);
      }

      await supabase.from('operacao_auditoria').insert({
        operacao_id: payload.operacaoId,
        evento: 'ALERTA_CRIADO',
        usuario_id: usuarioId || null,
        detalhes: { tipo: payload.tipo, mensagem: payload.mensagem },
      });

      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  /**
   * Marca o alerta operacional como resolvido
   */
  async resolveAlert(alertaId: string, usuarioId?: string): Promise<{ success: boolean }> {
    try {
      const { data: alerta } = await supabase.from('operacao_alertas').select('*').eq('id', alertaId).single();

      await supabase
        .from('operacao_alertas')
        .update({ resolvido: true, resolvido_em: new Date().toISOString() })
        .eq('id', alertaId);

      if (alerta) {
        await supabase.from('operacao_auditoria').insert({
          operacao_id: alerta.operacao_id,
          evento: 'ALERTA_RESOLVIDO',
          usuario_id: usuarioId || null,
          detalhes: { alerta_id: alertaId },
        });
      }

      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  /**
   * Encerra a execução operacional da campanha
   */
  async stopOperation(operacaoId: string, usuarioId?: string): Promise<{ success: boolean }> {
    try {
      await supabase
        .from('operacoes')
        .update({
          status: 'ENCERRADA',
          fim_execucao: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', operacaoId);

      await supabase.from('operacao_auditoria').insert({
        operacao_id: operacaoId,
        evento: 'OPERACAO_ENCERRADA',
        usuario_id: usuarioId || null,
      });

      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  /**
   * Busca dados consolidados de uma Operação
   */
  async getOperation(operacaoId: string): Promise<OperacaoCompleta | null> {
    try {
      const { data, error } = await supabase
        .from('operacoes')
        .select(`
          *,
          agendamento:agendamentos(*),
          pedido_insercao:pedidos_insercao(*),
          producao:producoes(*),
          players:operacao_players(*, player:players(*)),
          logs:operacao_logs(*),
          alertas:operacao_alertas(*),
          metricas:operacao_metricas(*)
        `)
        .eq('id', operacaoId)
        .maybeSingle();

      if (error || !data) return null;
      return data as OperacaoCompleta;
    } catch (err) {
      return null;
    }
  }

  /**
   * Lista todas as operações ativas e encerradas do tenant
   */
  async listOperations(empresaOperadoraId?: string): Promise<OperacaoCompleta[]> {
    try {
      let query = supabase
        .from('operacoes')
        .select(`*, agendamento:agendamentos(*), pedido_insercao:pedidos_insercao(*), alertas:operacao_alertas(*), metricas:operacao_metricas(*)`)
        .order('created_at', { ascending: false });

      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);

      const { data } = await query;
      return (data || []) as OperacaoCompleta[];
    } catch (err) {
      return [];
    }
  }
}

export const operacaoService = new OperacaoService();
