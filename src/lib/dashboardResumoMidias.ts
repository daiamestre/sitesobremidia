import { supabase } from '@/integrations/supabase/client';
import { SemPermissaoError, type Alerta } from '@/lib/dashboardResumo';

/**
 * Dashboard do Gestor de Mídias para OWNER/ADM (RPC fn_dashboard_resumo_midias_owner — migração 20261253):
 * a operação de mídia da EMPRESA inteira. Gestor continua com o próprio resumo (fn_dashboard_resumo_gestor).
 */
export interface ResumoMidiasOwner {
  status: 'OK';
  gerado_em: string;
  parametros: { offline_min: number };
  telas: {
    total: number; online: number; offline: number; sem_playlist: number;
    offline_itens: Array<{ id: string; nome: string; local: string | null; ultimo_sinal: string | null }>;
    sem_playlist_itens: Array<{ id: string; nome: string }>;
    versoes: Array<{ versao: string; qtd: number }>;
  };
  exibicoes: { hoje: number; semana: number; serie_7d: Array<{ dia: string; total: number }> };
  playlists: { total: number; em_uso: number; recentes: Array<{ id: string; nome: string; alterada_em: string; itens: number }> };
  midias: { total: number; videos: number; imagens: number; semana: number };
  biblioteca: { pastas: number; itens: number; videos: number; imagens: number };
  widgets: { total: number; ativos: number; em_playlists: number; por_tipo: Record<string, number> };
  conteudo: {
    esportes_publicados: number; esportes_ultima: string | null; esportes_fontes_com_falha: number;
    noticias_ativas: number; noticias_ultima: string | null; noticias_saude: string | null;
  };
}

export async function fetchResumoMidiasOwner(): Promise<ResumoMidiasOwner> {
  const { data, error } = await supabase.rpc('fn_dashboard_resumo_midias_owner' as never, { p_offline_min: 10, p_tz: 'America/Sao_Paulo' } as never);
  if (error) throw error;
  const r = data as unknown as ResumoMidiasOwner | { status: 'SEM_PERMISSAO' };
  if (!r || r.status !== 'OK') throw new SemPermissaoError();
  return r as ResumoMidiasOwner;
}

/** Versão mínima com todos os recursos atuais (Esportes, fundo no YouTube). */
export const VERSAO_PLAYER_ATUAL = '5.6.1';

/** "5.6.0-MicroGate" < "5.6.1" ? (versão desconhecida conta como desatualizada). */
export function versaoAnterior(versao: string, minima = VERSAO_PLAYER_ATUAL): boolean {
  const a = /(\d+)\.(\d+)\.(\d+)/.exec(versao);
  if (!a) return true;
  const b = minima.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = Number(a[i + 1]);
    if (x !== b[i]) return x < b[i];
  }
  return false;
}

export function montarAlertasMidias(r: ResumoMidiasOwner, mensagensNaoLidas = 0): Alerta[] {
  const a: Alerta[] = [];
  const t = r.telas;
  if (t.offline > 0) {
    a.push({ id: 'telas', nivel: 'critico', titulo: `${t.offline} de ${t.total} ${t.total === 1 ? 'tela' : 'telas'} da empresa offline`, detalhe: `sem sinal há mais de ${r.parametros.offline_min} min`, link: '/dashboard/screens' });
  }
  if (t.sem_playlist > 0) {
    a.push({ id: 'sem-playlist', nivel: 'atencao', titulo: `${t.sem_playlist} ${t.sem_playlist === 1 ? 'tela sem playlist' : 'telas sem playlist'}`, detalhe: 'a tela fica sem conteúdo', link: '/dashboard/screens' });
  }
  const antigos = t.versoes.filter((v) => versaoAnterior(v.versao)).reduce((s, v) => s + v.qtd, 0);
  if (antigos > 0) {
    a.push({ id: 'player-antigo', nivel: 'atencao', titulo: `${antigos} ${antigos === 1 ? 'aparelho com Player desatualizado' : 'aparelhos com Player desatualizado'}`, detalhe: `instale o ${VERSAO_PLAYER_ATUAL} para Esportes e fundo no YouTube`, link: '/dashboard/screens' });
  }
  if (r.conteudo.esportes_fontes_com_falha > 0 || (r.conteudo.noticias_saude && r.conteudo.noticias_saude !== 'HEALTHY')) {
    a.push({ id: 'conteudo', nivel: 'atencao', titulo: 'Conteúdo automático com fonte instável', detalhe: 'o último conteúdo confirmado continua no ar', link: '/dashboard/biblioteca' });
  }
  if (t.total > 0 && r.exibicoes.hoje === 0) {
    a.push({ id: 'sem-exibicao', nivel: 'atencao', titulo: 'Nenhuma exibição registrada hoje', detalhe: 'confira se as telas estão reproduzindo', link: '/dashboard/analytics' });
  }
  if (mensagensNaoLidas > 0) {
    a.push({ id: 'mensagens', nivel: 'atencao', titulo: `${mensagensNaoLidas} ${mensagensNaoLidas === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`, detalhe: 'Central de Mensagens', link: '/dashboard/central' });
  }
  if (a.length === 0) a.push({ id: 'tudo-ok', nivel: 'ok', titulo: 'Tudo funcionando', detalhe: 'telas online, exibindo e com conteúdo', link: '/dashboard/screens' });
  return a;
}
