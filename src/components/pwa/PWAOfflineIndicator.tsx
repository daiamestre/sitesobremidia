import { WifiOff, Wifi } from 'lucide-react';
import { usePWA } from '@/hooks/usePWA';
import { useState, useEffect } from 'react';

export const PWAOfflineIndicator = () => {
  const { isOffline } = usePWA();
  const [showOnlineMessage, setShowOnlineMessage] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (isOffline) {
      setWasOffline(true);
    } else if (wasOffline) {
      // Show "back online" message briefly
      setShowOnlineMessage(true);
      const timer = setTimeout(() => {
        setShowOnlineMessage(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOffline, wasOffline]);

  if (!isOffline && !showOnlineMessage) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div 
        className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-lg ${
          isOffline 
            ? 'bg-destructive text-destructive-foreground' 
            : 'bg-green-500 text-white'
        }`}
      >
        {isOffline ? (
          <>
            <WifiOff className="h-4 w-4" />
            <span className="text-sm font-medium">Sem conexão</span>
          </>
        ) : (
          <>
            <Wifi className="h-4 w-4" />
            <span className="text-sm font-medium">Conectado novamente</span>
          </>
        )}
      </div>
    </div>
  );
};
