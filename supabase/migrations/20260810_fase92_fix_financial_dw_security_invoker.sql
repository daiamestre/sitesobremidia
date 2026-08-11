-- ============================================================
-- MIGRATION: FASE 9.2 FIX — SECURITY INVOKER ON DW VIEWS & DATA VÍNCULOS
-- SOBRE MÍDIA ERP — ENTERPRISE DATA CONTRACT & RLS HARDENING
-- Criado em: 2026-08-10
-- ============================================================

-- ── 1. Re-criar DW Views com WITH (security_invoker = true) ──────────

CREATE OR REPLACE VIEW public.dw_fact_receita WITH (security_invoker = true) AS
 SELECT cr.id AS conta_receber_id,
    cr.empresa_operadora_id,
    cr.contrato_id,
    cr.cliente_id,
    cr.numero_parcela,
    cr.total_parcelas,
    cr.valor AS valor_contratado,
    COALESCE(sum(p.valor_pago), (0)::numeric) AS valor_recebido,
    (cr.valor - COALESCE(sum(p.valor_pago), (0)::numeric)) AS valor_pendente,
    cr.data_vencimento,
    cr.data_recebimento,
    cr.status AS status_recebimento
   FROM (public.contas_receber cr
     LEFT JOIN public.pagamentos p ON ((p.conta_receber_id = cr.id)))
  GROUP BY cr.id, cr.empresa_operadora_id, cr.contrato_id, cr.cliente_id, cr.numero_parcela, cr.total_parcelas, cr.valor, cr.data_vencimento, cr.data_recebimento, cr.status;

CREATE OR REPLACE VIEW public.dw_fact_comissao WITH (security_invoker = true) AS
 SELECT com.id AS comissao_id,
    com.empresa_operadora_id,
    com.contrato_id,
    com.valor_base,
    com.porcentagem,
    com.valor_comissao,
    com.status AS status_comissao,
    com.created_at AS data_liberacao
   FROM public.comissoes com;

CREATE OR REPLACE VIEW public.dw_dim_cliente WITH (security_invoker = true) AS
 SELECT id AS cliente_id,
    empresa_operadora_id,
    codigo_cliente,
    status AS status_cliente,
    created_at AS data_cadastro
   FROM public.clientes c;

CREATE OR REPLACE VIEW public.dw_dim_contrato WITH (security_invoker = true) AS
 SELECT id AS contrato_id,
    empresa_operadora_id,
    numero_contrato,
    proposta_id,
    cliente_id,
    valor_mensal,
    status_workflow AS status_contrato,
    data_inicio,
    data_fim,
    created_at
   FROM public.contratos ct;

CREATE OR REPLACE VIEW public.dw_dim_tela WITH (security_invoker = true) AS
 SELECT id AS tela_id,
    empresa_operadora_id,
    name AS nome_tela,
    location AS localizacao,
    resolution AS resolucao,
    orientation AS orientacao,
    status AS status_tela
   FROM public.screens s;

-- ── 2. Vínculos de Dados Financeiros para CTR-8001 ───────────────────

-- Inserir Macro Lançamento para CTR-8001
INSERT INTO public.financeiro_lancamentos (id, empresa_operadora_id, contrato_id, cliente_id, valor_total_contrato, numero_parcelas, status_geral)
VALUES (
  '77777777-4444-7000-8000-000000000001'::uuid,
  '7d62aaec-e24d-4273-b257-867183cf658c'::uuid,
  '77777777-5555-7000-8000-000000000001'::uuid,
  '77777777-1111-7000-8000-000000000001'::uuid,
  15000.00,
  3,
  'EM_ANDAMENTO'
)
ON CONFLICT (id) DO NOTHING;

-- Atualizar contas_receber do CTR-8001 com lancamento_id
UPDATE public.contas_receber
SET lancamento_id = '77777777-4444-7000-8000-000000000001'::uuid
WHERE contrato_id = '77777777-5555-7000-8000-000000000001'::uuid;

-- Inserir/Atualizar Pagamento Conciliado vinculado a Parcela 1 (88888888-0000-0000-0001-000000000001)
INSERT INTO public.pagamentos (empresa_operadora_id, conta_receber_id, contrato_id, transaction_id, valor_pago, metodo_pagamento, status_conciliacao)
VALUES (
  '7d62aaec-e24d-4273-b257-867183cf658c'::uuid,
  '88888888-0000-0000-0001-000000000001'::uuid,
  '77777777-5555-7000-8000-000000000001'::uuid,
  'TXID-20260810-001',
  5000.00,
  'PIX',
  'CONCILIADO'
)
ON CONFLICT (transaction_id) DO UPDATE SET conta_receber_id = '88888888-0000-0000-0001-000000000001'::uuid, valor_pago = 5000.00;
