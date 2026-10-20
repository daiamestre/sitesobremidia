import { supabase } from '@/integrations/supabase/client';
import { OCULTOS_PADRAO } from '@/lib/launcherApps';

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
  media?: { id: string; name: string; file_url: string | null; file_type: string | null; thumbnail_url: string | null; aspect_ratio?: string | null } | null;
}

export interface AppVisto { pacote: string; nome: string; aparelhos: number; visto_em: string }

export interface MidiaEscolhivel { id: string; name: string; file_url: string | null; file_type: string | null; thumbnail_url: string | null; aspect_ratio?: string | null }

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: unknown) => any };

export async function empresaDaConta(): Promise<string | null> {
  const { data } = await db.rpc('fn_biblioteca_tenant');
  return (data as string | null) ?? null;
}

export function configPadrao(empresa: string): ConfigLauncher {
  return {
    empresa_operadora_id: empresa, segundos_para_abrir_player: 30, minutos_de_uso_livre: 30,
    mostrar_relogio: true, mostrar_clima: true, mostrar_wifi: true, apps_ocultos: [...OCULTOS_PADRAO], apps_liberados: [],
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
    .select('id, media_id, vitrine, ordem, duracao_s, ativo, media:media_id (id, name, file_url, file_type, thumbnail_url, aspect_ratio)')
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

/** Mídias (imagem/vídeo) que o dono/ADM pode pôr no fundo, buscando pelo nome. */
export async function buscarMidias(texto: string): Promise<MidiaEscolhivel[]> {
  let q = db.from('media').select('id, name, file_url, file_type, thumbnail_url, aspect_ratio')
    .or('file_type.ilike.image%,file_type.ilike.video%').like('file_url', 'https://%')
    .order('created_at', { ascending: false }).limit(60);
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
