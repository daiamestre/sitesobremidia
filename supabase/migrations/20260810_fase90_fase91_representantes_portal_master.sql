-- ============================================================
-- MIGRATION: FASE 9.0 + FASE 9.1 — PORTAL DO REPRESENTANTE COMERCIAL MASTER
-- Sobre Mídia ERP — Tabela de Metas, RLS & Dados de Homologação
-- Criado em: 2026-08-10
-- ============================================================

-- ── 1. Tabela public.metas_representantes ───────────────────────────
CREATE TABLE IF NOT EXISTS public.metas_representantes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id  uuid NOT NULL REFERENCES public.empresa_operadora(id),
  representante_id      uuid NOT NULL REFERENCES public.representantes(id),
  ano                   integer NOT NULL DEFAULT 2026,
  mes                   integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor_meta            numeric(12,2) NOT NULL DEFAULT 0.00,
  valor_realizado       numeric(12,2) NOT NULL DEFAULT 0.00,
  status                text NOT NULL DEFAULT 'EM_ANDAMENTO' CHECK (status IN ('EM_ANDAMENTO', 'ATINGIDA', 'NAO_ATINGIDA')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(empresa_operadora_id, representante_id, ano, mes)
);

ALTER TABLE public.metas_representantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mr_tenant_isolation" ON public.metas_representantes;
CREATE POLICY "mr_tenant_isolation" ON public.metas_representantes
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE INDEX IF NOT EXISTS idx_mr_tenant ON public.metas_representantes(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_mr_rep ON public.metas_representantes(representante_id);
CREATE INDEX IF NOT EXISTS idx_mr_periodo ON public.metas_representantes(ano, mes);

-- ── 2. Homologação Rep B em Tenant Alpha para Teste de Isolamento Ownership Scope ─
-- User B em Tenant Alpha
INSERT INTO public.usuarios (id, empresa_operadora_id, perfil_id, nome, email, status, created_at, updated_at)
VALUES (
  '4164f657-8896-4e32-9bd4-2c253a124500'::uuid,
  '7d62aaec-e24d-4273-b257-867183cf658c'::uuid,
  '039a07d6-e7ae-485e-8961-81ead9640f5d'::uuid,
  'Representante B Alpha',
  'rep.b@sobremidia.com.br',
  'ACTIVE',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Representante B em Tenant Alpha
INSERT INTO public.representantes (id, empresa_operadora_id, usuario_id, codigo_representante, cpf_cnpj, razao_social, ativo, comissao_porcentagem, created_at, updated_at)
VALUES (
  'a1b2c3d4-e5f6-7000-8000-000000000003'::uuid,
  '7d62aaec-e24d-4273-b257-867183cf658c'::uuid,
  '4164f657-8896-4e32-9bd4-2c253a124500'::uuid,
  9003,
  '22.333.444/0001-55',
  'Representação B Alpha Ltda',
  true,
  5.00,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Cliente B do Representante B
INSERT INTO public.clientes (id, empresa_operadora_id, representante_id, codigo_cliente, status, created_at, updated_at)
VALUES (
  '88888888-0000-0000-0001-000000000002'::uuid,
  '7d62aaec-e24d-4273-b257-867183cf658c'::uuid,
  'a1b2c3d4-e5f6-7000-8000-000000000003'::uuid,
  1002,
  'ACTIVE',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Contrato B do Representante B
INSERT INTO public.contratos (id, empresa_operadora_id, empresa_id, representante_id, numero_contrato, cliente_id, valor_mensal, forma_pagamento, status_workflow, data_inicio, data_fim, created_at, updated_at)
VALUES (
  '88888888-0000-0000-0001-000000000004'::uuid,
  '7d62aaec-e24d-4273-b257-867183cf658c'::uuid,
  '88888888-2222-7000-8000-000000000002'::uuid,
  'a1b2c3d4-e5f6-7000-8000-000000000003'::uuid,
  'CTR-8002',
  '88888888-0000-0000-0001-000000000002'::uuid,
  10000.00,
  'BOLETO',
  'CAMPANHA_ATIVA',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '1 year',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Metas semente para Rep A e Rep B
INSERT INTO public.metas_representantes (empresa_operadora_id, representante_id, ano, mes, valor_meta, valor_realizado, status)
VALUES
(
  '7d62aaec-e24d-4273-b257-867183cf658c'::uuid,
  'a1b2c3d4-e5f6-7000-8000-000000000001'::uuid,
  2026,
  8,
  20000.00,
  15000.00,
  'EM_ANDAMENTO'
),
(
  '7d62aaec-e24d-4273-b257-867183cf658c'::uuid,
  'a1b2c3d4-e5f6-7000-8000-000000000003'::uuid,
  2026,
  8,
  25000.00,
  10000.00,
  'EM_ANDAMENTO'
)
ON CONFLICT (empresa_operadora_id, representante_id, ano, mes) DO UPDATE
SET valor_meta = EXCLUDED.valor_meta, valor_realizado = EXCLUDED.valor_realizado;
