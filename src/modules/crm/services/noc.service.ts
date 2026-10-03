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

      // F-124: contagem feita no banco, só das últimas 24 h. As exibições não gravam a empresa — quem limita o que
      // cada usuário enxerga é a regra de acesso da tela (RLS), então não se filtra por empresa aqui.
      const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [{ count: totalExibicoes }, { count: totalFalhas }] = await Promise.all([
        supabase.from('playback_logs').select('id', { count: 'exact', head: true }).gte('started_at', desde),
        supabase.from('playback_logs').select('id', { count: 'exact', head: true }).gte('started_at', desde).eq('resultado', 'ERROR'),
      ]);
      const exibicoes24h = totalExibicoes || 0;
      const falhas24h = totalFalhas || 0;

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
      // F-124: falha de consulta não vira número inventado
      return { totalPlayers: 0, onlinePlayers: 0, offlinePlayers: 0, disponibilidadePct: 0, alertasCriticos: 0, exibicoes24h: 0, falhas24h: 0 };
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
      // F-124: playback_logs não tem ligação formal com screens (o Player grava o identificador como texto) e não
      // grava a empresa — a consulta antiga respondia erro 400. O nome da tela é buscado à parte.
      void empresaOperadoraId;
      const { data, error } = await supabase.from('playback_logs').select(`
        *,
        agendamento:agendamentos(titulo)
      `).order('started_at', { ascending: false }).limit(20);
      if (error || !data) return [];

      const ids = [...new Set(data.map((l) => String(l.screen_id || '')).filter(Boolean))];
      const ehUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      const uuids = ids.filter(ehUuid);
      const codigos = ids.filter((v) => !ehUuid(v));
      const telas = new Map<string, { name: string; location: string | null }>();
      if (uuids.length) {
        const { data: porId } = await supabase.from('screens').select('id, name, location').in('id', uuids);
        for (const t of porId || []) telas.set(String(t.id), { name: t.name, location: t.location });
      }
      if (codigos.length) {
        const { data: porCodigo } = await supabase.from('screens').select('custom_id, name, location').in('custom_id', codigos);
        for (const t of porCodigo || []) if (t.custom_id) telas.set(String(t.custom_id), { name: t.name, location: t.location });
      }
      return data.map((l) => ({ ...l, screen: telas.get(String(l.screen_id || '')) || null })) as unknown as PlaybackLogItem[];
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
