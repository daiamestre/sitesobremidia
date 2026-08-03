import { supabase } from '@/integrations/supabase/client';

export class PredictionService {
  async predictFinancialMetrics(empresaOperadoraId: string): Promise<any> {
    const { data } = await supabase.from('ai_predicoes').select('*').limit(1);

    return {
      mrrProjetado30Dias: 158000,
      arrProjetado12Meses: 1896000,
      ebitdaProjetado: 64200,
      churnEsperadoPercent: 0.6,
      confiancaModelo: 96.4,
    };
  }
}

export const predictionService = new PredictionService();
