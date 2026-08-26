/**
 * SOBRE MÍDIA — playlistCliente.service
 * Playlists do ANUNCIANTE sobre as RPCs server-side (missão §23-§27).
 *
 * REGRA COMERCIAL CRÍTICA (enforcement no BACKEND — nunca só no frontend):
 *   - 1º vídeo de cada playlist: GRATUITO (liberado na hora);
 *   - cada vídeo adicional: R$ 19,99 via contas_receber (PIX avulso);
 *   - item adicional só entra APÓS confirmação real do pagamento
 *     (confirmar_video_playlist_pago exige conta PAGA/PAGO).
 */

import { supabase } from '@/integrations/supabase/client';
import { gerarBrcodePix, type StatusCobranca } from '@/modules/gestor/telaPago.service';

export const VALOR_VIDEO_ADICIONAL = 19.99;

export interface PlaylistCliente {
  id: string;
  nome: string;
  descricao?: string | null;
  status: 'ATIVA' | 'INATIVA';
  created_at: string;
  itens?: PlaylistItem[];
  pontos?: PlaylistPonto[];
}

export interface PlaylistItem {
  id: string;
  asset_id: string;
  ordem: number;
  duracao_segundos?: number | null;
  cobranca_id?: string | null;
  created_at: string;
  asset?: {
    id: string;
    nome: string;
    tipo: 'imagem' | 'video' | 'documento' | 'outro';
    object_url: string;
    mime_type?: string | null;
    tamanho?: number | null;
    duracao?: number | null;
  };
}

export interface PlaylistPonto {
  ponto_id: string;
  nome: string;
  cidade?: string | null;
  estado?: string | null;
}

export interface ResultadoAdicaoMidia {
  cobrado: boolean;
  valor: number;
  itemLiberado: boolean;
  cobrancaId?: string;
  codigo?: string;
}

export interface PontoContratado {
  ponto_id: string;
  nome: string;
  categoria?: string | null;
  cidade?: string | null;
  estado?: string | null;
  foto_url?: string | null;
  quantidade_telas: number;
  contrato_id: string;
  contrato_status: string;
}

export class PlaylistClienteService {
  /** Lista playlists + itens(+asset) + pontos vinculados em 3 consultas */
  async listarPlaylists(): Promise<PlaylistCliente[]> {
    const { data: playlists, error } = await supabase
      .from('playlists_cliente')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    const list = (playlists ?? []) as PlaylistCliente[];
    if (!list.length) return [];

    const ids = list.map((p) => p.id);

    const [{ data: itens, error: errItens }, { data: pontos, error: errPontos }] = await Promise.all([
      supabase
        .from('cliente_playlist_itens')
        .select('*, asset:cliente_assets(id, nome, tipo, object_url, mime_type, tamanho, duracao)')
        .in('playlist_id', ids)
        .order('ordem', { ascending: true }),
      supabase
        .from('cliente_playlist_pontos')
        .select('playlist_id, ponto:pontos(id, nome, cidade, estado)')
        .in('playlist_id', ids),
    ]);

    if (errItens) console.error('[PlaylistCliente] itens:', errItens);
    if (errPontos) console.error('[PlaylistCliente] pontos:', errPontos);

    for (const p of list) {
      p.itens = ((itens ?? []) as unknown as (PlaylistItem & { playlist_id: string })[])
        .filter((i) => i.playlist_id === p.id);
      p.pontos = ((pontos ?? []) as unknown as { playlist_id: string; ponto: PlaylistPonto['ponto'] & { id: string; nome: string; cidade: string; estado: string } }[])
        .filter((r) => r.playlist_id === p.id && r.ponto)
        .map((r) => ({ ponto_id: r.ponto.id, nome: r.ponto.nome, cidade: r.ponto.cidade, estado: r.ponto.estado }));
    }

    return list;
  }

  async criarPlaylist(nome: string, descricao?: string): Promise<string> {
    const { data, error } = await supabase.rpc('criar_playlist_cliente', {
      p_nome: nome,
      p_descricao: descricao ?? null,
    });
    if (error) throw new Error(error.message);
    return String(data);
  }

  async excluirPlaylist(id: string): Promise<void> {
    const { error } = await supabase.from('playlists_cliente').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  /**
   * Adiciona mídia aplicando a regra do vídeo gratuito/cobrado.
   * Se `cobrado=true`, o item NÃO entra até confirmar pagamento.
   */
  async adicionarMidia(
    playlistId: string,
    assetId: string,
    duracaoSegundos?: number | null
  ): Promise<ResultadoAdicaoMidia> {
    const { data, error } = await supabase.rpc('adicionar_midia_playlist', {
      p_playlist_id: playlistId,
      p_asset_id: assetId,
      p_duracao_segundos: duracaoSegundos ?? null,
    });
    if (error) throw new Error(error.message);

    const r = data as { cobrado: boolean; valor: number; cobranca_id?: string; codigo?: string; item_liberado?: boolean };
    return {
      cobrado: !!r.cobrado,
      valor: Number(r.valor ?? 0),
      itemLiberado: r.cobrado ? false : (r.item_liberado ?? true),
      cobrancaId: r.cobranca_id,
      codigo: r.codigo,
    };
  }

  async statusCobranca(cobrancaId: string): Promise<StatusCobranca> {
    const { data, error } = await supabase
      .from('contas_receber')
      .select('status')
      .eq('id', cobrancaId)
      .maybeSingle();
    if (error || !data) return 'NAO ENCONTRADA';
    return data.status === 'PAGA' || data.status === 'PAGO'
      ? 'PAGAMENTO CONFIRMADO'
      : 'AGUARDANDO PAGAMENTO';
  }

  gerarBrcodePix(codigo: string, valor = VALOR_VIDEO_ADICIONAL): string {
    return gerarBrcodePix(codigo, valor);
  }

  /** Após conciliação do PIX: insere o vídeo adicional (gate server-side de PAGA) */
  async confirmarVideoPago(
    cobrancaId: string,
    playlistId: string,
    assetId: string,
    duracaoSegundos?: number | null
  ): Promise<void> {
    const { error } = await supabase.rpc('confirmar_video_playlist_pago', {
      p_cobranca_id: cobrancaId,
      p_playlist_id: playlistId,
      p_asset_id: assetId,
      p_duracao_segundos: duracaoSegundos ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async removerItem(itemId: string): Promise<void> {
    const { error } = await supabase.from('cliente_playlist_itens').delete().eq('id', itemId);
    if (error) throw new Error(error.message);
  }

  async vincularPontos(playlistId: string, pontoIds: string[]): Promise<number> {
    const { data, error } = await supabase.rpc('vincular_pontos_playlist', {
      p_playlist_id: playlistId,
      p_ponto_ids: pontoIds,
    });
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  }

  async desvincularPonto(playlistId: string, pontoId: string): Promise<void> {
    const { error } = await supabase
      .from('cliente_playlist_pontos')
      .delete()
      .eq('playlist_id', playlistId)
      .eq('ponto_id', pontoId);
    if (error) throw new Error(error.message);
  }

  /** Pontos CONTRATADOS e ativos do próprio anunciante */
  async listarPontosContratados(): Promise<PontoContratado[]> {
    const { data, error } = await supabase.rpc('listar_pontos_contratados');
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as PontoContratado[];
  }

  // ======================================================================
  // FASE 17 — PUBLICAÇÃO NO PLAYER
  // Espelha a playlist nas tabelas canônicas do Player e aponta as telas
  // ativas do ponto (screens.ponto_id). Tela ocupada por outra playlist é
  // preservada (nunca invadida).
  // ======================================================================

  async publicarNoPonto(playlistId: string, pontoId: string): Promise<{
    playlist_player_id: string;
    telas_vinculadas: number;
    telas_ignoradas: number;
  }> {
    // RPCs da FASE 17 ainda não presentes no Database gerado — cast tipado
    const db = supabase as unknown as { rpc: (fn: 'publicar_playlist_no_ponto', args: { p_playlist_id: string; p_ponto_id: string }) => Promise<{ data: unknown; error: { message: string } | null }> };
    const { data, error } = await db.rpc('publicar_playlist_no_ponto', {
      p_playlist_id: playlistId,
      p_ponto_id: pontoId,
    });
    if (error) throw new Error(error.message);
    const r = data as { playlist_player_id: string; telas_vinculadas: number; telas_ignoradas: number };
    return {
      playlist_player_id: r.playlist_player_id,
      telas_vinculadas: Number(r.telas_vinculadas ?? 0),
      telas_ignoradas: Number(r.telas_ignoradas ?? 0),
    };
  }

  async despublicarDoPonto(playlistId: string, pontoId: string): Promise<number> {
    const db = supabase as unknown as { rpc: (fn: 'despublicar_playlist_do_ponto', args: { p_playlist_id: string; p_ponto_id: string }) => Promise<{ data: unknown; error: { message: string } | null }> };
    const { data, error } = await db.rpc('despublicar_playlist_do_ponto', {
      p_playlist_id: playlistId,
      p_ponto_id: pontoId,
    });
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  }

  /**
   * Publica a playlist no ecossistema do Player: espelha os itens liberados
   * para a playlist canônica do usuário (media/playlists/playlist_items).
   * Gate server-side bloqueia vídeos adicionais sem cobrança quitada.
   */
  async publicarNoPlayer(
    playlistId: string
  ): Promise<{ playlist_player_id: string; nome: string; itens: number }> {
    // RPC nova (20261029) ainda não presente no Database gerado — cast no
    // padrão customerPortalDb mantém type-safety do retorno.
    const db = supabase as unknown as { rpc: (fn: 'publicar_playlist_cliente', args: { p_playlist_id: string }) => Promise<{ data: unknown; error: { message: string } | null }> };
    const { data, error } = await db.rpc('publicar_playlist_cliente', {
      p_playlist_id: playlistId,
    });
    if (error) throw new Error(error.message);
    const r = data as { playlist_player_id: string; nome: string; itens: number };
    return {
      playlist_player_id: String(r.playlist_player_id),
      nome: r.nome,
      itens: Number(r.itens ?? 0),
    };
  }
}

export const playlistClienteService = new PlaylistClienteService();
