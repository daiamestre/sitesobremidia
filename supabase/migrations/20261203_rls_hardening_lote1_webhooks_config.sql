-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261203
-- GATE GLOBAL-RLS-03.1: RLS HARDENING LOTE 1 (RECONCILIADO)
--
-- Escopo Exclusivo:
--   1. public.webhook_pagamentos (Revogação total de SELECT para authenticated — service_role only)
--   2. public.financeiro_configuracoes (Isolamento estrito por tenant + papéis financeiros: OWNER/ADMIN/GESTOR/GERENTE/FINANCEIRO)
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY + REVOKE/GRANT.
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. TABELA: public.webhook_pagamentos (GAP-RLS-02 — SERVICE_ROLE ONLY)
-- ----------------------------------------------------------------------
ALTER TABLE public.webhook_pagamentos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Remove a policy permissiva legada com USING (TRUE)
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'webhook_pagamentos' 
      AND policyname = 'p_read_webhook_pagamentos'
  ) THEN
    DROP POLICY p_read_webhook_pagamentos ON public.webhook_pagamentos;
  END IF;

  -- Remove qualquer policy anterior para authenticated
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'webhook_pagamentos' 
      AND policyname = 'p_read_webhook_pagamentos_internal'
  ) THEN
    DROP POLICY p_read_webhook_pagamentos_internal ON public.webhook_pagamentos;
  END IF;
END $$;

-- Revoga explicitamente permissões de leitura/escrita diretas de anon e authenticated
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.webhook_pagamentos FROM anon, authenticated;
GRANT ALL ON public.webhook_pagamentos TO service_role;


-- ----------------------------------------------------------------------
-- 2. TABELA: public.financeiro_configuracoes (GAP-RLS-03 — RECONCILIADO)
-- ----------------------------------------------------------------------
ALTER TABLE public.financeiro_configuracoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Remove a policy permissiva legada com USING (TRUE)
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'financeiro_configuracoes' 
      AND policyname = 'p_read_financeiro_configuracoes'
  ) THEN
    DROP POLICY p_read_financeiro_configuracoes ON public.financeiro_configuracoes;
  END IF;

  -- Remove policy se já existir
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'financeiro_configuracoes' 
      AND policyname = 'p_read_financeiro_configuracoes_tenant'
  ) THEN
    DROP POLICY p_read_financeiro_configuracoes_tenant ON public.financeiro_configuracoes;
  END IF;

  -- Policy restritiva reconciliada:
  -- Apenas OWNER, ADMIN, GESTOR, GERENTE e FINANCEIRO do próprio tenant.
  -- REPRESENTANTE, ANUNCIANTE, CLIENTE, PARCEIRO, DESIGNER, OPERACIONAL, FUNCIONARIO e tenant NULL recebem DENY.
  CREATE POLICY p_read_financeiro_configuracoes_tenant ON public.financeiro_configuracoes
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO')
  );
END $$;
