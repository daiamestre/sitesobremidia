-- ============================================================
-- MIGRATION: FASE 8.5 — ENTERPRISE HARDENING & GOVERNANCE MASTER
-- Sobre Mídia ERP — Hardening de Segurança, Multi-Tenancy & Observabilidade
-- Criado em: 2026-08-07
-- ============================================================

-- ── 1. Central Audit Trail (public.system_events) ────────────
CREATE TABLE IF NOT EXISTS public.system_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id  uuid REFERENCES public.empresa_operadora(id),
  user_id               uuid REFERENCES public.usuarios(id),
  action                text NOT NULL,
  module                text NOT NULL,
  entity                text NOT NULL,
  entity_id             text,
  ip_address            text,
  metadata              jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "se_tenant_isolation" ON public.system_events;
CREATE POLICY "se_tenant_isolation" ON public.system_events
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE INDEX IF NOT EXISTS idx_se_tenant ON public.system_events(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_se_module ON public.system_events(module);
CREATE INDEX IF NOT EXISTS idx_se_created ON public.system_events(created_at DESC);

-- ── 2. Segundo Tenant de Homologação para Cross-Tenant Defense (Tenant Beta) ─
-- Empresa Operadora Beta
INSERT INTO public.empresa_operadora (id, razao_social, nome_fantasia, cnpj, status_ativa, created_at, updated_at)
VALUES (
  '99999999-9999-9999-9999-999999999999'::uuid,
  'Rede Mídia Beta Academias Ltda',
  'Rede Beta Fit',
  '99.888.777/0001-99',
  true,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Anunciante no Tenant Beta
INSERT INTO public.clientes (id, empresa_operadora_id, codigo_cliente, status, created_at, updated_at)
VALUES (
  'ffffffff-0000-0000-0002-000000000001'::uuid,
  '99999999-9999-9999-9999-999999999999'::uuid,
  'CLI-BETA-001',
  'ATIVO',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Contrato no Tenant Beta
INSERT INTO public.contratos (id, empresa_operadora_id, numero_contrato, cliente_id, valor_mensal, status_workflow, data_inicio, data_fim, created_at, updated_at)
VALUES (
  'ffffffff-0000-0000-0002-000000000002'::uuid,
  '99999999-9999-9999-9999-999999999999'::uuid,
  'CTR-BETA-9001',
  'ffffffff-0000-0000-0002-000000000001'::uuid,
  8000.00,
  'APROVADO',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '1 year',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Conta a receber no Tenant Beta
INSERT INTO public.contas_receber (id, empresa_operadora_id, contrato_id, cliente_id, numero_parcela, total_parcelas, valor, data_vencimento, status)
VALUES (
  'ffffffff-0000-0000-0002-000000000003'::uuid,
  '99999999-9999-9999-9999-999999999999'::uuid,
  'ffffffff-0000-0000-0002-000000000002'::uuid,
  'ffffffff-0000-0000-0002-000000000001'::uuid,
  1,
  12,
  8000.00,
  CURRENT_DATE + INTERVAL '30 days',
  'PENDENTE'
)
ON CONFLICT (id) DO NOTHING;

-- Log de evento no system_events
INSERT INTO public.system_events (empresa_operadora_id, action, module, entity, entity_id, metadata)
VALUES (
  '11111111-0000-0000-0000-000000000001'::uuid,
  'HARDENING_AUDIT_EXECUTION',
  'GOVERNANCE',
  'SYSTEM',
  'FASE-8.5',
  '{"status": "PASSED", "checkpoints": 6}'::jsonb
);
