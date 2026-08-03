import { supabase } from '@/integrations/supabase/client';

export class ReportingService {
  async scheduleReport(empresaOperadoraId: string, frequencia: 'DIARIO' | 'SEMANAL' | 'MENSAL', destinatarios: string[]): Promise<{ success: boolean }> {
    await supabase.from('bi_agendamentos').insert({
      empresa_operadora_id: empresaOperadoraId,
      frequencia,
      destinatarios,
      status: 'ATIVO',
    });
    return { success: true };
  }
}

export const reportingService = new ReportingService();
