/**
 * ============================================
 * OVERLAY DE REENTRADA FULLSCREEN
 * ============================================
 * 
 * Componente que exibe uma interface amigável para
 * o usuário reativar o modo tela cheia.
 * 
 * CARACTERÍSTICAS:
 * - Overlay flutuante não-intrusivo
 * - Animação suave de entrada
 * - Captura clique para reativar fullscreen
 * - Compatível com touch (mobile/TV)
 * - Mensagens claras e simples (sem jargão técnico)
 * 
 * USO:
 * Este overlay é exibido automaticamente quando:
 * - O usuário sai do fullscreen (ESC)
 * - A aba perde foco
 * - A tela é desligada e ligada
 * - O navegador mostra a UI novamente
 */

import { useState, useEffect } from 'react';
import { Maximize2, MonitorPlay, Hand } from 'lucide-react';

interface FullscreenReentryOverlayProps {
  /** Se o overlay está visível */
  visible: boolean;
  /** Callback para reativar fullscreen */
  onRequestFullscreen: () => void;
  /** Callback para fechar overlay sem ativar fullscreen */
  onDismiss?: () => void;
  /** Tipo de dispositivo para personalização */
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'tv' | 'ios';
  /** Personalizar mensagem principal */
  message?: string;
  /** Personalizar texto do botão */
  buttonText?: string;
  /** Ocultar automaticamente após X segundos (0 = nunca) */
  autoHideAfter?: number;
}

export function FullscreenReentryOverlay({
  visible,
  onRequestFullscreen,
  onDismiss,
  deviceType = 'desktop',
  message,
  buttonText,
  autoHideAfter = 0,
}: FullscreenReentryOverlayProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [showPulse, setShowPulse] = useState(false);

  // Animação de entrada
  useEffect(() => {
    if (visible) {
      setIsAnimating(true);
      // Pulse animation após 2s
      const pulseTimer = setTimeout(() => setShowPulse(true), 2000);
      return () => clearTimeout(pulseTimer);
    } else {
      setIsAnimating(false);
      setShowPulse(false);
    }
  }, [visible]);

  // Auto-hide
  useEffect(() => {
    if (visible && autoHideAfter > 0) {
      const timer = setTimeout(() => {
        onDismiss?.();
      }, autoHideAfter * 1000);
      return () => clearTimeout(timer);
    }
  }, [visible, autoHideAfter, onDismiss]);

  // Handler de clique
  const handleClick = () => {
    setIsAnimating(false);
    onRequestFullscreen();
  };

  // Não renderizar se não visível
  if (!visible) return null;

  // Personalizar mensagens por dispositivo
  const getDefaultMessage = () => {
    switch (deviceType) {
      case 'tv':
        return 'Pressione OK para continuar';
      case 'mobile':
      case 'tablet':
        return 'Toque para continuar em tela cheia';
      case 'ios':
        return 'No Safari, adicione à Tela Inicial para melhor experiência';
      default:
        return 'Clique para continuar em tela cheia';
    }
  };

  const getDefaultButtonText = () => {
    switch (deviceType) {
      case 'tv':
        return 'OK';
      case 'mobile':
      case 'tablet':
        return 'Toque aqui';
      case 'ios':
        return 'Continuar';
      default:
        return 'Continuar';
    }
  };

  const Icon = deviceType === 'mobile' || deviceType === 'tablet' ? Hand : Maximize2;

  return (
    <div
      className={`
        fixed inset-0 z-[9999] 
        flex items-center justify-center
        bg-black/90 backdrop-blur-sm
        transition-all duration-500
        ${isAnimating ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `}
      onClick={handleClick}
      onTouchStart={handleClick}
      role="button"
      tabIndex={0}
      aria-label="Ativar tela cheia"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'OK') {
          handleClick();
        }
      }}
    >
      {/* Container central */}
      <div 
        className={`
          flex flex-col items-center gap-8 p-12
          transition-all duration-700 ease-out
          ${isAnimating ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
        `}
      >
        {/* Ícone animado */}
        <div 
          className={`
            relative w-32 h-32 rounded-full
            bg-gradient-to-br from-white/20 to-white/5
            flex items-center justify-center
            ${showPulse ? 'animate-pulse' : ''}
          `}
        >
          {/* Anéis de pulso */}
          <div className="absolute inset-0 rounded-full border-2 border-white/30 animate-ping" style={{ animationDuration: '2s' }} />
          <div className="absolute inset-2 rounded-full border border-white/20 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }} />
          
          {/* Ícone central */}
          <MonitorPlay className="w-16 h-16 text-white drop-shadow-lg" />
        </div>

        {/* Texto principal */}
        <div className="text-center max-w-md">
          <h2 className="text-white text-2xl md:text-3xl font-bold mb-3 tracking-tight">
            Player Pausado
          </h2>
          <p className="text-white/80 text-lg md:text-xl">
            {message || getDefaultMessage()}
          </p>
        </div>

        {/* Botão/Área de clique */}
        <div 
          className={`
            flex items-center gap-3 
            px-10 py-5 rounded-2xl
            bg-white text-black
            font-bold text-xl
            cursor-pointer
            transition-all duration-300
            hover:scale-105 hover:shadow-2xl
            active:scale-95
            ${showPulse ? 'animate-bounce' : ''}
          `}
          style={{ animationDuration: '2s' }}
        >
          <Icon className="w-6 h-6" />
          <span>{buttonText || getDefaultButtonText()}</span>
        </div>

        {/* Dica extra para desktop */}
        {deviceType === 'desktop' && (
          <p className="text-white/40 text-sm mt-4">
            Pressione <kbd className="px-2 py-1 bg-white/10 rounded text-white/60">F</kbd> para alternar tela cheia
          </p>
        )}

        {/* Dica para iOS */}
        {deviceType === 'ios' && (
          <div className="text-white/40 text-sm mt-4 text-center max-w-sm">
            <p>Safari no iOS não suporta fullscreen real.</p>
            <p className="mt-1">
              Para melhor experiência, toque em{' '}
              <span className="inline-block w-5 h-5 bg-white/20 rounded align-middle">📤</span>
              {' '}e selecione "Adicionar à Tela de Início"
            </p>
          </div>
        )}
      </div>

      {/* Botão de fechar (opcional) */}
      {onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="
            absolute top-6 right-6
            w-12 h-12 rounded-full
            bg-white/10 hover:bg-white/20
            flex items-center justify-center
            text-white/60 hover:text-white
            transition-all duration-200
          "
          aria-label="Fechar"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default FullscreenReentryOverlay;
