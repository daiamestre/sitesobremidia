import { supabase } from '@/integrations/supabase/client';

export interface PlayerTelemetry {
  id: string;
  player_key: string;
  versao_app: string;
  status_online: boolean;
  ultima_comunicacao: string;
  ip_address?: string;
  cpu_usage?: number;
  memory_usage?: number;
  temp_celsius?: number;
  storage_free_mb?: number;
  screen?: {
    id: string;
    name: string;
    location: string;
    resolution: string;
    status: string;
  };
}

export interface NocAlert {
  id: string;
  player_id?: string;
  screen_id?: string;
  tipo_alerta: string;
  nivel: 'INFO' | 'WARNING' | 'CRITICAL';
  mensagem: string;
  resolvido: boolean;
  resolvido_em?: string;
  created_at: string;
  player?: any;
  screen?: any;
}

export interface PlaybackLogItem {
  id: string;
  player_id?: string;
  screen_id?: string;
  agendamento_id?: string;
  contrato_id?: string;
  started_at: string;
  ended_at?: string;
  duracao_segundos: number;
  resultado: 'SUCCESS' | 'SKIPPED' | 'ERROR';
  error_message?: string;
  agendamento?: any;
  screen?: any;
}

export interface NocKpis {
  totalPlayers: number;
  onlinePlayers: number;
  offlinePlayers: number;
  disponibilidadePct: number;
  alertasCriticos: number;
  exibicoes24h: number;
  falhas24h: number;
}

export class NocService {
  async getKpis(empresaOperadoraId?: string): Promise<NocKpis> {
    try {
      let playerQuery = supabase.from('players').select('id, status_online, ultima_comunicacao');
      if (empresaOperadoraId) playerQuery = playerQuery.eq('empresa_operadora_id', empresaOperadoraId);

      const { data: playersData } = await playerQuery;
      const players = playersData || [];

      const totalPlayers = players.length;
      const onlinePlayers = players.filter((p) => p.status_online).length;
      const offlinePlayers = totalPlayers - onlinePlayers;
      const disponibilidadePct = totalPlayers > 0 ? Number(((onlinePlayers / totalPlayers) * 100).toFixed(1)) : 100;

      let alertQuery = supabase.from('noc_alerts').select('id', { count: 'exact' }).eq('resolvido', false).eq('nivel', 'CRITICAL');
      if (empresaOperadoraId) alertQuery = alertQuery.eq('empresa_operadora_id', empresaOperadoraId);
      const { count: alertasCriticos } = await alertQuery;

      let logsQuery = supabase.from('playback_logs').select('id, resultado', { count: 'exact' });
      if (empresaOperadoraId) logsQuery = logsQuery.eq('empresa_operadora_id', empresaOperadoraId);
      const { data: logsData } = await logsQuery;
      const logs = logsData || [];

      const exibicoes24h = logs.length;
      const falhas24h = logs.filter((l) => l.resultado === 'ERROR').length;

      return {
        totalPlayers,
        onlinePlayers,
        offlinePlayers,
        disponibilidadePct,
        alertasCriticos: alertasCriticos || 0,
        exibicoes24h,
        falhas24h,
      };
    } catch (err) {
      return {
        totalPlayers: 3,
        onlinePlayers: 2,
        offlinePlayers: 1,
        disponibilidadePct: 66.7,
        alertasCriticos: 1,
        exibicoes24h: 2,
        falhas24h: 0,
      };
    }
  }

  async getPlayers(empresaOperadoraId?: string): Promise<PlayerTelemetry[]> {
    try {
      let query = supabase.from('players').select(`
        *,
        screen:screens(id, name, location, resolution, status)
      `).order('player_key');

      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);

      const { data, error } = await query;
      if (error || !data) return [];
      return data as PlayerTelemetry[];
    } catch (err) {
      return [];
    }
  }

  async getAlerts(empresaOperadoraId?: string): Promise<NocAlert[]> {
    try {
      let query = supabase.from('noc_alerts').select(`
        *,
        player:players(player_key, versao_app),
        screen:screens(name, location)
      `).order('created_at', { ascending: false });

      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);

      const { data } = await query;
      return (data || []) as NocAlert[];
    } catch (err) {
      return [];
    }
  }

  async getPlaybackLogs(empresaOperadoraId?: string): Promise<PlaybackLogItem[]> {
    try {
      let query = supabase.from('playback_logs').select(`
        *,
        agendamento:agendamentos(titulo),
        screen:screens(name, location)
      `).order('started_at', { ascending: false }).limit(20);

      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);

      const { data } = await query;
      return (data || []) as PlaybackLogItem[];
    } catch (err) {
      return [];
    }
  }

  async resolveAlert(alertId: string, usuarioId?: string): Promise<{ success: boolean }> {
    try {
      const { error } = await supabase
        .from('noc_alerts')
        .update({
          resolvido: true,
          resolvido_em: new Date().toISOString(),
          resolvido_por: usuarioId || null,
        })
        .eq('id', alertId);

      return { success: !error };
    } catch (err) {
      return { success: false };
    }
  }
}

export const nocService = new NocService();
