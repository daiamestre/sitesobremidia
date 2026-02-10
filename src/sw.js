// ============================================
// SERVICE WORKER - CACHE OFFLINE PARA PLAYER
// Version: 4.0.0 - Fix API intercept (2026-02-10)
// ============================================
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
self.skipWaiting();
clientsClaim();

import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

const MEDIA_CACHE_NAME = 'player-media-v2';

// 1. Cache First for Media FILES (Images, Videos from Supabase Storage ONLY)
registerRoute(
  ({ request, url }) => {
    const isMedia = request.destination === 'image' ||
      request.destination === 'video' ||
      request.destination === 'audio';
    const isSupabaseStorage = url.href.includes('/storage/v1/object/public/');
    return isMedia || isSupabaseStorage;
  },
  new CacheFirst({
    cacheName: MEDIA_CACHE_NAME,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [200], // ONLY cache successful responses, NOT opaque (0)
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  })
);

// 2. Supabase REST API calls → NETWORK ONLY (never cache, never intercept)
// This prevents the SW from hanging or serving stale API responses
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co') && !url.pathname.includes('/storage/'),
  new NetworkOnly()
);

// ============================================
// MENSAGENS DO CLIENTE
// ============================================

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'CACHE_MEDIA':
      cacheMediaList(payload.urls);
      break;
    case 'CLEAR_MEDIA_CACHE':
      clearMediaCache();
      break;
    case 'GET_CACHE_STATUS':
      getCacheStatus().then(status => {
        event.ports[0].postMessage(status);
      });
      break;
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
  }
});

async function cacheMediaList(urls) {
  if (!urls || urls.length === 0) return;
  const cache = await caches.open(MEDIA_CACHE_NAME);
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
      }
    } catch (error) {
      console.warn('[SW] Cache fail:', url);
    }
  }
}

async function clearMediaCache() {
  await caches.delete(MEDIA_CACHE_NAME);
  await caches.delete('player-media-v1'); // clear old cache too
  await caches.delete('api-cache'); // clear stale API cache
}

async function getCacheStatus() {
  const mediaCache = await caches.open(MEDIA_CACHE_NAME);
  const keys = await mediaCache.keys();
  let totalSize = 0;
  for (const request of keys) {
    const response = await mediaCache.match(request);
    if (response) {
      const blob = await response.clone().blob();
      totalSize += blob.size;
    }
  }
  return {
    mediaCount: keys.length,
    totalSize,
    totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
  };
}
