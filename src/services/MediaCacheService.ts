
const CACHE_NAME = 'player-media-cache-v1';

export const MediaCacheService = {
    /**
     * Checks if a URL is already cached.
     */
    async isCached(url: string): Promise<boolean> {
        try {
            if (!('caches' in window)) return false;
            const cache = await caches.open(CACHE_NAME);
            const match = await cache.match(url);
            return !!match;
        } catch (e) {
            console.warn('[MediaCache] Error checking cache:', e);
            return false;
        }
    },

    /**
     * Downloads and caches a file if not already cached.
     * Returns true if successful or already cached.
     */
    async cacheMedia(url: string): Promise<boolean> {
        if (!url) return false;

        try {
            if (!('caches' in window)) return false;

            const cache = await caches.open(CACHE_NAME);
            const match = await cache.match(url);

            if (match) {
                // console.debug('[MediaCache] Already cached:', url);
                return true;
            }

            console.log('[MediaCache] Downloading:', url);

            // Fetch specifically with 'cors' mode to ensure we can store opaque responses if needed,
            // though for playback we usually need proper CORS headers.
            // We expect the Supabase bucket to be configured with CORS.
            const response = await fetch(url, { mode: 'cors' });

            if (!response.ok) {
                console.error(`[MediaCache] Failed to fetch ${url}: ${response.statusText}`);
                return false;
            }

            // Clone response because it's a stream
            await cache.put(url, response.clone());
            console.log('[MediaCache] Cached successfully:', url);
            return true;

        } catch (e) {
            console.error('[MediaCache] Cache failed for:', url, e);
            return false;
        }
    },

    /**
     * Retrieves a cached Blob URL for a given remote URL.
     * If offline and cached, returns Blob URL.
     * If online and not cached, returns original URL (pass-through).
     */
    async getCachedUrl(url: string): Promise<string | null> {
        try {
            if (!('caches' in window)) return url;

            const cache = await caches.open(CACHE_NAME);
            const response = await cache.match(url);

            if (response) {
                const blob = await response.blob();
                return URL.createObjectURL(blob);
            }

            return null;
        } catch (e) {
            console.warn('[MediaCache] Error retrieving cached URL:', e);
            return null;
        }
    },

    /**
     * Cleans up old files unrelated to the current playlist.
     */
    async cleanupCache(activeUrls: string[]) {
        try {
            if (!('caches' in window)) return;

            const cache = await caches.open(CACHE_NAME);
            const keys = await cache.keys();

            const activeSet = new Set(activeUrls);

            for (const request of keys) {
                if (!activeSet.has(request.url)) {
                    console.log('[MediaCache] Deleting unused file:', request.url);
                    await cache.delete(request);
                }
            }
        } catch (e) {
            console.warn('[MediaCache] Cleanup failed:', e);
        }
    }
};
