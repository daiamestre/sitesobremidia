-- ============================================================
-- MIGRATION: FASE 9.2 — FINANCEIRO + BI + DATA WAREHOUSE MASTER
-- SOBRE MÍDIA ERP — ENTERPRISE DATA CONTRACT LOCK & DW STAR SCHEMA
-- Criado em: 2026-08-10
-- ============================================================

-- ── 1. Idempotência e Tabela de Pagamentos Conciliados ───────────────
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id  uuid NOT NULL REFERENCES public.empresa_operadora(id),
  conta_receber_id      uuid NOT NULL REFERENCES public.contas_receber(id),
  contrato_id           uuid NOT NULL REFERENCES public.contratos(id),
  transaction_id        text UNIQUE, -- Chave de idempotência bancária/Pix/Boleto (TXID/NSU)
  valor_pago            numeric(12,2) NOT NULL CHECK (valor_pago > 0),
  data_pagamento        timestamptz NOT NULL DEFAULT now(),
  metodo_pagamento      text NOT NULL CHECK (metodo_pagamento IN ('BOLETO', 'PIX', 'CARTAO', 'TRANSFERENCIA')),
  comprovante_url       text,
  status_conciliacao    text NOT NULL DEFAULT 'CONCILIADO' CHECK (status_conciliacao IN ('PENDENTE', 'CONCILIADO', 'DIVERGENTE')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pag_tenant_select" ON public.pagamentos;
CREATE POLICY "pag_tenant_select" ON public.pagamentos
  FOR SELECT
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "pag_tenant_write" ON public.pagamentos;
CREATE POLICY "pag_tenant_write" ON public.pagamentos
  FOR ALL
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'FINANCEIRO')
  )
  WITH CHECK (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'FINANCEIRO')
  );

-- Unique index em comissoes para garantir idempotência financeira (1 comissão por contrato/recorrência)
CREATE UNIQUE INDEX IF NOT EXISTS idx_comissoes_idempotencia ON public.comissoes(empresa_operadora_id, contrato_id);

-- ── 2. DATA WAREHOUSE — ESTRELA DE DIMENSÕES & FATOS ─────────────────

-- Dimensão Tempo
CREATE TABLE IF NOT EXISTS public.dw_dim_tempo (
  tempo_id              date PRIMARY KEY,
  ano                   integer NOT NULL,
  mes                   integer NOT NULL,
  dia                   integer NOT NULL,
  trimestre             integer NOT NULL,
  dia_semana            integer NOT NULL,
  e_fim_semana          boolean NOT NULL
);

-- Dimensão Cliente
CREATE TABLE IF NOT EXISTS public.dw_dim_cliente (
  cliente_id            uuid PRIMARY KEY,
  empresa_operadora_id  uuid NOT NULL,
  codigo_cliente        integer NOT NULL,
  razao_social          text,
  status                text NOT NULL
);

-- Dimensão Contrato
CREATE TABLE IF NOT EXISTS public.dw_dim_contrato (
  contrato_id           uuid PRIMARY KEY,
  empresa_operadora_id  uuid NOT NULL,
  numero_contrato       text NOT NULL,
  valor_mensal          numeric(12,2) NOT NULL,
  status_workflow       text NOT NULL
);

-- Dimensão Representante
CREATE TABLE IF NOT EXISTS public.dw_dim_representante (
  representante_id      uuid PRIMARY KEY,
  empresa_operadora_id  uuid NOT NULL,
  codigo_representante  integer NOT NULL,
  razao_social          text
);

-- Fato Financeiro Consolidação DW
CREATE TABLE IF NOT EXISTS public.dw_fat_financeiro (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id  uuid NOT NULL,
  contrato_id           uuid REFERENCES public.dw_dim_contrato(contrato_id),
  cliente_id            uuid REFERENCES public.dw_dim_cliente(cliente_id),
  representante_id      uuid REFERENCES public.dw_dim_representante(representante_id),
  tempo_id              date REFERENCES public.dw_dim_tempo(tempo_id),
  valor_faturado        numeric(12,2) NOT NULL DEFAULT 0.00,
  valor_recebido        numeric(12,2) NOT NULL DEFAULT 0.00,
  valor_comissao        numeric(12,2) NOT NULL DEFAULT 0.00,
  inadimplente          boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Fato Exibição DW (NOC Telemetria)
CREATE TABLE IF NOT EXISTS public.dw_fat_exibicao (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id  uuid NOT NULL,
  tela_id               uuid REFERENCES public.dw_dim_tela(tela_id),
  contrato_id           uuid REFERENCES public.dw_dim_contrato(contrato_id),
  tempo_id              date REFERENCES public.dw_dim_tempo(tempo_id),
  exibicoes_count       integer NOT NULL DEFAULT 0,
  uptime_segundos       integer NOT NULL DEFAULT 86400,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- RLS nas Tabelas DW
ALTER TABLE public.dw_dim_tempo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dw_dim_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dw_dim_contrato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dw_dim_representante ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dw_fat_financeiro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dw_fat_exibicao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dw_tempo_read" ON public.dw_dim_tempo;
CREATE POLICY "dw_tempo_read" ON public.dw_dim_tempo FOR SELECT USING (true);

DROP POLICY IF EXISTS "dw_cli_tenant" ON public.dw_dim_cliente;
CREATE POLICY "dw_cli_tenant" ON public.dw_dim_cliente FOR SELECT USING (empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1));

DROP POLICY IF EXISTS "dw_ctr_tenant" ON public.dw_dim_contrato;
CREATE POLICY "dw_ctr_tenant" ON public.dw_dim_contrato FOR SELECT USING (empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1));

DROP POLICY IF EXISTS "dw_rep_tenant" ON public.dw_dim_representante;
CREATE POLICY "dw_rep_tenant" ON public.dw_dim_representante FOR SELECT USING (empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1));

DROP POLICY IF EXISTS "dw_fat_fin_tenant" ON public.dw_fat_financeiro;
CREATE POLICY "dw_fat_fin_tenant" ON public.dw_fat_financeiro FOR SELECT USING (empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1));

DROP POLICY IF EXISTS "dw_fat_exib_tenant" ON public.dw_fat_exibicao;
CREATE POLICY "dw_fat_exib_tenant" ON public.dw_fat_exibicao FOR SELECT USING (empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1));

-- ── 3. CARGA SEMENTE DATA WAREHOUSE & TEST DATA ──────────────────────

-- Tempo Semente (Agosto 2026)
INSERT INTO public.dw_dim_tempo (tempo_id, ano, mes, dia, trimestre, dia_semana, e_fim_semana)
VALUES ('2026-08-10', 2026, 8, 10, 3, 1, false)
ON CONFLICT (tempo_id) DO NOTHING;

-- Cliente DW Semente
INSERT INTO public.dw_dim_cliente (cliente_id, empresa_operadora_id, codigo_cliente, razao_social, status)
VALUES ('77777777-1111-7000-8000-000000000001', '7d62aaec-e24d-4273-b257-867183cf658c', 1001, 'Restaurante Alpha Gourmet Ltda', 'ACTIVE')
ON CONFLICT (cliente_id) DO NOTHING;

-- Contrato DW Semente
INSERT INTO public.dw_dim_contrato (contrato_id, empresa_operadora_id, numero_contrato, valor_mensal, status_workflow)
VALUES ('77777777-5555-7000-8000-000000000001', '7d62aaec-e24d-4273-b257-867183cf658c', 'CTR-8001', 2500.00, 'CAMPANHA_ATIVA')
ON CONFLICT (contrato_id) DO NOTHING;

-- Representante DW Semente
INSERT INTO public.dw_dim_representante (representante_id, empresa_operadora_id, codigo_representante, razao_social)
VALUES ('a1b2c3d4-e5f6-7000-8000-000000000001', '7d62aaec-e24d-4273-b257-867183cf658c', 5001, 'Jairan Santos Representações')
ON CONFLICT (representante_id) DO NOTHING;

-- Fato Financeiro Semente
INSERT INTO public.dw_fat_financeiro (empresa_operadora_id, contrato_id, cliente_id, representante_id, tempo_id, valor_faturado, valor_recebido, valor_comissao, inadimplente)
VALUES ('7d62aaec-e24d-4273-b257-867183cf658c', '77777777-5555-7000-8000-000000000001', '77777777-1111-7000-8000-000000000001', 'a1b2c3d4-e5f6-7000-8000-000000000001', '2026-08-10', 15000.00, 15000.00, 750.00, false);
