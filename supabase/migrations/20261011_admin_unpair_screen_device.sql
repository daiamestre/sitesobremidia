-- ============================================================================
-- MIGRATION: 20261011_admin_unpair_screen_device.sql
-- SOBRE MÍDIA — DESVINCULAÇÃO SEGURA DE DISPOSITIVO / LIBERAÇÃO DE TELA
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND remote_commands_command_check TO ALLOW 'unpair'
-- ----------------------------------------------------------------------------
ALTER TABLE public.remote_commands DROP CONSTRAINT IF EXISTS remote_commands_command_check;
ALTER TABLE public.remote_commands ADD CONSTRAINT remote_commands_command_check 
CHECK (command = ANY (ARRAY[
    'reload'::text, 
    'reboot'::text, 
    'screenshot'::text, 
    'take_screenshot'::text, 
    'sync'::text, 
    'rotate_portrait'::text, 
    'rotate_landscape'::text,
    'unpair'::text
]));

-- ----------------------------------------------------------------------------
-- 2. FIX TRIGGER RECURSION GUARD ON devices
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_device_timeout()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  UPDATE public.devices
  SET is_online = false
  WHERE last_heartbeat < now() - interval '2 minutes'
    AND is_online = true;
  RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. DROP EXISTING OVERLOADS
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_unpair_screen();
DROP FUNCTION IF EXISTS public.admin_unpair_screen(uuid);
DROP FUNCTION IF EXISTS public.admin_unpair_screen(text);
DROP FUNCTION IF EXISTS public.admin_unpair_screen(text, text);
DROP FUNCTION IF EXISTS public.admin_unpair_screen(jsonb);

-- ----------------------------------------------------------------------------
-- 4. PRIMARY RPC: admin_unpair_screen(p_screen_id text)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_unpair_screen(
    p_screen_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uuid UUID;
    v_user_ctx RECORD;
    v_auth_uid UUID;
    v_screen_owner_empresa UUID;
    v_screen RECORD;
    v_old_device_id TEXT;
BEGIN
    v_auth_uid := auth.uid();
    
    -- 1. Validação de Autenticação
    IF v_auth_uid IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'UNAUTHORIZED',
            'message', 'Usuário não autenticado.'
        );
    END IF;

    IF p_screen_id IS NULL OR trim(p_screen_id) = '' THEN
        RETURN jsonb_build_object(
            'status', 'INVALID_SCREEN_ID',
            'message', 'ID da tela não informado.'
        );
    END IF;

    -- 2. Resolver UUID da tela (por UUID nativo ou custom_id)
    BEGIN
        v_uuid := p_screen_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        SELECT id INTO v_uuid FROM public.screens WHERE custom_id ILIKE p_screen_id LIMIT 1;
    END;

    IF v_uuid IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'SCREEN_NOT_FOUND',
            'message', 'Tela não encontrada.'
        );
    END IF;

    -- 3. Lock transacional na linha da tela (Concorrência Segura)
    SELECT * INTO v_screen 
    FROM public.screens 
    WHERE id = v_uuid 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'SCREEN_NOT_FOUND',
            'message', 'Tela não encontrada no banco de dados.'
        );
    END IF;

    -- 4. Validação Multi-Tenant & RBAC via fn_get_user_security_context
    SELECT * INTO v_user_ctx FROM public.fn_get_user_security_context(v_auth_uid);

    IF v_user_ctx.cargo_nome NOT IN ('OWNER', 'ADMIN') THEN
        IF v_screen.user_id = v_auth_uid THEN
            NULL; -- Criador direto da tela
        ELSIF v_screen.empresa_operadora_id IS NOT NULL AND v_screen.empresa_operadora_id = v_user_ctx.empresa_operadora_id THEN
            NULL; -- Mesma empresa operadora
        ELSE
            SELECT empresa_operadora_id INTO v_screen_owner_empresa
            FROM public.usuarios
            WHERE id = v_screen.user_id;

            IF v_screen_owner_empresa IS NOT NULL AND v_screen_owner_empresa != v_user_ctx.empresa_operadora_id THEN
                RETURN jsonb_build_object(
                    'status', 'SCREEN_ACCESS_DENIED',
                    'message', 'Sem permissão para gerenciar telas de outra organização.'
                );
            END IF;
        END IF;
    END IF;

    -- 5. Capturar bound_device_id antigo ANTES de liberar a tela
    v_old_device_id := v_screen.bound_device_id;

    -- 6. Revogar vínculo atômico na tabela screens
    UPDATE public.screens 
    SET bound_device_id = NULL
    WHERE id = v_screen.id;

    -- 7. Registrar registro em public.devices no escopo desta tela.
    -- ZERAR revoked_at - dispositivo permanece elegível para novo pareamento.
    -- A revogação administrativa real é feita exclusivamente via fn_device_revoke.
    IF v_old_device_id IS NOT NULL AND trim(v_old_device_id) != '' THEN
        IF EXISTS (SELECT 1 FROM public.devices WHERE identity_hash = v_old_device_id) THEN
                -- Reutiliza device existente: zera revoked_at e atualiza last_seen
                UPDATE public.devices
                SET last_seen = now(), revoked_at = NULL
                WHERE identity_hash = v_old_device_id;
            ELSE
                INSERT INTO public.devices (name, screen_id, identity_hash, revoked_at, last_seen)
                VALUES (COALESCE(v_screen.name, 'Player'), v_screen.id, v_old_device_id, NULL, now());
            END IF;
    END IF;

    -- 8. Emitir comando remoto Realtime direcionado especificamente ao dispositivo antigo
    IF v_old_device_id IS NOT NULL AND trim(v_old_device_id) != '' THEN
        INSERT INTO public.remote_commands (
            screen_id,
            command,
            status,
            payload,
            created_at
        ) VALUES (
            v_screen.id,
            'unpair',
            'pending',
            jsonb_build_object(
                'target_device_id', v_old_device_id,
                'reason', 'ADMIN_UNPAIR',
                'revoked_by', v_auth_uid,
                'screen_id', v_screen.id,
                'timestamp', now()
            ),
            now()
        );
    END IF;

    -- 9. Auditoria
    BEGIN
        INSERT INTO public.system_events (
            event_type,
            screen_id,
            user_id,
            payload,
            created_at
        ) VALUES (
            'SCREEN_DEVICE_UNBOUND',
            v_screen.id,
            v_auth_uid,
            jsonb_build_object(
                'previous_device_id', v_old_device_id,
                'screen_name', v_screen.name,
                'custom_id', v_screen.custom_id,
                'unpaired_by_email', v_user_ctx.email
            ),
            now()
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 10. Retorno com sucesso e integridade preservada
    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'message', 'Dispositivo desvinculado com sucesso. A tela e sua playlist permanecem ativas e disponíveis para novo pareamento.',
        'screen_id', v_screen.id,
        'screen_name', v_screen.name,
        'custom_id', v_screen.custom_id,
        'playlist_id', v_screen.playlist_id,
        'previous_device_id', v_old_device_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. UPDATE get_player_playlist_for_screen
-- ----------------------------------------------------------------------------
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
            -- Usa identity_hash para reutilizar device existente (não criar novo)
            -- Verifica se identity_hash já existe em qualquer device (não só esta tela)
            IF EXISTS (SELECT 1 FROM public.devices WHERE identity_hash = p_device_id) THEN
                -- Reutiliza device existente: atualiza screen_id e zera revoked_at
                UPDATE public.devices
                SET screen_id = v_screen.id, revoked_at = NULL, last_seen = now()
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

    -- 7. Return Payload
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
                'playlist_items', v_items
            )
        )
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.admin_unpair_screen(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_player_playlist_for_screen(text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
