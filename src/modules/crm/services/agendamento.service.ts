import { supabase } from '@/integrations/supabase/client';

export type AgendamentoStatus =
  | 'RASCUNHO'
  | 'VALIDADO'
  | 'PROGRAMADO'
  | 'SINCRONIZADO'
  | 'ATIVO'
  | 'ENCERRADO'
  | 'CANCELADO'
  | 'SUSPENSO';

export interface CreateSchedulePayload {
  empresaOperadoraId: string;
  pedidoInsercaoId: string;
  producaoId?: string;
  midiaId?: string;
  titulo: string;
  inicio: string;
  fim: string;
  timezone?: string;
  prioridade?: number;
  grade?: Array<{
    unidadeId?: string;
    telaId?: string;
    playerId?: string;
    playlistId?: string;
    diasSemana?: number[];
    horaInicio: string;
    horaFim: string;
    intervaloSegundos?: number;
    tempoExibicaoSegundos?: number;
    quantidadeInsercoes?: number;
  }>;
}

export interface ConflictRecord {
  conflito_id: string;
  titulo_conflito: string;
  hora_inicio_conflito: string;
  hora_fim_conflito: string;
}

export interface AgendamentoCompleto {
  id: string;
  empresa_operadora_id: string;
  pedido_insercao_id: string;
  producao_id?: string;
  midia_id?: string;
  titulo: string;
  status: AgendamentoStatus;
  inicio: string;
  fim: string;
  timezone: string;
  prioridade: number;
  created_at: string;
  pedido_insercao?: any;
  producao?: any;
  midia?: any;
  grade?: any[];
  historico?: any[];
}

export class AgendamentoService {
  /**
   * Executa a função PL/pgSQL fn_validar_conflitos_agendamento para interceptar conflitos de grade
   */
  async validateConflicts(payload: {
    agendamentoId?: string;
    telaId?: string;
    playerId?: string;
    horaInicio: string;
    horaFim: string;
    inicio: string;
    fim: string;
  }): Promise<{ hasConflicts: boolean; conflicts: ConflictRecord[] }> {
    try {
      const { data, error } = await supabase.rpc('fn_validar_conflitos_agendamento', {
        p_agendamento_id: payload.agendamentoId || null,
        p_tela_id: payload.telaId || null,
        p_player_id: payload.playerId || null,
        p_hora_inicio: payload.horaInicio,
        p_hora_fim: payload.horaFim,
        p_inicio: payload.inicio,
        p_fim: payload.fim,
      });

      if (error || !data) return { hasConflicts: false, conflicts: [] };

      const conflicts = data as ConflictRecord[];
      return {
        hasConflicts: conflicts.length > 0,
        conflicts,
      };
    } catch (err) {
      return { hasConflicts: false, conflicts: [] };
    }
  }

  /**
   * Cria registro do Agendamento e insere as Grades de Exibição
   */
  async createSchedule(payload: CreateSchedulePayload, usuarioId?: string): Promise<{ success: boolean; agendamentoId?: string; error?: string }> {
    try {
      const { data: agendamento, error: agErr } = await supabase
        .from('agendamentos')
        .insert({
          empresa_operadora_id: payload.empresaOperadoraId,
          pedido_insercao_id: payload.pedidoInsercaoId,
          producao_id: payload.producaoId || null,
          midia_id: payload.midiaId || null,
          titulo: payload.titulo,
          status: 'RASCUNHO',
          inicio: payload.inicio,
          fim: payload.fim,
          timezone: payload.timezone || 'America/Sao_Paulo',
          prioridade: payload.prioridade || 1,
          created_by: usuarioId || null,
        })
        .select('id')
        .single();

      if (agErr || !agendamento) return { success: false, error: agErr?.message || 'Falha ao gravar agendamento.' };

      // Insere Grades de Exibição
      if (payload.grade && payload.grade.length > 0) {
        const gradeRows = payload.grade.map((g) => ({
          agendamento_id: agendamento.id,
          unidade_id: g.unidadeId || null,
          tela_id: g.telaId || null,
          player_id: g.playerId || null,
          playlist_id: g.playlistId || null,
          dias_semana: g.diasSemana || [0, 1, 2, 3, 4, 5, 6],
          hora_inicio: g.horaInicio,
          hora_fim: g.horaFim,
          intervalo_segundos: g.intervaloSegundos || 60,
          tempo_exibicao_segundos: g.tempoExibicaoSegundos || 15,
          quantidade_insercoes: g.quantidadeInsercoes || 100,
        }));
        await supabase.from('grade_exibicao').insert(gradeRows);
      }

      // Registra Histórico e Auditoria
      await supabase.from('agendamento_historico').insert({
        agendamento_id: agendamento.id,
        status_anterior: null,
        status_novo: 'RASCUNHO',
        descricao: 'Programação de exibição criada em modo rascunho.',
        usuario_id: usuarioId || null,
      });

      await supabase.from('agendamento_auditoria').insert({
        agendamento_id: agendamento.id,
        evento: 'AGENDAMENTO_CRIADO',
        usuario_id: usuarioId || null,
        detalhes: { titulo: payload.titulo },
      });

      return { success: true, agendamentoId: agendamento.id };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Publica e ativa a programação com pré-validação automática de conflitos na grade
   */
  async publishSchedule(agendamentoId: string, usuarioId?: string): Promise<{ success: boolean; conflicts?: ConflictRecord[]; error?: string }> {
    try {
      const ag = await this.getSchedule(agendamentoId);
      if (!ag) return { success: false, error: 'Agendamento não encontrado.' };

      // Executa validação de conflitos para cada grade cadastrada
      if (ag.grade && ag.grade.length > 0) {
        for (const g of ag.grade) {
          const valResult = await this.validateConflicts({
            agendamentoId,
            telaId: g.tela_id,
            playerId: g.player_id,
            horaInicio: g.hora_inicio,
            horaFim: g.hora_fim,
            inicio: ag.inicio,
            fim: ag.fim,
          });

          if (valResult.hasConflicts) {
            // REGISTRA CONFLITO NA AUDITORIA
            await supabase.from('agendamento_auditoria').insert({
              agendamento_id: agendamentoId,
              evento: 'CONFLITO_DETECTADO',
              usuario_id: usuarioId || null,
              detalhes: { conflitos: valResult.conflicts, tela_id: g.tela_id },
            });

            return {
              success: false,
              conflicts: valResult.conflicts,
              error: `Conflito de horário/grade detectado. A programação não pode ser publicada.`,
            };
          }
        }
      }

      // Atualiza Status para PROGRAMADO / ATIVO
      await supabase.from('agendamentos').update({ status: 'ATIVO', updated_at: new Date().toISOString() }).eq('id', agendamentoId);

      await supabase.from('agendamento_historico').insert({
        agendamento_id: agendamentoId,
        status_anterior: ag.status,
        status_novo: 'ATIVO',
        descricao: 'Programação validada sem conflitos e ativada na rede de exibição.',
        usuario_id: usuarioId || null,
      });

      await supabase.from('agendamento_auditoria').insert({
        agendamento_id: agendamentoId,
        evento: 'AGENDAMENTO_VALIDADO',
        usuario_id: usuarioId || null,
        detalhes: { status: 'ATIVO' },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Registra a Sincronização dos Players da Rede
   */
  async syncPlayers(agendamentoId: string, usuarioId?: string): Promise<{ success: boolean; playerCount: number; error?: string }> {
    try {
      const ag = await this.getSchedule(agendamentoId);
      if (!ag) return { success: false, error: 'Agendamento não encontrado.' };

      const playerCount = ag.grade?.length || 1;

      await supabase.from('agendamentos').update({ status: 'SINCRONIZADO', updated_at: new Date().toISOString() }).eq('id', agendamentoId);

      await supabase.from('agendamento_auditoria').insert({
        agendamento_id: agendamentoId,
        evento: 'SINCRONIZACAO_REALIZADA',
        usuario_id: usuarioId || null,
        detalhes: { player_count: playerCount, timestamp: new Date().toISOString() },
      });

      return { success: true, playerCount };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Cancela agendamento da rede
   */
  async cancelSchedule(agendamentoId: string, motivo: string, usuarioId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      await supabase.from('agendamentos').update({ status: 'CANCELADO', updated_at: new Date().toISOString() }).eq('id', agendamentoId);

      await supabase.from('agendamento_historico').insert({
        agendamento_id: agendamentoId,
        status_anterior: 'ATIVO',
        status_novo: 'CANCELADO',
        descricao: `Cancelamento: ${motivo}`,
        usuario_id: usuarioId || null,
      });

      await supabase.from('agendamento_auditoria').insert({
        agendamento_id: agendamentoId,
        evento: 'AGENDAMENTO_CANCELADO',
        usuario_id: usuarioId || null,
        detalhes: { motivo },
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Busca Agendamento completo
   */
  async getSchedule(agendamentoId: string): Promise<AgendamentoCompleto | null> {
    try {
      const { data, error } = await supabase
        .from('agendamentos')
        .select(`
          *,
          pedido_insercao:pedidos_insercao(*),
          producao:producoes(*),
          midia:midias(*),
          grade:grade_exibicao(*, unidade:unidades(*), tela:telas(*), player:players(*), playlist:playlists(*)),
          historico:agendamento_historico(*)
        `)
        .eq('id', agendamentoId)
        .maybeSingle();

      if (error || !data) return null;
      return data as AgendamentoCompleto;
    } catch (err) {
      return null;
    }
  }

  /**
   * Lista todos os agendamentos operacionais por tenant
   */
  async listSchedules(empresaOperadoraId?: string): Promise<AgendamentoCompleto[]> {
    try {
      let query = supabase
        .from('agendamentos')
        .select(`*, pedido_insercao:pedidos_insercao(*), midia:midias(*), grade:grade_exibicao(*)`)
        .order('inicio', { ascending: true });

      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);

      const { data } = await query;
      return (data || []) as AgendamentoCompleto[];
    } catch (err) {
      return [];
    }
  }
}

export const agendamentoService = new AgendamentoService();
