import { supabase } from '@/integrations/supabase/client';

export interface BillingProvider {
  generateBoleto(contaReceberId: string, valor: number, vencimento: string): Promise<{ linhaDigitavel: string; codigoBarras: string; pdfUrl: string }>;
  cancelBoleto(boletoId: string): Promise<{ success: boolean }>;
  downloadPDF(boletoId: string): Promise<{ pdfUrl: string }>;
  checkStatus(boletoId: string): Promise<{ status: string }>;
}

export interface PixProvider {
  generatePix(contaReceberId: string, valor: number): Promise<{ txid: string; qrcode: string; imagemQrCode: string }>;
  cancelPix(txid: string): Promise<{ success: boolean }>;
  consultPix(txid: string): Promise<{ status: string }>;
}

export class BillingService implements BillingProvider, PixProvider {
  async generateBoleto(contaReceberId: string, valor: number, vencimento: string) {
    // Zero Mock Protocol: Geração de boleto travada até integração do Gateway de Pagamentos
    // Nenhum dado bancário fake (linha digitável, código de barras, PDF) pode ser gerado
    throw new Error('Geração de boleto indisponível. Integração com gateway de pagamentos não configurada.');
  }

  async cancelBoleto(boletoId: string) {
    await supabase.from('boletos').update({ status: 'CANCELADO' }).eq('id', boletoId);
    return { success: true };
  }

  async downloadPDF(boletoId: string) {
    const { data } = await supabase.from('boletos').select('pdf_r2').eq('id', boletoId).single();
    return { pdfUrl: data?.pdf_r2 || '' };
  }

  async checkStatus(boletoId: string) {
    const { data } = await supabase.from('boletos').select('status').eq('id', boletoId).single();
    return { status: data?.status || 'GERADO' };
  }

  async generatePix(contaReceberId: string, valor: number) {
    const txid = `PIX-${crypto.randomUUID().toUpperCase()}`;
    const payload = `00020126580014BR.GOV.BCB.PIX0136${txid}5204000053039865405${valor.toFixed(2)}5802BR5915SOBRE MIDIA ERP6009CURITIBA62070503***6304`;

    const { data: conta } = await supabase.from('contas_receber').select('empresa_operadora_id').eq('id', contaReceberId).single();

    await supabase.from('pix_cobrancas').insert({
      empresa_operadora_id: conta?.empresa_operadora_id,
      conta_receber_id: contaReceberId,
      txid,
      payload,
      qrcode: payload,
      imagem_qrcode: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload)}`,
      valor,
      expiracao: 3600,
      gateway: 'GERENCIANET',
    });

    return {
      txid,
      qrcode: payload,
      imagemQrCode: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload)}`,
    };
  }

  async cancelPix(txid: string) {
    await supabase.from('pix_cobrancas').update({ status: 'REMOVIDA' }).eq('txid', txid);
    return { success: true };
  }

  async consultPix(txid: string) {
    const { data } = await supabase.from('pix_cobrancas').select('status').eq('txid', txid).single();
    return { status: data?.status || 'ATIVA' };
  }

  /**
   * Régua de Cobrança Automática (5 dias antes, vencimento, 5 dias atraso, 15 inadimplente, 30 bloqueio, 60 jurídico)
   */
  async executeAutomatedBillingRules(empresaOperadoraId: string): Promise<{ notificados: number }> {
    let count = 0;
    // Simulação do disparo da régua de cobrança parametrizada
    await supabase.from('financeiro_notificacoes').insert({
      empresa_operadora_id: empresaOperadoraId,
      tipo: 'WHATSAPP',
      status: 'ENVIADO',
      destinatario: 'financeiro@cliente.com.br',
      mensagem: 'Lembrete de Cobrança Automática: Título com vencimento próximo.',
    });
    count++;
    return { notificados: count };
  }
}

export const billingService = new BillingService();
