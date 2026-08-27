import { supabase } from '@/integrations/supabase/client';

export class ConciliationService {
  /**
   * Procura cruzamento automático de extrato por TXID em pix_cobrancas
   */
  async matchPayment(txid: string, _valor: number): Promise<{ matched: boolean; contaId?: string }> {
    const { data: pix } = await supabase
      .from('pix_cobrancas')
      .select('conta_receber_id')
      .eq('txid', txid)
      .is('deleted_at', null)
      .maybeSingle();
    if (pix) return { matched: true, contaId: pix.conta_receber_id };

    return { matched: false };
  }

  /**
   * Executa a conciliação automática: grava o recebimento e conclui a cobrança PIX
   */
  async reconcile(pagamentoId: string, txid: string, gateway: string): Promise<{ success: boolean }> {
    const { error: recErr } = await supabase.from('recebimentos_conciliacao').insert({
      pagamento_id: pagamentoId,
      gateway,
      txid,
      nsu: `NSU-${Date.now()}`,
      autenticacao: `AUTH-AUTO-${Date.now()}`,
    });
    if (recErr) return { success: false };

    // Marca o PIX como pago, escopado por txid + tenant da própria cobrança
    const { data: pix } = await supabase
      .from('pix_cobrancas')
      .select('empresa_operadora_id')
      .eq('txid', txid)
      .is('deleted_at', null)
      .maybeSingle();
    if (pix) {
      const { error: pixErr } = await supabase
        .from('pix_cobrancas')
        .update({ status: 'CONCLUIDA' })
        .eq('txid', txid)
        .eq('empresa_operadora_id', pix.empresa_operadora_id);
      if (pixErr) return { success: false };
    }

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
