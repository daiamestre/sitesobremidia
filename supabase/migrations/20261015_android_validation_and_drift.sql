-- ============================================================================
-- MIGRATION: 20261015_android_validation_and_drift.sql
-- SOBRE MIDIA - TAREFA 02: VALIDACAO ANDROID + RECONCILIACAO DE DRIFT
-- ============================================================================
-- Escopo minimo (nenhuma tabela/policy/trigger alterada):
--
--   FIX D - fn_device_revoke: removida referencia a coluna inexistente
--     devices.status ("SET status='revoked'") que fazia TODA revogacao
--     administrativa falhar com 42703 em producao. Prova: chamada real
--     retornou {"code":"42703","message":"column \"status\" of relation
--     \"devices\" does not exist"} antes desta correcao.
--
--   FIX E - fn_player_report_telemetry: screens.last_ip nao existe; a coluna
--     correta e screens.ip_address. Telemetria do Player falhava com
--     'column "last_ip" does not exist' em cada ciclo.
--
--   FIX F - get_player_playlist_for_screen(text,text), apenas no branch
--     "bound" (device ja vinculado):
--       F) dispositivo REALMENTE revogado (revoked_at IS NOT NULL, setavel
--          exclusivamente via fn_device_revoke) perde acesso operacional a
--          playlist. UNPAIR permanece intocado (nao seta revoked_at).
--       G) frescor do device atualizado a cada poll de playlist
--          (last_seen/last_heartbeat), dando base server-side para
--          online/offline sem depender de mudanca no app Android.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- FIX D - fn_device_revoke operante (sem coluna inexistente)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_device_revoke(p_device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_device public.devices%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_device FROM public.devices WHERE id = p_device_id LIMIT 1;
  IF v_device.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_not_found');
  END IF;

  IF NOT public.fn_player_can_access_screen(v_device.screen_id)
     AND NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'denied');
  END IF;

  UPDATE public.devices SET revoked_at = now()
  WHERE id = p_device_id;

  RETURN jsonb_build_object('ok', true, 'device_id', p_device_id::text);
END;
$function$;

-- ----------------------------------------------------------------------------
-- FIX E - telemetria operante (coluna correta screens.ip_address)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_player_report_telemetry(p_screen_id uuid, p_cpu_usage numeric DEFAULT NULL::numeric, p_memory_usage numeric DEFAULT NULL::numeric, p_temp_celsius numeric DEFAULT NULL::numeric, p_storage_free_mb bigint DEFAULT NULL::bigint, p_versao_app text DEFAULT NULL::text, p_ip_address text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    DECLARE
      v_uid uuid := auth.uid();
      v_screen public.screens%ROWTYPE;
      v_player uuid;
      v_tenant uuid;
    BEGIN
      SELECT * INTO v_screen FROM public.screens WHERE id = p_screen_id LIMIT 1;
      IF v_screen.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'screen_not_found');
      END IF;

      -- Update last ping and metrics directly on screens
      UPDATE public.screens
      SET last_ping_at = now(),
          ip_address = COALESCE(p_ip_address, ip_address)
      WHERE id = p_screen_id;

      -- Insert into heartbeats safely
      BEGIN
        INSERT INTO public.player_heartbeats (
          screen_id, ip_address,
          cpu_usage, memory_usage, temp_celsius, storage_free_mb,
          versao_app, status_ping, ping_at
        ) VALUES (
          p_screen_id, p_ip_address,
          p_cpu_usage, p_memory_usage, p_temp_celsius, p_storage_free_mb,
          p_versao_app, 'ONLINE', now()
        );
      EXCEPTION WHEN OTHERS THEN
        -- Non critical log failure
        NULL;
      END;

      RETURN jsonb_build_object('ok', true);
    END;
    $function$;

-- ----------------------------------------------------------------------------
-- FIX F - get_player_playlist_for_screen(text,text): apenas o branch "bound"
--   F) dispositivo REALMENTE revogado perde acesso operacional a playlist
--      (a mensagem oficial de revogacao passa a aparecer tambem neste cenario)
--   G) frescor do device (last_seen/last_heartbeat) atualizado a cada poll
-- UNPAIR permanece intocado: desvincular nunca seta revoked_at.
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
BEGIN
    v_auth_uid := auth.uid();

    -- 1. Extrair Seguranca e Contexto se autenticado
    IF v_auth_uid IS NOT NULL THEN
        SELECT u.empresa_operadora_id, p.nome AS cargo_nome INTO v_user_ctx
        FROM public.usuarios u
        LEFT JOIN public.perfis p ON u.perfil_id = p.id
        WHERE u.id = v_auth_uid;
    END IF;

    -- Validar que o device_id nao seja nulo ou UNKNOWN
    IF p_device_id IS NULL OR trim(p_device_id) = '' OR p_device_id = 'UNKNOWN_DEVICE' OR p_device_id = 'UNKNOWN' THEN
        RETURN '{"status": "DEVICE_ACCESS_DENIED", "message": "Identidade fisica de hardware invalida ou nao informada."}'::JSONB;
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

    -- 3. Screen Ownership Check (se autenticado e nao for OWNER/ADMIN)
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

    -- 4. Device Binding Check
    IF v_screen.bound_device_id IS NULL THEN
        -- Protecao contra apropriacao por dispositivo REALMENTE revogado
        -- (checagem GLOBAL: revogado nao pode parear em nenhuma tela).
        IF EXISTS (
            SELECT 1 FROM public.devices
            WHERE identity_hash = p_device_id
              AND revoked_at IS NOT NULL
        ) THEN
            RETURN '{"status": "DEVICE_REVOKED", "message": "O vinculo deste aparelho com esta tela foi revogado pelo administrador."}'::JSONB;
        END IF;

        -- EXCLUSIVIDADE: um device NAO pode ficar simultaneamente vinculado
        -- a duas Screens. Serializa operacoes concorrentes do mesmo aparelho
        -- (evita double-claim por corrida entre chamadas paralelas).
        PERFORM pg_advisory_xact_lock(hashtext('sobremidia:device:' || p_device_id));

        IF EXISTS (
            SELECT 1 FROM public.screens
            WHERE bound_device_id = p_device_id
              AND id <> v_screen.id
        ) THEN
            RETURN '{"status": "DEVICE_ALREADY_BOUND", "message": "Este aparelho ja esta vinculado a outra tela. Desvincule-o antes de parear em uma nova tela."}'::JSONB;
        END IF;

        -- Auto-claim da tela livre pelo aparelho solicitante
        UPDATE public.screens SET bound_device_id = p_device_id, last_ping_at = now() WHERE id = v_screen.id;

        -- 1 identity_hash = 1 registro: reuso global, nunca INSERT duplicado
        IF EXISTS (SELECT 1 FROM public.devices WHERE identity_hash = p_device_id) THEN
            -- Reaproveita o registro existente e aponta para a tela atual
            -- (mantem devices.screen_id em sincronia com screens.bound_device_id).
            -- revoked_at NAO e alterado aqui (ja passou pela guarda acima).
            UPDATE public.devices
            SET screen_id = v_screen.id, last_seen = now()
            WHERE identity_hash = p_device_id;
        ELSE
            INSERT INTO public.devices (name, screen_id, identity_hash, revoked_at, last_seen)
            VALUES (COALESCE(v_screen.name, 'Player'), v_screen.id, p_device_id, NULL, now());
        END IF;
    ELSIF v_screen.bound_device_id = p_device_id THEN
        -- FIX F: dispositivo REALMENTE revogado perde acesso operacional,
        -- mesmo estando ainda vinculado a esta tela.
        IF EXISTS (
            SELECT 1 FROM public.devices
            WHERE identity_hash = p_device_id
              AND revoked_at IS NOT NULL
        ) THEN
            RETURN '{"status": "DEVICE_REVOKED", "message": "O vinculo deste aparelho com esta tela foi revogado pelo administrador."}'::JSONB;
        END IF;

        -- FIX F: frescor do device acompanhando cada poll de playlist
        UPDATE public.devices
        SET last_seen = now(), last_heartbeat = now()
        WHERE identity_hash = p_device_id;

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

    -- 7. Return Payload garantindo playlists.audio_enabled como autoridade
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

-- ----------------------------------------------------------------------------
-- GRANTS (preservam os contratos existentes)
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.fn_device_revoke(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_player_report_telemetry(uuid, numeric, numeric, numeric, bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_playlist_for_screen(text, text) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Registro da migration
-- ----------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261015', 'android_validation_and_drift')
ON CONFLICT (version) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';

