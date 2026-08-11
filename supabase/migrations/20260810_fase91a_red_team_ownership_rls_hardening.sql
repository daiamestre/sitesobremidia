-- ============================================================
-- MIGRATION: FASE 9.1-A — POST-CERTIFICATION RED TEAM
-- HARDENING DE RLS, OWNERSHIP SCOPE E INVIOLABILIDADE DE BANCO
-- SOBRE MÍDIA ERP — ENTERPRISE COMMERCIAL SCALE
-- Criado em: 2026-08-10
-- ============================================================

-- ── 1. Funcões auxiliares de governança de acesso ────────────────────
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT UPPER(COALESCE(p.nome, 'REPRESENTANTE'))
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON u.perfil_id = p.id
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_representante_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id
  FROM public.representantes
  WHERE usuario_id = auth.uid()
  LIMIT 1;
$$;

-- ── 2. Hardening de RLS para public.metas_representantes ─────────────
ALTER TABLE public.metas_representantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mr_tenant_isolation" ON public.metas_representantes;
DROP POLICY IF EXISTS "mr_select_policy" ON public.metas_representantes;
DROP POLICY IF EXISTS "mr_write_policy" ON public.metas_representantes;

-- SELECT Policy for metas_representantes
CREATE POLICY "mr_select_policy" ON public.metas_representantes
  FOR SELECT
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    AND (
      public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO')
      OR
      representante_id = public.get_user_representante_id()
    )
  );

-- INSERT/UPDATE/DELETE Policy for metas_representantes (Only Admins/Gestores)
CREATE POLICY "mr_write_policy" ON public.metas_representantes
  FOR ALL
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR')
  )
  WITH CHECK (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR')
  );

-- ── 3. Hardening de RLS para public.comissoes ────────────────────────
ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "com_tenant_isolation" ON public.comissoes;
DROP POLICY IF EXISTS "com_select_policy" ON public.comissoes;
DROP POLICY IF EXISTS "com_write_policy" ON public.comissoes;

-- SELECT Policy for comissoes
CREATE POLICY "com_select_policy" ON public.comissoes
  FOR SELECT
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    AND (
      public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO')
      OR
      EXISTS (
        SELECT 1 FROM public.contratos c
        WHERE c.id = comissoes.contrato_id
          AND c.representante_id = public.get_user_representante_id()
      )
    )
  );

-- INSERT/UPDATE/DELETE Policy for comissoes (Only Admins/Financeiro)
CREATE POLICY "com_write_policy" ON public.comissoes
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

-- ── 4. Hardening de RLS para public.clientes ─────────────────────────
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "p_representante_clientes" ON public.clientes;
DROP POLICY IF EXISTS "cli_select_policy" ON public.clientes;
DROP POLICY IF EXISTS "cli_write_policy" ON public.clientes;

-- SELECT Policy for clientes
CREATE POLICY "cli_select_policy" ON public.clientes
  FOR SELECT
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    AND (
      public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO')
      OR
      representante_id = public.get_user_representante_id()
    )
  );

-- INSERT/UPDATE/DELETE Policy for clientes
CREATE POLICY "cli_write_policy" ON public.clientes
  FOR ALL
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    AND (
      public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR')
      OR
      (public.get_user_role() = 'REPRESENTANTE' AND representante_id = public.get_user_representante_id())
    )
  )
  WITH CHECK (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    AND (
      public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR')
      OR
      (public.get_user_role() = 'REPRESENTANTE' AND representante_id = public.get_user_representante_id())
    )
  );

-- ── 5. Hardening de RLS para public.contratos ────────────────────────
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "p_tenant_contratos" ON public.contratos;
DROP POLICY IF EXISTS "ctr_select_policy" ON public.contratos;
DROP POLICY IF EXISTS "ctr_write_policy" ON public.contratos;

-- SELECT Policy for contratos
CREATE POLICY "ctr_select_policy" ON public.contratos
  FOR SELECT
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    AND (
      public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO')
      OR
      representante_id = public.get_user_representante_id()
    )
  );

-- INSERT/UPDATE/DELETE Policy for contratos
CREATE POLICY "ctr_write_policy" ON public.contratos
  FOR ALL
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO')
  )
  WITH CHECK (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO')
  );
