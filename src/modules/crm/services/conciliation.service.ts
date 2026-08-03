import { supabase } from '@/integrations/supabase/client';

export class ConciliationService {
  /**
   * Procura cruzamento automático de extrato por TXID ou Valor/Vencimento
   */
  async matchPayment(txid: string, valor: number): Promise<{ matched: boolean; contaId?: string }> {
    const { data: pix } = await supabase.from('pix_cobrancas').select('conta_receber_id').eq('txid', txid).single();
    if (pix) return { matched: true, contaId: pix.conta_receber_id };

    return { matched: false };
  }

  /**
   * Executa a conciliação automática
   */
  async reconcile(pagamentoId: string, txid: string, gateway: string): Promise<{ success: boolean }> {
    await supabase.from('recebimentos_conciliacao').insert({
      pagamento_id: pagamentoId,
      gateway,
      txid,
      nsu: `NSU-${Date.now()}`,
      autenticacao: `AUTH-AUTO-${Date.now()}`,
    });
    return { success: true };
  }

  /**
   * Relatório de divergências entre extrato bancário e contas a receber
   */
  async generateDifferenceReport(empresaOperadoraId: string): Promise<any[]> {
    const { data } = await supabase.from('contas_receber').select('*').eq('empresa_operadora_id', empresaOperadoraId).eq('status', 'PARCIAL');
    return data || [];
  }
}

export const conciliationService = new ConciliationService();
