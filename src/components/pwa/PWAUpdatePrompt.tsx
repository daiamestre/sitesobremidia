import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWA } from '@/hooks/usePWA';

export const PWAUpdatePrompt = () => {
  const { needRefresh, isUpdating, updatePWA, dismissUpdate } = usePWA();

  if (!needRefresh) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 animate-fade-in safe-area-top">
      <div className="mx-4 mt-4 rounded-xl bg-primary shadow-2xl overflow-hidden">
        <div className="relative p-4">
          <button
            onClick={dismissUpdate}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Fechar"
            disabled={isUpdating}
          >
            <X className="h-5 w-5 text-primary-foreground" />
          </button>

          <div className="flex items-center gap-4 pr-8">
            <div className="flex-shrink-0 p-2 rounded-lg bg-white/10">
              <RefreshCw className={`h-6 w-6 text-primary-foreground ${isUpdating ? 'animate-spin' : ''}`} />
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-primary-foreground">
                Nova versão disponível
              </h3>
              <p className="text-sm text-primary-foreground/80 mt-0.5">
                Atualize para obter melhorias e correções
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button
              variant="secondary"
              onClick={dismissUpdate}
              className="flex-1 bg-white/10 text-primary-foreground hover:bg-white/20 border-0"
              disabled={isUpdating}
            >
              Depois
            </Button>
            <Button
              onClick={updatePWA}
              className="flex-1 bg-white text-primary hover:bg-white/90"
              disabled={isUpdating}
            >
              {isUpdating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Atualizando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar agora
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
