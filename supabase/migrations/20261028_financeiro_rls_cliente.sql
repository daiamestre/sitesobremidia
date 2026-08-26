-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261028
-- HARDENING RLS FINANCEIRO DO CLIENTE (missão §41)
--
-- Problema auditado: `contas_receber.cr_tenant_isolation` e as policies de
-- `pagamentos` isolam apenas por TENANT — qualquer usuário do tenant
-- (inclusive ANUNCIANTEs) enxergava faturas/pagamentos de OUTROS clientes
-- (vazamento cross-client dentro do tenant).
--
-- Correção aditiva e compatível:
--   * Perfis internos (OWNER/ADMIN/GESTOR/FINANCEIRO/REPRESENTANTE/…)
--     mantêm acesso total ao tenant;
--   * CLIENTE/ANUNCIANTE passam a ver SOMENTE as próprias faturas
--     (cliente_id = get_user_cliente_id()) em leitura.
-- ======================================================================

-- ---------- CONTAS A RECEBER ----------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contas_receber' AND policyname='cr_tenant_isolation') THEN
        DROP POLICY cr_tenant_isolation ON public.contas_receber;
    END IF;
END $$;

CREATE POLICY cr_internal_all ON public.contas_receber FOR ALL TO authenticated
    USING (
        empresa_operadora_id = (SELECT usuarios.empresa_operadora_id FROM public.usuarios WHERE usuarios.id = auth.uid() LIMIT 1)
        AND public.is_internal_role()
    )
    WITH CHECK (
        empresa_operadora_id = (SELECT usuarios.empresa_operadora_id FROM public.usuarios WHERE usuarios.id = auth.uid() LIMIT 1)
        AND public.is_internal_role()
    );

CREATE POLICY cr_client_select_own ON public.contas_receber FOR SELECT TO authenticated
    USING (
        empresa_operadora_id = (SELECT usuarios.empresa_operadora_id FROM public.usuarios WHERE usuarios.id = auth.uid() LIMIT 1)
        AND cliente_id IS NOT NULL
        AND cliente_id = public.get_user_cliente_id()
    );

-- ---------- PAGAMENTOS ----------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pagamentos' AND policyname='pag_tenant_isolation') THEN
        DROP POLICY pag_tenant_isolation ON public.pagamentos;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pagamentos' AND policyname='pag_tenant_select') THEN
        DROP POLICY pag_tenant_select ON public.pagamentos;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pagamentos' AND policyname='pag_tenant_write') THEN
        DROP POLICY pag_tenant_write ON public.pagamentos;
    END IF;
END $$;

CREATE POLICY pag_internal_all ON public.pagamentos FOR ALL TO authenticated
    USING (
        empresa_operadora_id = (SELECT usuarios.empresa_operadora_id FROM public.usuarios WHERE usuarios.id = auth.uid() LIMIT 1)
        AND public.is_internal_role()
    )
    WITH CHECK (
        empresa_operadora_id = (SELECT usuarios.empresa_operadora_id FROM public.usuarios WHERE usuarios.id = auth.uid() LIMIT 1)
        AND public.is_internal_role()
    );

CREATE POLICY pag_client_select_own ON public.pagamentos FOR SELECT TO authenticated
    USING (
        empresa_operadora_id = (SELECT usuarios.empresa_operadora_id FROM public.usuarios WHERE usuarios.id = auth.uid() LIMIT 1)
        AND EXISTS (
            SELECT 1 FROM public.contas_receber cr
            WHERE cr.id = pagamentos.conta_receber_id
              AND cr.cliente_id IS NOT NULL
              AND cr.cliente_id = public.get_user_cliente_id()
        )
    );

-- GATES: nenhuma policy antiga de tenant-only pode sobreviver
DO $$
DECLARE
    sobrando INT;
BEGIN
    SELECT COUNT(*) INTO sobrando FROM pg_policies
    WHERE tablename IN ('contas_receber','pagamentos')
      AND policyname IN ('cr_tenant_isolation','pag_tenant_isolation','pag_tenant_select','pag_tenant_write');
    IF sobrando > 0 THEN
        RAISE EXCEPTION 'GATE: policies antigas de tenant-only ainda presentes.';
    END IF;
END $$;
