-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261204
-- GATE GLOBAL-RLS-03.7: HARDENING RLS FINANCEIRO / BILLING REAL
--
-- Escopo Exclusivo:
--   1. public.regras_cobranca (Eliminação de fail-open OR IS NULL, isolamento tenant + roles financeiras)
--   2. public.pix_cobrancas (Eliminação de fail-open OR IS NULL, isolamento tenant + roles autorizadas)
--   3. public.recebimentos_conciliacao (Eliminação de fail-open OR IS NULL via pagamentos, tenant + roles autorizadas)
--   4. public.notas_fiscais (Eliminação de fail-open OR IS NULL, isolamento tenant para internos e cliente próprio)
--
-- Idempotente: DO $$ ... DROP POLICY IF EXISTS ... CREATE POLICY ... END $$;
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. TABELA: public.regras_cobranca (ACHADO-RLS-01)
-- ----------------------------------------------------------------------
ALTER TABLE public.regras_cobranca ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Remover policies legadas
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'regras_cobranca' AND policyname = 'p_read_regras_cobranca') THEN
    DROP POLICY p_read_regras_cobranca ON public.regras_cobranca;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'regras_cobranca' AND policyname = 'p_write_regras_cobranca') THEN
    DROP POLICY p_write_regras_cobranca ON public.regras_cobranca;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'regras_cobranca' AND policyname = 'p_read_regras_cobranca_tenant') THEN
    DROP POLICY p_read_regras_cobranca_tenant ON public.regras_cobranca;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'regras_cobranca' AND policyname = 'p_write_regras_cobranca_tenant') THEN
    DROP POLICY p_write_regras_cobranca_tenant ON public.regras_cobranca;
  END IF;

  -- 1.1 Policy SELECT: Restrita a papéis financeiros do próprio tenant
  CREATE POLICY p_read_regras_cobranca_tenant ON public.regras_cobranca
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO')
  );

  -- 1.2 Policy WRITE (ALL): Restrita a papéis financeiros do próprio tenant
  CREATE POLICY p_write_regras_cobranca_tenant ON public.regras_cobranca
  FOR ALL TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO')
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO')
  );
END $$;


-- ----------------------------------------------------------------------
-- 2. TABELA: public.pix_cobrancas (ACHADO-RLS-02)
-- ----------------------------------------------------------------------
ALTER TABLE public.pix_cobrancas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Remover policies legadas
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pix_cobrancas' AND policyname = 'p_read_pix_cobrancas') THEN
    DROP POLICY p_read_pix_cobrancas ON public.pix_cobrancas;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pix_cobrancas' AND policyname = 'p_tenant_pix_cobrancas_select') THEN
    DROP POLICY p_tenant_pix_cobrancas_select ON public.pix_cobrancas;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pix_cobrancas' AND policyname = 'p_tenant_pix_cobrancas_insert') THEN
    DROP POLICY p_tenant_pix_cobrancas_insert ON public.pix_cobrancas;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pix_cobrancas' AND policyname = 'p_tenant_pix_cobrancas_update') THEN
    DROP POLICY p_tenant_pix_cobrancas_update ON public.pix_cobrancas;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pix_cobrancas' AND policyname = 'p_pix_cobrancas_tenant_select') THEN
    DROP POLICY p_pix_cobrancas_tenant_select ON public.pix_cobrancas;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pix_cobrancas' AND policyname = 'p_pix_cobrancas_tenant_write') THEN
    DROP POLICY p_pix_cobrancas_tenant_write ON public.pix_cobrancas;
  END IF;

  -- 2.1 Policy SELECT: Operadores e representantes do próprio tenant
  CREATE POLICY p_pix_cobrancas_tenant_select ON public.pix_cobrancas
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO', 'OPERACIONAL', 'REPRESENTANTE')
  );

  -- 2.2 Policy WRITE (ALL): Operadores internos e finanças do próprio tenant
  CREATE POLICY p_pix_cobrancas_tenant_write ON public.pix_cobrancas
  FOR ALL TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO', 'OPERACIONAL')
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO', 'OPERACIONAL')
  );
END $$;


-- ----------------------------------------------------------------------
-- 3. TABELA: public.recebimentos_conciliacao (ACHADO-RLS-02)
-- ----------------------------------------------------------------------
ALTER TABLE public.recebimentos_conciliacao ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Remover policies legadas
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'recebimentos_conciliacao' AND policyname = 'p_tenant_recebimentos_conciliacao_select') THEN
    DROP POLICY p_tenant_recebimentos_conciliacao_select ON public.recebimentos_conciliacao;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'recebimentos_conciliacao' AND policyname = 'p_tenant_recebimentos_conciliacao_insert') THEN
    DROP POLICY p_tenant_recebimentos_conciliacao_insert ON public.recebimentos_conciliacao;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'recebimentos_conciliacao' AND policyname = 'p_recebimentos_conciliacao_tenant_select') THEN
    DROP POLICY p_recebimentos_conciliacao_tenant_select ON public.recebimentos_conciliacao;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'recebimentos_conciliacao' AND policyname = 'p_recebimentos_conciliacao_tenant_write') THEN
    DROP POLICY p_recebimentos_conciliacao_tenant_write ON public.recebimentos_conciliacao;
  END IF;

  -- 3.1 Policy SELECT: Papéis autorizados com matching no pagamento do próprio tenant
  CREATE POLICY p_recebimentos_conciliacao_tenant_select ON public.recebimentos_conciliacao
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pagamentos pg
      WHERE pg.id = recebimentos_conciliacao.pagamento_id
        AND pg.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO', 'OPERACIONAL')
  );

  -- 3.2 Policy WRITE (ALL): Papéis autorizados com matching no pagamento do próprio tenant
  CREATE POLICY p_recebimentos_conciliacao_tenant_write ON public.recebimentos_conciliacao
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pagamentos pg
      WHERE pg.id = recebimentos_conciliacao.pagamento_id
        AND pg.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO', 'OPERACIONAL')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pagamentos pg
      WHERE pg.id = recebimentos_conciliacao.pagamento_id
        AND pg.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO', 'OPERACIONAL')
  );
END $$;


-- ----------------------------------------------------------------------
-- 4. TABELA: public.notas_fiscais (ACHADO-RLS-02)
-- ----------------------------------------------------------------------
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Remover policies legadas
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notas_fiscais' AND policyname = 'p_read_notas_fiscais') THEN
    DROP POLICY p_read_notas_fiscais ON public.notas_fiscais;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notas_fiscais' AND policyname = 'p_tenant_notas_fiscais_select') THEN
    DROP POLICY p_tenant_notas_fiscais_select ON public.notas_fiscais;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notas_fiscais' AND policyname = 'p_tenant_notas_fiscais_insert') THEN
    DROP POLICY p_tenant_notas_fiscais_insert ON public.notas_fiscais;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notas_fiscais' AND policyname = 'p_notas_fiscais_internal_select') THEN
    DROP POLICY p_notas_fiscais_internal_select ON public.notas_fiscais;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notas_fiscais' AND policyname = 'p_notas_fiscais_client_select') THEN
    DROP POLICY p_notas_fiscais_client_select ON public.notas_fiscais;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notas_fiscais' AND policyname = 'p_notas_fiscais_internal_write') THEN
    DROP POLICY p_notas_fiscais_internal_write ON public.notas_fiscais;
  END IF;

  -- 4.1 Policy SELECT INTERNO: Papéis financeiros do próprio tenant
  CREATE POLICY p_notas_fiscais_internal_select ON public.notas_fiscais
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO')
  );

  -- 4.2 Policy SELECT CLIENTE: Cliente/Anunciante lendo exclusivamente suas próprias notas no tenant
  CREATE POLICY p_notas_fiscais_client_select ON public.notas_fiscais
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND cliente_id IS NOT NULL
    AND cliente_id = public.get_user_cliente_id()
  );

  -- 4.3 Policy WRITE (ALL): Apenas papéis financeiros do próprio tenant
  CREATE POLICY p_notas_fiscais_internal_write ON public.notas_fiscais
  FOR ALL TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO')
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO')
  );
END $$;
