-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261206
-- GATE GLOBAL-RLS-06: HARDENING CONTROLADO LOTE 3
--
-- Escopo Exclusivo (Tabelas Primárias):
--   1. public.operacoes         — Habilitar RLS + Policies SELECT/INSERT/UPDATE (Fail-Closed)
--   2. public.operacao_alertas  — Eliminar fail-open OR IS NULL em SELECT/INSERT/UPDATE
--   3. public.midia_versoes     — Eliminar policies redundantes vulneráveis p_tenant_midia_versoes_*
--                                 preservando as policies seguras mv_tenant_*
--   4. public.grade_exibicao    — Eliminar fail-open OR IS NULL em SELECT/INSERT/DELETE
--
-- Idempotente via DO $$ ... DROP POLICY IF EXISTS ... CREATE POLICY ... END $$;
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. TABELA: public.operacoes
-- ----------------------------------------------------------------------
ALTER TABLE public.operacoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Remover policies legadas se existirem
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operacoes' AND policyname = 'op_tenant_select') THEN
    DROP POLICY op_tenant_select ON public.operacoes;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operacoes' AND policyname = 'op_tenant_insert') THEN
    DROP POLICY op_tenant_insert ON public.operacoes;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operacoes' AND policyname = 'op_tenant_update') THEN
    DROP POLICY op_tenant_update ON public.operacoes;
  END IF;

  -- Criar policies fail-closed por tenant
  -- SELECT: somente operações do tenant do usuário
  CREATE POLICY op_tenant_select ON public.operacoes
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  );

  -- INSERT: somente operações no tenant do usuário
  CREATE POLICY op_tenant_insert ON public.operacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  );

  -- UPDATE: somente operações no tenant do usuário, proibindo mutação de tenant
  CREATE POLICY op_tenant_update ON public.operacoes
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  );

  -- DELETE: sem policy -> DENY padrão
END $$;


-- ----------------------------------------------------------------------
-- 2. TABELA: public.operacao_alertas
-- ----------------------------------------------------------------------
ALTER TABLE public.operacao_alertas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operacao_alertas' AND policyname = 'p_tenant_operacao_alertas_select') THEN
    DROP POLICY p_tenant_operacao_alertas_select ON public.operacao_alertas;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operacao_alertas' AND policyname = 'p_tenant_operacao_alertas_insert') THEN
    DROP POLICY p_tenant_operacao_alertas_insert ON public.operacao_alertas;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operacao_alertas' AND policyname = 'p_tenant_operacao_alertas_update') THEN
    DROP POLICY p_tenant_operacao_alertas_update ON public.operacao_alertas;
  END IF;

  -- SELECT: fail-closed via operacoes pai
  CREATE POLICY p_tenant_operacao_alertas_select ON public.operacao_alertas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_alertas.operacao_id
        AND o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );

  -- INSERT: fail-closed via operacoes pai
  CREATE POLICY p_tenant_operacao_alertas_insert ON public.operacao_alertas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_alertas.operacao_id
        AND o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );

  -- UPDATE: fail-closed via operacoes pai
  CREATE POLICY p_tenant_operacao_alertas_update ON public.operacao_alertas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_alertas.operacao_id
        AND o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_alertas.operacao_id
        AND o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );
END $$;


-- ----------------------------------------------------------------------
-- 3. TABELA: public.midia_versoes
-- ----------------------------------------------------------------------
ALTER TABLE public.midia_versoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Remover policies vulneráveis redundantes com fail-open OR IS NULL
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'midia_versoes' AND policyname = 'p_tenant_midia_versoes_select') THEN
    DROP POLICY p_tenant_midia_versoes_select ON public.midia_versoes;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'midia_versoes' AND policyname = 'p_tenant_midia_versoes_insert') THEN
    DROP POLICY p_tenant_midia_versoes_insert ON public.midia_versoes;
  END IF;

  -- As policies mv_tenant_select e mv_tenant_insert permanecem como as políticas ativas e seguras.
END $$;


-- ----------------------------------------------------------------------
-- 4. TABELA: public.grade_exibicao
-- ----------------------------------------------------------------------
ALTER TABLE public.grade_exibicao ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'grade_exibicao' AND policyname = 'p_tenant_grade_exibicao_select') THEN
    DROP POLICY p_tenant_grade_exibicao_select ON public.grade_exibicao;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'grade_exibicao' AND policyname = 'p_tenant_grade_exibicao_insert') THEN
    DROP POLICY p_tenant_grade_exibicao_insert ON public.grade_exibicao;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'grade_exibicao' AND policyname = 'p_tenant_grade_exibicao_delete') THEN
    DROP POLICY p_tenant_grade_exibicao_delete ON public.grade_exibicao;
  END IF;

  -- SELECT: fail-closed via agendamentos pai
  CREATE POLICY p_tenant_grade_exibicao_select ON public.grade_exibicao
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = grade_exibicao.agendamento_id
        AND a.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );

  -- INSERT: fail-closed via agendamentos pai
  CREATE POLICY p_tenant_grade_exibicao_insert ON public.grade_exibicao
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = grade_exibicao.agendamento_id
        AND a.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );

  -- DELETE: fail-closed via agendamentos pai
  CREATE POLICY p_tenant_grade_exibicao_delete ON public.grade_exibicao
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = grade_exibicao.agendamento_id
        AND a.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );
END $$;
