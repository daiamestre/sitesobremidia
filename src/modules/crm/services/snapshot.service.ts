import { supabase } from '@/integrations/supabase/client';

export class SnapshotService {
  async saveSnapshot(empresaOperadoraId: string, granularidade: 'DIARIA' | 'MENSAL' | 'ANUAL', data: any): Promise<{ success: boolean }> {
    await supabase.from('bi_snapshots').insert({
      empresa_operadora_id: empresaOperadoraId,
      granularidade,
      snapshot_data: data,
    });
    return { success: true };
  }
}

export const snapshotService = new SnapshotService();
