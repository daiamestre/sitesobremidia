import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { offlineStorageService } from '../../services/offlineStorage.service';
import { mobileSyncService } from '../../services/mobileSync.service';
import { useToast } from '@/hooks/use-toast';

export function SyncDashboard({ empresaOperadoraId }: { empresaOperadoraId: string }) {
  const { toast } = useToast();
  const [queueLength, setQueueLength] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshQueue = () => {
    setQueueLength(offlineStorageService.getQueue().length);
  };

  useEffect(() => {
    refreshQueue();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    const res = await mobileSyncService.syncOfflineData(empresaOperadoraId, 'DEV-MOBILE-01');
    setSyncing(false);
    refreshQueue();

    if (res.success) {
      toast({
        title: 'Sincronização Concluída!',
        description: `${res.syncedCount} registros enviados para a nuvem.`,
      });
    }
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-amber-400" /> Fila Offline & Sincronização
          </span>
          <Badge className={queueLength > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}>
            {queueLength > 0 ? `${queueLength} Pendentes` : 'Sincronizado'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-3 text-xs">
        <Button
          size="sm"
          disabled={syncing || queueLength === 0}
          onClick={handleSync}
          className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs gap-1.5"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> Sincronizar Fila Offline Agora
        </Button>
      </CardContent>
    </Card>
  );
}
