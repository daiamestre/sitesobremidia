/**
 * F-150 — Rádio Comércio: playlists de áudio (músicas e promoções) que tocam em qualquer tela.
 * Tabelas radio_playlists / radio_playlist_itens (mesma regra de acesso das playlists de mídia) e o som da tela por
 * fn_definir_som_da_tela. A tela nasce sem áudio; as zonas nunca têm som.
 */
import { supabase } from '@/integrations/supabase/client';

export type ModoDeSom = 'MUDO' | 'MIDIAS' | 'RADIO';
export interface RadioPlaylist { id: string; nome: string; embaralhar: boolean; faixas?: number }
export interface FaixaDaRadio { id: string; media_id: string; nome: string; url: string | null; duracao_ms: number | null; posicao: number }
export interface AudioDaGaleria { id: string; name: string; file_url: string | null; duration_ms: number | null }

export const ROTULO_DO_SOM: Record<ModoDeSom, { titulo: string; detalhe: string }> = {
  MUDO: { titulo: 'Só mídias, sem áudio', detalhe: 'A tela mostra as mídias em silêncio.' },
  MIDIAS: { titulo: 'Som das mídias', detalhe: 'Toca o áudio dos vídeos da playlist principal.' },
  RADIO: { titulo: 'Rádio Comércio', detalhe: 'Toca a sua playlist de áudio; os vídeos ficam mudos.' },
};

/** Modo de som a partir do que está gravado na tela. Rádio só vale com playlist escolhida. */
export function modoDeSomDaTela(t: { audio_enabled?: boolean | null; radio_ativa?: boolean | null; radio_playlist_id?: string | null }): ModoDeSom {
  if (t.radio_ativa && t.radio_playlist_id) return 'RADIO';
  return t.audio_enabled === true ? 'MIDIAS' : 'MUDO';
}

/** "3:05" */
export function duracaoDaFaixa(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Duração total da rádio, por extenso curto: "1 h 12 min" / "8 min". */
export function duracaoTotal(faixas: Array<{ duracao_ms: number | null }>): string {
  const s = Math.round(faixas.reduce((t, f) => t + (f.duracao_ms && f.duracao_ms > 0 ? f.duracao_ms : 0), 0) / 1000);
  if (s <= 0) return '—';
  const h = Math.floor(s / 3600); const m = Math.max(1, Math.round((s % 3600) / 60));
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** Próxima faixa: em ordem, ou sorteada sem repetir a que acabou de tocar. */
export function proximaFaixa(total: number, atual: number, embaralhar: boolean, sorteio: () => number = Math.random): number {
  if (total <= 0) return -1;
  if (total === 1) return 0;
  if (!embaralhar) return (atual + 1 + total) % total;
  let n = Math.floor(sorteio() * (total - 1));
  if (n >= atual && atual >= 0) n += 1;
  return Math.min(Math.max(n, 0), total - 1);
}

const erro = (e: { message?: string } | null) => { if (e) throw new Error(e.message || 'Não foi possível concluir.'); };

export const radioService = {
  async listar(): Promise<RadioPlaylist[]> {
    const { data, error } = await supabase.from('radio_playlists' as never).select('id, nome, embaralhar, radio_playlist_itens(count)').order('nome');
    erro(error);
    return ((data as unknown as Array<{ id: string; nome: string; embaralhar: boolean; radio_playlist_itens?: Array<{ count: number }> }>) ?? [])
      .map((p) => ({ id: p.id, nome: p.nome, embaralhar: p.embaralhar, faixas: p.radio_playlist_itens?.[0]?.count ?? 0 }));
  },

  async criar(nome: string, userId: string): Promise<RadioPlaylist> {
    const { data, error } = await supabase.from('radio_playlists' as never).insert({ nome: nome.trim(), user_id: userId } as never).select('id, nome, embaralhar').single();
    erro(error);
    return { ...(data as unknown as RadioPlaylist), faixas: 0 };
  },

  async alterar(id: string, mudanca: Partial<Pick<RadioPlaylist, 'nome' | 'embaralhar'>>): Promise<void> {
    const { error } = await supabase.from('radio_playlists' as never).update({ ...mudanca, updated_at: new Date().toISOString() } as never).eq('id', id);
    erro(error);
  },

  async excluir(id: string): Promise<void> {
    const { error, count } = await supabase.from('radio_playlists' as never).delete({ count: 'exact' }).eq('id', id);
    erro(error);
    if (!count) throw new Error('A playlist não foi excluída: ela não é sua.');
  },

  async faixas(playlistId: string): Promise<FaixaDaRadio[]> {
    const { data, error } = await supabase.from('radio_playlist_itens' as never).select('id, media_id, posicao, media:media(name, file_url, duration_ms)').eq('playlist_id', playlistId).order('posicao').order('created_at');
    erro(error);
    return ((data as unknown as Array<{ id: string; media_id: string; posicao: number; media: { name: string; file_url: string | null; duration_ms: number | null } | null }>) ?? [])
      .map((f) => ({ id: f.id, media_id: f.media_id, posicao: f.posicao, nome: f.media?.name ?? 'Áudio', url: f.media?.file_url ?? null, duracao_ms: f.media?.duration_ms ?? null }));
  },

  async adicionar(playlistId: string, mediaId: string): Promise<void> {
    const { data: ultimo } = await supabase.from('radio_playlist_itens' as never).select('posicao').eq('playlist_id', playlistId).order('posicao', { ascending: false }).limit(1);
    const posicao = (((ultimo as unknown as Array<{ posicao: number }> | null) ?? [])[0]?.posicao ?? -1) + 1;
    const { error } = await supabase.from('radio_playlist_itens' as never).insert({ playlist_id: playlistId, media_id: mediaId, posicao } as never);
    erro(error);
  },

  async remover(itemId: string): Promise<void> {
    const { error } = await supabase.from('radio_playlist_itens' as never).delete().eq('id', itemId);
    erro(error);
  },

  /** Grava a nova ordem (posições 0, 1, 2…). */
  async reordenar(faixas: FaixaDaRadio[]): Promise<void> {
    for (let i = 0; i < faixas.length; i++) {
      if (faixas[i].posicao === i) continue;
      const { error } = await supabase.from('radio_playlist_itens' as never).update({ posicao: i } as never).eq('id', faixas[i].id);
      erro(error);
    }
  },

  /** Áudios da galeria (Minhas Mídias → Áudio), com busca pelo nome. */
  async audios(busca: string): Promise<AudioDaGaleria[]> {
    let q = supabase.from('media').select('id, name, file_url, duration_ms' as never).eq('file_type', 'audio').order('created_at', { ascending: false }).limit(40);
    if (busca.trim()) q = q.ilike('name', `%${busca.trim()}%`);
    const { data, error } = await q;
    erro(error);
    return (data as unknown as AudioDaGaleria[]) ?? [];
  },

  async definirSom(telaId: string, modo: ModoDeSom, radioId?: string | null, volume?: number | null): Promise<void> {
    const { error } = await supabase.rpc('fn_definir_som_da_tela' as never, { p_screen: telaId, p_modo: modo, p_radio: radioId ?? null, p_volume: volume ?? null } as never);
    erro(error);
  },
};
