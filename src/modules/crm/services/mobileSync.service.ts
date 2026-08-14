import { supabase } from '@/integrations/supabase/client';
import { offlineStorageService } from './offlineStorage.service';

export class MobileSyncService {
  async syncOfflineData(empresaOperadoraId: string, tecnicoId: string): Promise<{ success: boolean; syncedCount: number }> {
    const queue = offlineStorageService.getQueue();
    if (queue.length === 0) return { success: true, syncedCount: 0 };

    let syncedCount = 0;

    for (const item of queue) {
      if (item.type === 'CHECKIN') {
        await supabase.from('mobile_checkins').insert({
          empresa_operadora_id: empresaOperadoraId,
          screen_id: item.payload.screenId, // FIXED: was clienteId
          latitude: item.payload.latitude,
          longitude: item.payload.longitude,
          tipo: item.payload.tipo || 'MANUTENCAO',
          created_by: tecnicoId, // ADDED: required by schema
          status: 'INICIADO'
        });
        syncedCount++;
      } else if (item.type === 'VISITA') {
        await supabase.from('mobile_visitas').insert({
          empresa_operadora_id: empresaOperadoraId,
          screen_id: item.payload.screenId, // FIXED: was clienteId
          tecnico_id: tecnicoId, // ADDED: required by schema
          data_agendada: item.payload.dataAgendada || new Date().toISOString().split('T')[0],
          status: 'REALIZADA'
        });
        syncedCount++;
      }
    }

    // REMOVED: mobile_sincronizacao ghost table insert. 
    // Sync telemetry should be handled by local PWA logs or a central observability platform, not the operational database.

    offlineStorageService.clearQueue();
    return { success: true, syncedCount };
  }
}

export const mobileSyncService = new MobileSyncService();
