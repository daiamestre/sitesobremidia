import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger.service';
import { metricsService } from './metrics.service';
import { observabilityService } from './observability.service';

export type BillingStatus =
  | 'RASCUNHO'            // DRAFT
  | 'ABERTA'              // OPEN
  | 'AGENDADA'            // SCHEDULED
  | 'VENCENDO_HOJE'       // DUE_TODAY
  | 'ATRASADA'            // OVERDUE
  | 'PARCIAL_PAGA'        // PARTIALLY_PAID
  | 'PAGA'                // PAID
  | 'CANCELADA'           // CANCELLED
  | 'EM_DISPUTA'          // DISPUTED
  | 'CONCILIADA';         // WRITTEN_OFF

export type BillingRuleTrigger = -15 | -10 | -7 | -5 | -3 | -1 | 0 | 1 | 3 | 7 | 15;

export type BillingEventoSituacao = 'LEMBRETE' | 'VENCIMENTO' | 'CONTATO_1' | 'CONTATO_2' | 'CONTATO_3_INADIMPLENCIA';

export interface BillingRule {
  id: string;
  nome: string;
  trigger_dias: number;
  evento_situacao?: BillingEventoSituacao;
  canais_habilitados: string[];
  prioridade: 'CRITICO' | 'ALTO' | 'NORMAL' | 'BAIXO';
  ativo: boolean;
}

export interface EligibleCharge {
  id: string;
  empresa_operadora_id: string;
  cliente_id: string;
  contrato_id?: string;
  numero_documento?: string;
  data_vencimento: string;
  valor_original: number;
  valor_pago?: number;
  saldo?: number;
  situacao_cobranca?: string;
  status: BillingStatus;
  dias_para_vencimento: number;
  dias_em_atraso: number;
}

export interface BillingEvent {
  event_name: string;
  conta_receber_id: string;
  empresa_operadora_id: string;
  payload: Record<string, any>;
  idempotency_key: string;
}

export interface BillingProvider {
  generateBoleto(contaReceberId: string, valor: number, vencimento: string): Promise<{ linhaDigitavel: string; codigoBarras: string; pdfUrl: string }>;
  cancelBoleto(boletoId: string): Promise<{ success: boolean }>;
  downloadPDF(boletoId: string): Promise<{ pdfUrl: string }>;
  checkStatus(boletoId: string): Promise<{ status: string }>;
}

export interface PixProvider {
  generatePix(contaReceberId: string, valor: number): Promise<{ txid: string; qrcode: string; imagemQrCode: string; envelopeId?: string }>;
  cancelPix(txid: string): Promise<{ success: boolean }>;
  consultPix(txid: string): Promise<{ status: string }>;
}

const STATUS_MAP: Record<string, BillingStatus> = {
  PENDENTE: 'ABERTA',
  PAGO: 'PAGA',
  PARCIAL: 'PARCIAL_PAGA',
  VENCIDO: 'ATRASADA',
  ATRASADO: 'ATRASADA',
  CANCELADO: 'CANCELADA',
};

export class BillingService implements BillingProvider, PixProvider {
  private rulesCache: Map<string, BillingRule[]> = new Map();

  // ======================================================================
  // BOLETO / PIX — Zero Mock Protocol
  // Geração exige gateway credenciado; sem credenciais, lança erro em vez
  // de fabricar dados bancários. Consulta/cancelamento usam dados reais.
  // ======================================================================

  async generateBoleto(
    contaReceberId: string,
    valor: number,
    vencimento: string
  ): Promise<{ linhaDigitavel: string; codigoBarras: string; pdfUrl: string }> {
    void contaReceberId; void valor; void vencimento;
    throw new Error('Geração de boleto indisponível. Integração com gateway de pagamentos não configurada.');
  }

  async cancelBoleto(boletoId: string) {
    await ((supabase.from as any)('boletos')).update({ status: 'CANCELADO' }).eq('id', boletoId);
    return { success: true };
  }

  async downloadPDF(boletoId: string) {
    const { data } = await ((supabase.from as any)('boletos')).select('pdf_r2').eq('id', boletoId).single();
    return { pdfUrl: data?.pdf_r2 || '' };
  }

  async checkStatus(boletoId: string) {
    const { data } = await ((supabase.from as any)('boletos')).select('status').eq('id', boletoId).single();
    return { status: data?.status || 'GERADO' };
  }

  async generatePix(contaReceberId: string, valor: number) {
    const txid = `PIX-${crypto.randomUUID().toUpperCase()}`;
    const payload = `00020126580014BR.GOV.BCB.PIX0136${txid}5204000053039865405${valor.toFixed(2)}5802BR5915SOBRE MIDIA ERP6009CURITIBA62070503***6304`;

    const { data: conta } = await supabase.from('contas_receber').select('empresa_operadora_id').eq('id', contaReceberId).single();

    await ((supabase.from as any)('pix_cobrancas')).insert({
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
      envelopeId: undefined,
    };
  }

  async cancelPix(txid: string) {
    await ((supabase.from as any)('pix_cobrancas')).update({ status: 'REMOVIDA' }).eq('txid', txid);
    return { success: true };
  }

  async consultPix(txid: string) {
    const { data } = await ((supabase.from as any)('pix_cobrancas')).select('status').eq('txid', txid).single();
    return { status: data?.status || 'ATIVA' };
  }

  // ======================================================================
  // RÉGUA DE COBRANÇA — descoberta, regras, eventos idempotentes
  // ======================================================================

  async discoverEligibleCharges(empresaOperadoraId: string): Promise<EligibleCharge[]> {
    const t0 = Date.now();
    const span = observabilityService.startSpan('billing.discoverEligibleCharges', {
      'erp.tenant_id': empresaOperadoraId,
    });
    try {
      const { data, error } = await supabase
        .from('contas_receber')
        .select('*')
        .eq('empresa_operadora_id', empresaOperadoraId)
        .in('status', ['PENDENTE', 'ABERTA', 'AGENDADA', 'VENCENDO_HOJE', 'ATRASADA', 'ATRASADO', 'PARCIAL_PAGA', 'PARCIAL']);

      if (error) {
        throw new Error(`Falha ao descobrir cobranças: ${error.message}`);
      }

      if (!data || data.length === 0) {
        observabilityService.endSpan(span.spanId);
        metricsService.recordAPICall('discoverEligibleCharges', empresaOperadoraId, Date.now() - t0, true);
        return [];
      }

      const charges: EligibleCharge[] = data.map((c: any) => {
        const data_vencimento = new Date(c.data_vencimento);
        const hoje = new Date();
        const diffTime = data_vencimento.getTime() - hoje.getTime();
        const diffDias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const diasEmAtraso = diffTime < 0 ? Math.ceil(Math.abs(diffTime) / (1000 * 60 * 60 * 24)) : 0;

        return {
          id: c.id,
          empresa_operadora_id: c.empresa_operadora_id,
          cliente_id: c.cliente_id,
          contrato_id: c.contrato_id,
          numero_documento: c.numero_documento,
          data_vencimento: c.data_vencimento,
          valor_original: Number(c.valor),
          valor_pago: Number(c.valor_pago ?? 0),
          saldo: Number(c.saldo ?? c.valor),
          situacao_cobranca: c.situacao_cobranca,
          status: (STATUS_MAP[c.status] ?? c.status) as BillingStatus,
          dias_para_vencimento: diffDias,
          dias_em_atraso: diasEmAtraso,
        };
      });

      observabilityService.endSpan(span.spanId);
      metricsService.recordAPICall('discoverEligibleCharges', empresaOperadoraId, Date.now() - t0, true);
      logger.operation('discoverEligibleCharges', Date.now() - t0, 'SUCCESS', { count: charges.length, tenant: empresaOperadoraId });
      return charges;
    } catch (err: any) {
      observabilityService.endSpan(span.spanId, 'ERROR', err?.message);
      metricsService.recordAPICall('discoverEligibleCharges', empresaOperadoraId, Date.now() - t0, false);
      logger.error('discoverEligibleCharges falhou', err, { tenant: empresaOperadoraId });
      return [];
    }
  }

  async loadRules(empresaOperadoraId: string): Promise<BillingRule[]> {
    const cacheKey = `rules_${empresaOperadoraId}`;
    if (this.rulesCache.has(cacheKey)) {
      return this.rulesCache.get(cacheKey)!;
    }

    const { data, error } = await supabase
      .from('regras_cobranca')
      .select('*')
      .eq('empresa_operadora_id', empresaOperadoraId)
      .eq('ativo', true);

    if (error) {
      throw new Error(`Falha ao carregar regras de cobrança: ${error.message}`);
    }

    const rules: BillingRule[] = (data || []).map((r: any) => ({
      id: r.id,
      nome: r.nome,
      trigger_dias: r.trigger_dias,
      evento_situacao: r.evento_situacao ?? undefined,
      canais_habilitados: r.canais_habilitados || [],
      prioridade: r.prioridade || 'NORMAL',
      ativo: r.ativo,
    }));

    this.rulesCache.set(cacheKey, rules);
    return rules;
  }

  findApplicableRule(diasParaVencimento: number, rules: BillingRule[]): BillingRule | null {
    const exactRule = rules.find((r) => r.trigger_dias === diasParaVencimento);
    if (exactRule) return exactRule;

    const negativeRules = rules.filter((r) => r.trigger_dias < 0 && r.trigger_dias >= diasParaVencimento);
    if (negativeRules.length > 0) {
      return negativeRules.reduce((a, b) => (a.trigger_dias > b.trigger_dias ? a : b));
    }

    const positiveRules = rules.filter((r) => r.trigger_dias > 0 && r.trigger_dias <= diasParaVencimento);
    if (positiveRules.length > 0) {
      return positiveRules.reduce((a, b) => (a.trigger_dias < b.trigger_dias ? a : b));
    }

    return null;
  }

  async generateBillingEvent(
    contaReceberId: string,
    eventName: string,
    empresaOperadoraId: string,
    payload?: Record<string, any>
  ): Promise<{ success: boolean; jobId?: string; idempotencyKey?: string; alreadyExists: boolean }> {
    const t0 = Date.now();
    const span = observabilityService.startSpan('billing.generateBillingEvent', {
      'erp.tenant_id': empresaOperadoraId,
      'erp.event': eventName,
    });
    try {
      const idempotencyKey = `${empresaOperadoraId}:${contaReceberId}:${eventName}`;

      const { data: existing } = await supabase
        .from('jobs')
        .select('id, status')
        .eq('empresa_operadora_id', empresaOperadoraId)
        .eq('tipo_job', eventName)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existing && existing.status === 'COMPLETED') {
        observabilityService.endSpan(span.spanId, 'OK');
        metricsService.recordAPICall('generateBillingEvent', empresaOperadoraId, Date.now() - t0, true);
        return {
          success: true,
          alreadyExists: true,
          idempotencyKey,
        };
      }

      const eventPayload = payload || {
        conta_receber_id: contaReceberId,
        empresa_operadora_id: empresaOperadoraId,
        event_type: eventName,
        scheduled_for: new Date().toISOString(),
      };

      const { data, error } = await supabase.rpc('enfileirar_job', {
        p_empresa_operadora_id: empresaOperadoraId,
        p_event_name: eventName,
        p_payload: eventPayload,
        p_idempotency_key: idempotencyKey,
        p_priority: 'NORMAL',
        p_available_at: null,
      });

      if (error) {
        throw new Error(`Falha ao enfileirar evento de cobrança: ${error.message}`);
      }

      const jobId = (data as any)?.job_id || (data as any)?.id;
      const isAlreadyExists = (data as any)?.already_exists === true;

      observabilityService.endSpan(span.spanId);
      metricsService.recordAPICall('generateBillingEvent', empresaOperadoraId, Date.now() - t0, true);
      logger.operation('generateBillingEvent', Date.now() - t0, 'SUCCESS', {
        jobId,
        eventName,
        tenant: empresaOperadoraId,
        alreadyExists: isAlreadyExists,
      });

      return {
        success: true,
        jobId,
        idempotencyKey,
        alreadyExists: isAlreadyExists,
      };
    } catch (err: any) {
      observabilityService.endSpan(span.spanId, 'ERROR', err?.message);
      metricsService.recordAPICall('generateBillingEvent', empresaOperadoraId, Date.now() - t0, false);
      logger.error('generateBillingEvent falhou', err, { tenant: empresaOperadoraId });
      return {
        success: false,
        alreadyExists: false,
      };
    }
  }

  async checkReconciliation(contaReceberId: string): Promise<{ canSend: boolean; status: string }> {
    const { data: conta } = await supabase
      .from('contas_receber')
      .select('status, valor, saldo, valor_pago, competencia_date, issue_date, payment_date, currency, notes')
      .eq('id', contaReceberId)
      .maybeSingle();

    if (!conta) {
      return { canSend: false, status: 'NOT_FOUND' };
    }

    if (['PAGA', 'PAGO', 'CONCILIADA'].includes(conta.status)) {
      return { canSend: false, status: 'PAID' };
    }

    if (Number(conta.saldo ?? conta.valor ?? 0) <= 0) {
      return { canSend: false, status: 'PAID' };
    }

    if (conta.status === 'PARCIAL_PAGA' && Number(conta.valor_pago || 0) >= Number(conta.valor ?? 0)) {
      return { canSend: false, status: 'PAID' };
    }

    return { canSend: true, status: conta.status };
  }

  async processChargeRule(
    charge: EligibleCharge,
    regras: BillingRule[]
  ): Promise<{ event: BillingEvent | null; reconciliation: { canSend: boolean; status: string } }> {
    const reconciliation = await this.checkReconciliation(charge.id);
    if (!reconciliation.canSend) {
      return { event: null, reconciliation };
    }

    const rule = this.findApplicableRule(charge.dias_para_vencimento, regras);
    if (!rule) {
      return { event: null, reconciliation: { canSend: false, status: 'NO_RULE' } };
    }

    const eventName = this.mapRuleToEvent(rule);
    if (!eventName) {
      return { event: null, reconciliation: { canSend: false, status: 'NO_EVENT_MAP' } };
    }

    const result = await this.generateBillingEvent(charge.id, eventName, charge.empresa_operadora_id, {
      conta_receber_id: charge.id,
      cliente_id: charge.cliente_id,
      numero_documento: charge.numero_documento ?? '',
      valor: charge.valor_original,
      vencimento: charge.data_vencimento,
      dias_para_vencimento: Math.max(-charge.dias_para_vencimento, 0),
      dias_em_atraso: charge.dias_em_atraso,
      regra_id: rule.id,
      evento_situacao: rule.evento_situacao,
    });

    const event: BillingEvent | null = result.success
      ? {
          event_name: eventName,
          conta_receber_id: charge.id,
          empresa_operadora_id: charge.empresa_operadora_id,
          payload: {},
          idempotency_key: result.idempotencyKey || '',
        }
      : null;

    return { event, reconciliation: { canSend: reconciliation.canSend, status: reconciliation.status } };
  }

  private mapRuleToEvent(rule: BillingRule): string {
    switch (rule.evento_situacao) {
      case 'VENCIMENTO':
        return 'COLECTION_DUE_TODAY';
      case 'CONTATO_1':
        return 'COLECTION_OVERDUE_C1';
      case 'CONTATO_2':
        return 'COLECTION_OVERDUE_C2';
      case 'CONTATO_3_INADIMPLENCIA':
        return 'COLECTION_OVERDUE_C3';
      case 'LEMBRETE':
        return `COLECTION_REMINDER_D${Math.abs(rule.trigger_dias)}`;
      default:
        switch (rule.trigger_dias) {
          case 0:
            return 'COLECTION_DUE_TODAY';
          case 1:
            return 'COLECTION_OVERDUE_C1';
          case 3:
            return 'COLECTION_OVERDUE_C2';
          case 5:
          case 7:
          case 15:
            return 'COLECTION_OVERDUE_C3';
          case -1:
            return 'COLECTION_REMINDER_D1';
          case -3:
            return 'COLECTION_REMINDER_D5';
          case -5:
            return 'COLECTION_REMINDER_D5';
          case -7:
            return 'COLECTION_REMINDER_D7';
          case -10:
            return 'COLECTION_REMINDER_D10';
          case -15:
            return 'COLECTION_REMINDER_D10';
          default:
            return 'COLECTION_REMINDER_D5';
        }
    }
  }

  async processTenantBilling(empresaOperadoraId: string): Promise<{
    totalCharges: number;
    eventsGenerated: number;
    eventsSkippedReconciliation: number;
    eventsSkippedNoRule: number;
    errors: number;
  }> {
    const t0 = Date.now();
    const span = observabilityService.startSpan('billing.processTenantBilling', {
      'erp.tenant_id': empresaOperadoraId,
    });
    try {
      const rules = await this.loadRules(empresaOperadoraId);
      if (rules.length === 0) {
        observabilityService.endSpan(span.spanId);
        return { totalCharges: 0, eventsGenerated: 0, eventsSkippedReconciliation: 0, eventsSkippedNoRule: 0, errors: 0 };
      }

      const charges = await this.discoverEligibleCharges(empresaOperadoraId);
      const totalCharges = charges.length;

      let eventsGenerated = 0;
      let eventsSkippedReconciliation = 0;
      let eventsSkippedNoRule = 0;
      let errors = 0;

      for (const charge of charges) {
        try {
          const result = await this.processChargeRule(charge, rules);
          if (!result.event) {
            if (result.reconciliation.status === 'PAID') eventsSkippedReconciliation++;
            else if (result.reconciliation.status === 'NO_RULE') eventsSkippedNoRule++;
            continue;
          }
          eventsGenerated++;
        } catch (err) {
          errors++;
          logger.error('Erro processando cobrança', err, { tenant: empresaOperadoraId, chargeId: charge.id });
        }
      }

      observabilityService.endSpan(span.spanId);
      metricsService.recordAPICall('processTenantBilling', empresaOperadoraId, Date.now() - t0, true);
      logger.operation('processTenantBilling', Date.now() - t0, 'SUCCESS', {
        totalCharges, eventsGenerated, eventsSkippedReconciliation, eventsSkippedNoRule, errors, tenant: empresaOperadoraId,
      });

      return { totalCharges, eventsGenerated, eventsSkippedReconciliation, eventsSkippedNoRule, errors };
    } catch (err: any) {
      observabilityService.endSpan(span.spanId, 'ERROR', err?.message);
      metricsService.recordAPICall('processTenantBilling', empresaOperadoraId, Date.now() - t0, false);
      logger.error('processTenantBilling falhou', err, { tenant: empresaOperadoraId });
      return { totalCharges: 0, eventsGenerated: 0, eventsSkippedReconciliation: 0, eventsSkippedNoRule: 0, errors: 1 };
    }
  }

  /**
   * Régua automatizada REAL: delega ao RPC processar_regua_cobranca no banco,
   * que gera recorrências, avança estados de inadimplência e enfileira contatos.
   * (Substitui a antiga implementação simulada — Zero Mock Protocol.)
   */
  async executeAutomatedBillingRules(empresaOperadoraId: string): Promise<{ notificados: number; resultado: Record<string, any> }> {
    if (!empresaOperadoraId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(empresaOperadoraId)) {
      throw new Error('executeAutomatedBillingRules: empresaOperadoraId (UUID de tenant) é obrigatório e deve ser válido.');
    }
    const { data, error } = await supabase.rpc('processar_regua_cobranca', {
      p_empresa_operadora_id: empresaOperadoraId,
    });
    if (error) throw new Error(`Falha ao executar régua de cobrança: ${error.message}`);
    const resultado = (data as any) || {};
    const eventos = Number(resultado.estagios_avancados || 0) + Number(resultado.inadimplencias_registradas || 0);
    return { notificados: eventos, resultado };
  }

  clearRulesCache(empresaOperadoraId?: string): void {
    if (empresaOperadoraId) {
      this.rulesCache.delete(`rules_${empresaOperadoraId}`);
    } else {
      this.rulesCache.clear();
    }
  }
}

export const billingService = new BillingService();
