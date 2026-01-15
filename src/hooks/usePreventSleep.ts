import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook para prevenir que a tela entre em modo de descanso
 * 
 * FUNCIONALIDADE:
 * - Usa Wake Lock API para manter tela ligada
 * - Fallback para reprodução de vídeo invisível em navegadores antigos
 * - Reativa automaticamente quando a aba volta ao foco
 * 
 * ESTABILIDADE:
 * - Libera recursos ao desmontar
 * - Lida com erros de permissão graciosamente
 */
export function usePreventSleep(enabled: boolean = true) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const fallbackVideoRef = useRef<HTMLVideoElement | null>(null);

  // Função para solicitar Wake Lock
  const requestWakeLock = useCallback(async () => {
    if (!enabled) return;

    // Verificar suporte à Wake Lock API
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('[WakeLock] Ativado');

        wakeLockRef.current.addEventListener('release', () => {
          console.log('[WakeLock] Liberado');
        });
      } catch (err) {
        console.warn('[WakeLock] Falha ao ativar:', err);
        // Fallback para método alternativo
        setupFallback();
      }
    } else {
      console.warn('[WakeLock] API não suportada, usando fallback');
      setupFallback();
    }
  }, [enabled]);

  // Método fallback: vídeo invisível em loop
  const setupFallback = useCallback(() => {
    if (fallbackVideoRef.current) return;

    // Criar vídeo transparente de 1 segundo
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.loop = true;
    video.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    `;

    // Base64 de um vídeo MP4 mínimo (1x1 pixel, 1 frame)
    video.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAu1tZGF0AAACrQYF//+p3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTEgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAA0ZYiEAD//8m+P5OXfBeLGOfKE3xkODvFZuBflHv/+VwJIta6cbpIo8s8xI6VLwAAAAwBhAAAAABNBmiRsQ//+nhAAADATZwAAAAMAAAMAABJtb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAZAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAABpnRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAZAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAEAAAABAAAAAAAJRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAAGQAAAQAAAABAAAAASR0bWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAABABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABz21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAY9zdGJsAAAAs3N0c2QAAAAAAAAAAQAAAKNhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAMWhdY0QBZAAKr+6BQ//Y2AAAAwAEAAADACA8UJZYAQAGaO2ByAD4fShAAADA/AAIAAAZAAAAH3N0dHMAAAAAAAAAAQAAAAEAAAQAAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAAQAAABRzdHN6AAAAAAAAAsUAAAABAAAAFHN0Y28AAAAAAAAAAQAAADAAAAA=';

    document.body.appendChild(video);
    video.play().catch(() => {
      console.warn('[Fallback] Não foi possível reproduzir vídeo');
    });

    fallbackVideoRef.current = video;
  }, []);

  // Liberar Wake Lock
  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      console.log('[WakeLock] Liberado manualmente');
    }

    if (fallbackVideoRef.current) {
      fallbackVideoRef.current.pause();
      fallbackVideoRef.current.remove();
      fallbackVideoRef.current = null;
      console.log('[Fallback] Removido');
    }
  }, []);

  // Reativar quando a página volta ao foco
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, requestWakeLock]);

  // Ativar ao montar, liberar ao desmontar
  useEffect(() => {
    if (enabled) {
      requestWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [enabled, requestWakeLock, releaseWakeLock]);

  return {
    requestWakeLock,
    releaseWakeLock,
  };
}
