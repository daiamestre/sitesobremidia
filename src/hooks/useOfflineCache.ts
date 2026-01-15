import { useEffect, useCallback, useRef } from 'react';
import { useServiceWorker } from './useServiceWorker';
import { UnifiedPlaylistItem } from '@/pages/Player';

interface OfflineCacheOptions {
  enabled?: boolean;
  autoCacheOnLoad?: boolean;
}

/**
 * Hook para gerenciar cache offline de mídias do player
 * 
 * FUNCIONALIDADE:
 * - Cacheia automaticamente mídias da playlist
 * - Monitora status do cache
 * - Funciona em conjunto com o Service Worker
 */
export function useOfflineCache(
  items: UnifiedPlaylistItem[],
  options: OfflineCacheOptions = {}
) {
  const { enabled = true, autoCacheOnLoad = true } = options;
  const { isReady, cacheStatus, cacheMediaList, clearMediaCache, updateCacheStatus } = useServiceWorker();
  const hasCached = useRef(false);

  // Cachear mídias quando os itens mudarem
  useEffect(() => {
    if (!enabled || !isReady || !autoCacheOnLoad) return;
    if (items.length === 0) return;
    if (hasCached.current) return;

    const urls = items
      .filter(item => item.content_type === 'media' && item.media?.file_url)
      .map(item => item.media!.file_url);

    console.log(`[OfflineCache] Cacheando ${urls.length} mídias...`);
    cacheMediaList(urls);
    hasCached.current = true;
  }, [enabled, isReady, items, autoCacheOnLoad, cacheMediaList]);

  // Reset flag quando itens mudarem
  useEffect(() => {
    hasCached.current = false;
  }, [items.map(i => i.id).join(',')]);

  // Função para força cache de todas as mídias
  const cacheAllMedia = useCallback(async () => {
    if (!isReady || items.length === 0) return false;

    const urls = items
      .filter(item => item.content_type === 'media' && item.media?.file_url)
      .map(item => item.media!.file_url);
    return cacheMediaList(urls);
  }, [isReady, items, cacheMediaList]);

  // Função para cachear mídia específica
  const cacheMedia = useCallback(async (url: string) => {
    if (!isReady) return false;
    return cacheMediaList([url]);
  }, [isReady, cacheMediaList]);

  return {
    isReady,
    cacheStatus,
    cacheAllMedia,
    cacheMedia,
    clearMediaCache,
    updateCacheStatus,
  };
}
