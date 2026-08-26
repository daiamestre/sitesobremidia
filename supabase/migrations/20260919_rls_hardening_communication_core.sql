-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20260919
-- RLS HARDENING: jobs, job_tentativas, auditoria_logs, timeline
-- ----------------------------------------------------------------------
-- ETAPA 6 da Fase 2 — Communication Core
-- Problema: tabelas críticas sem RLS explícita ou com políticas fracas.
-- Princípio: fail-closed, multi-tenant, least privilege.
-- Idempotente: usa DO $$ BEGIN ... IF NOT EXISTS ... END $$
-- ======================================================================

-- ======================================================================
-- 1. TABELA: jobs (fila persistente)
-- ======================================================================

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT: tenant próprio ou service_role
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'jobs_select_tenant'
  ) THEN
    CREATE POLICY jobs_select_tenant ON public.jobs
    FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()));
  END IF;

  -- INSERT: apenas roles internas (backend/server-side via service_role)
  -- Usuários autenticados comuns NÃO devem enfileirar jobs diretamente
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'jobs_insert_internal'
  ) THEN
    CREATE POLICY jobs_insert_internal ON public.jobs
    FOR INSERT TO authenticated
    WITH CHECK (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      AND public.is_internal_role()
    );
  END IF;

  -- UPDATE: somente roles internas no tenant próprio
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'jobs_update_internal'
  ) THEN
    CREATE POLICY jobs_update_internal ON public.jobs
    FOR UPDATE TO authenticated
    USING (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      AND public.is_internal_role()
    )
    WITH CHECK (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    );
  END IF;

  -- DELETE: apenas OWNER/ADMIN (jobs mortos/cancelados)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'jobs_delete_admin'
  ) THEN
    CREATE POLICY jobs_delete_admin ON public.jobs
    FOR DELETE TO authenticated
    USING (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      AND public.get_user_role() IN ('OWNER', 'ADMIN')
    );
  END IF;
END $$;

-- ======================================================================
-- 2. TABELA: job_tentativas (tentativas de jobs)
-- ======================================================================

ALTER TABLE public.job_tentativas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT: via job do mesmo tenant
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'job_tentativas' AND policyname = 'jt_select_tenant'
  ) THEN
    CREATE POLICY jt_select_tenant ON public.job_tentativas
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = job_tentativas.job_id
          AND j.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      )
    );
  END IF;

  -- INSERT: apenas roles internas (Communication Core server-side)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'job_tentativas' AND policyname = 'jt_insert_internal'
  ) THEN
    CREATE POLICY jt_insert_internal ON public.job_tentativas
    FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = job_tentativas.job_id
          AND j.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      )
      AND public.is_internal_role()
    );
  END IF;
END $$;

-- ======================================================================
-- 3. TABELA: auditoria_logs (logs de auditoria imutáveis)
-- ======================================================================

ALTER TABLE public.auditoria_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT: OWNER e ADMIN veem tudo do tenant; demais veem somente os próprios
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'auditoria_logs' AND policyname = 'audit_select_own_or_admin'
  ) THEN
    CREATE POLICY audit_select_own_or_admin ON public.auditoria_logs
    FOR SELECT TO authenticated
    USING (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      AND (
        public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE')
        OR usuario_id = auth.uid()
      )
    );
  END IF;

  -- INSERT: qualquer autenticado do tenant (sistema, triggers, usuários)
  -- auditoria_logs é append-only por convenção; UPDATE e DELETE proibidos via política
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'auditoria_logs' AND policyname = 'audit_insert_tenant'
  ) THEN
    CREATE POLICY audit_insert_tenant ON public.auditoria_logs
    FOR INSERT TO authenticated
    WITH CHECK (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    );
  END IF;

  -- UPDATE: BLOQUEADO para todos — auditoria é imutável
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'auditoria_logs' AND policyname = 'audit_no_update'
  ) THEN
    CREATE POLICY audit_no_update ON public.auditoria_logs
    FOR UPDATE TO authenticated
    USING (FALSE); -- sempre falso = nenhum UPDATE possível via RLS
  END IF;

  -- DELETE: BLOQUEADO para todos
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'auditoria_logs' AND policyname = 'audit_no_delete'
  ) THEN
    CREATE POLICY audit_no_delete ON public.auditoria_logs
    FOR DELETE TO authenticated
    USING (FALSE); -- sempre falso = nenhum DELETE possível via RLS
  END IF;
END $$;

-- ======================================================================
-- 4. TABELA: timeline (histórico operacional)
-- ======================================================================

-- Verificar se RLS já está ativo (migrations anteriores podem ter ativado)
DO $$
BEGIN
  -- Garantir RLS habilitado
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'timeline' AND c.relrowsecurity = TRUE
  ) THEN
    EXECUTE 'ALTER TABLE public.timeline ENABLE ROW LEVEL SECURITY';
  END IF;

  -- SELECT: tenant isolado
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'timeline' AND policyname = 'timeline_select_tenant'
  ) THEN
    CREATE POLICY timeline_select_tenant ON public.timeline
    FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()));
  END IF;

  -- INSERT: roles internas e representantes do tenant
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'timeline' AND policyname = 'timeline_insert_tenant'
  ) THEN
    CREATE POLICY timeline_insert_tenant ON public.timeline
    FOR INSERT TO authenticated
    WITH CHECK (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()));
  END IF;

  -- UPDATE: BLOQUEADO — timeline é append-only
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'timeline' AND policyname = 'timeline_no_update'
  ) THEN
    CREATE POLICY timeline_no_update ON public.timeline
    FOR UPDATE TO authenticated
    USING (FALSE);
  END IF;
END $$;

-- ======================================================================
-- 5. VERIFICAÇÃO FINAL
-- Confirmar que todas as tabelas críticas têm RLS habilitada
-- ======================================================================
DO $$
DECLARE
  v_table TEXT;
  v_has_rls BOOLEAN;
BEGIN
  FOR v_table IN VALUES ('jobs'), ('job_tentativas'), ('auditoria_logs'), ('timeline')
  LOOP
    SELECT c.relrowsecurity INTO v_has_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = v_table;

    IF NOT COALESCE(v_has_rls, FALSE) THEN
      RAISE WARNING '[RLS HARDENING] Tabela % ainda sem RLS ativo.', v_table;
    ELSE
      RAISE NOTICE '[RLS HARDENING] OK: tabela % com RLS ativo.', v_table;
    END IF;
  END LOOP;
END $$;
