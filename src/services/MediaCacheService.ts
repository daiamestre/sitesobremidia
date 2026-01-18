import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

const CACHE_FOLDER = 'media-cache';
const CACHE_NAME_WEB = 'player-media-cache-v1';

// Helper to hash URL to filename
const getFilename = (url: string) => {
    return btoa(url).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 64) + '_' + url.split('/').pop()?.split('?')[0].slice(-10);
};

export const MediaCacheService = {

    async initialize(): Promise<void> {
        if (Capacitor.isNativePlatform()) {
            try {
                // Ensure directory exists
                await Filesystem.mkdir({
                    path: CACHE_FOLDER,
                    directory: Directory.Data,
                    recursive: true
                });
            } catch (e) {
                // Ignore if exists
            }
        }
    },

    /**
     * Checks if a URL is already cached.
     */
    async isCached(url: string): Promise<boolean> {
        if (Capacitor.isNativePlatform()) {
            try {
                const filename = getFilename(url);
                const stat = await Filesystem.stat({
                    path: `${CACHE_FOLDER}/${filename}`,
                    directory: Directory.Data
                });
                return !!stat; // Exists
            } catch {
                return false;
            }
        } else {
            // WEB FALLBACK
            try {
                if (!('caches' in window)) return false;
                const cache = await caches.open(CACHE_NAME_WEB);
                const match = await cache.match(url);
                return !!match;
            } catch (e) {
                return false;
            }
        }
    },

    /**
     * Downloads and caches a file.
     * Native: Saves to Disk.
     * Web: Saves to Cache Storage.
     */
    async cacheMedia(url: string, expectedMimeType?: string): Promise<boolean> {
        if (!url) return false;

        try {
            await this.initialize();

            // 1. NATIVE DOWNLOAD
            if (Capacitor.isNativePlatform()) {
                if (await this.isCached(url)) return true;

                console.log('[NativeCache] Downloading:', url);

                const response = await fetch(url);
                if (!response.ok) throw new Error(`Status ${response.status}`);

                const blob = await response.blob();

                // VALIDATION
                if (blob.type.includes('text/html')) {
                    console.error('[NativeCache] Aborting: HTML content detected');
                    return false;
                }
                // We accept ANY other mime type (octet-stream, video/quicktime, etc) to support all formats.


                // Convert Blob to Base64 to write
                const reader = new FileReader();
                const base64Promise = new Promise<string>((resolve, reject) => {
                    reader.onload = () => {
                        const base64 = reader.result as string;
                        // remove prefix "data:video/mp4;base64,"
                        resolve(base64.split(',')[1]);
                    };
                    reader.onerror = reject;
                });
                reader.readAsDataURL(blob);
                const base64Data = await base64Promise;

                const filename = getFilename(url);
                await Filesystem.writeFile({
                    path: `${CACHE_FOLDER}/${filename}`,
                    directory: Directory.Data,
                    data: base64Data,
                });

                console.log('[NativeCache] Written to disk:', filename);
                return true;

            }

            // 2. WEB FALLBACK (Existing Logic)
            else {
                if (!('caches' in window)) return false;

                const cache = await caches.open(CACHE_NAME_WEB);
                const match = await cache.match(url);
                if (match) return true;

                console.log('[MediaCache] Downloading (Web):', url);
                const response = await fetch(url, { mode: 'cors' }); // strict fallback handled in useOfflineMedia if needed
                if (!response.ok) return false;

                await cache.put(url, response.clone());
                return true;
            }

        } catch (e) {
            console.error('[MediaCache] Error caching:', url, e);
            return false;
        }
    },

    /**
     * Retrieves the playback URL.
     * Native: Returns convertFileSrc() path (http://localhost/...) -> Streaming from Disk!
     * Web: Returns Blob URL (memory intense).
     */
    async getCachedUrl(url: string): Promise<string | null> {
        try {
            if (Capacitor.isNativePlatform()) {
                const filename = getFilename(url);
                try {
                    // Check existence
                    await Filesystem.stat({
                        path: `${CACHE_FOLDER}/${filename}`,
                        directory: Directory.Data
                    });

                    // Get URI
                    const uriResult = await Filesystem.getUri({
                        path: `${CACHE_FOLDER}/${filename}`,
                        directory: Directory.Data
                    });

                    return Capacitor.convertFileSrc(uriResult.uri);

                } catch (e) {
                    return null; // Not cached
                }
            } else {
                // WEB FALLBACK
                if (!('caches' in window)) return url;
                const cache = await caches.open(CACHE_NAME_WEB);
                const response = await cache.match(url);
                if (response) {
                    const blob = await response.blob();
                    return URL.createObjectURL(blob);
                }
                return null;
            }
        } catch (e) {
            console.warn('[MediaCache] Error retrieving URL:', e);
            return null;
        }
    },

    /**
     * Cleans up old files.
     */
    async cleanupCache(activeUrls: string[]) {
        try {
            if (Capacitor.isNativePlatform()) {
                const activeFilenames = new Set(activeUrls.map(u => getFilename(u)));

                const result = await Filesystem.readdir({
                    path: CACHE_FOLDER,
                    directory: Directory.Data
                });

                for (const file of result.files) {
                    if (!activeFilenames.has(file.name)) {
                        console.log('[NativeCache] Deleting unused:', file.name);
                        await Filesystem.deleteFile({
                            path: `${CACHE_FOLDER}/${file.name}`,
                            directory: Directory.Data
                        });
                    }
                }

            } else {
                if (!('caches' in window)) return;
                const cache = await caches.open(CACHE_NAME_WEB);
                const keys = await cache.keys();
                const activeSet = new Set(activeUrls); // simple URL matching for web
                for (const request of keys) {
                    if (!activeSet.has(request.url)) {
                        await cache.delete(request);
                    }
                }
            }
        } catch (e) {
            console.warn('[MediaCache] Cleanup failed:', e);
        }
    }
};
