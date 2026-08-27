import { supabase } from '@/integrations/supabase/client';

export class SnapshotService {
  async saveSnapshot(empresaOperadoraId: string, granularidade: 'DIARIA' | 'MENSAL' | 'ANUAL', data: any): Promise<{ success: boolean }> {
    // bi_snapshots: granularidade mapeada em tipo_relatorio; payload em JSONB
    await supabase.from('bi_snapshots').insert({
      empresa_operadora_id: empresaOperadoraId,
      tipo_relatorio: granularidade,
      payload: data,
    });
    return { success: true };
  }
}

export const snapshotService = new SnapshotService();
