import { useEffect, useState, useCallback } from 'react';

interface CacheStatus {
  mediaCount: number;
  totalSize: number;
  totalSizeMB: string;
}

interface ServiceWorkerState {
  isSupported: boolean;
  isRegistered: boolean;
  isReady: boolean;
  cacheStatus: CacheStatus | null;
}

/**
 * Hook para gerenciar Service Worker e cache offline
 * 
 * FUNCIONALIDADE:
 * - Registra o Service Worker
 * - Permite pré-cachear mídias
 * - Monitora status do cache
 * - Limpa cache quando necessário
 */
export function useServiceWorker() {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: 'serviceWorker' in navigator,
    isRegistered: false,
    isReady: false,
    cacheStatus: null,
  });

  // Registrar Service Worker
  useEffect(() => {
    if (!state.isSupported) {
      console.warn('[SW Hook] Service Worker não suportado neste navegador');
      return;
    }

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw-v303.js', {
          scope: '/',
        });

        console.log('[SW Hook] Service Worker registrado:', registration.scope);
        setState(prev => ({ ...prev, isRegistered: true }));

        // Aguardar ativação
        if (registration.active) {
          setState(prev => ({ ...prev, isReady: true }));
        } else {
          registration.addEventListener('activate', () => {
            setState(prev => ({ ...prev, isReady: true }));
          });
        }

        // Escutar mensagens do SW
        navigator.serviceWorker.addEventListener('message', handleSWMessage);
      } catch (error) {
        console.error('[SW Hook] Falha ao registrar Service Worker:', error);
      }
    };

    registerSW();

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, [state.isSupported]);

  // Handler de mensagens do SW
  const handleSWMessage = useCallback((event: MessageEvent) => {
    const { type, payload } = event.data || {};

    switch (type) {
      case 'CACHE_COMPLETE':
        console.log(`[SW Hook] ${payload.count} mídias cacheadas`);
        updateCacheStatus();
        break;
      case 'CACHE_CLEARED':
        console.log('[SW Hook] Cache limpo');
        setState(prev => ({ ...prev, cacheStatus: null }));
        break;
    }
  }, []);

  // Pré-cachear lista de mídias
  const cacheMediaList = useCallback(async (urls: string[]) => {
    if (!state.isReady) {
      console.warn('[SW Hook] Service Worker não está pronto');
      return false;
    }

    const controller = navigator.serviceWorker.controller;
    if (!controller) {
      console.warn('[SW Hook] Sem controller ativo');
      return false;
    }

    controller.postMessage({
      type: 'CACHE_MEDIA',
      payload: { urls },
    });

    console.log(`[SW Hook] Solicitado cache de ${urls.length} mídias`);
    return true;
  }, [state.isReady]);

  // Limpar cache de mídias
  const clearMediaCache = useCallback(async () => {
    if (!state.isReady) return false;

    const controller = navigator.serviceWorker.controller;
    if (!controller) return false;

    controller.postMessage({ type: 'CLEAR_MEDIA_CACHE' });
    return true;
  }, [state.isReady]);

  // Atualizar status do cache
  const updateCacheStatus = useCallback(async () => {
    if (!state.isReady) return;

    const controller = navigator.serviceWorker.controller;
    if (!controller) return;

    const messageChannel = new MessageChannel();

    messageChannel.port1.onmessage = (event) => {
      setState(prev => ({ ...prev, cacheStatus: event.data }));
    };

    controller.postMessage(
      { type: 'GET_CACHE_STATUS' },
      [messageChannel.port2]
    );
  }, [state.isReady]);

  // Atualizar status periodicamente
  useEffect(() => {
    if (!state.isReady) return;

    // Atualizar imediatamente
    updateCacheStatus();

    // Atualizar a cada 30 segundos
    const interval = setInterval(updateCacheStatus, 30000);
    return () => clearInterval(interval);
  }, [state.isReady, updateCacheStatus]);

  return {
    ...state,
    cacheMediaList,
    clearMediaCache,
    updateCacheStatus,
  };
}
