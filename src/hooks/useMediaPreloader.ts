import { useEffect } from 'react';
import { UnifiedPlaylistItem } from '@/pages/Player';
import { MediaCacheService } from '@/services/MediaCacheService';

export function useMediaPreloader(items: UnifiedPlaylistItem[]) {
    useEffect(() => {
        if (!items || items.length === 0) return;

        const cacheItem = async (url: string) => {
            await MediaCacheService.cacheMedia(url);
        };

        const runPreloader = async () => {
            console.log('[Preloader] Starting Offline Cache Sync for', items.length, 'items');

            const urlsToCache: string[] = [];

            // 1. Collect all URLs
            items.forEach(item => {
                if (item.content_type === 'media' && item.media?.file_url) {
                    urlsToCache.push(item.media.file_url);
                }
                if (item.content_type === 'widget' && item.widget) {
                    const conf = item.widget.config;
                    if (conf.backgroundImage) urlsToCache.push(conf.backgroundImage);
                    if (conf.backgroundImageLandscape) urlsToCache.push(conf.backgroundImageLandscape);
                    if (conf.backgroundImagePortrait) urlsToCache.push(conf.backgroundImagePortrait);
                }
            });

            // 2. Cache them sequentially to avoid network congestion (or parallel with limit)
            // Parallel is fine for modern browsers/connections
            await Promise.allSettled(urlsToCache.map(url => cacheItem(url)));

            console.log('[Preloader] Offline Cache Sync Complete.');

            // 3. Cleanup old files
            MediaCacheService.cleanupCache(urlsToCache);
        };

        runPreloader();

    }, [items]);
}
