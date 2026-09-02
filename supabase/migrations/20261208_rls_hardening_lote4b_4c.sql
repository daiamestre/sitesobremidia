-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261208
-- GATE GLOBAL-RLS-10: HARDENING CONTROLADO LOTE 4B + LOTE 4C
--
-- Escopo Exclusivo:
--   LOTE 4B:
--     1. public.catalogo_servicos — Habilitar RLS + policies tenant SELECT/INSERT/UPDATE/DELETE
--     2. public.itens_proposta    — Habilitar RLS + policies tenant SELECT/INSERT/UPDATE/DELETE (via propostas)
--     3. public.proposta_versoes  — Habilitar RLS + policies tenant SELECT/INSERT (via propostas, UPDATE/DELETE=DENY)
--     4. public.itens_contrato    — Habilitar RLS + policies tenant SELECT/INSERT/UPDATE (via contratos)
--
--   LOTE 4C:
--     5. public.operacao_logs      — Eliminar fail-open OR IS NULL em SELECT/INSERT (via operacoes)
--     6. public.operacao_metricas  — Eliminar fail-open OR IS NULL em SELECT/INSERT (via operacoes)
--     7. public.operacao_auditoria — Eliminar fail-open OR IS NULL em SELECT/INSERT (via operacoes)
--
-- Idempotente via DO $$ ... DROP POLICY IF EXISTS ... CREATE POLICY ... END $$;
-- ======================================================================

-- ----------------------------------------------------------------------
-- LOTE 4B: 1. TABELA public.catalogo_servicos
-- ----------------------------------------------------------------------
ALTER TABLE public.catalogo_servicos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'catalogo_servicos' AND policyname = 'cs_tenant_select') THEN
    DROP POLICY cs_tenant_select ON public.catalogo_servicos;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'catalogo_servicos' AND policyname = 'cs_tenant_insert') THEN
    DROP POLICY cs_tenant_insert ON public.catalogo_servicos;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'catalogo_servicos' AND policyname = 'cs_tenant_update') THEN
    DROP POLICY cs_tenant_update ON public.catalogo_servicos;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'catalogo_servicos' AND policyname = 'cs_tenant_delete') THEN
    DROP POLICY cs_tenant_delete ON public.catalogo_servicos;
  END IF;

  CREATE POLICY cs_tenant_select ON public.catalogo_servicos
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  );

  CREATE POLICY cs_tenant_insert ON public.catalogo_servicos
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  );

  CREATE POLICY cs_tenant_update ON public.catalogo_servicos
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  );

  CREATE POLICY cs_tenant_delete ON public.catalogo_servicos
  FOR DELETE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  );
END $$;


-- ----------------------------------------------------------------------
-- LOTE 4B: 2. TABELA public.itens_proposta
-- ----------------------------------------------------------------------
ALTER TABLE public.itens_proposta ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'itens_proposta' AND policyname = 'ip_tenant_select') THEN
    DROP POLICY ip_tenant_select ON public.itens_proposta;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'itens_proposta' AND policyname = 'ip_tenant_insert') THEN
    DROP POLICY ip_tenant_insert ON public.itens_proposta;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'itens_proposta' AND policyname = 'ip_tenant_update') THEN
    DROP POLICY ip_tenant_update ON public.itens_proposta;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'itens_proposta' AND policyname = 'ip_tenant_delete') THEN
    DROP POLICY ip_tenant_delete ON public.itens_proposta;
  END IF;

  CREATE POLICY ip_tenant_select ON public.itens_proposta
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.propostas p
      WHERE p.id = itens_proposta.proposta_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );

  CREATE POLICY ip_tenant_insert ON public.itens_proposta
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.propostas p
      WHERE p.id = itens_proposta.proposta_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );

  CREATE POLICY ip_tenant_update ON public.itens_proposta
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.propostas p
      WHERE p.id = itens_proposta.proposta_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.propostas p
      WHERE p.id = itens_proposta.proposta_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );

  CREATE POLICY ip_tenant_delete ON public.itens_proposta
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.propostas p
      WHERE p.id = itens_proposta.proposta_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );
END $$;


-- ----------------------------------------------------------------------
-- LOTE 4B: 3. TABELA public.proposta_versoes
-- ----------------------------------------------------------------------
ALTER TABLE public.proposta_versoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'proposta_versoes' AND policyname = 'pv_tenant_select') THEN
    DROP POLICY pv_tenant_select ON public.proposta_versoes;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'proposta_versoes' AND policyname = 'pv_tenant_insert') THEN
    DROP POLICY pv_tenant_insert ON public.proposta_versoes;
  END IF;

  CREATE POLICY pv_tenant_select ON public.proposta_versoes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.propostas p
      WHERE p.id = proposta_versoes.proposta_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );

  CREATE POLICY pv_tenant_insert ON public.proposta_versoes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.propostas p
      WHERE p.id = proposta_versoes.proposta_id
        AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );
  -- UPDATE e DELETE negados por padrão (imutabilidade histórica)
END $$;


-- ----------------------------------------------------------------------
-- LOTE 4B: 4. TABELA public.itens_contrato
-- ----------------------------------------------------------------------
ALTER TABLE public.itens_contrato ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'itens_contrato' AND policyname = 'ic_tenant_select') THEN
    DROP POLICY ic_tenant_select ON public.itens_contrato;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'itens_contrato' AND policyname = 'ic_tenant_insert') THEN
    DROP POLICY ic_tenant_insert ON public.itens_contrato;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'itens_contrato' AND policyname = 'ic_tenant_update') THEN
    DROP POLICY ic_tenant_update ON public.itens_contrato;
  END IF;

  CREATE POLICY ic_tenant_select ON public.itens_contrato
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contratos c
      WHERE c.id = itens_contrato.contrato_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );

  CREATE POLICY ic_tenant_insert ON public.itens_contrato
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contratos c
      WHERE c.id = itens_contrato.contrato_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );

  CREATE POLICY ic_tenant_update ON public.itens_contrato
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contratos c
      WHERE c.id = itens_contrato.contrato_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contratos c
      WHERE c.id = itens_contrato.contrato_id
        AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );
  -- DELETE direto negado; exclusão permitida somente via ON DELETE CASCADE do contrato pai
END $$;


-- ----------------------------------------------------------------------
-- LOTE 4C: 5. TABELA public.operacao_logs
-- ----------------------------------------------------------------------
ALTER TABLE public.operacao_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operacao_logs' AND policyname = 'p_tenant_operacao_logs_select') THEN
    DROP POLICY p_tenant_operacao_logs_select ON public.operacao_logs;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operacao_logs' AND policyname = 'p_tenant_operacao_logs_insert') THEN
    DROP POLICY p_tenant_operacao_logs_insert ON public.operacao_logs;
  END IF;

  CREATE POLICY p_tenant_operacao_logs_select ON public.operacao_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_logs.operacao_id
        AND o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );

  CREATE POLICY p_tenant_operacao_logs_insert ON public.operacao_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_logs.operacao_id
        AND o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );
END $$;


-- ----------------------------------------------------------------------
-- LOTE 4C: 6. TABELA public.operacao_metricas
-- ----------------------------------------------------------------------
ALTER TABLE public.operacao_metricas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operacao_metricas' AND policyname = 'p_tenant_operacao_metricas_select') THEN
    DROP POLICY p_tenant_operacao_metricas_select ON public.operacao_metricas;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operacao_metricas' AND policyname = 'p_tenant_operacao_metricas_insert') THEN
    DROP POLICY p_tenant_operacao_metricas_insert ON public.operacao_metricas;
  END IF;

  CREATE POLICY p_tenant_operacao_metricas_select ON public.operacao_metricas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_metricas.operacao_id
        AND o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );

  CREATE POLICY p_tenant_operacao_metricas_insert ON public.operacao_metricas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_metricas.operacao_id
        AND o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );
END $$;


-- ----------------------------------------------------------------------
-- LOTE 4C: 7. TABELA public.operacao_auditoria
-- ----------------------------------------------------------------------
ALTER TABLE public.operacao_auditoria ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operacao_auditoria' AND policyname = 'p_tenant_operacao_auditoria_select') THEN
    DROP POLICY p_tenant_operacao_auditoria_select ON public.operacao_auditoria;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operacao_auditoria' AND policyname = 'p_tenant_operacao_auditoria_insert') THEN
    DROP POLICY p_tenant_operacao_auditoria_insert ON public.operacao_auditoria;
  END IF;

  CREATE POLICY p_tenant_operacao_auditoria_select ON public.operacao_auditoria
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_auditoria.operacao_id
        AND o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );

  CREATE POLICY p_tenant_operacao_auditoria_insert ON public.operacao_auditoria
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_auditoria.operacao_id
        AND o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
  );
END $$;
