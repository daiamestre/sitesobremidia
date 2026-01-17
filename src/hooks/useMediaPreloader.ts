import { useEffect } from 'react';
import { UnifiedPlaylistItem } from '@/pages/Player';

export function useMediaPreloader(items: UnifiedPlaylistItem[]) {
    useEffect(() => {
        if (!items || items.length === 0) return;

        const preloadImage = (url: string) => {
            const img = new Image();
            img.src = url;
        };

        const preloadVideo = (url: string) => {
            // For videos, we rely on the browser's disk cache.
            // We can trigger a download by checking using fetch
            // This caches it in the HTTP cache
            fetch(url, { method: 'HEAD' }).catch(() => { });
            // Full fetch might be too heavy?
            // Service worker is better for this.
            // But let's verify connectivity at least.
        };

        console.log('[Preloader] Warming up cache for', items.length, 'items');

        items.forEach(item => {
            if (item.content_type === 'media' && item.media) {
                if (item.media.file_type === 'video') {
                    // preloadVideo(item.media.file_url);
                    // Browser preload link injection?
                    const link = document.createElement('link');
                    link.rel = 'preload';
                    link.as = 'video';
                    link.href = item.media.file_url;
                    document.head.appendChild(link);
                } else {
                    preloadImage(item.media.file_url);
                }
            }

            // Also cache Widget Backgrounds!
            if (item.content_type === 'widget' && item.widget) {
                const conf = item.widget.config;
                if (conf.backgroundImage) preloadImage(conf.backgroundImage);
                if (conf.backgroundImageLandscape) preloadImage(conf.backgroundImageLandscape);
                if (conf.backgroundImagePortrait) preloadImage(conf.backgroundImagePortrait);
            }
        });

    }, [items]);
}
