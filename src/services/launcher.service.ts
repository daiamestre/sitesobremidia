import { supabase } from '@/integrations/supabase/client';
import { OCULTOS_PADRAO } from '@/lib/launcherApps';
import { buscarMidias as buscarNaBiblioteca, listarPastas } from '@/lib/biblioteca';

/** F-200 — launcher Sobre Mídia: configuração, mídias de fundo e apps vistos nos aparelhos (só dono/ADM). */

export interface ConfigLauncher {
  empresa_operadora_id: string;
  segundos_para_abrir_player: number;
  minutos_de_uso_livre: number;
  mostrar_relogio: boolean;
  mostrar_clima: boolean;
  mostrar_wifi: boolean;
  apps_ocultos: string[];
  apps_liberados: string[];
  /** F-209: cor do fundo (#RRGGBB) ou null = fundo padrão Sobre Mídia. */
  fundo_cor?: string | null;
  /** F-209: imagem de capa. F-213: a cor continua sendo a cor do app (botões, Menu) por cima da capa. */
  capa_media_id?: string | null;
}

/** As 4 telas do cartão "Destaques Sobre Mídia" da launcher (F-200). */
export const VITRINES = [
  { id: 'tv1', nome: 'TV 1', formato: '16:9' },
  { id: 'tv2', nome: 'TV 2', formato: '16:9' },
  { id: 'totem1', nome: 'Totem 1', formato: '9:16' },
  { id: 'totem2', nome: 'Totem 2', formato: '9:16' },
] as const;
export type Vitrine = (typeof VITRINES)[number]['id'];

export interface ItemDeFundo {
  id: string;
  media_id: string;
  vitrine: Vitrine;
  ordem: number;
  duracao_s: number;
  ativo: boolean;
  media?: { id: string; name: string; file_url: string | null; file_type: string | null; thumbnail_url: string | null; aspect_ratio?: string | null; duration_ms?: number | null } | null;
}

export interface AppVisto { pacote: string; nome: string; aparelhos: number; visto_em: string }

export interface MidiaEscolhivel { id: string; name: string; file_url: string | null; file_type: string | null; thumbnail_url: string | null; aspect_ratio?: string | null; duration_ms?: number | null }

const CAMPOS_DA_MIDIA = 'id, name, file_url, file_type, thumbnail_url, aspect_ratio, duration_ms';

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: unknown) => any };

export async function empresaDaConta(): Promise<string | null> {
  const { data } = await db.rpc('fn_biblioteca_tenant');
  return (data as string | null) ?? null;
}

export function configPadrao(empresa: string): ConfigLauncher {
  return {
    empresa_operadora_id: empresa, segundos_para_abrir_player: 30, minutos_de_uso_livre: 30,
    mostrar_relogio: true, mostrar_clima: true, mostrar_wifi: true, apps_ocultos: [...OCULTOS_PADRAO], apps_liberados: [],
    fundo_cor: null, capa_media_id: null,
  };
}

export async function carregarConfig(empresa: string): Promise<ConfigLauncher> {
  const { data, error } = await db.from('launcher_configuracao').select('*').eq('empresa_operadora_id', empresa).maybeSingle();
  if (error) throw error;
  return (data as ConfigLauncher | null) ?? configPadrao(empresa);
}

export async function salvarConfig(cfg: ConfigLauncher): Promise<void> {
  const { error } = await db.from('launcher_configuracao').upsert({ ...cfg, updated_at: new Date().toISOString() }, { onConflict: 'empresa_operadora_id' });
  if (error) throw error;
}

export async function carregarFundo(empresa: string): Promise<ItemDeFundo[]> {
  const { data, error } = await db.from('launcher_fundo')
    .select('id, media_id, vitrine, ordem, duracao_s, ativo, media:media_id (id, name, file_url, file_type, thumbnail_url, aspect_ratio, duration_ms)')
    .eq('empresa_operadora_id', empresa).order('ordem').order('created_at');
  if (error) throw error;
  return (data as ItemDeFundo[]) ?? [];
}

export async function adicionarAoFundo(empresa: string, midias: MidiaEscolhivel[], vitrine: Vitrine, ordemInicial: number): Promise<void> {
  if (!midias.length) return;
  const linhas = midias.map((m, i) => ({
    empresa_operadora_id: empresa, media_id: m.id, vitrine, ordem: ordemInicial + i,
    duracao_s: (m.file_type ?? '').startsWith('video') ? 30 : 10,
  }));
  const { error } = await db.from('launcher_fundo').insert(linhas);
  if (error) throw error;
}

export async function atualizarItemDoFundo(id: string, mudanca: Partial<Pick<ItemDeFundo, 'ordem' | 'duracao_s' | 'ativo' | 'vitrine'>>): Promise<void> {
  const { error } = await db.from('launcher_fundo').update(mudanca).eq('id', id);
  if (error) throw error;
}

export async function removerDoFundo(id: string): Promise<void> {
  const { error } = await db.from('launcher_fundo').delete().eq('id', id);
  if (error) throw error;
}

/** F-209: de onde vêm as mídias — as enviadas (Minhas Mídias) ou a Biblioteca automática/compartilhada. */
export type OrigemDasMidias = 'enviadas' | 'biblioteca';

/**
 * Mídias que o dono/ADM pode pôr nos Destaques (ou como capa), buscando pelo nome. F-209: separadas por origem — antes
 * vinham só as 60 mais recentes de tudo, e o robô de conteúdo automático (centenas por semana) escondia as enviadas.
 */
export async function buscarMidias(texto: string, origem: OrigemDasMidias = 'enviadas', somenteImagem = false): Promise<MidiaEscolhivel[]> {
  let q = db.from('media').select(CAMPOS_DA_MIDIA)
    .or(somenteImagem ? 'file_type.ilike.image%' : 'file_type.ilike.image%,file_type.ilike.video%').like('file_url', 'https://%')
    .eq('biblioteca', origem === 'biblioteca')
    .order('created_at', { ascending: false }).limit(120);
  const t = texto.trim();
  if (t) q = q.ilike('name', `%${t.replace(/[%_]/g, '')}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data as MidiaEscolhivel[]) ?? [];
}

/** Apps informados pelos aparelhos, um por pacote, com quantos aparelhos têm. */
export async function carregarAppsVistos(empresa: string): Promise<AppVisto[]> {
  const { data, error } = await db.from('launcher_apps_vistos').select('pacote, nome, aparelho, visto_em')
    .eq('empresa_operadora_id', empresa).limit(5000);
  if (error) throw error;
  const porPacote = new Map<string, AppVisto & { _ap: Set<string> }>();
  for (const l of (data as { pacote: string; nome: string | null; aparelho: string; visto_em: string }[]) ?? []) {
    const atual = porPacote.get(l.pacote) ?? { pacote: l.pacote, nome: l.nome || l.pacote, aparelhos: 0, visto_em: l.visto_em, _ap: new Set<string>() };
    atual._ap.add(l.aparelho);
    atual.aparelhos = atual._ap.size;
    if (l.visto_em > atual.visto_em) atual.visto_em = l.visto_em;
    porPacote.set(l.pacote, atual);
  }
  return [...porPacote.values()].map(({ _ap: _ignorado, ...a }) => a).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** F-209: mídias pelos ids (as que acabaram de ser enviadas, a capa escolhida). */
export async function midiasPorId(ids: string[]): Promise<MidiaEscolhivel[]> {
  if (!ids.length) return [];
  const { data, error } = await db.from('media').select(CAMPOS_DA_MIDIA).in('id', ids);
  if (error) throw error;
  const porId = new Map(((data as MidiaEscolhivel[]) ?? []).map((m) => [m.id, m]));
  return ids.map((id) => porId.get(id)).filter((m): m is MidiaEscolhivel => !!m);
}

/**
 * F-213 — pastas do seletor de mídias da launcher. "Enviadas" = as pastas de Minhas Mídias (Vídeos e Fotos);
 * "Biblioteca" = as pastas da página Biblioteca (mesma RPC e permissões), com quantas mídias têm.
 */
export interface PastaDeMidias { id: string; nome: string; total: number; capa_url?: string | null; automatica?: boolean }

const ehTipoAceito = (tipo: string | null | undefined, somenteImagem: boolean) =>
  somenteImagem ? (tipo ?? '').startsWith('image') : /^(image|video)/.test(tipo ?? '');

export async function buscarPastas(_empresa: string, origem: OrigemDasMidias, somenteImagem = false): Promise<PastaDeMidias[]> {
  if (origem === 'enviadas') {
    const contar = async (tipo: 'video' | 'image') => {
      const { count, error } = await db.from('media').select('id', { count: 'exact', head: true })
        .eq('biblioteca', false).ilike('file_type', `${tipo}%`).like('file_url', 'https://%');
      if (error) throw error;
      return count ?? 0;
    };
    const fotos: PastaDeMidias = { id: 'image', nome: 'Fotos', total: await contar('image') };
    if (somenteImagem) return [fotos];
    return [{ id: 'video', nome: 'Vídeos', total: await contar('video') }, fotos];
  }
  // Biblioteca: as mesmas pastas e permissões da página Biblioteca (RPC oficial, com a contagem de vídeos e fotos)
  const pastas = await listarPastas();
  return pastas.map((p) => ({ id: p.id, nome: p.nome, total: somenteImagem ? p.imagens : p.videos + p.imagens, capa_url: p.capa_url }))
    .filter((p) => p.total > 0);
}

/** F-213: as mídias de UMA pasta (Enviadas: "video"/"image"; Biblioteca: o id da pasta), filtrando pelo nome. */
export async function buscarMidiasDaPasta(origem: OrigemDasMidias, pasta: string, texto = '', somenteImagem = false): Promise<MidiaEscolhivel[]> {
  const t = texto.trim().replace(/[%_]/g, '');
  if (origem === 'enviadas') {
    let q = db.from('media').select(CAMPOS_DA_MIDIA).eq('biblioteca', false).ilike('file_type', `${pasta === 'video' ? 'video' : 'image'}%`)
      .like('file_url', 'https://%').order('created_at', { ascending: false }).limit(300);
    if (t) q = q.ilike('name', `%${t}%`);
    const { data, error } = await q;
    if (error) throw error;
    return (data as MidiaEscolhivel[]) ?? [];
  }
  // Biblioteca: a busca oficial dentro da pasta (mesma ordem e permissões da página Biblioteca)
  const lista = await buscarNaBiblioteca({ pastaId: pasta, busca: t, tipo: somenteImagem ? 'image' : '', limite: 500 });
  return lista.filter((m) => (m.file_url ?? '').startsWith('https://') && ehTipoAceito(m.file_type, somenteImagem))
    .map((m) => ({ id: m.media_id, name: m.nome, file_url: m.file_url, file_type: m.file_type, thumbnail_url: m.thumbnail_url,
      aspect_ratio: m.aspect_ratio, duration_ms: m.duration_ms }));
}
