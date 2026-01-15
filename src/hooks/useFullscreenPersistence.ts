/**
 * ============================================
 * SISTEMA DE PERSISTÊNCIA DE FULLSCREEN
 * ============================================
 * 
 * Hook profissional para Digital Signage que mantém
 * o modo tela cheia ativo de forma contínua e legal.
 * 
 * ESTRATÉGIA:
 * 1. Solicitar fullscreen via interação do usuário (obrigatório)
 * 2. Monitorar eventos de saída (ESC, perda de foco, etc.)
 * 3. Exibir overlay de reentrada quando fullscreen for perdido
 * 4. Capturar novo clique para reativar fullscreen
 * 
 * POR QUE ISSO É NECESSÁRIO:
 * - Navegadores modernos bloqueiam auto-click por segurança
 * - A API Fullscreen requer "user gesture" (interação real)
 * - Não é possível forçar remoção da barra de endereço
 * - Este é o padrão usado por quiosques web profissionais
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ==========================================
// INTERFACES
// ==========================================

interface FullscreenState {
  isFullscreen: boolean;
  isSupported: boolean;
  showReentryOverlay: boolean;
  wasFullscreenOnce: boolean;
  lastExitReason: 'user' | 'blur' | 'visibility' | 'unknown' | null;
}

interface UseFullscreenPersistenceOptions {
  /** Ativar sistema de persistência */
  enabled?: boolean;
  /** Solicitar fullscreen automaticamente no mount (requer interação prévia) */
  autoRequestOnMount?: boolean;
  /** Mostrar overlay de reentrada quando fullscreen for perdido */
  showReentryOverlay?: boolean;
  /** Tempo de delay antes de mostrar overlay (ms) */
  overlayDelay?: number;
  /** Callback quando entrar em fullscreen */
  onEnterFullscreen?: () => void;
  /** Callback quando sair de fullscreen */
  onExitFullscreen?: (reason: string) => void;
}

interface UseFullscreenPersistenceReturn {
  /** Estado atual do fullscreen */
  state: FullscreenState;
  /** Solicitar entrada em fullscreen */
  requestFullscreen: () => Promise<boolean>;
  /** Sair do fullscreen */
  exitFullscreen: () => Promise<boolean>;
  /** Toggle fullscreen */
  toggleFullscreen: () => Promise<boolean>;
  /** Fechar overlay de reentrada sem entrar em fullscreen */
  dismissReentryOverlay: () => void;
}

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

/**
 * Detecta se a API Fullscreen é suportada
 */
const isFullscreenSupported = (): boolean => {
  return !!(
    document.documentElement.requestFullscreen ||
    (document.documentElement as any).webkitRequestFullscreen ||
    (document.documentElement as any).mozRequestFullScreen ||
    (document.documentElement as any).msRequestFullscreen
  );
};

/**
 * Verifica se está em modo fullscreen
 */
const getIsFullscreen = (): boolean => {
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement
  );
};

/**
 * Solicita fullscreen de forma cross-browser
 */
const requestFullscreenAPI = async (): Promise<boolean> => {
  const elem = document.documentElement;
  
  try {
    if (elem.requestFullscreen) {
      await elem.requestFullscreen();
    } else if ((elem as any).webkitRequestFullscreen) {
      await (elem as any).webkitRequestFullscreen();
    } else if ((elem as any).mozRequestFullScreen) {
      await (elem as any).mozRequestFullScreen();
    } else if ((elem as any).msRequestFullscreen) {
      await (elem as any).msRequestFullscreen();
    } else {
      console.warn('[Fullscreen] API não suportada');
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[Fullscreen] Erro ao solicitar:', error);
    return false;
  }
};

/**
 * Sai do fullscreen de forma cross-browser
 */
const exitFullscreenAPI = async (): Promise<boolean> => {
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      await (document as any).webkitExitFullscreen();
    } else if ((document as any).mozCancelFullScreen) {
      await (document as any).mozCancelFullScreen();
    } else if ((document as any).msExitFullscreen) {
      await (document as any).msExitFullscreen();
    }
    return true;
  } catch (error) {
    console.warn('[Fullscreen] Erro ao sair:', error);
    return false;
  }
};

/**
 * Detecta tipo de dispositivo
 */
const detectDevice = (): 'desktop' | 'mobile' | 'tablet' | 'tv' | 'ios' => {
  const ua = navigator.userAgent.toLowerCase();
  
  // iOS tem comportamento especial
  if (/iphone|ipad|ipod/.test(ua)) {
    return 'ios';
  }
  
  // Smart TVs e TV Boxes
  if (/smart-tv|smarttv|googletv|appletv|hbbtv|pov_tv|netcast|viera|nettv|philipstv|opera tv|sharp|roku|lg netcast|lg simplesmart|tizen|webos|android tv|fire tv|aftn|aftm|aftt/i.test(ua)) {
    return 'tv';
  }
  
  // Tablets
  if (/ipad|android(?!.*mobile)/i.test(ua)) {
    return 'tablet';
  }
  
  // Mobile
  if (/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    return 'mobile';
  }
  
  return 'desktop';
};

// ==========================================
// HOOK PRINCIPAL
// ==========================================

export function useFullscreenPersistence(
  options: UseFullscreenPersistenceOptions = {}
): UseFullscreenPersistenceReturn {
  const {
    enabled = true,
    autoRequestOnMount = true,
    showReentryOverlay: enableReentryOverlay = true,
    overlayDelay = 500,
    onEnterFullscreen,
    onExitFullscreen,
  } = options;

  // ==========================================
  // ESTADOS
  // ==========================================

  const [state, setState] = useState<FullscreenState>({
    isFullscreen: getIsFullscreen(),
    isSupported: isFullscreenSupported(),
    showReentryOverlay: false,
    wasFullscreenOnce: false,
    lastExitReason: null,
  });

  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceType = useRef(detectDevice());
  const mountedRef = useRef(true);

  // ==========================================
  // FUNÇÕES DE CONTROLE
  // ==========================================

  const requestFullscreen = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      console.warn('[Fullscreen] API não suportada neste dispositivo');
      return false;
    }

    // Limpar overlay se existir
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
      overlayTimeoutRef.current = null;
    }

    const success = await requestFullscreenAPI();
    
    if (success && mountedRef.current) {
      setState(prev => ({
        ...prev,
        isFullscreen: true,
        showReentryOverlay: false,
        wasFullscreenOnce: true,
        lastExitReason: null,
      }));
      onEnterFullscreen?.();
      console.log('[Fullscreen] ✅ Modo tela cheia ativado');
    }
    
    return success;
  }, [state.isSupported, onEnterFullscreen]);

  const exitFullscreen = useCallback(async (): Promise<boolean> => {
    const success = await exitFullscreenAPI();
    
    if (success && mountedRef.current) {
      setState(prev => ({
        ...prev,
        isFullscreen: false,
        lastExitReason: 'user',
      }));
    }
    
    return success;
  }, []);

  const toggleFullscreen = useCallback(async (): Promise<boolean> => {
    if (getIsFullscreen()) {
      return exitFullscreen();
    }
    return requestFullscreen();
  }, [requestFullscreen, exitFullscreen]);

  const dismissReentryOverlay = useCallback(() => {
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
      overlayTimeoutRef.current = null;
    }
    setState(prev => ({ ...prev, showReentryOverlay: false }));
  }, []);

  // ==========================================
  // MONITORAMENTO DE EVENTOS
  // ==========================================

  useEffect(() => {
    if (!enabled) return;

    // Handler para mudança de fullscreen
    const handleFullscreenChange = () => {
      const isNowFullscreen = getIsFullscreen();
      
      if (!mountedRef.current) return;

      if (isNowFullscreen) {
        // Entrou em fullscreen
        setState(prev => ({
          ...prev,
          isFullscreen: true,
          showReentryOverlay: false,
          wasFullscreenOnce: true,
          lastExitReason: null,
        }));
        onEnterFullscreen?.();
        console.log('[Fullscreen] ✅ Entrou em tela cheia');
      } else {
        // Saiu de fullscreen
        const reason = document.hidden ? 'visibility' : 'user';
        
        setState(prev => ({
          ...prev,
          isFullscreen: false,
          lastExitReason: reason,
        }));
        
        onExitFullscreen?.(reason);
        console.log('[Fullscreen] 🔄 Saiu da tela cheia:', reason);

        // Mostrar overlay de reentrada após delay
        if (enableReentryOverlay && state.wasFullscreenOnce) {
          overlayTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && !getIsFullscreen()) {
              setState(prev => ({ ...prev, showReentryOverlay: true }));
              console.log('[Fullscreen] 📢 Overlay de reentrada exibido');
            }
          }, overlayDelay);
        }
      }
    };

    // Handler para mudança de visibilidade
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('[Fullscreen] 👁️ Página oculta');
        return;
      }

      // Página voltou a ser visível
      console.log('[Fullscreen] 👁️ Página visível novamente');
      
      const isNowFullscreen = getIsFullscreen();
      
      if (!isNowFullscreen && state.wasFullscreenOnce && enableReentryOverlay) {
        // Mostrar overlay para reativar fullscreen
        overlayTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && !getIsFullscreen()) {
            setState(prev => ({ 
              ...prev, 
              showReentryOverlay: true,
              lastExitReason: 'visibility',
            }));
          }
        }, overlayDelay);
      }
    };

    // Handler para foco da janela
    const handleFocus = () => {
      console.log('[Fullscreen] 🎯 Janela recebeu foco');
      
      const isNowFullscreen = getIsFullscreen();
      
      if (!isNowFullscreen && state.wasFullscreenOnce && enableReentryOverlay) {
        overlayTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && !getIsFullscreen()) {
            setState(prev => ({ 
              ...prev, 
              showReentryOverlay: true,
              lastExitReason: 'blur',
            }));
          }
        }, overlayDelay);
      }
    };

    // Handler para blur da janela
    const handleBlur = () => {
      console.log('[Fullscreen] 💨 Janela perdeu foco');
    };

    // Registrar eventos (cross-browser)
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);

      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, [enabled, enableReentryOverlay, overlayDelay, state.wasFullscreenOnce, onEnterFullscreen, onExitFullscreen]);

  // ==========================================
  // AUTO-REQUEST NO MOUNT
  // ==========================================

  useEffect(() => {
    if (!enabled || !autoRequestOnMount || !state.isSupported) return;

    // Para iOS, não solicitar automaticamente (comportamento especial)
    if (deviceType.current === 'ios') {
      console.log('[Fullscreen] ℹ️ iOS detectado - fullscreen limitado ao Safari');
      return;
    }

    // Tentar solicitar fullscreen após pequeno delay
    // Isso só funcionará se houver uma interação do usuário recente
    const timer = setTimeout(() => {
      if (!getIsFullscreen()) {
        requestFullscreenAPI().then(success => {
          if (!success && mountedRef.current) {
            // Se falhou, mostrar overlay para solicitar interação
            setState(prev => ({ ...prev, showReentryOverlay: true }));
          }
        });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [enabled, autoRequestOnMount, state.isSupported]);

  // Cleanup no unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, []);

  return {
    state,
    requestFullscreen,
    exitFullscreen,
    toggleFullscreen,
    dismissReentryOverlay,
  };
}

export type { FullscreenState, UseFullscreenPersistenceOptions, UseFullscreenPersistenceReturn };
