import { supabase } from '@/integrations/supabase/client';

export type FinanceEventType =
  | 'ContratoAssinado'
  | 'RecebivelCriado'
  | 'PagamentoRecebido'
  | 'ComissaoCalculada'
  | 'FluxoAtualizado'
  | 'NotaFiscalEmitida';

export type GatewayProvider = 'ASAAS' | 'BANCO_DO_BRASIL' | 'MERCADO_PAGO' | 'PAGARME' | 'STRIPE' | 'SISTEMA_INTERNO';

export interface FinanceChargePayload {
  valor: number;
  vencimento: string;
  clienteNome: string;
  clienteCnpjCpf: string;
  descricao: string;
}

export interface FinanceChargeResult {
  success: boolean;
  txid: string;
  pixQrCodeUrl?: string;
  boletoPdfUrl?: string;
}

/**
 * Gateway Financeiro Desacoplado (Interface Abstrata)
 */
export class FinanceGatewayAdapter {
  constructor(private provider: GatewayProvider = 'SISTEMA_INTERNO') {}

  async createCharge(payload: FinanceChargePayload): Promise<FinanceChargeResult> {
    // Simulação do Gateway Abstrato
    return {
      success: true,
      txid: `TX-${this.provider}-${Date.now()}`,
      pixQrCodeUrl: `https://gateway.${this.provider.toLowerCase()}.com/qrcode/${Date.now()}`,
      boletoPdfUrl: `https://gateway.${this.provider.toLowerCase()}.com/boleto/${Date.now()}`,
    };
  }

  async cancelCharge(txid: string): Promise<{ success: boolean }> {
    return { success: true };
  }
}

/**
 * Barramento de Eventos Financeiros (Internal Event Bus)
 */
export class FinanceEventBus {
  private static listeners: Map<FinanceEventType, Array<(payload: unknown) => Promise<void> | void>> = new Map();

  static on(event: FinanceEventType, callback: (payload: unknown) => Promise<void> | void) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)?.push(callback);
  }

  static async emit(event: FinanceEventType, payload: unknown) {
    const callbacks = this.listeners.get(event) || [];
    for (const fn of callbacks) {
      try {
        await fn(payload);
      } catch (err) {
        console.error(`Erro no listener de ${event}:`, err);
      }
    }
  }
}

export class FinanceiroPlusService {
  /**
   * Registra Partida Dobrada no Livro-Razão (General Ledger)
   */
  async registerGeneralLedgerEntry(payload: {
    empresaOperadoraId: string;
    contaDebitoCodigo: string; // Ex: '1.1.02' (Banco)
    contaCreditoCodigo: string; // Ex: '1.2.01' (Clientes)
    centroCustoId?: string;
    valor: number;
    historico: string;
    origemId?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: debito } = await supabase.from('plano_contas').select('id').eq('codigo', payload.contaDebitoCodigo).single();
      const { data: credito } = await supabase.from('plano_contas').select('id').eq('codigo', payload.contaCreditoCodigo).single();

      if (!debito || !credito) return { success: false, error: 'Contas do Plano de Contas não localizadas.' };

      await supabase.from('financeiro_lancamentos').insert({
        empresa_operadora_id: payload.empresaOperadoraId,
        conta_debito_id: debito.id,
        conta_credito_id: credito.id,
        centro_custo_id: payload.centroCustoId || null,
        valor: payload.valor,
        historico: payload.historico,
        origem_id: payload.origemId || null,
      });

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Emitir Nota Fiscal / RPS (Motor Fiscal)
   */
  async issueInvoice(payload: {
    empresaOperadoraId: string;
    clienteId: string;
    contratoId?: string;
    valorServicos: number;
  }): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
    try {
      const iss = (payload.valorServicos * 5.0) / 100;
      const pis = (payload.valorServicos * 0.65) / 100;
      const cofins = (payload.valorServicos * 3.0) / 100;

      const { data: nf, error } = await supabase
        .from('notas_fiscais')
        .insert({
          empresa_operadora_id: payload.empresaOperadoraId,
          cliente_id: payload.clienteId,
          contrato_id: payload.contratoId || null,
          numero_rps: 0, // Zero Mock: deve ser preenchido por integração real de prefeitura
          numero_nfse: '', // Zero Mock: deve ser retornado pela integração real
          valor_servicos: payload.valorServicos,
          aliquota_iss: 5.0,
          valor_iss: iss,
          pis,
          cofins,
          status: 'EMITIDA',
        })
        .select('id')
        .single();

      if (error || !nf) return { success: false, error: error?.message };

      await FinanceEventBus.emit('NotaFiscalEmitida', { invoiceId: nf.id, valor: payload.valorServicos });

      return { success: true, invoiceId: nf.id };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Scheduler Autónomo Financeiro: Atualiza títulos vencidos e executa régua de cobrança
   */
  async runDailyFinanceScheduler(empresaOperadoraId: string): Promise<{ success: boolean; titulosAtualizados: number }> {
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const { data: vencidos } = await supabase
        .from('contas_receber')
        .select('id')
        .eq('empresa_operadora_id', empresaOperadoraId)
        .lt('vencimento', hoje)
        .eq('status', 'PENDENTE');

      if (vencidos && vencidos.length > 0) {
        const ids = vencidos.map((v) => v.id);
        await supabase.from('contas_receber').update({ status: 'VENCIDO' }).in('id', ids);
      }

      return { success: true, titulosAtualizados: vencidos?.length || 0 };
    } catch (err) {
      return { success: false, titulosAtualizados: 0 };
    }
  }

  /**
   * Lista Lançamentos do Livro-Razão
   */
  async listGeneralLedger(empresaOperadoraId?: string): Promise<Record<string, unknown>[]> {
    try {
      let query = supabase.from('financeiro_lancamentos').select('*').order('created_at', { ascending: false });
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      const { data } = await query;
      return data || [];
    } catch (err) {
      return [];
    }
  }

  /**
   * Lista Notas Fiscais
   */
  async listInvoices(empresaOperadoraId?: string): Promise<Record<string, unknown>[]> {
    try {
      let query = supabase.from('notas_fiscais').select('*, cliente:clientes(*)').order('created_at', { ascending: false });
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      const { data } = await query;
      return data || [];
    } catch (err) {
      return [];
    }
  }
}

export const financeiroPlusService = new FinanceiroPlusService();
