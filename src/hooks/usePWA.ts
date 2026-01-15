import { useState, useEffect, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PWAState {
  isInstallable: boolean;
  isInstalled: boolean;
  isUpdating: boolean;
  needRefresh: boolean;
  isOffline: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  isChrome: boolean;
}

export const usePWA = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [pwaState, setPwaState] = useState<PWAState>({
    isInstallable: false,
    isInstalled: false,
    isUpdating: false,
    needRefresh: false,
    isOffline: !navigator.onLine,
    isIOS: false,
    isAndroid: false,
    isSafari: false,
    isChrome: false,
  });

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      console.log('[PWA] Service Worker registrado:', swUrl);
      
      // Check for updates every 1 hour
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('[PWA] Erro ao registrar Service Worker:', error);
    },
    onNeedRefresh() {
      console.log('[PWA] Nova versão disponível');
      setPwaState(prev => ({ ...prev, needRefresh: true }));
    },
    onOfflineReady() {
      console.log('[PWA] App pronto para uso offline');
    },
  });

  // Detect device and browser
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
    const isChrome = /chrome/.test(userAgent) && !/edge/.test(userAgent);
    
    // Check if running as standalone PWA
    const isInstalled = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    setPwaState(prev => ({
      ...prev,
      isIOS,
      isAndroid,
      isSafari,
      isChrome,
      isInstalled,
    }));
  }, []);

  // Handle beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setPwaState(prev => ({ ...prev, isInstallable: true }));
      console.log('[PWA] Prompt de instalação disponível');
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setPwaState(prev => ({ 
        ...prev, 
        isInstalled: true, 
        isInstallable: false 
      }));
      console.log('[PWA] App instalado com sucesso!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setPwaState(prev => ({ ...prev, isOffline: false }));
    };
    
    const handleOffline = () => {
      setPwaState(prev => ({ ...prev, isOffline: true }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync needRefresh state
  useEffect(() => {
    setPwaState(prev => ({ ...prev, needRefresh }));
  }, [needRefresh]);

  const installPWA = useCallback(async () => {
    if (!deferredPrompt) {
      console.log('[PWA] Prompt de instalação não disponível');
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      console.log('[PWA] Resultado da instalação:', outcome);
      
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setPwaState(prev => ({ 
          ...prev, 
          isInstalled: true, 
          isInstallable: false 
        }));
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[PWA] Erro ao instalar:', error);
      return false;
    }
  }, [deferredPrompt]);

  const updatePWA = useCallback(async () => {
    setPwaState(prev => ({ ...prev, isUpdating: true }));
    
    try {
      await updateServiceWorker(true);
      setPwaState(prev => ({ 
        ...prev, 
        isUpdating: false, 
        needRefresh: false 
      }));
      setNeedRefresh(false);
    } catch (error) {
      console.error('[PWA] Erro ao atualizar:', error);
      setPwaState(prev => ({ ...prev, isUpdating: false }));
    }
  }, [updateServiceWorker, setNeedRefresh]);

  const dismissUpdate = useCallback(() => {
    setNeedRefresh(false);
    setPwaState(prev => ({ ...prev, needRefresh: false }));
  }, [setNeedRefresh]);

  return {
    ...pwaState,
    installPWA,
    updatePWA,
    dismissUpdate,
    deferredPrompt,
  };
};
