import { supabase } from '@/integrations/supabase/client';
import type { ResultadoAdicao } from '@/lib/biblioteca';

/**
 * Pasta inteira da Biblioteca na playlist (F-93, migração 20261263). A playlist ganha UM item que aponta para a pasta;
 * o Player (>= 5.6.8) toca um conteúdo da pasta a cada volta da playlist, do 1º ao último, e recomeça. Conteúdo novo na
 * pasta entra sozinho (as telas sincronizam).
 */
export const DURACAO_PADRAO_PASTA = 10;

export async function adicionarPastaAPlaylists(pastaId: string, playlistIds: string[], duracao = DURACAO_PADRAO_PASTA): Promise<ResultadoAdicao> {
  const { data, error } = await supabase.rpc('biblioteca_adicionar_pasta_playlists' as never, {
    p_pasta_id: pastaId, p_playlist_ids: playlistIds, p_duracao: duracao,
  } as never);
  if (error) throw new Error(/pasta_nao_encontrada/.test(error.message) ? 'Pasta não encontrada (pode ter ido para a Lixeira).' : error.message);
  return data as unknown as ResultadoAdicao;
}

/** Texto do item de pasta na lista de reprodução. */
export function rotuloItemPasta(nome: string | null | undefined): string {
  return `Pasta: ${nome ?? 'removida'}`;
}
