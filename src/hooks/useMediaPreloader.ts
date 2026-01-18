import { useEffect } from 'react';
import { UnifiedPlaylistItem } from '@/pages/Player';
import { MediaCacheService } from '@/services/MediaCacheService';

export function useMediaPreloader(items: UnifiedPlaylistItem[]) {
    useEffect(() => {
        if (!items || items.length === 0) return;

        const cacheItem = async (url: string, mimeType?: string) => {
            await MediaCacheService.cacheMedia(url, mimeType);
        };

        const runPreloader = async () => {
            console.log('[Preloader] Starting Offline Cache Sync for', items.length, 'items');

            const urlsToCache: { url: string, mime?: string }[] = [];

            // 1. Collect all URLs
            items.forEach(item => {
                if (item.content_type === 'media' && item.media?.file_url) {
                    urlsToCache.push({ url: item.media.file_url, mime: item.media.mime_type });
                }
                if (item.content_type === 'widget' && item.widget) {
                    const conf = item.widget.config;
                    if (conf.backgroundImage) urlsToCache.push({ url: conf.backgroundImage, mime: 'image' });
                    if (conf.backgroundImageLandscape) urlsToCache.push({ url: conf.backgroundImageLandscape, mime: 'image' });
                    if (conf.backgroundImagePortrait) urlsToCache.push({ url: conf.backgroundImagePortrait, mime: 'image' });
                }
            });

            // 2. Cache them sequentially
            await Promise.allSettled(urlsToCache.map(obj => cacheItem(obj.url, obj.mime)));

            console.log('[Preloader] Offline Cache Sync Complete.');

            // 3. Cleanup old files
            MediaCacheService.cleanupCache(urlsToCache.map(u => u.url));
        };

        runPreloader();

    }, [items]);
}
