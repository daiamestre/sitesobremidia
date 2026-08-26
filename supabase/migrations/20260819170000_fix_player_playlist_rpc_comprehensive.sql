-- ==============================================================================
-- SOBRE MÍDIA PLAYER - ZERO TRUST DEVICE BINDING & PLAYLIST RPC COMPREHENSIVE
-- Migration: 20260819170000_fix_player_playlist_rpc_comprehensive.sql
-- ==============================================================================

-- 1. FUNCTION FOR GETTING PLAYER PLAYLIST WITH ZERO TRUST & IS_ACTIVE VALIDATION
CREATE OR REPLACE FUNCTION public.get_player_playlist_for_screen(
    p_identifier TEXT,
    p_device_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_ctx RECORD;
    v_screen RECORD;
    v_playlist RECORD;
    v_items JSONB;
    v_screen_owner_empresa UUID;
    v_auth_uid UUID;
BEGIN
    -- Validar que o device_id não seja nulo ou UNKNOWN
    IF p_device_id IS NULL OR trim(p_device_id) = '' OR p_device_id = 'UNKNOWN_DEVICE' OR p_device_id = 'UNKNOWN' THEN
        RETURN '{"status": "DEVICE_ACCESS_DENIED", "message": "Identidade física de hardware inválida ou não informada."}'::JSONB;
    END IF;

    v_auth_uid := auth.uid();

    -- Validação de contexto de usuário autenticado (se aplicável)
    IF v_auth_uid IS NOT NULL THEN
        SELECT * INTO v_user_ctx FROM public.fn_get_user_security_context(v_auth_uid);
        IF v_user_ctx.status_ciclo_vida NOT IN ('ACTIVE', 'APPROVED', 'ATIVO') THEN
            RETURN '{"status": "DEVICE_ACCESS_DENIED", "message": "Usuário desativado ou ciclo de vida inválido."}'::JSONB;
        END IF;
    END IF;

    -- Localização e Lock de Concorrência da Tela
    BEGIN
        SELECT * INTO v_screen
        FROM public.screens
        WHERE id::text = p_identifier OR custom_id = p_identifier
        FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
        RETURN '{"status": "DEVICE_ALREADY_BOUND", "message": "Tela bloqueada por concorrência ativa."}'::JSONB;
    END;

    IF NOT FOUND THEN
        RETURN '{"status": "SCREEN_NOT_FOUND", "message": "Tela não encontrada."}'::JSONB;
    END IF;

    -- [ZERO TRUST P0]: Validação de Ativação / Suspensão da Tela
    IF NOT v_screen.is_active THEN
        RETURN '{"status": "SCREEN_SUSPENDED", "message": "Sistema Temporariamente Suspenso."}'::JSONB;
    END IF;

    -- Validação de Tenant / Empresa (Tenant Isolation)
    IF v_auth_uid IS NOT NULL THEN
        IF v_user_ctx.cargo_nome NOT IN ('OWNER', 'ADMIN') THEN
            SELECT empresa_operadora_id INTO v_screen_owner_empresa
            FROM public.usuarios
            WHERE id = v_screen.user_id;

            IF v_screen_owner_empresa IS NOT NULL AND v_screen_owner_empresa != v_user_ctx.empresa_operadora_id THEN
                RETURN '{"status": "SCREEN_ACCESS_DENIED", "message": "Acesso não autorizado para esta empresa/tenant."}'::JSONB;
            END IF;
        END IF;
    END IF;

    -- [DEVICE BINDING PROTOCOL]
    IF v_screen.bound_device_id IS NULL THEN
        -- Primeiro Pareamento: Vínculo Atômico
        UPDATE public.screens 
        SET bound_device_id = p_device_id, last_ping_at = now() 
        WHERE id = v_screen.id;
    ELSIF v_screen.bound_device_id = p_device_id THEN
        -- Aparelho Autorizado: Atualiza heartbeat/ping
        UPDATE public.screens 
        SET last_ping_at = now() 
        WHERE id = v_screen.id;
    ELSE
        -- Conflito de Hardware / Mismatch
        RETURN jsonb_build_object(
            'status', 'DEVICE_BINDING_MISMATCH',
            'message', 'Hardware mismatch: Tela já vinculada a outro dispositivo físico.',
            'bound_device_prefix', substring(v_screen.bound_device_id from 1 for 8)
        );
    END IF;

    -- Validação de Playlist Atribuída
    IF v_screen.playlist_id IS NULL THEN
        RETURN '{"status": "NO_PLAYLIST_ASSIGNED", "message": "Nenhuma playlist programada para esta tela."}'::JSONB;
    END IF;

    SELECT * INTO v_playlist FROM public.playlists WHERE id = v_screen.playlist_id;

    IF NOT FOUND THEN
        RETURN '{"status": "PLAYLIST_NOT_FOUND", "message": "Playlist vinculada não encontrada no banco."}'::JSONB;
    END IF;

    -- Agregação dos Itens da Playlist (Mídias e Widgets)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', pi.id,
            'position', pi.position,
            'duration', pi.duration,
            'start_time', pi.start_time,
            'end_time', pi.end_time,
            'days_of_week', pi.days,
            'media', (
                SELECT jsonb_build_object(
                    'id', m.id,
                    'name', m.name,
                    'file_url', m.file_url,
                    'file_type', m.file_type,
                    'file_hash', m.file_hash
                )
                FROM public.media m WHERE m.id = pi.media_id
            ),
            'widget', (
                SELECT jsonb_build_object(
                    'id', w.id,
                    'name', w.name,
                    'widget_type', w.widget_type,
                    'config', w.config
                )
                FROM public.widgets w WHERE w.id = pi.widget_id
            )
        ) ORDER BY pi.position ASC
    ) INTO v_items
    FROM public.playlist_items pi
    WHERE pi.playlist_id = v_playlist.id;

    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        RETURN '{"status": "PLAYLIST_EMPTY", "message": "A playlist programada não possui mídias ativas."}'::JSONB;
    END IF;

    -- Resposta Estruturada de Sucesso
    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'data', jsonb_build_object(
            'id', v_screen.id,
            'name', v_screen.name,
            'custom_id', v_screen.custom_id,
            'playlist_id', v_screen.playlist_id,
            'orientation', COALESCE(v_screen.orientation, 'landscape'),
            'resolution', COALESCE(v_screen.resolution, '16x9'),
            'playlists', jsonb_build_object(
                'id', v_playlist.id,
                'name', v_playlist.name,
                'playlist_items', v_items
            )
        )
    );
END;
$$;

-- 2. FUNCTION FOR ADMINISTRATIVE DEVICE RELEASE (UNBIND)
CREATE OR REPLACE FUNCTION public.release_screen_device(p_screen_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_ctx RECORD;
    v_screen RECORD;
    v_screen_owner_empresa UUID;
    v_auth_uid UUID;
BEGIN
    v_auth_uid := auth.uid();
    IF v_auth_uid IS NOT NULL THEN
        SELECT * INTO v_user_ctx FROM public.fn_get_user_security_context(v_auth_uid);
        IF v_user_ctx.status_ciclo_vida NOT IN ('ACTIVE', 'APPROVED', 'ATIVO') THEN RETURN FALSE; END IF;
    END IF;

    SELECT * INTO v_screen FROM public.screens WHERE id = p_screen_id;
    IF NOT FOUND THEN RETURN FALSE; END IF;

    IF v_auth_uid IS NOT NULL AND v_user_ctx.cargo_nome NOT IN ('OWNER', 'ADMIN') THEN
        SELECT empresa_operadora_id INTO v_screen_owner_empresa 
        FROM public.usuarios WHERE id = v_screen.user_id;

        IF v_screen_owner_empresa IS NOT NULL AND v_screen_owner_empresa != v_user_ctx.empresa_operadora_id THEN
            RETURN FALSE;
        END IF;
    END IF;

    UPDATE public.screens 
    SET bound_device_id = NULL, last_ping_at = now() 
    WHERE id = p_screen_id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_playlist_for_screen(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_screen_device(UUID) TO authenticated, service_role;
