import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, Plus } from 'lucide-react';
import { geolocationService } from '../../services/geolocation.service';
import { offlineStorageService } from '../../services/offlineStorage.service';
import { useToast } from '@/hooks/use-toast';

export function SalesDashboardMobile({ empresaOperadoraId, clienteId }: { empresaOperadoraId: string; clienteId?: string }) {
  const { toast } = useToast();
  const [loadingCheckin, setLoadingCheckin] = useState(false);

  const handleCheckin = async () => {
    setLoadingCheckin(true);
    const coords = await geolocationService.getCurrentPosition();

    // Salva na fila offline local — clienteId derivado da prop, nunca hardcoded
    offlineStorageService.enqueue('CHECKIN', {
      clienteId: clienteId || null, // null se não houver cliente selecionado no contexto
      latitude: coords.latitude,
      longitude: coords.longitude,
      precisao: coords.accuracy,
    });

    setLoadingCheckin(false);
    toast({
      title: 'Check-in Geolocalizado Salvo (Offline-First)!',
      description: `GPS: ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`,
    });
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-emerald-400" /> Visitas Comerciais de Campo
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
          <div className="flex justify-between items-center text-white">
            <strong>{clienteId ? 'Cliente selecionado' : 'Nenhum cliente selecionado'}</strong>
            <span className="text-[10px] text-emerald-400">{clienteId ? 'GPS disponível' : 'Selecione um cliente'}</span>
          </div>
          <Button
            size="sm"
            disabled={loadingCheckin}
            onClick={handleCheckin}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs gap-1.5"
          >
            <MapPin className="h-4 w-4" /> Registrar Check-in GPS
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
