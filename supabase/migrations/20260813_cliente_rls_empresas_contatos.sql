-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20260813: RLS DE EMPRESAS E CONTATOS DO CLIENTE
-- ======================================================================
-- Correção crítica: as tabelas public.empresas e public.contatos possuíam
-- RLS habilitado SEM nenhuma policy, bloqueando toda leitura/escrita via
-- REST (PostgREST) e fazendo os joins aninhados de clientes retornarem vazio.
-- Estas policies espelham o RBAC de public.clientes (cli_select_policy /
-- cli_write_policy) para que representantes acessem apenas os registros
-- dos SEUS clientes e perfis corporativos acessem os do próprio tenant.

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "emp_select_policy" ON public.empresas;
DROP POLICY IF EXISTS "emp_write_policy" ON public.empresas;
DROP POLICY IF EXISTS "ctt_select_policy" ON public.contatos;
DROP POLICY IF EXISTS "ctt_write_policy" ON public.contatos;

-- ── 1. RLS: EMPRESAS (via clientes → empresa_operadora + RBAC) ────────
CREATE POLICY "emp_select_policy" ON public.empresas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = empresas.cliente_id
        AND c.deleted_at IS NULL
        AND c.empresa_operadora_id = (
          SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
        )
        AND (
          public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO')
          OR c.representante_id = public.get_user_representante_id()
        )
    )
  );

CREATE POLICY "emp_write_policy" ON public.empresas
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = empresas.cliente_id
        AND c.deleted_at IS NULL
        AND c.empresa_operadora_id = (
          SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
        )
        AND (
          public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR')
          OR (public.get_user_role() = 'REPRESENTANTE' AND c.representante_id = public.get_user_representante_id())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = empresas.cliente_id
        AND c.deleted_at IS NULL
        AND c.empresa_operadora_id = (
          SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
        )
        AND (
          public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR')
          OR (public.get_user_role() = 'REPRESENTANTE' AND c.representante_id = public.get_user_representante_id())
        )
    )
  );

-- ── 2. RLS: CONTATOS (via empresas → clientes → tenant + RBAC) ────────
CREATE POLICY "ctt_select_policy" ON public.contatos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas e
      JOIN public.clientes c ON c.id = e.cliente_id
      WHERE e.id = contatos.empresa_id
        AND c.deleted_at IS NULL
        AND c.empresa_operadora_id = (
          SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
        )
        AND (
          public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO')
          OR c.representante_id = public.get_user_representante_id()
        )
    )
  );

CREATE POLICY "ctt_write_policy" ON public.contatos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.empresas e
      JOIN public.clientes c ON c.id = e.cliente_id
      WHERE e.id = contatos.empresa_id
        AND c.deleted_at IS NULL
        AND c.empresa_operadora_id = (
          SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
        )
        AND (
          public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR')
          OR (public.get_user_role() = 'REPRESENTANTE' AND c.representante_id = public.get_user_representante_id())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.empresas e
      JOIN public.clientes c ON c.id = e.cliente_id
      WHERE e.id = contatos.empresa_id
        AND c.deleted_at IS NULL
        AND c.empresa_operadora_id = (
          SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
        )
        AND (
          public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR')
          OR (public.get_user_role() = 'REPRESENTANTE' AND c.representante_id = public.get_user_representante_id())
        )
    )
  );
