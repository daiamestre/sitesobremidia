// ============================================
// SERVICE WORKER - CACHE OFFLINE PARA PLAYER
// ============================================
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
self.skipWaiting();
clientsClaim();

import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// ... (precaching code above remains)

const MEDIA_CACHE_NAME = 'player-media-v1';

// 1. Cache First for Media Files (Images, Videos, Audio)
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
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
      }),
    ],
  })
);

// 2. Network First for API calls (excluding Storage)
// Allowing Supabase API to be cached for offline fallback if needed, but prioritizing network
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co') && !url.pathname.includes('/storage/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 5 * 60, // 5 minutes
      }),
    ],
  })
);

// ============================================
// MENSAGENS DO CLIENTE
// ============================================

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'CACHE_MEDIA':
      // Pré-cachear lista de mídias
      cacheMediaList(payload.urls);
      break;

    case 'CLEAR_MEDIA_CACHE':
      // Limpar cache de mídias
      clearMediaCache();
      break;

    case 'GET_CACHE_STATUS':
      // Retornar status do cache
      getCacheStatus().then(status => {
        event.ports[0].postMessage(status);
      });
      break;
  }
});

/**
 * Pré-cachear lista de URLs de mídia
 */
async function cacheMediaList(urls) {
  if (!urls || urls.length === 0) return;

  const cache = await caches.open(MEDIA_CACHE_NAME);

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
        console.log('[SW] Mídia pré-cacheada:', url);
      }
    } catch (error) {
      console.warn('[SW] Falha ao pré-cachear:', url, error);
    }
  }

  // Notificar clientes
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'CACHE_COMPLETE',
      payload: { count: urls.length }
    });
  });
}

/**
 * Limpar cache de mídias
 */
async function clearMediaCache() {
  await caches.delete(MEDIA_CACHE_NAME);
  console.log('[SW] Cache de mídias limpo');

  // Notificar clientes
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'CACHE_CLEARED'
    });
  });
}

/**
 * Obter status do cache
 */
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
    totalSize: totalSize,
    totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
  };
}
