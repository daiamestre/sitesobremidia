-- Migration: 20261010_create_universal_binding_rpcs.sql

-- ============================================================================
-- 1. SCREEN DISCOVERY (ZERO TRUST AUTHENTICATED RPC)
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_authorized_screens_for_player();
DROP FUNCTION IF EXISTS public.get_authorized_screens_for_player(jsonb);

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
    WHERE (
        -- 1. Global Admins and Owners can see all screens
        v_user_ctx.cargo_nome IN ('OWNER', 'ADMIN')
        OR
        -- 2. Direct creator/owner of the screen
        s.user_id = v_auth_uid
        OR
        -- 3. Screen belongs to user's empresa_operadora
        (v_user_ctx.empresa_operadora_id IS NOT NULL AND (
            s.empresa_operadora_id = v_user_ctx.empresa_operadora_id
            OR
            s.user_id IN (
                SELECT id FROM public.usuarios WHERE empresa_operadora_id = v_user_ctx.empresa_operadora_id
            )
        ))
    );

    IF v_result IS NULL THEN
        v_result := '[]'::JSONB;
    END IF;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'data', v_result
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_authorized_screens_for_player(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.get_authorized_screens_for_player();
END;
$$;

-- ============================================================================
-- 2. SCREEN UNPAIRING (ATOMIC DISCONNECT)
-- ============================================================================
DROP FUNCTION IF EXISTS public.player_unpair_screen(text, text);
DROP FUNCTION IF EXISTS public.player_unpair_screen(text, uuid);
DROP FUNCTION IF EXISTS public.player_unpair_screen(jsonb);

CREATE OR REPLACE FUNCTION public.player_unpair_screen(
    p_screen_id text,
    p_device_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_screen_uuid UUID;
    v_user_ctx RECORD;
    v_auth_uid UUID;
    v_screen_owner_empresa UUID;
    v_screen RECORD;
BEGIN
    v_auth_uid := auth.uid();
    
    IF v_auth_uid IS NULL THEN
        RETURN jsonb_build_object('status', 'UNAUTHORIZED');
    END IF;

    IF p_device_id IS NULL OR trim(p_device_id) = '' THEN
        RETURN jsonb_build_object('status', 'INVALID_DEVICE_ID');
    END IF;

    BEGIN
        v_screen_uuid := p_screen_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        SELECT id INTO v_screen_uuid FROM public.screens WHERE custom_id = p_screen_id LIMIT 1;
    END;

    IF v_screen_uuid IS NULL THEN
        RETURN jsonb_build_object('status', 'SCREEN_NOT_FOUND');
    END IF;

    SELECT * INTO v_screen FROM public.screens WHERE id = v_screen_uuid FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'SCREEN_NOT_FOUND');
    END IF;

    -- Security check via fn_get_user_security_context
    SELECT * INTO v_user_ctx FROM public.fn_get_user_security_context(v_auth_uid);

    IF v_user_ctx.cargo_nome NOT IN ('OWNER', 'ADMIN') THEN
        IF v_screen.user_id = v_auth_uid THEN
            NULL;
        ELSIF v_screen.empresa_operadora_id IS NOT NULL AND v_screen.empresa_operadora_id = v_user_ctx.empresa_operadora_id THEN
            NULL;
        ELSE
            SELECT empresa_operadora_id INTO v_screen_owner_empresa
            FROM public.usuarios
            WHERE id = v_screen.user_id;

            IF v_screen_owner_empresa IS NOT NULL AND v_screen_owner_empresa != v_user_ctx.empresa_operadora_id THEN
                RETURN jsonb_build_object('status', 'SCREEN_ACCESS_DENIED');
            END IF;
        END IF;
    END IF;

    IF v_screen.bound_device_id = p_device_id THEN
        UPDATE public.screens SET bound_device_id = NULL WHERE id = v_screen.id;
        RETURN jsonb_build_object('status', 'SUCCESS');
    ELSIF v_screen.bound_device_id IS NULL THEN
        RETURN jsonb_build_object('status', 'SUCCESS');
    ELSE
        RETURN jsonb_build_object('status', 'DEVICE_MISMATCH');
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.player_unpair_screen(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_device_id TEXT;
    v_screen_id TEXT;
BEGIN
    v_device_id := COALESCE(payload->>'p_device_id', payload->>'device_id', payload->>'deviceId');
    v_screen_id := COALESCE(payload->>'p_screen_id', payload->>'screen_id', payload->>'screenId');
    RETURN public.player_unpair_screen(v_screen_id, v_device_id);
END;
$$;

-- Permissions & Grants
GRANT EXECUTE ON FUNCTION public.get_authorized_screens_for_player() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_authorized_screens_for_player(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.player_unpair_screen(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.player_unpair_screen(jsonb) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
