
import { useState, useEffect } from 'react';
import { MediaCacheService } from '@/services/MediaCacheService';

export type MediaStatus = 'loading' | 'cached' | 'remote' | 'error';

export interface OfflineMediaState {
    src: string | null;
    status: MediaStatus;
    error: any | null;
}

export function useOfflineMedia(remoteUrl: string | undefined | null, mimeType?: string): OfflineMediaState {
    const [state, setState] = useState<OfflineMediaState>({
        src: null,
        status: 'loading',
        error: null
    });

    useEffect(() => {
        if (!remoteUrl) {
            setState({ src: null, status: 'error', error: 'No URL provided' });
            return;
        }

        let isMounted = true;

        const resolveUrl = async () => {
            // Reset state on URL change
            if (isMounted) setState({ src: null, status: 'loading', error: null });

            try {
                // 1. Try Cache First
                const cachedUrl = await MediaCacheService.getCachedUrl(remoteUrl);

                if (cachedUrl) {
                    if (isMounted) setState({ src: cachedUrl, status: 'cached', error: null });
                    return;
                }

                // 2. AGGRESSIVE STREAMING (No Online Check)
                // We don't trust navigator.onLine in Android Kiosk mode. 
                // Always try to stream if not cached. 
                console.log('[OfflineShield] Not cached, forcing remote stream:', remoteUrl);
                if (isMounted) setState({ src: remoteUrl, status: 'remote', error: null });

                // Trigger background cache for NEXT time
                MediaCacheService.cacheMedia(remoteUrl, mimeType).catch(e =>
                    console.warn('[OfflineShield] Background cache failed:', e)
                );
            } catch (err) {
                console.error('[OfflineShield] Error resolving media:', err);
                // Fallback to remote even on error
                if (isMounted) setState({ src: remoteUrl, status: 'remote', error: err });
            }
        };

        resolveUrl();

        return () => {
            isMounted = false;
        };
    }, [remoteUrl]); // Intentionally omitting mimeType to avoid re-renders if it changes trivially

    return state;
}


