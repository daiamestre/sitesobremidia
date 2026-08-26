-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261047
-- CENTRAL DE PROSPECÇÃO: INSERT de PONTO PARCEIRO pelo REPRESENTANTE
--
-- Causa raiz auditada (E2E prospeccao_rep.spec PONTO PARCEIRO): o wizard
-- grava via INSERT direto em public.pontos (prospeccao.service.ts), porém a
-- única policy de INSERT era pontos_interno_insert (is_internal_role()).
-- Representante legítimo recebia 42501 "new row violates row-level
-- security policy" — o cadastro comercial ficava impossível.
--
-- Correção ADITIVA, sem backdoor:
--   * REPRESENTANTE autenticado pode inserir ponto APENAS no próprio
--     tenant e apenas se possuir registro ativo em representantes;
--   * código público EST- permanece gerado server-side pelo trigger
--     trg_pontos_codigo_publico (nenhum cliente escolhe código);
--   * OWNER/ADMIN/INTERNAL mantêm a policy existente intocada.
-- ======================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='pontos' AND policyname='pontos_representante_insert'
    ) THEN
        CREATE POLICY pontos_representante_insert ON public.pontos
            FOR INSERT TO authenticated
            WITH CHECK (
                empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                AND EXISTS (
                    SELECT 1
                    FROM public.representantes r
                    WHERE r.usuario_id = auth.uid()
                      AND r.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                      AND r.ativo
                )
            );
    END IF;
END $$;

-- GATE: policy precisa estar registrada
DO $$
DECLARE n INT;
BEGIN
    SELECT COUNT(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename='pontos' AND policyname='pontos_representante_insert';
    IF n <> 1 THEN RAISE EXCEPTION 'GATE: pontos_representante_insert ausente.'; END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261047','pontos_representante_insert_policy','{}')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

NOTIFY pgrst, 'reload schema';
