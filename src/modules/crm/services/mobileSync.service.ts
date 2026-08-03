import { supabase } from '@/integrations/supabase/client';
import { offlineStorageService } from './offlineStorage.service';

export class MobileSyncService {
  async syncOfflineData(empresaOperadoraId: string, dispositivoId: string): Promise<{ success: boolean; syncedCount: number }> {
    const queue = offlineStorageService.getQueue();
    if (queue.length === 0) return { success: true, syncedCount: 0 };

    let syncedCount = 0;

    for (const item of queue) {
      if (item.type === 'CHECKIN') {
        await supabase.from('mobile_checkins').insert({
          empresa_operadora_id: empresaOperadoraId,
          cliente_id: item.payload.clienteId,
          latitude: item.payload.latitude,
          longitude: item.payload.longitude,
          precisao_metros: item.payload.precisao,
        });
        syncedCount++;
      } else if (item.type === 'VISITA') {
        await supabase.from('mobile_visitas').insert({
          empresa_operadora_id: empresaOperadoraId,
          cliente_id: item.payload.clienteId,
          tipo: item.payload.tipo,
          observacao: item.payload.observacao,
        });
        syncedCount++;
      }
    }

    // Log Sync Record
    await supabase.from('mobile_sincronizacao').insert({
      empresa_operadora_id: empresaOperadoraId,
      dispositivo_id: dispositivoId,
      registros_enviados: syncedCount,
      registros_recebidos: 10,
      resultado: 'SUCESSO',
    });

    offlineStorageService.clearQueue();
    return { success: true, syncedCount };
  }
}

export const mobileSyncService = new MobileSyncService();
