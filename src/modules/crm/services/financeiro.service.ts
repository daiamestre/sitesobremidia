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
  valor_pago: number;
  desconto: number;
  juros: number;
  multa: number;
  valor_recebido: number;
  saldo: number;
  status: ContaStatus;
  created_at: string;
  public_token?: string;
  public_enabled?: boolean;
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
  codigo_publico?: string | null;
  cargo?: string | null;
  percentual: number;
  valor: number;
  competencia: string;
  status: 'PENDENTE' | 'LIBERADA' | 'PAGA' | 'CANCELADA';
  created_at: string;
  data_liberacao?: string | null;
  data_pagamento?: string | null;
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
      let numDoc = payload.numeroDocumento;
      if (!numDoc) {
        const { data: numData, error: rpcError } = await (supabase.rpc as any)('fn_gerar_numero_recebivel_atomo', {
          p_empresa_operadora_id: payload.empresaOperadoraId,
        });
        if (rpcError || !numData) {
          throw new Error(`Falha ao gerar número de documento via RPC: ${rpcError?.message || 'Retorno vazio'}`);
        }
        numDoc = String(numData);
      }

      const saldo = payload.valorOriginal - (payload.desconto || 0) + (payload.juros || 0) + (payload.multa || 0);
      const comp = payload.competencia || new Date().toISOString().substring(0, 7);

      const { data: conta, error } = await supabase
        .from('contas_receber')
        .insert({
          empresa_operadora_id: payload.empresaOperadoraId,
          contrato_id: payload.contratoId || null,
          cliente_id: payload.clienteId,
          codigo_operacional: numDoc,
          numero_documento: numDoc,
          competencia_date: `${comp}-01`,
          data_vencimento: payload.vencimento,
          valor: saldo,
          status: 'PENDENTE',
          notes: null,
        })
        .select('id')
        .single();

      if (error || !conta) return { success: false, error: error?.message || 'Falha ao criar recebível.' };

      // Insere Fluxo de Caixa Previsto
      await (supabase.from('fluxo_caixa') as any).insert({
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

      await (supabase.from as any)('parcelas').insert(parcelasRows);

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

      // 1. Registra pagamento em public.pagamentos (schema real; conciliação via trigger)
      const { data: pag, error: pagErr } = await supabase
        .from('pagamentos')
        .insert({
          conta_receber_id: payload.contaReceberId,
          meio_pagamento: payload.tipo,
          valor_pago: payload.valor,
          data_liquidacao: payload.dataPagamento || new Date().toISOString(),
          transacao_id_externo: payload.txid || null,
          created_by: usuarioId || null,
        })
        .select('id')
        .single();

      if (pagErr || !pag) return { success: false, error: pagErr?.message };

      // 2. Registra conciliação (tabela com schema próprio)
      await this.reconcilePayment({
        pagamentoId: pag.id,
        gateway: payload.gateway || 'GATEWAY_PADRAO',
        txid: payload.txid || `TX-${Date.now()}`,
        nsu: payload.nsu || `NSU-${Date.now()}`,
        codigoBancario: payload.codigoBancario || '341',
        comprovanteKey: payload.comprovanteObjectKey,
        usuarioId,
      });

      // 3. Estado consolidado da conta após o trigger de conciliação
      const { data: contaAtualizada } = await supabase
        .from('contas_receber')
        .select('valor, valor_pago, saldo, status')
        .eq('id', payload.contaReceberId)
        .single();
      const novoStatus: ContaStatus = (contaAtualizada?.status as ContaStatus) || 'PARCIAL';

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
    await (supabase.from('conciliacoes') as any).insert({
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
    await (supabase.from('comissoes') as any).insert({
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

    const conta = pag.conta as any;
    const valorEstornado = Number(pag.valor_pago || 0);
    const novoPago = Math.max(0, Number(conta?.valor_pago || 0) - valorEstornado);
    const novoSaldo = Math.max(0, Number(conta?.valor || 0) - novoPago);
    const vencido = conta?.data_vencimento ? String(conta.data_vencimento) < new Date().toISOString().slice(0, 10) : false;
    const novoStatus = novoSaldo <= 0 ? 'PAGO' : novoPago > 0 ? 'PARCIAL' : vencido ? 'ATRASADO' : 'PENDENTE';

    await supabase
      .from('contas_receber')
      .update({ valor_pago: novoPago, saldo: novoSaldo, status: novoStatus, updated_at: new Date().toISOString() })
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
        .select(`*, cliente:clientes(*), contrato:contratos(*), pagamentos:pagamentos(*)`)
        .order('data_vencimento', { ascending: true });

      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);

      const { data } = await query;
      return (data || []) as unknown as ContaReceberCompleta[];
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
      return (data || []) as unknown as ComissaoRecord[];
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

  async listCobrancas(empresaOperadoraId?: string): Promise<{ data: Cobranca[]; error: string | null }> {
    try {
      let query = supabase
        .from('contas_receber')
        .select(COBRANCA_SELECT)
        .order('data_vencimento', { ascending: true });
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      const { data, error } = await query;
      if (error) return { data: [], error: error.message };
      return { data: (data || []) as unknown as Cobranca[], error: null };
    } catch (err: any) {
      logger.error('listCobrancas falhou', err);
      return { data: [], error: err?.message || 'Falha ao listar cobranças.' };
    }
  }

  /**
   * Resolve a cobrança pelo código operacional (codigo_operacional,
   * ex.: COB-2026-000030) ou por UUID legado (identidade técnica interna).
   */
  async getCobranca(ref: string): Promise<{ data: Cobranca | null; error: string | null }> {
    try {
      const porUuid = isUuid(ref);
      const coluna = porUuid ? 'id' : 'codigo_operacional';
      const valor = porUuid ? ref : decodeURIComponent(ref).toUpperCase();
      const { data, error } = await supabase
        .from('contas_receber')
        .select(COBRANCA_SELECT)
        .eq(coluna, valor)
        .limit(1)
        .maybeSingle();
      if (error) return { data: null, error: error.message };
      return { data: (data as unknown as Cobranca) || null, error: null };
    } catch (err: any) {
      logger.error('getCobranca falhou', err);
      return { data: null, error: err?.message || 'Falha ao carregar cobrança.' };
    }
  }

  /** Gera o codigo_operacional obrigatório de contas_receber via RPC oficial */
  private async gerarCodigoOperacional(empresaOperadoraId: string): Promise<string> {
    const { data } = await supabase.rpc('fn_gerar_numero_recebivel_atomo', {
      p_empresa_operadora_id: empresaOperadoraId,
    });
    return data || `REC-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
  }

  async createCobranca(payload: CreateCobrancaPayload): Promise<{ success: boolean; cobrancaId?: string; error?: string }> {
    if (!payload.empresaOperadoraId) return { success: false, error: 'Tenant (empresa_operadora_id) ausente. Refaça o login.' };    if (!payload.clienteId) return { success: false, error: 'Selecione o cliente da cobrança.' };
    if (!payload.contratoId) return { success: false, error: 'Selecione o contrato vinculado.' };
    if (!payload.valor || payload.valor <= 0) return { success: false, error: 'Informe um valor maior que zero.' };
    if (!payload.dataVencimento) return { success: false, error: 'Informe a data de vencimento.' };
    try {
      const { data, error } = await supabase
        .from('contas_receber')
        .insert({
          empresa_operadora_id: payload.empresaOperadoraId,
          cliente_id: payload.clienteId,
          contrato_id: payload.contratoId,
          codigo_operacional: await this.gerarCodigoOperacional(payload.empresaOperadoraId),
          valor: payload.valor,
          data_vencimento: payload.dataVencimento,
          numero_parcela: payload.numeroParcela ?? 1,
          total_parcelas: payload.totalParcelas ?? 1,
          status: 'PENDENTE',
          competencia_date: payload.competenciaDate ?? null,
          metodo_cobranca: payload.metodoCobranca ?? null,
          recorrencia: payload.recorrencia ?? 'AVULSA',
          notes: payload.descricao ?? null,
        })
        .select('id')
        .single();
      if (error || !data) return { success: false, error: error?.message || 'Falha ao criar cobrança.' };
      return { success: true, cobrancaId: data.id };
    } catch (err: any) {
      logger.error('createCobranca falhou', err);
      return { success: false, error: err?.message || 'Falha ao criar cobrança.' };
    }
  }

  async updateReceivable(
    id: string,
    payload: { valor?: number; dataVencimento?: string; descricao?: string; metodoCobranca?: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validar recebível e regras financeiras (ex: não reduzir saldo para negativo ou valor total menor que pago)
      const { data: current } = await supabase
        .from('contas_receber')
        .select('valor_pago, status')
        .eq('id', id)
        .single();
        
      if (!current) return { success: false, error: 'Recebível não encontrado.' };
      
      const updatePayload: any = { updated_at: new Date().toISOString() };
      
      if (payload.valor !== undefined) {
        if (payload.valor < Number(current.valor_pago || 0)) {
          return { success: false, error: 'Valor total não pode ser menor que o valor já recebido.' };
        }
        updatePayload.valor = payload.valor;
        updatePayload.saldo = payload.valor - Number(current.valor_pago || 0);
        
        // Recalcular status se necessário baseado no novo saldo
        if (current.status !== 'CANCELADO') {
          updatePayload.status = updatePayload.saldo <= 0 ? 'PAGO' : (Number(current.valor_pago || 0) > 0 ? 'PARCIAL' : 'PENDENTE');
        }
      }
      
      if (payload.dataVencimento) updatePayload.data_vencimento = payload.dataVencimento;
      if (payload.descricao !== undefined) updatePayload.notes = payload.descricao;
      if (payload.metodoCobranca !== undefined) updatePayload.metodo_cobranca = payload.metodoCobranca;

      const { error } = await supabase.from('contas_receber').update(updatePayload).eq('id', id);
      
      if (error) return { success: false, error: error.message };
      
      // Registrar evento de auditoria
      await supabase.from('financeiro_auditoria').insert({
        empresa_operadora_id: (await supabase.from('contas_receber').select('empresa_operadora_id').eq('id', id).single()).data?.empresa_operadora_id,
        evento: 'EDICAO',
        detalhes: { conta_receber_id: id, alteracoes: payload }
      });
      
      return { success: true };
    } catch (err: any) {
      logger.error('updateReceivable falhou', err);
      return { success: false, error: err?.message || 'Falha ao atualizar cobrança.' };
    }
  }

  async marcarComoPaga(
    cobranca: Pick<Cobranca, 'id' | 'valor' | 'contrato_id' | 'empresa_operadora_id'>,
    opts: { meioPagamento: TipoPagamento; valorPago?: number; dataLiquidacao?: string; usuarioId?: string }
  ): Promise<{ success: boolean; pagamentoId?: string; error?: string }> {
    const valorPago = opts.valorPago && opts.valorPago > 0 ? opts.valorPago : cobranca.valor;
    const dataLiquidacao = opts.dataLiquidacao || new Date().toISOString();
    try {
      const { data: pag, error: pagError } = await supabase
        .from('pagamentos')
        .insert({
          empresa_operadora_id: cobranca.empresa_operadora_id,
          conta_receber_id: cobranca.id,
          contrato_id: cobranca.contrato_id,
          meio_pagamento: opts.meioPagamento,
          valor_pago: valorPago,
          data_liquidacao: dataLiquidacao,
          created_by: opts.usuarioId || null,
        })
        .select('id')
        .single();
      if (pagError || !pag) return { success: false, error: pagError?.message || 'Falha ao registrar pagamento.' };

      const { error: updError } = await supabase
        .from('contas_receber')
        .update({ status: 'PAGO', data_recebimento: dataLiquidacao, updated_at: new Date().toISOString() })
        .eq('id', cobranca.id);
      if (updError) {
        await supabase.from('pagamentos').delete().eq('id', pag.id);
        return { success: false, error: updError.message };
      }
      return { success: true, pagamentoId: pag.id };
    } catch (err: any) {
      logger.error('marcarComoPaga falhou', err);
      return { success: false, error: err?.message || 'Falha ao dar baixa na cobrança.' };
    }
  }

  async cancelarCobranca(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('contas_receber')
        .update({ status: 'CANCELADO', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Falha ao cancelar cobrança.' };
    }
  }

  async reabrirCobranca(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('contas_receber')
        .update({ status: 'PENDENTE', data_recebimento: null, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Falha ao reabrir cobrança.' };
    }
  }

  async listClientesResumo(empresaOperadoraId?: string): Promise<ClienteResumo[]> {
    try {
      let query = supabase
        .from('clientes')
        .select('id, empresas(nome_fantasia, razao_social)')
        .order('created_at', { ascending: false });
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      const { data, error } = await query;
      if (error) return [];
      return ((data || []) as any[]).map((c) => ({
        id: c.id,
        nome: c.empresas?.[0]?.nome_fantasia || c.empresas?.[0]?.razao_social || `Cliente ${String(c.id).slice(0, 8)}`,
      }));
    } catch {
      return [];
    }
  }

  async listContratosResumo(empresaOperadoraId?: string): Promise<ContratoResumo[]> {
    try {
      let query = supabase
        .from('contratos')
        .select('id, numero_contrato, cliente_id, tipo_contrato, valor_mensal')
        .order('created_at', { ascending: false });
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      const { data, error } = await query;
      if (error) return [];
      return (data || []) as ContratoResumo[];
    } catch {
      return [];
    }
  }

  // ======================================================================
  // CENTRAL DE COBRANÇAS v2 — tipos, serviços, agenda, histórico, régua
  // ======================================================================

  async listTiposContrato(empresaOperadoraId?: string): Promise<string[]> {
    try {
      let query = supabase.from('contratos').select('tipo_contrato').not('tipo_contrato', 'is', null);
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      const { data, error } = await query;
      if (error) return [];
      return Array.from(new Set((data || []).map((d: any) => d.tipo_contrato).filter(Boolean))).sort();
    } catch {
      return [];
    }
  }

  async listServicosDeContrato(contratoId: string): Promise<ServicoResumo[]> {
    try {
      const { data, error } = await supabase
        .from('itens_contrato')
        .select('id, servico_id, quantidade, valor_unitario, valor_total, servico:servico_id(nome, codigo_servico, valor_tabela)')
        .eq('contrato_id', contratoId);
      if (error) return [];
      return (data || []).map((i: any) => ({
        item_contrato_id: i.id,
        servico_id: i.servico_id,
        nome: i.servico?.nome || 'Serviço',
        codigo: i.servico?.codigo_servico || null,
        valor_unitario: Number(i.valor_unitario || 0),
        valor_total: Number(i.valor_total || 0),
        quantidade: Number(i.quantidade || 1),
      }));
    } catch {
      return [];
    }
  }

  async processarReguaCobranca(empresaOperadoraId?: string) {
    try {
      const { data, error } = await supabase.rpc('processar_regua_cobranca', {
        p_empresa_operadora_id: empresaOperadoraId ?? null,
      });
      if (error) return { success: false as const, error: error.message, data: null };
      return { success: true as const, error: null, data: (data as any) || {} };
    } catch (err: any) {
      return { success: false as const, error: err?.message || 'Falha ao processar régua.', data: null };
    }
  }

  async getHistoricoCobranca(id: string): Promise<CobrancaHistorico> {
    const vazio: CobrancaHistorico = { eventos: [], jobsCobranca: [] };
    try {
      const [{ data: aud }, { data: pags }, { data: jobs }] = await Promise.all([
        supabase.from('financeiro_auditoria').select('*').contains('detalhes', { conta_receber_id: id }).order('created_at', { ascending: true }),
        supabase.from('pagamentos').select('*').eq('conta_receber_id', id).order('data_liquidacao', { ascending: true }),
        supabase.from('jobs').select('id, tipo_job, status, tentativas, max_tentativas, erro_ultimo, created_at, processed_at').contains('payload', { conta_receber_id: id }).like('tipo_job', 'COLECTION%').order('created_at', { ascending: true }),
      ]);
      return {
        eventos: (aud || []).map((e: any) => ({
          id: e.id,
          evento: e.evento,
          criado_em: e.created_at,
          detalhes: typeof e.detalhes === 'string' ? JSON.parse(e.detalhes) : (e.detalhes || {}),
        })),
        pagamentos: pags || [],
        jobsCobranca: (jobs || []).map((j: any) => ({
          id: j.id,
          evento: j.tipo_job,
          status: j.status,
          tentativas: j.tentativas,
          max_tentativas: j.max_tentativas,
          erro_ultimo: j.erro_ultimo,
          criado_em: j.created_at,
          processado_em: j.processed_at,
        })),
      };
    } catch {
      return vazio;
    }
  }

  async contarBloqueados(empresaOperadoraId?: string): Promise<number> {
    try {
      let query = supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('bloqueio_financeiro', true);
      if (empresaOperadoraId) query = query.eq('empresa_operadora_id', empresaOperadoraId);
      const { count } = await query;
      return count || 0;
    } catch {
      return 0;
    }
  }

  async desbloquearCliente(clienteId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('desbloquear_cliente', {
        p_cliente_id: clienteId,
        p_motivo: 'Desbloqueio manual pela Central de Cobranças',
      });
      if (error) return { success: false, error: error.message };
      const ok = (data as any)?.ok !== false;
      return ok ? { success: true } : { success: false, error: (data as any)?.erro || 'Cliente não estava bloqueado.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Falha ao desbloquear cliente.' };
    }
  }

  async listarContatosFinanceiros(clienteId: string): Promise<ContatoFinanceiro[]> {
    try {
      const { data: empresas } = await supabase.from('empresas').select('id, email').eq('cliente_id', clienteId).limit(1);
      const empresaId = empresas?.[0]?.id;
      if (!empresaId) return [];
      const { data } = await supabase
        .from('contatos')
        .select('nome, email, telefone, cargo, is_principal')
        .eq('empresa_id', empresaId)
        .or('cargo.ilike.%financ%,cargo.ilike.%fatur%,cargo.ilike.%contab%,is_principal.eq.true');
      return (data || []).map((c: any) => ({
        nome: c.nome,
        email: c.email,
        telefone: c.telefone,
        cargo: c.cargo,
        principal: !!c.is_principal,
        financeiro: /financ|fatur|contab|pagam/i.test(c.cargo || ''),
      }));
    } catch {
      return [];
    }
  }
}

const COBRANCA_SELECT =
  '*, cliente:clientes!contas_receber_cliente_id_fkey(id,empresas(nome_fantasia,razao_social,telefone)), contrato:contratos!contas_receber_contrato_id_fkey(id,numero_contrato,tipo_contrato), pagamentos:pagamentos!pagamentos_conta_receber_id_fkey(id,meio_pagamento,valor_pago,data_liquidacao)';
// Nota: embeds resolvem como OUTER join quando cliente/contrato forem nulos
// (cobranças internas, ex.: criação de tela por gestor).

export type CobrancaSituacao = 'ABERTA' | 'VENCENDO_HOJE' | 'ATRASADA' | 'PAGA' | 'PARCIAL' | 'CANCELADA';

export interface CobrancaPagamento {
  id: string;
  meio_pagamento: string;
  valor_pago: number;
  data_liquidacao: string;
}

export interface Cobranca {
  id: string;
  empresa_operadora_id: string | null;
  contrato_id: string | null;
  cliente_id: string | null;
  numero_parcela: number;
  total_parcelas: number;
  valor: number;
  data_vencimento: string;
  data_recebimento: string | null;
  status: ContaStatus;
  created_at: string;
  updated_at: string;
  numero_documento?: string | null;
  codigo_operacional?: string | null;
  competencia_date?: string | null;
  metodo_cobranca?: string | null;
  recorrencia?: string | null;
  gerada_automaticamente?: boolean;
  situacao_cobranca?: 'NENHUMA' | 'EM_COBRANCA' | 'CONTATO_1' | 'CONTATO_2' | 'CONTATO_3' | 'INADIMPLENTE' | 'BLOQUEADO';
  valor_pago?: number;
  saldo?: number;
  notes?: string | null;
  public_token?: string | null;
  public_enabled?: boolean | null;
  cliente?: { id: string; empresas?: { nome_fantasia?: string | null; razao_social?: string | null; telefone?: string | null }[] } | null;
  contrato?: { id: string; numero_contrato: string | null; tipo_contrato?: string | null } | null;
  pagamentos?: CobrancaPagamento[] | null;
}

export interface ClienteResumo {
  id: string;
  nome: string;
}

export interface ContratoResumo {
  id: string;
  numero_contrato: string | null;
  cliente_id: string | null;
  tipo_contrato?: string | null;
  valor_mensal?: number | null;
}

export interface ServicoResumo {
  item_contrato_id: string;
  servico_id: string;
  nome: string;
  codigo: string | null;
  valor_unitario: number;
  valor_total: number;
  quantidade: number;
}

export interface ContatoFinanceiro {
  nome: string;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  principal: boolean;
  financeiro: boolean;
}

export interface CobrancaHistorico {
  eventos: { id: string; evento: string; criado_em: string; detalhes: Record<string, any> }[];
  pagamentos?: any[];
  jobsCobranca: {
    id: string;
    evento: string;
    status: string;
    tentativas: number;
    max_tentativas: number;
    erro_ultimo: string | null;
    criado_em: string;
    processado_em: string | null;
  }[];
}

export interface CreateCobrancaPayload {
  empresaOperadoraId: string;
  contratoId: string;
  clienteId: string;
  valor: number;
  dataVencimento: string;
  numeroParcela?: number;
  totalParcelas?: number;
  competenciaDate?: string;
  metodoCobranca?: string;
  recorrencia?: 'AVULSA' | 'MENSAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';
  descricao?: string;
}

export function deriveCobrancaSituacao(status: string, dataVencimento: string | null | undefined, hoje: Date = new Date()): CobrancaSituacao {
  if (status === 'PAGO' || status === 'PAGA') return 'PAGA';
  if (status === 'CANCELADO' || status === 'CANCELADA') return 'CANCELADA';
  if (status === 'PARCIAL' || status === 'PARCIAL_PAGA') return 'PARCIAL';
  if (!dataVencimento) return 'ABERTA';
  const [ano, mes, dia] = String(dataVencimento).split('-').map(Number);
  if (!ano || !mes || !dia) return 'ABERTA';
  const venc = new Date(ano, mes - 1, dia);
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diffDias = Math.round((venc.getTime() - base.getTime()) / 86400000);
  if (diffDias < 0) return 'ATRASADA';
  if (diffDias === 0) return 'VENCENDO_HOJE';
  return 'ABERTA';
}

export function formatarNomeCliente(cobranca: Cobranca): string {
  const nome = cobranca.cliente?.empresas?.[0]?.nome_fantasia || cobranca.cliente?.empresas?.[0]?.razao_social;
  return nome || `Cliente ${cobranca.cliente_id ? cobranca.cliente_id.slice(0, 8) : '—'}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identifica se o parâmetro de rota é um UUID legado (identidade técnica)
 * ou um código operacional (ex.: COB-2026-000184).
 */
export function isUuid(valor: string | null | undefined): boolean {
  return !!valor && UUID_RE.test(valor);
}

/**
 * Código operacional exibível da cobrança (nunca o UUID).
 */
export function codigoOperacionalCobranca(cobranca: Pick<Cobranca, 'id' | 'codigo_operacional'> | null | undefined): string {
  const code = cobranca?.codigo_operacional?.trim();
  return code || '';
}

/**
 * Rota canônica de detalhe: usa o código operacional quando existir;
 * UUID apenas como fallback transitório (a página redireciona para a URL do código).
 */
export function rotaCobranca(cobranca: Pick<Cobranca, 'id' | 'codigo_operacional'>): string {
  const code = codigoOperacionalCobranca(cobranca);
  return `/financeiro/cobrancas/${encodeURIComponent(code || cobranca.id)}`;
}

export const financeiroService = new FinanceiroService();
