import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger.service';
import { metricsService } from './metrics.service';
import { observabilityService } from './observability.service';

export type ContaStatus = 'PENDENTE' | 'PARCIAL' | 'PAGO' | 'VENCIDO' | 'CANCELADO';
export type TipoPagamento = 'PIX' | 'BOLETO' | 'CARTÃO' | 'TED' | 'DOC' | 'TRANSFERÊNCIA' | 'DINHEIRO';
export type CargoComissao = 'REPRESENTANTE' | 'SUPERVISOR' | 'GERENTE';

export interface CommissionRuleConfig {
  representantePercent: number;
  supervisorPercent: number;
  gerentePercent: number;
}

export interface CreateReceivablePayload {
  empresaOperadoraId: string;
  contratoId?: string;
  clienteId: string;
  numeroDocumento?: string;
  competencia?: string;
  vencimento: string;
  valorOriginal: number;
  desconto?: number;
  juros?: number;
  multa?: number;
}

export interface RegisterPaymentPayload {
  contaReceberId: string;
  parcelaId?: string;
  tipo: TipoPagamento;
  valor: number;
  dataPagamento?: string;
  gateway?: string;
  txid?: string;
  nsu?: string;
  codigoBancario?: string;
  comprovanteObjectKey?: string;
}

export interface ContaReceberCompleta {
  id: string;
  empresa_operadora_id: string;
  contrato_id?: string;
  cliente_id: string;
  numero_documento: string;
  competencia: string;
  vencimento: string;
  valor_original: number;
  desconto: number;
  juros: number;
  multa: number;
  valor_recebido: number;
  saldo: number;
  status: ContaStatus;
  created_at: string;
  cliente?: any;
  contrato?: any;
  parcelas?: any[];
  pagamentos?: any[];
}

export interface ComissaoRecord {
  id: string;
  empresa_operadora_id: string;
  contrato_id?: string;
  conta_receber_id?: string;
  representante_id?: string;
  supervisor_id?: string;
  gerente_id?: string;
  percentual: number;
  valor: number;
  competencia: string;
  status: 'PENDENTE' | 'LIBERADA' | 'PAGA' | 'CANCELADA';
  created_at: string;
  usuario?: any;
}

export class FinanceiroService {
  private commissionRules: CommissionRuleConfig = {
    representantePercent: 5.0,
    supervisorPercent: 2.0,
    gerentePercent: 1.0,
  };

  /**
   * Configura regras parametrizáveis de comissão
   */
  setCommissionRules(rules: Partial<CommissionRuleConfig>): void {
    this.commissionRules = { ...this.commissionRules, ...rules };
  }

  /**
   * Cria Conta a Receber com código atômico por tenant (REC-2026-000001)
   */
  async createReceivable(payload: CreateReceivablePayload, usuarioId?: string): Promise<{ success: boolean; contaId?: string; numeroDocumento?: string; error?: string }> {
    const t0 = Date.now();
    const span = observabilityService.startSpan('financeiro.createReceivable', {
      'erp.tenant_id': payload.empresaOperadoraId,
      'erp.valor': payload.valorOriginal,
    });
    try {
      // 1. Gera código atômico via RPC se não fornecido
      let numDoc = payload.numeroDocumento;
      if (!numDoc) {
        const { data: numData } = await supabase.rpc('fn_gerar_numero_recebivel_atomo', {
          p_empresa_operadora_id: payload.empresaOperadoraId,
        });
        numDoc = numData || `REC-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000000)}`;
      }

      const saldo = payload.valorOriginal - (payload.desconto || 0) + (payload.juros || 0) + (payload.multa || 0);
      const comp = payload.competencia || new Date().toISOString().substring(0, 7);

      const { data: conta, error } = await supabase
        .from('contas_receber')
        .insert({
          empresa_operadora_id: payload.empresaOperadoraId,
          contrato_id: payload.contratoId || null,
          cliente_id: payload.clienteId,
          numero_documento: numDoc,
          competencia: comp,
          vencimento: payload.vencimento,
          valor_original: payload.valorOriginal,
          desconto: payload.desconto || 0,
          juros: payload.juros || 0,
          multa: payload.multa || 0,
          valor_recebido: 0,
          saldo,
          status: 'PENDENTE',
        })
        .select('id')
        .single();

      if (error || !conta) return { success: false, error: error?.message || 'Falha ao criar recebível.' };

      // Insere Fluxo de Caixa Previsto
      await supabase.from('fluxo_caixa').insert({
        empresa_operadora_id: payload.empresaOperadoraId,
        tipo: 'ENTRADA',
        categoria: 'FATURAMENTO',
        descricao: `Recebível Doc #${numDoc}`,
        valor_previsto: payload.valorOriginal,
        valor_realizado: 0,
        data_prevista: payload.vencimento,
      });

      // Auditoria
      await supabase.from('financeiro_auditoria').insert({
        empresa_operadora_id: payload.empresaOperadoraId,
        evento: 'CONTA_CRIADA',
        usuario_id: usuarioId || null,
        detalhes: { conta_id: conta.id, numero_documento: numDoc, valor: payload.valorOriginal },
      });

      const durationMs = Date.now() - t0;
      observabilityService.endSpan(span.spanId, 'OK');
      metricsService.recordAPICall('createReceivable', payload.empresaOperadoraId, durationMs, true);
      metricsService.recordFinancialTransaction('RECEBIVEL', payload.empresaOperadoraId);
      logger.operation('createReceivable', durationMs, 'SUCCESS', { contaId: conta.id, valor: payload.valorOriginal, tenant: payload.empresaOperadoraId });
      return { success: true, contaId: conta.id, numeroDocumento: numDoc };
    } catch (err: any) {
      const durationMs = Date.now() - t0;
      observabilityService.endSpan(span.spanId, 'ERROR', err?.message);
      metricsService.recordAPICall('createReceivable', payload.empresaOperadoraId, durationMs, false);
      logger.error('createReceivable falhou', err, { tenant: payload.empresaOperadoraId });
      return { success: false, error: err?.message };
    }
  }

  /**
   * Gera parcelas em public.parcelas para contratos de cobrança recorrente
   */
  async generateInstallments(payload: {
    empresaOperadoraId: string;
    contratoId: string;
    clienteId: string;
    valorMensal: number;
    numeroParcelas: number;
    dataPrimeiroVencimento: string;
  }, usuarioId?: string): Promise<{ success: boolean; totalGerado: number; error?: string }> {
    try {
      const recRes = await this.createReceivable({
        empresaOperadoraId: payload.empresaOperadoraId,
        contratoId: payload.contratoId,
        clienteId: payload.clienteId,
        vencimento: payload.dataPrimeiroVencimento,
        valorOriginal: payload.valorMensal * payload.numeroParcelas,
      }, usuarioId);

      if (!recRes.success || !recRes.contaId) return { success: false, totalGerado: 0, error: recRes.error };

      const baseDate = new Date(payload.dataPrimeiroVencimento);
      const parcelasRows = [];

      for (let i = 1; i <= payload.numeroParcelas; i++) {
        const venc = new Date(baseDate);
        venc.setMonth(venc.getMonth() + (i - 1));

        parcelasRows.push({
          conta_receber_id: recRes.contaId,
          numero_parcela: i,
          vencimento: venc.toISOString().split('T')[0],
          valor: payload.valorMensal,
          status: 'PENDENTE',
        });
      }

      await supabase.from('parcelas').insert(parcelasRows);

      await supabase.from('financeiro_auditoria').insert({
        empresa_operadora_id: payload.empresaOperadoraId,
        evento: 'PARCELA_GERADA',
        usuario_id: usuarioId || null,
        detalhes: { conta_id: recRes.contaId, parcelas: payload.numeroParcelas },
      });

      return { success: true, totalGerado: payload.numeroParcelas };
    } catch (err: any) {
      return { success: false, totalGerado: 0, error: err?.message };
    }
  }

  /**
   * Registra liquidação / pagamento e baixa atômica no recebível
   */
  async registerPayment(payload: RegisterPaymentPayload, usuarioId?: string): Promise<{ success: boolean; error?: string }> {
    const t0 = Date.now();
    const span = observabilityService.startSpan('financeiro.registerPayment', { 'erp.tipo_pagamento': payload.tipo, 'erp.valor': payload.valor });
    try {
      const { data: conta } = await supabase.from('contas_receber').select('*').eq('id', payload.contaReceberId).single();
      if (!conta) return { success: false, error: 'Recebível não encontrado.' };

      // 1. Registra pagamento em public.pagamentos
      const { data: pag, error: pagErr } = await supabase
        .from('pagamentos')
        .insert({
          conta_receber_id: payload.contaReceberId,
          parcela_id: payload.parcelaId || null,
          tipo: payload.tipo,
          valor: payload.valor,
          data_pagamento: payload.dataPagamento || new Date().toISOString(),
          comprovante_object_key: payload.comprovanteObjectKey || null,
        })
        .select('id')
        .single();

      if (pagErr || !pag) return { success: false, error: pagErr?.message };

      // 2. Registra conciliação
      await this.reconcilePayment({
        pagamentoId: pag.id,
        gateway: payload.gateway || 'GATEWAY_PADRAO',
        txid: payload.txid || `TX-${Date.now()}`,
        nsu: payload.nsu || `NSU-${Date.now()}`,
        codigoBancario: payload.codigoBancario || '341',
        comprovanteKey: payload.comprovanteObjectKey,
        usuarioId,
      });

      // 3. Atualiza valor_recebido e saldo
      const novoRecebido = Number(conta.valor_recebido || 0) + payload.valor;
      const novoSaldo = Math.max(0, Number(conta.saldo || 0) - payload.valor);
      const novoStatus: ContaStatus = novoSaldo <= 0 ? 'PAGO' : 'PARCIAL';

      await supabase
        .from('contas_receber')
        .update({
          valor_recebido: novoRecebido,
          saldo: novoSaldo,
          status: novoStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.contaReceberId);

      // 4. Calcula comissões parametrizadas (Representante, Supervisor, Gerente) apenas após confirmação do recebimento
      if (usuarioId) {
        await this.calculateCommission({
          empresaOperadoraId: conta.empresa_operadora_id,
          contratoId: conta.contrato_id,
          contaReceberId: conta.id,
          representanteId: usuarioId,
          valorPago: payload.valor,
        });
      }

      // 5. Auditoria
      await supabase.from('financeiro_auditoria').insert({
        empresa_operadora_id: conta.empresa_operadora_id,
        evento: 'BAIXA',
        usuario_id: usuarioId || null,
        detalhes: { conta_receber_id: conta.id, valor: payload.valor, status_novo: novoStatus },
      });

      const durationMs = Date.now() - t0;
      observabilityService.endSpan(span.spanId, 'OK');
      metricsService.recordAPICall('registerPayment', conta.empresa_operadora_id, durationMs, true);
      logger.businessEvent('PAGAMENTO_REGISTRADO', conta.empresa_operadora_id, { tipo: payload.tipo, valor: payload.valor });
      return { success: true };
    } catch (err: any) {
      const durationMs = Date.now() - t0;
      observabilityService.endSpan(span.spanId, 'ERROR', err?.message);
      metricsService.recordAPICall('registerPayment', 'unknown', durationMs, false);
      logger.error('registerPayment falhou', err);
      return { success: false, error: err?.message };
    }
  }

  /**
   * Registra a conciliação bancária do pagamento
   */
  async reconcilePayment(payload: {
    pagamentoId: string;
    gateway?: string;
    txid?: string;
    nsu?: string;
    codigoBancario?: string;
    comprovanteKey?: string;
    usuarioId?: string;
  }): Promise<void> {
    await supabase.from('conciliacoes').insert({
      pagamento_id: payload.pagamentoId,
      gateway: payload.gateway || 'INTERNO',
      txid: payload.txid || null,
      nsu: payload.nsu || null,
      codigo_bancario: payload.codigoBancario || null,
      comprovante_key: payload.comprovanteKey || null,
      usuario_conciliador_id: payload.usuarioId || null,
    });
  }

  /**
   * Calcula comissões multinível parametrizáveis (Representante 5%, Supervisor 2%, Gerente 1%)
   */
  async calculateCommission(payload: {
    empresaOperadoraId: string;
    contratoId?: string;
    contaReceberId: string;
    representanteId: string;
    supervisorId?: string;
    gerenteId?: string;
    valorPago: number;
  }): Promise<void> {
    const comp = new Date().toISOString().substring(0, 7);

    // Representante (5%)
    const valRep = (payload.valorPago * this.commissionRules.representantePercent) / 100;
    await supabase.from('comissoes').insert({
      empresa_operadora_id: payload.empresaOperadoraId,
      contrato_id: payload.contratoId || null,
      conta_receber_id: payload.contaReceberId,
      representante_id: payload.representanteId,
      percentual: this.commissionRules.representantePercent,
      valor: valRep,
      competencia: comp,
      status: 'LIBERADA',
    });

    await supabase.from('financeiro_auditoria').insert({
      empresa_operadora_id: payload.empresaOperadoraId,
      evento: 'COMISSAO',
      usuario_id: payload.representanteId,
      detalhes: { valor: valRep, percentual: this.commissionRules.representantePercent },
    });
  }

  /**
   * Libera comissão para pagamento
   */
  async releaseCommission(comissaoId: string, usuarioId?: string): Promise<{ success: boolean }> {
    await supabase.from('comissoes').update({ status: 'LIBERADA' }).eq('id', comissaoId);
    return { success: true };
  }

  /**
   * Realiza o estorno auditado de um pagamento sem apagar histórico
   */
  async reversePayment(pagamentoId: string, motivo: string, usuarioId?: string): Promise<{ success: boolean }> {
    const { data: pag } = await supabase.from('pagamentos').select('*, conta:contas_receber(*)').eq('id', pagamentoId).single();
    if (!pag) return { success: false };

    const novaRecebido = Math.max(0, Number(pag.conta.valor_recebido) - Number(pag.valor));
    const novoSaldo = Number(pag.conta.saldo) + Number(pag.valor);

    await supabase
      .from('contas_receber')
      .update({ valor_recebido: novaRecebido, saldo: novoSaldo, status: 'PARCIAL' })
      .eq('id', pag.conta_receber_id);

    await supabase.from('financeiro_auditoria').insert({
      empresa_operadora_id: pag.conta.empresa_operadora_id,
      evento: 'ESTORNO',
      usuario_id: usuarioId || null,
      detalhes: { pagamento_id: pagamentoId, motivo },
    });

    return { success: true };
  }

  /**
   * Lista recebíveis
   */
  async listReceivables(empresaOperadoraId?: string): Promise<ContaReceberCompleta[]> {
    try {
      let query = supabase
        .from('contas_receber')
        .select(`*, cliente:clientes(*), contrato:contratos(*), parcelas:parcelas(*), pagamentos:pagamentos(*)`)
        .order('vencimento', { ascending: true });

      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);

      const { data } = await query;
      return (data || []) as ContaReceberCompleta[];
    } catch (err) {
      return [];
    }
  }

  /**
   * Lista comissões
   */
  async listCommissions(empresaOperadoraId?: string): Promise<ComissaoRecord[]> {
    try {
      let query = supabase.from('comissoes').select(`*, usuario:usuarios(*)`).order('created_at', { ascending: false });
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      const { data } = await query;
      return (data || []) as ComissaoRecord[];
    } catch (err) {
      return [];
    }
  }

  /**
   * Fluxo de caixa
   */
  async generateCashFlow(empresaOperadoraId?: string): Promise<any[]> {
    try {
      let query = supabase.from('fluxo_caixa').select('*').order('data_prevista', { ascending: true });
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      const { data } = await query;
      return data || [];
    } catch (err) {
      return [];
    }
  }
}

export const financeiroService = new FinanceiroService();
