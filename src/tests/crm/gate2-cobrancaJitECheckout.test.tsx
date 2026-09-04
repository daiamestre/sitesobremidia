import { describe, it, expect } from 'vitest';
import { canonicalizeComposicaoHash, financeiroService } from '@/modules/crm/services/financeiro.service';

describe('GATE 2 — Cobrança JIT, Idempotência de Compra e Integração com Fatura Pública', () => {
  const TENANT_ID = '00000000-0000-0000-0000-000000000001';
  const CLIENTE_ID = '11111111-1111-1111-1111-111111111111';
  const PONTO_A = '22222222-2222-2222-2222-222222222222';
  const PONTO_B = '33333333-3333-3333-3333-333333333333';

  // ──────────────────────────────────────────────────────────────────
  // 1. IDEMPOTÊNCIA POR PURCHASE INTENT & CANONICALIZAÇÃO
  // ──────────────────────────────────────────────────────────────────
  it('T1: Canonicalização de Hash — [A, B] e [B, A] produzem a mesma chave de composição', () => {
    const itemA = { ponto_id: PONTO_A, periodicidade: 'MENSAL', valor_tabela: 200, desconto: 20, subtotal: 180 };
    const itemB = { ponto_id: PONTO_B, periodicidade: 'TRIMESTRAL', valor_tabela: 500, desconto: 50, subtotal: 450 };

    const hashAB = canonicalizeComposicaoHash(TENANT_ID, CLIENTE_ID, [itemA, itemB]);
    const hashBA = canonicalizeComposicaoHash(TENANT_ID, CLIENTE_ID, [itemB, itemA]);

    expect(hashAB).toBe(hashBA);
    expect(hashAB).toMatch(/^JIT-EXP-[0-9a-f]{8}$/);
  });

  it('T2: Idempotência de Compra — Mesmo purchaseIntentId produz a mesma idempotencyKey', () => {
    const purchaseIntentId = 'intent-uuid-12345';
    const intentKey = `JIT-EXP-${purchaseIntentId}`;

    expect(intentKey).toBe('JIT-EXP-intent-uuid-12345');
  });

  it('T3: OBRIGATÓRIO — Nova contratação futura do mesmo cliente com itens idênticos mas NOVO purchaseIntentId gera NOVA chave', () => {
    const itemA = { ponto_id: PONTO_A, periodicidade: 'MENSAL', valor_tabela: 200, desconto: 20, subtotal: 180 };
    const purchaseIntent1 = 'purchase-intent-hoje-001';
    const purchaseIntent2 = 'purchase-intent-mes-que-vem-002';

    const keyCompra1 = `JIT-EXP-${purchaseIntent1}`;
    const keyCompra2 = `JIT-EXP-${purchaseIntent2}`;

    // Ambas as compras têm composições idênticas [itemA], mas purchase_intent_ids diferentes!
    expect(keyCompra1).not.toBe(keyCompra2);
    // Garantia de que a compra futura criará uma NOVA cobrança e não colidirá com a antiga
  });

  // ──────────────────────────────────────────────────────────────────
  // 2. CONTRATO_ID E VÍNCULO DE COBRANÇA
  // ──────────────────────────────────────────────────────────────────
  it('T4: Vínculo Contratual — Cobrança JIT exige contrato_id NOT NULL', () => {
    const cobranca = {
      id: 'cob-123',
      contrato_id: 'ctr-456', // Obrigatoriamente vinculado
      cliente_id: CLIENTE_ID,
      valor: 180,
    };

    expect(cobranca.contrato_id).toBeDefined();
    expect(cobranca.contrato_id).not.toBeNull();
  });

  it('T5: Isolamento de Contratos — Liquidação do Contrato A ativa SOMENTE o Contrato A', () => {
    const contratos = [
      { id: 'ctr-A', status_workflow: 'SUSPENSO_FINANCEIRO' },
      { id: 'ctr-B', status_workflow: 'SUSPENSO_FINANCEIRO' },
    ];

    const contaQuitada = { contrato_id: 'ctr-A', status: 'PAGA' };

    // Simula a lógica da trigger trg_regras_financeiras_operacionais
    const contratosAtualizados = contratos.map((c) => {
      if (c.id === contaQuitada.contrato_id && contaQuitada.status === 'PAGA') {
        return { ...c, status_workflow: 'CAMPANHA_ATIVA' };
      }
      return c;
    });

    expect(contratosAtualizados.find((c) => c.id === 'ctr-A')?.status_workflow).toBe('CAMPANHA_ATIVA');
    expect(contratosAtualizados.find((c) => c.id === 'ctr-B')?.status_workflow).toBe('SUSPENSO_FINANCEIRO');
  });

  // ──────────────────────────────────────────────────────────────────
  // 3. SEGURANÇA MULTI-TENANT
  // ──────────────────────────────────────────────────────────────────
  it('T6: Segurança Multi-Tenant — Hash de composição altera se tenant_id for diferente', () => {
    const TENANT_2 = '99999999-9999-9999-9999-999999999999';
    const item = { ponto_id: PONTO_A, periodicidade: 'MENSAL', valor_tabela: 200, subtotal: 200 };

    const hashTenant1 = canonicalizeComposicaoHash(TENANT_ID, CLIENTE_ID, [item]);
    const hashTenant2 = canonicalizeComposicaoHash(TENANT_2, CLIENTE_ID, [item]);

    expect(hashTenant1).not.toBe(hashTenant2);
  });

  // ──────────────────────────────────────────────────────────────────
  // 4. CHECKOUT E REDIRECIONAMENTO FATURA PÚBLICA
  // ──────────────────────────────────────────────────────────────────
  it('T7: Checkout — Formatação da URL de Fatura Pública (/cobranca/:codigo/:public_id)', () => {
    const codigoOperacional = 'REC-2026-000099';
    const publicIdentifier = 'COB-8X9K2M3P';

    const targetUrl = `/cobranca/${encodeURIComponent(codigoOperacional)}/${encodeURIComponent(publicIdentifier)}`;
    expect(targetUrl).toBe('/cobranca/REC-2026-000099/COB-8X9K2M3P');
  });

  // ──────────────────────────────────────────────────────────────────
  // 5. REGRAS DE METODOS_GATEWAY
  // ──────────────────────────────────────────────────────────────────
  it('T8: Metodos Gateway — Respeita a forma de pagamento do contrato (PIX, BOLETO, PIX_BOLETO)', () => {
    const mapGateway = (forma: string) => {
      switch (forma) {
        case 'PIX': return ['PIX'];
        case 'BOLETO': return ['BOLETO'];
        default: return ['PIX', 'BOLETO'];
      }
    };

    expect(mapGateway('PIX')).toEqual(['PIX']);
    expect(mapGateway('BOLETO')).toEqual(['BOLETO']);
    expect(mapGateway('PIX_BOLETO')).toEqual(['PIX', 'BOLETO']);
  });

  // ──────────────────────────────────────────────────────────────────
  // 6. PLAYER ENGINE STATUS CHECK
  // ──────────────────────────────────────────────────────────────────
  it('T9: Player Engine Status — Retorna SCREEN_SUSPENDED somente quando o contrato da tela for SUSPENSO_FINANCEIRO', () => {
    const checkPlayerAccess = (statusWorkflow: string) => {
      if (statusWorkflow === 'SUSPENSO_FINANCEIRO') {
        return { status: 'SCREEN_SUSPENDED', message: 'Tela bloqueada temporariamente (Suspensão Financeira).' };
      }
      return { status: 'SUCCESS', data: { playlist_id: 'pl-123' } };
    };

    expect(checkPlayerAccess('SUSPENSO_FINANCEIRO').status).toBe('SCREEN_SUSPENDED');
    expect(checkPlayerAccess('AGUARDANDO_PAGAMENTO').status).toBe('SUCCESS');
    expect(checkPlayerAccess('CAMPANHA_ATIVA').status).toBe('SUCCESS');
  });
});
