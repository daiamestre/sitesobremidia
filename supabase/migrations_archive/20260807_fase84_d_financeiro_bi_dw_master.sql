-- ============================================================
-- MIGRATION: FASE 8.4-D — FINANCEIRO, BI & DATA WAREHOUSE MASTER
-- Sobre Mídia ERP — Inteligência Financeira e BI Executivo
-- Criado em: 2026-08-07
-- ============================================================

-- ── 1. Camada Financeira Operacional ────────────────────────

-- Tabela public.contas_receber
CREATE TABLE IF NOT EXISTS public.contas_receber (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id  uuid REFERENCES public.empresa_operadora(id),
  contrato_id           uuid NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  cliente_id            uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  numero_parcela        int NOT NULL DEFAULT 1,
  total_parcelas        int NOT NULL DEFAULT 1,
  valor                 numeric(12,2) NOT NULL CHECK (valor >= 0),
  data_vencimento       date NOT NULL,
  data_recebimento      date,
  status                text NOT NULL DEFAULT 'PENDENTE',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contas_receber
  DROP CONSTRAINT IF EXISTS cr_status_check;

ALTER TABLE public.contas_receber
  ADD CONSTRAINT cr_status_check CHECK (status IN ('PENDENTE', 'PAGO', 'ATRASADO', 'CANCELADO'));

ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cr_tenant_isolation" ON public.contas_receber;
CREATE POLICY "cr_tenant_isolation" ON public.contas_receber
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    OR contrato_id IN (
      SELECT id FROM public.contratos WHERE empresa_operadora_id = (
        SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
      )
    )
  );

-- Tabela public.pagamentos
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id  uuid REFERENCES public.empresa_operadora(id),
  conta_receber_id      uuid REFERENCES public.contas_receber(id) ON DELETE CASCADE,
  contrato_id           uuid REFERENCES public.contratos(id) ON DELETE CASCADE,
  valor_pago            numeric(12,2) NOT NULL CHECK (valor_pago >= 0),
  metodo_pagamento      text NOT NULL DEFAULT 'PIX',
  data_pagamento        timestamptz NOT NULL DEFAULT now(),
  transacao_id          text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pag_tenant_isolation" ON public.pagamentos;
CREATE POLICY "pag_tenant_isolation" ON public.pagamentos
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  );

-- Tabela public.comissoes
CREATE TABLE IF NOT EXISTS public.comissoes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id  uuid REFERENCES public.empresa_operadora(id),
  contrato_id           uuid NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  vendedor_id           uuid REFERENCES public.usuarios(id),
  valor_base            numeric(12,2) NOT NULL DEFAULT 0,
  porcentagem           numeric(5,2) NOT NULL DEFAULT 5.00,
  valor_comissao        numeric(12,2) NOT NULL CHECK (valor_comissao >= 0),
  status                text NOT NULL DEFAULT 'PENDENTE',
  data_liberacao        date,
  data_pagamento        date,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comissoes
  DROP CONSTRAINT IF EXISTS com_status_check;

ALTER TABLE public.comissoes
  ADD CONSTRAINT com_status_check CHECK (status IN ('PENDENTE', 'LIBERADA', 'PAGA', 'CANCELADA'));

ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "com_tenant_isolation" ON public.comissoes;
CREATE POLICY "com_tenant_isolation" ON public.comissoes
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  );

-- Tabela public.fluxo_caixa
CREATE TABLE IF NOT EXISTS public.fluxo_caixa (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id  uuid REFERENCES public.empresa_operadora(id),
  tipo                  text NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
  categoria             text NOT NULL,
  descricao             text NOT NULL,
  valor                 numeric(12,2) NOT NULL CHECK (valor > 0),
  data_movimento        date NOT NULL DEFAULT CURRENT_DATE,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fluxo_caixa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fc_tenant_isolation" ON public.fluxo_caixa;
CREATE POLICY "fc_tenant_isolation" ON public.fluxo_caixa
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  );

-- Tabela public.financeiro_auditoria
CREATE TABLE IF NOT EXISTS public.financeiro_auditoria (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id  uuid REFERENCES public.empresa_operadora(id),
  evento                text NOT NULL,
  usuario_id            uuid REFERENCES public.usuarios(id),
  detalhes              jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financeiro_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fa_tenant_isolation" ON public.financeiro_auditoria;
CREATE POLICY "fa_tenant_isolation" ON public.financeiro_auditoria
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  );

-- ── 2. Camada Data Warehouse (Star Schema Views) ────────────

-- Dimensão Cliente
CREATE OR REPLACE VIEW public.dw_dim_cliente AS
SELECT
  c.id AS cliente_id,
  c.empresa_operadora_id,
  c.nome_fantasia,
  c.razao_social,
  c.documento AS cnpj_cpf,
  c.tipo_pessoa,
  c.created_at AS data_cadastro
FROM public.clientes c;

-- Dimensão Contrato
CREATE OR REPLACE VIEW public.dw_dim_contrato AS
SELECT
  ct.id AS contrato_id,
  ct.empresa_operadora_id,
  ct.numero_contrato,
  ct.proposta_id,
  ct.cliente_id,
  ct.valor_total,
  ct.status AS status_contrato,
  ct.data_inicio,
  ct.data_fim,
  ct.created_at
FROM public.contratos ct;

-- Dimensão Tela
CREATE OR REPLACE VIEW public.dw_dim_tela AS
SELECT
  s.id AS tela_id,
  s.empresa_operadora_id,
  s.name AS nome_tela,
  s.location AS localizacao,
  s.resolution AS resolucao,
  s.orientation AS orientacao,
  s.status AS status_tela
FROM public.screens s;

-- Dimensão Player
CREATE OR REPLACE VIEW public.dw_dim_player AS
SELECT
  p.id AS player_id,
  p.empresa_operadora_id,
  p.screen_id,
  p.player_key,
  p.versao_app,
  p.status_online,
  p.ip_address,
  p.ultima_comunicacao
FROM public.players p;

-- Dimensão Campanha
CREATE OR REPLACE VIEW public.dw_dim_campanha AS
SELECT
  ag.id AS agendamento_id,
  ag.empresa_operadora_id,
  ag.contrato_id,
  ag.pedido_insercao_id,
  ag.producao_id,
  ag.titulo AS titulo_campanha,
  ag.status AS status_agendamento,
  ag.inicio,
  ag.fim,
  ag.insercoes_por_hora
FROM public.agendamentos ag;

-- Fato Receita (DW Fact Receita)
CREATE OR REPLACE VIEW public.dw_fact_receita AS
SELECT
  cr.id AS conta_receber_id,
  cr.empresa_operadora_id,
  cr.contrato_id,
  cr.cliente_id,
  cr.numero_parcela,
  cr.total_parcelas,
  cr.valor AS valor_contratado,
  COALESCE(SUM(p.valor_pago), 0) AS valor_recebido,
  cr.valor - COALESCE(SUM(p.valor_pago), 0) AS valor_pendente,
  cr.data_vencimento,
  cr.data_recebimento,
  cr.status AS status_recebimento
FROM public.contas_receber cr
LEFT JOIN public.pagamentos p ON p.conta_receber_id = cr.id
GROUP BY cr.id, cr.empresa_operadora_id, cr.contrato_id, cr.cliente_id, cr.numero_parcela, cr.total_parcelas, cr.valor, cr.data_vencimento, cr.data_recebimento, cr.status;

-- Fato Exibição (DW Fact Exibição com SLA As-Delivered)
CREATE OR REPLACE VIEW public.dw_fact_exibicao AS
SELECT
  ag.id AS agendamento_id,
  ag.empresa_operadora_id,
  ag.contrato_id,
  ag.cliente_id,
  ag.titulo AS campanha,
  COUNT(pbl.id) AS insercoes_realizadas,
  COALESCE(ag.insercoes_por_hora * 14 * 30, 900) AS insercoes_contratadas,
  CASE
    WHEN COALESCE(ag.insercoes_por_hora * 14 * 30, 900) > 0
    THEN LEAST(100.0, ROUND((COUNT(pbl.id)::numeric / COALESCE(ag.insercoes_por_hora * 14 * 30, 900)::numeric) * 100, 1))
    ELSE 100.0
  END AS sla_entrega_pct
FROM public.agendamentos ag
LEFT JOIN public.playback_logs pbl ON pbl.agendamento_id = ag.id AND pbl.resultado = 'SUCCESS'
GROUP BY ag.id, ag.empresa_operadora_id, ag.contrato_id, ag.cliente_id, ag.titulo, ag.insercoes_por_hora;

-- Fato Comissão (DW Fact Comissão)
CREATE OR REPLACE VIEW public.dw_fact_comissao AS
SELECT
  com.id AS comissao_id,
  com.empresa_operadora_id,
  com.contrato_id,
  com.vendedor_id,
  com.valor_base,
  com.porcentagem,
  com.valor_comissao,
  com.status AS status_comissao,
  com.data_liberacao
FROM public.comissoes com;

-- Visão DRE Corporativo (v_dre_consolidado)
CREATE OR REPLACE VIEW public.v_dre_consolidado AS
SELECT
  cr.empresa_operadora_id,
  COALESCE(SUM(cr.valor), 0) AS receita_bruta,
  ROUND(COALESCE(SUM(cr.valor), 0) * 0.06, 2) AS impostos_estimados,
  COALESCE(SUM(com.valor_comissao), 0) AS comissoes_vendas,
  ROUND(COALESCE(SUM(cr.valor), 0) * 0.15, 2) AS custos_operacionais_rede,
  (
    COALESCE(SUM(cr.valor), 0)
    - ROUND(COALESCE(SUM(cr.valor), 0) * 0.06, 2)
    - COALESCE(SUM(com.valor_comissao), 0)
    - ROUND(COALESCE(SUM(cr.valor), 0) * 0.15, 2)
  ) AS ebitda,
  (
    COALESCE(SUM(cr.valor), 0)
    - ROUND(COALESCE(SUM(cr.valor), 0) * 0.06, 2)
    - COALESCE(SUM(com.valor_comissao), 0)
    - ROUND(COALESCE(SUM(cr.valor), 0) * 0.15, 2)
  ) AS resultado_liquido
FROM public.contas_receber cr
LEFT JOIN public.comissoes com ON com.empresa_operadora_id = cr.empresa_operadora_id
GROUP BY cr.empresa_operadora_id;

-- ── 3. Dados Semente de Homologação Financeira ─────────────

-- Inserir parcelas de contas a receber para o contrato CTR-8001
INSERT INTO public.contas_receber (
  id, empresa_operadora_id, contrato_id, cliente_id, numero_parcela, total_parcelas, valor, data_vencimento, data_recebimento, status
)
SELECT
  '88888888-0000-0000-0001-000000000001'::uuid,
  ct.empresa_operadora_id,
  ct.id,
  ct.cliente_id,
  1,
  3,
  5000.00,
  CURRENT_DATE - INTERVAL '5 days',
  CURRENT_DATE - INTERVAL '4 days',
  'PAGO'
FROM public.contratos ct WHERE ct.numero_contrato = 'CTR-8001'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contas_receber (
  id, empresa_operadora_id, contrato_id, cliente_id, numero_parcela, total_parcelas, valor, data_vencimento, status
)
SELECT
  '88888888-0000-0000-0001-000000000002'::uuid,
  ct.empresa_operadora_id,
  ct.id,
  ct.cliente_id,
  2,
  3,
  5000.00,
  CURRENT_DATE + INTERVAL '25 days',
  'PENDENTE'
FROM public.contratos ct WHERE ct.numero_contrato = 'CTR-8001'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contas_receber (
  id, empresa_operadora_id, contrato_id, cliente_id, numero_parcela, total_parcelas, valor, data_vencimento, status
)
SELECT
  '88888888-0000-0000-0001-000000000003'::uuid,
  ct.empresa_operadora_id,
  ct.id,
  ct.cliente_id,
  3,
  3,
  5000.00,
  CURRENT_DATE + INTERVAL '55 days',
  'PENDENTE'
FROM public.contratos ct WHERE ct.numero_contrato = 'CTR-8001'
ON CONFLICT (id) DO NOTHING;

-- Inserir pagamento registrado
INSERT INTO public.pagamentos (
  id, empresa_operadora_id, conta_receber_id, contrato_id, valor_pago, metodo_pagamento, data_pagamento, transacao_id
)
SELECT
  '99999999-0000-0000-0001-000000000001'::uuid,
  cr.empresa_operadora_id,
  cr.id,
  cr.contrato_id,
  5000.00,
  'PIX',
  now() - INTERVAL '4 days',
  'PIX-TXID-2026-8001-P1'
FROM public.contas_receber cr WHERE cr.id = '88888888-0000-0000-0001-000000000001'::uuid
ON CONFLICT (id) DO NOTHING;

-- Inserir comissão liberada
INSERT INTO public.comissoes (
  id, empresa_operadora_id, contrato_id, valor_base, porcentagem, valor_comissao, status, data_liberacao
)
SELECT
  'aaaaaaaa-0000-0000-0001-000000000001'::uuid,
  ct.empresa_operadora_id,
  ct.id,
  15000.00,
  5.00,
  750.00,
  'LIBERADA',
  CURRENT_DATE
FROM public.contratos ct WHERE ct.numero_contrato = 'CTR-8001'
ON CONFLICT (id) DO NOTHING;

-- Inserir movimentação de fluxo de caixa
INSERT INTO public.fluxo_caixa (
  id, empresa_operadora_id, tipo, categoria, descricao, valor, data_movimento
)
SELECT
  'bbbbbbbb-0000-0000-0001-000000000001'::uuid,
  ct.empresa_operadora_id,
  'ENTRADA',
  'RECEBIMENTO_CONTRATO',
  'Pagamento Parcela 1/3 - Contrato CTR-8001 (Cliente Alpha)',
  5000.00,
  CURRENT_DATE - INTERVAL '4 days'
FROM public.contratos ct WHERE ct.numero_contrato = 'CTR-8001'
ON CONFLICT (id) DO NOTHING;
