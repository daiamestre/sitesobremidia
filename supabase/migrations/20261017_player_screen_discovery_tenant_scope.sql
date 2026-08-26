-- ============================================================================
-- MIGRATION: 20261017_player_screen_discovery_tenant_scope.sql
-- SOBRE MIDIA - PLAYER EXECUTION: SCREENS FALSAS/ORFA NO PAREAMENTO
-- ============================================================================
-- PROBLEMA COMPROVADO (probe em producao, scratch/t03_probe_screens.cjs):
--
--   A RPC get_authorized_screens_for_player() tinha o branch
--   "cargo_nome IN ('OWNER','ADMIN') -> ver TODAS as screens do banco",
--   ignorando tenant. O Dashboard (useScreens.ts) lista SOMENTE
--   user_id = usuario logado.
--
--   Resultado: o Player exibia screens que NAO existem no Dashboard:
--     - "LED Shopping Avenida"   (11111111-0000-0000-0001-000000000001)
--     - "LED Restaurante Alpha"  (11111111-0000-0000-0001-000000000002)
--     - "LED Academia Beta"      (11111111-0000-0000-0001-000000000003)
--   Fixtures sem dono (user_id NULL) e sem presenca no Dashboard.
--
-- CORRECAO MINIMA (nenhuma tabela/policy alterada):
--   Contrato de PARIDADE COM O DASHBOARD: o Player lista EXATAMENTE as
--   screens que o usuario logado ve no painel (s.user_id = auth.uid()).
--   Screens orfas/sem dono/fixtures deixam de existir para o Player.
--   NADA e apagado do banco.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_authorized_screens_for_player()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_ctx RECORD;
    v_auth_uid UUID;
    v_result JSONB;
BEGIN
    v_auth_uid := auth.uid();

    IF v_auth_uid IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'UNAUTHORIZED',
            'message', 'User not authenticated'
        );
    END IF;

    -- Extract Security and Context
    SELECT * INTO v_user_ctx FROM public.fn_get_user_security_context(v_auth_uid);

    IF v_user_ctx.status_ciclo_vida NOT IN ('ACTIVE', 'APPROVED', 'ATIVO', 'APROVADO') THEN
        RETURN jsonb_build_object(
            'status', 'DEVICE_ACCESS_DENIED',
            'message', 'User account is not active'
        );
    END IF;

    -- Build JSON list of authorized screens
    -- [FIX PARIDADE DASHBOARD] O Dashboard lista somente user_id = usuario
    -- logado (useScreens.ts .eq('user_id', userId)). O antigo bypass global
    -- OWNER/ADMIN e o escopo por empresa vazavam para o Player screens que o
    -- usuario NAO ve no painel (fixtures orfas "LED *" com user_id NULL).
    -- Regra absoluta atendida: SCREEN NAO EXISTE NO DASHBOARD -> NAO APARECE
    -- NO PAYER/PAREAMENTO.
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'custom_id', s.custom_id,
            'name', s.name,
            'is_active', s.is_active,
            'bound_device_id', s.bound_device_id
        ) ORDER BY s.name ASC
    ) INTO v_result
    FROM public.screens s
    WHERE s.user_id = v_auth_uid;

    IF v_result IS NULL THEN
        v_result := '[]'::JSONB;
    END IF;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'data', v_result
    );
END;
$$;

-- O overload delegador (jsonb) permanece intocado: repassa para esta funcao.

-- Grants preservados
GRANT EXECUTE ON FUNCTION public.get_authorized_screens_for_player() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_authorized_screens_for_player(jsonb) TO anon, authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261017', 'player_screen_discovery_tenant_scope')
ON CONFLICT (version) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
