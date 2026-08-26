-- ============================================================================
-- MIGRATION: Mover Política de Áudio da Tela (Screen) para a Playlist
-- ============================================================================

-- 1. Adicionar coluna na tabela playlists
ALTER TABLE public.playlists 
ADD COLUMN IF NOT EXISTS audio_enabled BOOLEAN NOT NULL DEFAULT false;

-- (Opcional, mas de acordo com a regra, garantimos que todos iniciam mudos,
-- o default false já cuida dos novos. E os existentes também ficarão false).

-- 2. Atualizar a RPC get_player_playlist_for_screen para ler da playlist
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
    v_is_device_revoked_for_this_screen BOOLEAN := FALSE;
BEGIN
    v_auth_uid := auth.uid();

    -- 1. Extrair Segurança e Contexto se autenticado
    IF v_auth_uid IS NOT NULL THEN
        SELECT u.empresa_operadora_id, p.nome AS cargo_nome INTO v_user_ctx
        FROM public.usuarios u
        LEFT JOIN public.perfis p ON u.perfil_id = p.id
        WHERE u.id = v_auth_uid;
    END IF;

    -- Validar que o device_id não seja nulo ou UNKNOWN
    IF p_device_id IS NULL OR trim(p_device_id) = '' OR p_device_id = 'UNKNOWN_DEVICE' OR p_device_id = 'UNKNOWN' THEN
        RETURN '{"status": "DEVICE_ACCESS_DENIED", "message": "Identidade física de hardware inválida ou não informada."}'::JSONB;
    END IF;

    -- 2. Fetch Screen (Case Insensitive for custom_id, direct match for UUID)
    SELECT * INTO v_screen 
    FROM public.screens 
    WHERE (custom_id ILIKE p_identifier OR (length(p_identifier) > 20 AND id::text = p_identifier));

    IF NOT FOUND THEN
        RETURN '{"status": "SCREEN_NOT_FOUND"}'::JSONB;
    END IF;

    IF NOT v_screen.is_active THEN
        RETURN '{"status": "SCREEN_SUSPENDED"}'::JSONB;
    END IF;

    -- 3. Screen Ownership Check (se autenticado e não for OWNER/ADMIN)
    IF v_auth_uid IS NOT NULL THEN
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
                    RETURN '{"status": "SCREEN_ACCESS_DENIED"}'::JSONB;
                END IF;
            END IF;
        END IF;
    END IF;

    -- 4. Device Binding Check com proteção contra apropriação indevida do aparelho antigo revogado
    IF v_screen.bound_device_id IS NULL THEN
        -- Verificar se p_device_id foi o dispositivo especificamente revogado desta tela
        SELECT EXISTS (
            SELECT 1 FROM public.devices 
            WHERE screen_id = v_screen.id 
              AND identity_hash = p_device_id 
              AND revoked_at IS NOT NULL
        ) INTO v_is_device_revoked_for_this_screen;

        IF v_is_device_revoked_for_this_screen THEN
            -- O aparelho antigo que volta online após desvinculação não pode reassumir a tela automaticamente
            RETURN '{"status": "DEVICE_REVOKED", "message": "O vínculo deste aparelho com esta tela foi revogado pelo administrador."}'::JSONB;
        ELSE
            -- Novo aparelho (DEVICE B) ou re-pareamento legítimo
            UPDATE public.screens SET bound_device_id = p_device_id, last_ping_at = now() WHERE id = v_screen.id;
            
            -- Registra/atualiza registro do dispositivo no banco
            IF EXISTS (SELECT 1 FROM public.devices WHERE identity_hash = p_device_id) THEN
                -- Reutiliza device existente: zera revoked_at e atualiza last_seen
                UPDATE public.devices
                SET revoked_at = NULL, last_seen = now()
                WHERE identity_hash = p_device_id;
            ELSE
                INSERT INTO public.devices (name, screen_id, identity_hash, revoked_at, last_seen)
                VALUES (COALESCE(v_screen.name, 'Player'), v_screen.id, p_device_id, NULL, now());
            END IF;
        END IF;
    ELSIF v_screen.bound_device_id = p_device_id THEN
        -- Dispositivo atualmente vinculado e autorizado
        UPDATE public.screens SET last_ping_at = now() WHERE id = v_screen.id;
    ELSE
        -- Conflito: tela ocupada por outro aparelho diferente
        RETURN '{"status": "DEVICE_ALREADY_BOUND"}'::JSONB;
    END IF;

    -- 5. Playlist Validation
    IF v_screen.playlist_id IS NULL THEN
        RETURN '{"status": "NO_PLAYLIST_ASSIGNED"}'::JSONB;
    END IF;

    SELECT * INTO v_playlist FROM public.playlists WHERE id = v_screen.playlist_id;

    IF NOT FOUND THEN
        RETURN '{"status": "PLAYLIST_NOT_FOUND"}'::JSONB;
    END IF;

    -- 6. Fetch Items & Build Payload
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
        RETURN '{"status": "PLAYLIST_EMPTY"}'::JSONB;
    END IF;

    -- 7. Return Payload (AGORA COM audio_enabled NA PLAYLIST)
    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'data', jsonb_build_object(
            'id', v_screen.id,
            'name', v_screen.name,
            'custom_id', v_screen.custom_id,
            'playlist_id', v_screen.playlist_id,
            'orientation', v_screen.orientation,
            'resolution', v_screen.resolution,
            'playlists', jsonb_build_object(
                'id', v_playlist.id,
                'name', v_playlist.name,
                'resolution', v_playlist.resolution,
                'playlist_resolution', v_playlist.resolution,
                'audio_enabled', COALESCE(v_playlist.audio_enabled, false),
                'playlist_items', v_items
            )
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_playlist_for_screen(text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
