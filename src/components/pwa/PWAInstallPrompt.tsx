import { useState, useEffect } from 'react';
import { X, Download, Share, Plus, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWA } from '@/hooks/usePWA';

export const PWAInstallPrompt = () => {
  const { 
    isInstallable, 
    isInstalled, 
    isIOS, 
    isSafari, 
    installPWA 
  } = usePWA();
  
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if user has dismissed before
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      // Show again after 7 days
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        setIsDismissed(true);
        return;
      }
    }

    // Show prompt after a delay for better UX
    const timer = setTimeout(() => {
      if ((isInstallable || (isIOS && isSafari)) && !isInstalled) {
        setIsVisible(true);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [isInstallable, isInstalled, isIOS, isSafari]);

  const handleInstall = async () => {
    const success = await installPWA();
    if (success) {
      setIsVisible(false);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (!isVisible || isDismissed || isInstalled) {
    return null;
  }

  // iOS Safari instructions
  if (isIOS && isSafari) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-fade-in safe-area-bottom">
        <div className="mx-4 mb-4 rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
          <div className="relative p-4">
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted transition-colors"
              aria-label="Fechar"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>

            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                <img 
                  src="/pwa-192x192.png" 
                  alt="SOBRE MÍDIA" 
                  className="w-14 h-14 rounded-xl shadow-lg"
                />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-lg">
                  Instalar SOBRE MÍDIA
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Acesse rapidamente do seu iPhone
                </p>
              </div>
            </div>

            <div className="mt-4 bg-muted/50 rounded-xl p-4">
              <p className="text-sm text-foreground font-medium mb-3">
                Para instalar no iPhone:
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 flex-shrink-0">
                    <Share className="h-4 w-4 text-primary" />
                  </div>
                  <span>Toque em <strong className="text-foreground">Compartilhar</strong></span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 flex-shrink-0">
                    <Plus className="h-4 w-4 text-primary" />
                  </div>
                  <span>Selecione <strong className="text-foreground">Adicionar à Tela de Início</strong></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Chrome/Android install prompt
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-fade-in safe-area-bottom">
      <div className="mx-4 mb-4 rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        <div className="relative p-4">
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted transition-colors"
            aria-label="Fechar"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>

          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <img 
                src="/pwa-192x192.png" 
                alt="SOBRE MÍDIA" 
                className="w-14 h-14 rounded-xl shadow-lg"
              />
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-lg">
                Instalar SOBRE MÍDIA
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Acesso rápido e offline
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4 text-sm text-muted-foreground">
            <Smartphone className="h-4 w-4 text-accent" />
            <span>Funciona como um app nativo no seu dispositivo</span>
          </div>

          <div className="flex gap-3 mt-4">
            <Button
              variant="outline"
              onClick={handleDismiss}
              className="flex-1"
            >
              Agora não
            </Button>
            <Button
              onClick={handleInstall}
              className="flex-1 gradient-primary"
            >
              <Download className="h-4 w-4 mr-2" />
              Instalar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
