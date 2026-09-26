import { supabase } from '@/integrations/supabase/client';

/**
 * Biblioteca de Mídias (acervo oficial por empresa) — migração 20261244.
 * O arquivo da Biblioteca é uma linha de `media` (a mesma que o Player toca); pastas e Lixeira ficam em
 * biblioteca_pastas / biblioteca_itens. Toda regra de permissão está no banco (RLS + RPC); aqui só se chama.
 *
 * contexto 'painel' = Owner/ADM/Gestor (playlists e telas próprias, /dashboard);
 * contexto 'portal' = Anunciante (playlists do portal, telas onde já publicou, /portal).
 */
export type ContextoBiblioteca = 'painel' | 'portal';
export type TipoMidia = 'video' | 'image' | 'audio';

export interface PastaBiblioteca {
  id: string; nome: string; descricao: string | null; ordem: number;
  total: number; videos: number; imagens: number; capa_url: string | null;
}

export interface MidiaBiblioteca {
  item_id: string; media_id: string; nome: string; file_type: TipoMidia | string; file_url: string;
  thumbnail_url: string | null; duration_ms: number | null; mime_type: string; file_size: number;
  aspect_ratio: string | null; pasta_id: string; pasta_nome: string; tags: string[]; descricao: string | null; created_at: string;
}

export interface PlaylistDestino { id: string; nome: string; itens: number; detalhe?: string }
export interface TelaDestino { id: string; nome: string; detalhe: string | null; habilitada: boolean; motivo: string | null }
export interface ResultadoAdicao { adicionadas: number; recusadas: Array<{ id: string; motivo: string; tela?: string }>; aviso?: string }

export interface LixeiraBiblioteca {
  pastas: Array<{ id: string; nome: string; deleted_at: string; total: number }>;
  midias: Array<{ item_id: string; nome: string; file_type: string; thumbnail_url: string | null; file_url: string;
    pasta_id: string; pasta_nome: string; pasta_na_lixeira: boolean; deleted_at: string; usos: number }>;
}

// RPCs novas ainda não estão nos tipos gerados do Supabase (mesmo padrão de brasiliaTime/playbackStats).
async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome as never, (args ?? {}) as never);
  if (error) throw new Error(mensagemAmigavel(error.message));
  return data as T;
}

const MENSAGENS: Array<[RegExp, string]> = [
  [/sem_permissao/, 'Apenas Owner/ADM podem administrar a Biblioteca.'],
  [/nome_vazio/, 'Informe o nome da pasta.'],
  [/nome_longo/, 'O nome da pasta pode ter até 80 caracteres.'],
  [/nome_invalido/, 'O nome não pode ter \\ / < > : " | ? *'],
  [/nome_duplicado/, 'Já existe uma pasta com esse nome.'],
  [/pasta_na_lixeira/, 'A pasta desta mídia está na Lixeira: restaure a pasta primeiro.'],
  [/ja_existe_no_destino/, 'A mídia já está nessa pasta.'],
  [/midia_indisponivel/, 'Esta mídia não está mais disponível na Biblioteca.'],
  [/midia_fora_do_escopo/, 'Só é possível adicionar mídias enviadas por você.'],
  [/pasta_nao_encontrada|midia_nao_encontrada|pasta_destino_nao_encontrada/, 'Item não encontrado (pode ter sido removido).'],
  [/sem vínculo comercial/i, 'Seu usuário não está vinculado a um cliente.'],
  [/titulo_vazio/, 'Informe o título da mídia.'],
];
export function mensagemAmigavel(msg: string): string {
  for (const [re, texto] of MENSAGENS) if (re.test(msg)) return texto;
  return msg;
}

// ------------------------------------------------------------ leitura
export const souAdminBiblioteca = () => rpc<boolean>('fn_biblioteca_admin');
export const listarPastas = () => rpc<PastaBiblioteca[]>('biblioteca_listar_pastas').then((r) => r ?? []);
export function buscarMidias(opts: { busca?: string; tipo?: TipoMidia | ''; pastaId?: string | null; limite?: number; offset?: number } = {}) {
  return rpc<MidiaBiblioteca[]>('biblioteca_buscar', {
    p_busca: opts.busca?.trim() || null, p_tipo: opts.tipo || null, p_pasta_id: opts.pastaId ?? null,
    p_limite: opts.limite ?? 60, p_offset: opts.offset ?? 0,
  }).then((r) => r ?? []);
}

// ------------------------------------------------------------ administração (Owner/ADM — o banco confere)
export const criarPasta = (nome: string, descricao?: string) => rpc<string>('biblioteca_criar_pasta', { p_nome: nome, p_descricao: descricao ?? null });
export const renomearPasta = (pastaId: string, nome: string) => rpc<void>('biblioteca_renomear_pasta', { p_pasta_id: pastaId, p_nome: nome });
export const duplicarPasta = (pastaId: string, nome?: string) => rpc<string>('biblioteca_duplicar_pasta', { p_pasta_id: pastaId, p_nome: nome ?? null });
export const excluirPasta = (pastaId: string) => rpc<void>('biblioteca_excluir_pasta', { p_pasta_id: pastaId });
export const restaurarPasta = (pastaId: string) => rpc<string>('biblioteca_restaurar_pasta', { p_pasta_id: pastaId });
export const vincularMidias = (pastaId: string, mediaIds: string[]) => rpc<number>('biblioteca_vincular_midias', { p_pasta_id: pastaId, p_media_ids: mediaIds });
export const editarMidia = (itemId: string, titulo: string, descricao: string, tags: string[]) =>
  rpc<void>('biblioteca_editar_item', { p_item_id: itemId, p_titulo: titulo, p_descricao: descricao, p_tags: tags });
export const moverMidia = (itemId: string, pastaDestino: string) => rpc<void>('biblioteca_mover_item', { p_item_id: itemId, p_pasta_destino: pastaDestino });
export const copiarMidia = (itemId: string, pastaDestino: string) => rpc<string>('biblioteca_copiar_item', { p_item_id: itemId, p_pasta_destino: pastaDestino });
export const excluirMidia = (itemId: string) => rpc<void>('biblioteca_excluir_item', { p_item_id: itemId });
export const restaurarMidia = (itemId: string) => rpc<void>('biblioteca_restaurar_item', { p_item_id: itemId });
export const lixeira = () => rpc<LixeiraBiblioteca>('biblioteca_lixeira');

interface ResultadoPurga { chaves_r2: string[]; preservadas_em_uso: number }
/** Apaga do R2 os arquivos que o banco liberou (mídia órfã e sem uso). Falha no R2 não desfaz a exclusão. */
async function limparR2(chaves: string[]) {
  for (const objectKey of chaves) {
    try { await supabase.functions.invoke('delete-media-object', { body: { objectKey } }); }
    catch (e) { console.warn('[Biblioteca] R2 não removeu', objectKey, e); }
  }
}
export async function excluirPastaDefinitivo(pastaId: string) {
  const r = await rpc<ResultadoPurga>('biblioteca_excluir_pasta_definitivo', { p_pasta_id: pastaId });
  await limparR2(r.chaves_r2 ?? []);
  return r;
}
export async function excluirMidiaDefinitivo(itemId: string) {
  const r = await rpc<ResultadoPurga>('biblioteca_excluir_item_definitivo', { p_item_id: itemId });
  await limparR2(r.chaves_r2 ?? []);
  return r;
}

// ------------------------------------------------------------ consumo (Adicionar à Playlist / à Tela)
export async function buscarPlaylists(contexto: ContextoBiblioteca, busca: string): Promise<PlaylistDestino[]> {
  if (contexto === 'portal') {
    const r = await rpc<Array<{ id: string; nome: string; itens: number; publicada: boolean }>>('biblioteca_playlists_cliente', { p_busca: busca || null, p_limite: 20 });
    return (r ?? []).map((p) => ({ id: p.id, nome: p.nome, itens: Number(p.itens), detalhe: p.publicada ? 'Publicada nas telas' : 'Ainda não publicada' }));
  }
  const r = await rpc<Array<{ id: string; nome: string; itens: number; telas: number }>>('biblioteca_minhas_playlists', { p_busca: busca || null, p_limite: 20 });
  return (r ?? []).map((p) => ({ id: p.id, nome: p.nome, itens: Number(p.itens), detalhe: Number(p.telas) > 0 ? `Em ${p.telas} tela(s)` : 'Sem tela' }));
}

export async function adicionarAPlaylists(contexto: ContextoBiblioteca, mediaId: string, playlistIds: string[]): Promise<ResultadoAdicao> {
  if (contexto === 'portal') {
    const r = await rpc<ResultadoAdicao & { playlists_publicadas: number }>('biblioteca_adicionar_playlist_cliente', { p_media_id: mediaId, p_playlist_ids: playlistIds });
    return { ...r, aviso: r.playlists_publicadas > 0 ? 'Para atualizar as telas, publique a playlist novamente em Playlists.' : undefined };
  }
  return rpc<ResultadoAdicao>('biblioteca_adicionar_playlists', { p_media_id: mediaId, p_playlist_ids: playlistIds });
}

export async function buscarTelas(contexto: ContextoBiblioteca, busca: string): Promise<TelaDestino[]> {
  if (contexto === 'portal') {
    const r = await rpc<Array<{ id: string; nome: string; ponto_nome: string | null; playlist_nome: string }>>('biblioteca_telas_cliente', { p_busca: busca || null, p_limite: 30 });
    return (r ?? []).map((t) => ({ id: t.id, nome: t.nome, detalhe: [t.ponto_nome, `Playlist: ${t.playlist_nome}`].filter(Boolean).join(' · '), habilitada: true, motivo: null }));
  }
  const r = await rpc<Array<{ id: string; nome: string; ativa: boolean; playlist_nome: string | null; pode_adicionar: boolean; motivo: string | null }>>('biblioteca_minhas_telas', { p_busca: busca || null, p_limite: 30 });
  return (r ?? []).map((t) => ({
    id: t.id, nome: t.nome, habilitada: t.pode_adicionar, motivo: t.motivo,
    detalhe: [t.ativa ? null : 'Inativa', t.playlist_nome ? `Playlist: ${t.playlist_nome}` : null].filter(Boolean).join(' · ') || null,
  }));
}

export async function adicionarATelas(contexto: ContextoBiblioteca, mediaId: string, screenIds: string[]): Promise<ResultadoAdicao> {
  if (contexto === 'portal') {
    const r = await rpc<ResultadoAdicao & { detalhe: Array<{ acao: string; erro?: string }> }>('biblioteca_adicionar_telas_cliente', { p_media_id: mediaId, p_screen_ids: screenIds });
    const falha = (r.detalhe ?? []).find((d) => d.acao === 'nao_publicada');
    return { ...r, aviso: falha ? `Não foi possível publicar: ${mensagemAmigavel(falha.erro ?? '')}` : undefined };
  }
  return rpc<ResultadoAdicao>('biblioteca_adicionar_telas', { p_media_id: mediaId, p_screen_ids: screenIds });
}

// ------------------------------------------------------------ apresentação
export function duracaoCurta(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null;
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
export const ROTULO_TIPO: Record<string, string> = { video: 'Vídeo', image: 'Imagem', audio: 'Áudio' };
export function contagemPasta(p: Pick<PastaBiblioteca, 'total'>): string {
  const n = Number(p.total);
  return n === 1 ? '1 mídia' : `${n} mídias`;
}
