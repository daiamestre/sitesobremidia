import { supabase } from '@/integrations/supabase/client';
import { SemPermissaoError, type Alerta } from '@/lib/dashboardResumo';

/** Resumo do dia do GESTOR DE MÍDIAS (RPC fn_dashboard_resumo_gestor: só telas/playlists/mídias do próprio usuário). */
export interface ResumoGestor {
  status: 'OK';
  gerado_em: string;
  parametros: { offline_min: number };
  telas: {
    total: number; online: number; offline: number; sem_playlist: number;
    offline_itens: Array<{ id: string; nome: string; local: string | null; ultimo_sinal: string | null }>;
    sem_playlist_itens: Array<{ id: string; nome: string }>;
  };
  exibicoes: { hoje: number; semana: number; serie_7d: Array<{ dia: string; total: number }> };
  playlists: {
    total: number; em_uso: number; itens_agendados: number;
    recentes: Array<{ id: string; nome: string; alterada_em: string; itens: number }>;
  };
  midias: {
    total: number; videos: number; imagens: number; semana: number;
    recentes: Array<{ id: string; nome: string; tipo: string; duration_ms: number | null; enviada_em: string }>;
  };
}

export async function fetchResumoGestor(): Promise<ResumoGestor> {
  const { data, error } = await supabase.rpc('fn_dashboard_resumo_gestor' as never, { p_offline_min: 10, p_tz: 'America/Sao_Paulo' } as never);
  if (error) throw error;
  const r = data as unknown as ResumoGestor | { status: 'SEM_PERMISSAO' };
  if (!r || r.status !== 'OK') throw new SemPermissaoError();
  return r as ResumoGestor;
}

export function montarAlertasGestor(r: ResumoGestor, mensagensNaoLidas = 0): Alerta[] {
  const a: Alerta[] = [];
  if (r.telas.offline > 0) {
    a.push({ id: 'telas', nivel: 'critico', titulo: `${r.telas.offline} de ${r.telas.total} ${r.telas.total === 1 ? 'tela' : 'telas'} offline`, detalhe: `sem sinal há mais de ${r.parametros.offline_min} min`, link: '/dashboard/screens' });
  }
  if (r.telas.sem_playlist > 0) {
    a.push({ id: 'sem-playlist', nivel: 'atencao', titulo: `${r.telas.sem_playlist} ${r.telas.sem_playlist === 1 ? 'tela sem playlist' : 'telas sem playlist'}`, detalhe: 'a tela fica sem conteúdo', link: '/dashboard/screens' });
  }
  if (r.telas.total > 0 && r.exibicoes.hoje === 0) {
    a.push({ id: 'sem-exibicao', nivel: 'atencao', titulo: 'Nenhuma exibição registrada hoje', detalhe: 'confira se as telas estão reproduzindo', link: '/dashboard/analytics' });
  }
  if (mensagensNaoLidas > 0) {
    a.push({ id: 'mensagens', nivel: 'atencao', titulo: `${mensagensNaoLidas} ${mensagensNaoLidas === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`, detalhe: 'Central de Mensagens', link: '/dashboard/central' });
  }
  if (a.length === 0) a.push({ id: 'tudo-ok', nivel: 'ok', titulo: 'Tudo funcionando', detalhe: 'todas as telas online e exibindo', link: '/dashboard/screens' });
  return a;
}
