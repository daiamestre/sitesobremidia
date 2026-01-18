
import { useState, useEffect } from 'react';
import { MediaCacheService } from '@/services/MediaCacheService';

export function useOfflineMedia(remoteUrl: string | undefined | null) {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        if (!remoteUrl) {
            setSrc(null);
            return;
        }

        let isMounted = true;

        const resolveUrl = async () => {
            // 1. Try Cache First
            const cachedUrl = await MediaCacheService.getCachedUrl(remoteUrl);

            if (cachedUrl) {
                if (isMounted) setSrc(cachedUrl);
                return;
            }

            // 2. If online, use remote
            if (navigator.onLine) {
                if (isMounted) setSrc(remoteUrl);
                // Trigger background cache for next time
                MediaCacheService.cacheMedia(remoteUrl);
            } else {
                // 3. Offline & Not Cached = FAIL
                console.warn('[OfflineShield] Asset missing in cache while offline:', remoteUrl);
                if (isMounted) setSrc(null); // Will trigger onError in <video>
            }
        };

        resolveUrl();

        return () => {
            isMounted = false;
        };
    }, [remoteUrl]);

    return src;
}
