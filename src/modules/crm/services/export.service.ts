import { supabase } from '@/integrations/supabase/client';

export type ExportFormat = 'PDF' | 'EXCEL' | 'CSV' | 'POWER_BI';

export class ExportService {
  async exportData(empresaOperadoraId: string, formato: ExportFormat, dashboardName: string): Promise<{ success: boolean; downloadUrl: string }> {
    await supabase.from('bi_exportacoes').insert({
      empresa_operadora_id: empresaOperadoraId,
      formato,
      detalhes: { dashboardName, exportedAt: new Date().toISOString() },
    });

    return {
      success: true,
      downloadUrl: `https://storage.sobremidia.com/export/${empresaOperadoraId}/${dashboardName.toLowerCase()}.${formato.toLowerCase()}`,
    };
  }
}

export const exportService = new ExportService();
