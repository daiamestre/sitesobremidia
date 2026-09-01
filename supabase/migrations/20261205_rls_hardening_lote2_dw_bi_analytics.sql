-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261205
-- GATE GLOBAL-RLS-04: HARDENING RLS LOTE 2 DW & BI / ANALYTICS
--
-- Escopo Exclusivo:
--   1. public.bi_exportacoes     — eliminar fail-open OR IS NULL no SELECT
--   2. public.bi_agendamentos    — eliminar fail-open OR IS NULL no SELECT
--   3. public.ai_predicoes       — eliminar fail-open OR IS NULL no SELECT
--   4. public.ai_auditoria       — eliminar bypass do user_tenant IS NULL
--                                  preservar OR empresa_operadora_id IS NULL (linhas de sistema)
--   5. public.analytics_auditoria — eliminar bypass do user_tenant IS NULL
--                                   preservar OR empresa_operadora_id IS NULL (linhas de sistema)
--
-- Idempotente via DO $$ ... DROP POLICY IF EXISTS ... CREATE POLICY ... END $$;
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. TABELA: public.bi_exportacoes
-- ----------------------------------------------------------------------
ALTER TABLE public.bi_exportacoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Remover policy vulnerável
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bi_exportacoes'
      AND policyname = 'p_tenant_bi_exportacoes_select'
  ) THEN
    DROP POLICY p_tenant_bi_exportacoes_select ON public.bi_exportacoes;
  END IF;

  -- Criar policy fail-closed: tenant do usuário = tenant da linha
  -- empresa_operadora_id NOT NULL → get_user_empresa_operadora_id NULL → FALSE (DENY)
  CREATE POLICY p_tenant_bi_exportacoes_select ON public.bi_exportacoes
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  );
END $$;


-- ----------------------------------------------------------------------
-- 2. TABELA: public.bi_agendamentos
-- ----------------------------------------------------------------------
ALTER TABLE public.bi_agendamentos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bi_agendamentos'
      AND policyname = 'p_tenant_bi_agendamentos_select'
  ) THEN
    DROP POLICY p_tenant_bi_agendamentos_select ON public.bi_agendamentos;
  END IF;

  CREATE POLICY p_tenant_bi_agendamentos_select ON public.bi_agendamentos
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  );
END $$;


-- ----------------------------------------------------------------------
-- 3. TABELA: public.ai_predicoes
-- ----------------------------------------------------------------------
ALTER TABLE public.ai_predicoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_predicoes'
      AND policyname = 'p_tenant_ai_predicoes_select'
  ) THEN
    DROP POLICY p_tenant_ai_predicoes_select ON public.ai_predicoes;
  END IF;

  CREATE POLICY p_tenant_ai_predicoes_select ON public.ai_predicoes
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  );
END $$;


-- ----------------------------------------------------------------------
-- 4. TABELA: public.ai_auditoria
-- empresa_operadora_id NULLABLE:
--   - Linhas com empresa_operadora_id = tenant do usuário → ALLOW (dados do tenant)
--   - Linhas com empresa_operadora_id IS NULL → ALLOW (registros globais de sistema)
--   - user_tenant IS NULL (desprovisionado) → DENY (eliminamos o bypass)
-- ----------------------------------------------------------------------
ALTER TABLE public.ai_auditoria ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_auditoria'
      AND policyname = 'p_tenant_ai_auditoria_select'
  ) THEN
    DROP POLICY p_tenant_ai_auditoria_select ON public.ai_auditoria;
  END IF;

  -- Preservar: linhas do tenant + linhas globais de sistema (empresa_operadora_id IS NULL)
  -- Remover: bypass OR (get_user_empresa_operadora_id(auth.uid()) IS NULL)
  CREATE POLICY p_tenant_ai_auditoria_select ON public.ai_auditoria
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR empresa_operadora_id IS NULL
  );

  -- Também corrigir policy INSERT para eliminar o permissivismo desnecessário:
  -- WITH CHECK original: (empresa_operadora_id IS NULL) OR (empresa_operadora_id = get_user_empresa_operadora_id(auth.uid()))
  -- Esta policy INSERT já é aceitável pois controla somente o que o usuário pode GRAVAR.
  -- Registros de sistema com IS NULL devem ser inseridos somente via service_role.
  -- Porém, como a política existente já foi validada e contém IS NULL somente na linha (não no user_tenant),
  -- NÃO alterar a policy INSERT para não gerar regressão.
END $$;


-- ----------------------------------------------------------------------
-- 5. TABELA: public.analytics_auditoria
-- Mesma lógica de ai_auditoria: empresa_operadora_id NULLABLE
-- ----------------------------------------------------------------------
ALTER TABLE public.analytics_auditoria ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'analytics_auditoria'
      AND policyname = 'p_tenant_analytics_auditoria_select'
  ) THEN
    DROP POLICY p_tenant_analytics_auditoria_select ON public.analytics_auditoria;
  END IF;

  CREATE POLICY p_tenant_analytics_auditoria_select ON public.analytics_auditoria
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR empresa_operadora_id IS NULL
  );
END $$;
