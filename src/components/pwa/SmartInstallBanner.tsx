import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  X, 
  Download, 
  Share, 
  Plus, 
  Smartphone, 
  Monitor, 
  Tv, 
  Tablet,
  Chrome,
  Maximize2,
  ExternalLink,
  Apple
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWA } from '@/hooks/usePWA';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import { cn } from '@/lib/utils';

// Chave para persistir se o banner foi fechado nesta sessão
const BANNER_DISMISSED_KEY = 'pwa_install_banner_dismissed';

export const SmartInstallBanner = () => {
  const location = useLocation();
  const { installPWA, deferredPrompt } = usePWA();
  const deviceInfo = useDeviceDetection();
  
  const [isVisible, setIsVisible] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showTVGuide, setShowTVGuide] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  // Verificar se deve mostrar o banner (apenas uma vez)
  useEffect(() => {
    // Evitar múltiplas verificações
    if (hasChecked) return;
    setHasChecked(true);

    // REGRA 1: Só aparecer na página inicial (/)
    if (location.pathname !== '/') {
      setIsVisible(false);
      return;
    }

    // REGRA 2: Não mostrar se já instalado
    if (deviceInfo.isInstalled) {
      setIsVisible(false);
      return;
    }

    // REGRA 3: Verificar se já foi fechado nesta sessão
    const wasDismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY);
    if (wasDismissed === 'true') {
      setIsVisible(false);
      return;
    }

    // REGRA 4: Não pode instalar
    if (!deviceInfo.canInstall) {
      setIsVisible(false);
      return;
    }

    // Mostrar após pequeno delay para melhor UX
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [hasChecked, location.pathname, deviceInfo.isInstalled, deviceInfo.canInstall]);

  // Handler de instalação
  const handleInstall = useCallback(async () => {
    if (deviceInfo.installMethod === 'prompt' && deferredPrompt) {
      const success = await installPWA();
      if (success) {
        setIsVisible(false);
        sessionStorage.setItem(BANNER_DISMISSED_KEY, 'true');
      }
    } else if (deviceInfo.installMethod === 'manual-ios') {
      setShowIOSGuide(true);
    } else if (deviceInfo.installMethod === 'manual-tv') {
      setShowTVGuide(true);
    }
  }, [deviceInfo.installMethod, deferredPrompt, installPWA]);

  // Handler de fechar - salvar na sessão
  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    setShowIOSGuide(false);
    setShowTVGuide(false);
    // Salvar que foi fechado nesta sessão
    sessionStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  }, []);

  // Ícone do dispositivo
  const getDeviceIcon = useCallback(() => {
    if (deviceInfo.isTV) return <Tv className="h-6 w-6" />;
    if (deviceInfo.isTablet) return <Tablet className="h-6 w-6" />;
    if (deviceInfo.isMobile) return <Smartphone className="h-6 w-6" />;
    return <Monitor className="h-6 w-6" />;
  }, [deviceInfo.isTV, deviceInfo.isTablet, deviceInfo.isMobile]);

  // Não renderizar se não deve aparecer
  if (!isVisible) {
    return null;
  }

  // ========== GUIA iOS ==========
  if (showIOSGuide) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in">
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={handleDismiss}
        />
        
        {/* Modal */}
        <div className="relative w-full max-w-lg mx-4 mb-4 animate-slide-up">
          <div className="bg-card border border-border rounded-3xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="relative bg-gradient-to-r from-primary/20 to-accent/20 p-6 pb-4">
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 p-2 rounded-full bg-background/80 hover:bg-background transition-colors"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
              
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-background shadow-lg flex items-center justify-center">
                  <img 
                    src="/pwa-192x192.png" 
                    alt="SOBRE MÍDIA" 
                    className="w-12 h-12 rounded-xl"
                  />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">
                    Instalar no {deviceInfo.deviceName}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {deviceInfo.isSafari ? 'Siga os passos abaixo' : 'Abra no Safari primeiro'}
                  </p>
                </div>
              </div>
            </div>

            {/* Instruções */}
            <div className="p-6 space-y-4">
              {!deviceInfo.isSafari && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <Chrome className="h-5 w-5 text-amber-500 flex-shrink-0" />
                    <p className="text-sm text-foreground">
                      <strong>Atenção:</strong> Abra esta página no <strong>Safari</strong> para instalar o app.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {/* Passo 1 */}
                <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold">1</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">Toque em Compartilhar</p>
                    <p className="text-sm text-muted-foreground">Ícone na barra do navegador</p>
                  </div>
                  <Share className="h-6 w-6 text-primary" />
                </div>

                {/* Passo 2 */}
                <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold">2</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">Adicionar à Tela de Início</p>
                    <p className="text-sm text-muted-foreground">Role para baixo e toque</p>
                  </div>
                  <Plus className="h-6 w-6 text-primary" />
                </div>

                {/* Passo 3 */}
                <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold">3</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">Confirme a instalação</p>
                    <p className="text-sm text-muted-foreground">Toque em "Adicionar"</p>
                  </div>
                  <Apple className="h-6 w-6 text-primary" />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6">
              <Button
                onClick={handleDismiss}
                variant="outline"
                className="w-full"
              >
                Entendi
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== GUIA TV ==========
  if (showTVGuide) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in p-4">
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={handleDismiss}
        />
        
        {/* Modal */}
        <div className="relative w-full max-w-xl animate-scale-in">
          <div className="bg-card border border-border rounded-3xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="relative bg-gradient-to-r from-primary/20 to-accent/20 p-8">
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 p-2 rounded-full bg-background/80 hover:bg-background transition-colors"
              >
                <X className="h-6 w-6 text-muted-foreground" />
              </button>
              
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-2xl bg-background shadow-lg flex items-center justify-center">
                  <Tv className="h-10 w-10 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground">
                    {deviceInfo.deviceName}
                  </h3>
                  <p className="text-muted-foreground mt-1">
                    Opções para melhor experiência
                  </p>
                </div>
              </div>
            </div>

            {/* Opções */}
            <div className="p-6 space-y-4">
              {/* Opção 1 - Tela Cheia */}
              <button
                onClick={() => {
                  document.documentElement.requestFullscreen?.();
                  handleDismiss();
                }}
                className="w-full flex items-center gap-4 p-4 bg-muted/50 hover:bg-muted rounded-xl transition-colors text-left group"
              >
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                  <Maximize2 className="h-7 w-7 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground text-lg">Usar em Tela Cheia</p>
                  <p className="text-muted-foreground">Experiência imersiva no navegador</p>
                </div>
              </button>

              {/* Opção 2 - Adicionar Favoritos */}
              <button
                onClick={handleDismiss}
                className="w-full flex items-center gap-4 p-4 bg-muted/50 hover:bg-muted rounded-xl transition-colors text-left group"
              >
                <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/20 transition-colors">
                  <ExternalLink className="h-7 w-7 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground text-lg">Adicionar aos Favoritos</p>
                  <p className="text-muted-foreground">Acesse rapidamente pelo navegador</p>
                </div>
              </button>

              {/* Info */}
              <div className="bg-muted/30 rounded-xl p-4 mt-4">
                <p className="text-sm text-muted-foreground text-center">
                  💡 <strong>Dica:</strong> Para melhor experiência, pressione <kbd className="px-2 py-0.5 bg-muted rounded text-xs">F11</kbd> ou use o menu para tela cheia.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6">
              <Button
                onClick={handleDismiss}
                variant="outline"
                className="w-full"
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== BANNER PRINCIPAL ==========
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up safe-area-bottom pointer-events-none">
      <div className="mx-4 mb-4 pointer-events-auto">
        <div className={cn(
          "bg-card/95 backdrop-blur-lg border border-border rounded-2xl shadow-2xl overflow-hidden",
          "transform transition-all duration-300"
        )}>
          {/* Barra de progresso decorativa */}
          <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary animate-pulse" />
          
          <div className="p-4">
            {/* Header com informação do dispositivo */}
            <div className="flex items-start gap-4">
              {/* Ícone do app */}
              <div className="relative flex-shrink-0">
                <img 
                  src="/pwa-192x192.png" 
                  alt="SOBRE MÍDIA" 
                  className="w-14 h-14 rounded-xl shadow-lg"
                />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-md">
                  {getDeviceIcon()}
                </div>
              </div>
              
              {/* Conteúdo */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-foreground text-lg leading-tight">
                      Instalar SOBRE MÍDIA
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      {getDeviceIcon()}
                      <span>{deviceInfo.deviceName}</span>
                    </p>
                  </div>
                  
                  {/* Botão fechar */}
                  <button
                    onClick={handleDismiss}
                    className="p-1.5 rounded-full hover:bg-muted transition-colors flex-shrink-0"
                    aria-label="Fechar"
                  >
                    <X className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>

                {/* Benefícios */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    ⚡ Acesso rápido
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-medium">
                    📴 Funciona offline
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                    🔔 Notificações
                  </span>
                </div>
              </div>
            </div>

            {/* Botões de ação */}
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                onClick={handleDismiss}
                className="flex-1 h-11"
              >
                Agora não
              </Button>
              <Button
                onClick={handleInstall}
                className="flex-1 h-11 bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
              >
                <Download className="h-4 w-4 mr-2" />
                Instalar
              </Button>
            </div>

            {/* Instrução adicional se necessário */}
            {deviceInfo.installMethod === 'manual-ios' && (
              <p className="text-xs text-muted-foreground text-center mt-3">
                Toque em "Instalar" para ver as instruções
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
