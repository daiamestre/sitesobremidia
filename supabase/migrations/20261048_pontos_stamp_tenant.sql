-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261048
-- Selo server-side de tenant em public.pontos (INSERT)
--
-- Complementa 20261047: a coluna pontos.empresa_operadora_id é NOT NULL
-- sem default e o cliente comercial não envia tenant no payload. Sem o
-- selo, o WITH_CHECK da policy avaliaria NULL = tenant → falso → 42501.
--
-- Padrão seguro: BEFORE ROW trigger usa o HELPER OFICIAL do servidor
-- (get_user_empresa_operadora_id(auth.uid())) para estampar o tenant;
-- anon/sem-tenant permanece NULL → policy nega (nenhum bypass criado).
-- RLS é avaliado APÓS os triggers BEFORE, portanto a policy
-- pontos_representante_insert passa a validar corretamente.
-- ======================================================================

CREATE OR REPLACE FUNCTION public.fn_pontos_stamp_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.empresa_operadora_id IS NULL THEN
        NEW.empresa_operadora_id := public.get_user_empresa_operadora_id(auth.uid());
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pontos_stamp_tenant ON public.pontos;
CREATE TRIGGER trg_pontos_stamp_tenant
    BEFORE INSERT ON public.pontos
    FOR EACH ROW EXECUTE FUNCTION public.fn_pontos_stamp_tenant();

-- GATE: trigger registrado
DO $$
DECLARE n INT;
BEGIN
    SELECT COUNT(*) INTO n FROM pg_trigger
    WHERE tgrelid = 'public.pontos'::regclass AND tgname = 'trg_pontos_stamp_tenant' AND NOT tgisinternal;
    IF n <> 1 THEN RAISE EXCEPTION 'GATE: trg_pontos_stamp_tenant ausente.'; END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261048','pontos_stamp_tenant_trigger','{}')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

NOTIFY pgrst, 'reload schema';
