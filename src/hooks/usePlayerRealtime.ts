import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UsePlayerRealtimeProps {
  screenId: string;
  playlistId: string | null;
  onPlaylistUpdate: () => void;
  onScreenUpdate: () => void;
  onScheduleUpdate: () => void;
}

/**
 * Hook para gerenciar atualizações em tempo real do player
 * 
 * FUNCIONALIDADE:
 * - Escuta mudanças na tela (configurações, widgets)
 * - Escuta mudanças nos itens da playlist
 * - Escuta mudanças nos agendamentos
 * 
 * ESTABILIDADE:
 * - Cleanup automático de channels ao desmontar
 * - Reconexão automática em caso de falha
 */
export function usePlayerRealtime({
  screenId,
  playlistId,
  onPlaylistUpdate,
  onScreenUpdate,
  onScheduleUpdate,
}: UsePlayerRealtimeProps) {

  // Subscrever a mudanças na tela
  useEffect(() => {
    if (!screenId) return;

    const channel = supabase
      .channel(`screen-${screenId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'screens',
          filter: `id=eq.${screenId}`,
        },
        (payload) => {
          // Ignorar updates gerados pelo próprio ping do player (last_ping_at/updated_at),
          // para não causar re-renderizações constantes durante a reprodução.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const oldRow = (payload as any).old ?? null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newRow = (payload as any).new ?? null;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const strip = (row: any) => {
            if (!row) return row;
            const { last_ping_at, updated_at, ...rest } = row;
            return rest;
          };

          if (oldRow && newRow) {
            try {
              if (JSON.stringify(strip(oldRow)) === JSON.stringify(strip(newRow))) {
                return;
              }
            } catch {
              // Se falhar a comparação, seguimos com update normal
            }
          }

          console.log('[Realtime] Tela atualizada:', payload);
          onScreenUpdate();
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Status da conexão (screen):', status);
      });

    return () => {
      console.log('[Realtime] Removendo channel screen');
      supabase.removeChannel(channel);
    };
  }, [screenId, onScreenUpdate]);

  // Subscrever a mudanças nos itens da playlist
  useEffect(() => {
    if (!playlistId) return;

    const channel = supabase
      .channel(`playlist-items-${playlistId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'playlist_items',
          filter: `playlist_id=eq.${playlistId}`,
        },
        (payload) => {
          console.log('[Realtime] Playlist atualizada:', payload);
          onPlaylistUpdate();
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Status da conexão (playlist):', status);
      });

    return () => {
      console.log('[Realtime] Removendo channel playlist');
      supabase.removeChannel(channel);
    };
  }, [playlistId, onPlaylistUpdate]);

  // Subscrever a mudanças nos schedules
  useEffect(() => {
    if (!screenId) return;

    const channel = supabase
      .channel(`schedules-${screenId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'screen_schedules',
          filter: `screen_id=eq.${screenId}`,
        },
        (payload) => {
          console.log('[Realtime] Schedule atualizado:', payload);
          onScheduleUpdate();
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Status da conexão (schedule):', status);
      });

    return () => {
      console.log('[Realtime] Removendo channel schedule');
      supabase.removeChannel(channel);
    };
  }, [screenId, onScheduleUpdate]);

  // Subscrever a mudanças na bilbioteca de mídias (Global)
  // Se uma mídia for atualizada (ex: arquivo trocado), precismos recarregar a playlist
  // para pegar a nova URL.
  useEffect(() => {
    // Escuta qualquer mudança na tabela medias. 
    // Idealmente filtraríamos apenas pelas mídias da playlist atual, 
    // mas como não temos a lista de IDs de mídia fácil aqui, um refresh global é aceitável para segurança.
    const channel = supabase
      .channel('public-medias-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'medias',
        },
        (payload) => {
          console.log('[Realtime] Mídia atualizada na biblioteca:', payload);
          // Debounce ou apenas chamar update
          onPlaylistUpdate();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') console.log('[Realtime] Escutando atualizações de mídia');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onPlaylistUpdate]);

  // --------------------------------------------------------------------------
  // POLLING FALLBACK (Reliability)
  // --------------------------------------------------------------------------
  // Ensures data stays fresh even if WebSocket connection drops or is blocked.
  useEffect(() => {
    if (!screenId && !playlistId) return;

    console.log('[Realtime] Starting Polling Fallback (60s)');
    const interval = setInterval(() => {
      console.log('[Realtime] Polling sync...');
      onScreenUpdate();
      if (playlistId) onPlaylistUpdate();
      onScheduleUpdate();
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [screenId, playlistId, onScreenUpdate, onPlaylistUpdate, onScheduleUpdate]);
}
