-- ============================================================================
-- MIGRATION: 20261014_pairing_state_recovery.sql
-- SOBRE MIDIA - RECUPERACAO DO ESTADO REAL DO PAREAMENTO
-- ============================================================================
-- Contexto (Tarefa 01 - pairing-state-recovery):
-- O banco vivo divergiu dos arquivos de migration em pontos que quebravam
-- o ciclo DEVICE -> PAREAR -> USAR -> ONLINE -> DESVINCULAR -> LIBERAR ->
-- PAREAR NOVAMENTE EM QUALQUER SCREEN:
--
--   BUG A (admin_unpair_screen vivo): fazia `SET revoked_at = now()` ao
--     desvincular - transformava UNPAIR em REVOKE (violacao direta da regra
--     "UNPAIR != REVOKE"). Evidencia: devices bb7ba7ba... e a7675daa...
--     com revoked_at exatamente igual ao timestamp de comandos ADMIN_UNPAIR.
--
--   BUG B (get_player_playlist_for_screen vivo): reutilizacao do device so
--     quando o registro ja apontava para a MESMA tela
--     (`WHERE screen_id = v_screen.id AND identity_hash = ...`). Ao parear
--     noutra tela caia no INSERT e violava idx_devices_identity_hash_unique
--     -> "duplicate key value violates unique constraint".
--
--   BUG C (fn_device_bind / fn_device_attest vivos): referenciavam colunas
--     `devices.status` e `devices.registered_at` que NAO existem na tabela
--     viva -> toda chamada falhava com 42703 (bind novo, rotacao e attest).
--
-- Regras de negocio respeitadas (DEFINITIVAS):
--   * UNPAIR != REVOKE. Desvincular NAO preenche revoked_at (e tambem NAO
--     limpa uma revogacao administrativa real pre-existente).
--   * 1 identity_hash = 1 registro em public.devices (constraint UNIQUE
--     idx_devices_identity_hash_unique preservada - nada e removido).
--   * Device realmente revogado NAO pode parear em nenhuma tela.
--   * Um device nao pode ficar simultaneamente vinculado a duas Screens.
--
-- Escopo: CREATE OR REPLACE FUNCTION apenas. Nenhuma tabela, coluna,
-- policy RLS, trigger ou grant estrutural e criado/removido.
-- Idempotente: pode ser reaplicada sem dano.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- FIX A - admin_unpair_screen: UNPAIR nao toca em revoked_at
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_unpair_screen();
DROP FUNCTION IF EXISTS public.admin_unpair_screen(uuid);
DROP FUNCTION IF EXISTS public.admin_unpair_screen(text, text);
DROP FUNCTION IF EXISTS public.admin_unpair_screen(jsonb);

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

    -- 1. Validacao de Autenticacao
    IF v_auth_uid IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'UNAUTHORIZED',
            'message', 'Usuario nao autenticado.'
        );
    END IF;

    IF p_screen_id IS NULL OR trim(p_screen_id) = '' THEN
        RETURN jsonb_build_object(
            'status', 'INVALID_SCREEN_ID',
            'message', 'ID da tela nao informado.'
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
            'message', 'Tela nao encontrada.'
        );
    END IF;

    -- 3. Lock transacional na linha da tela (Concorrencia Segura)
    SELECT * INTO v_screen
    FROM public.screens
    WHERE id = v_uuid
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'SCREEN_NOT_FOUND',
            'message', 'Tela nao encontrada no banco de dados.'
        );
    END IF;

    -- 4. Validacao Multi-Tenant & RBAC via fn_get_user_security_context
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
                    'message', 'Sem permissao para gerenciar telas de outra organizacao.'
                );
            END IF;
        END IF;
    END IF;

    -- 5. Capturar bound_device_id antigo ANTES de liberar a tela
    v_old_device_id := v_screen.bound_device_id;

    -- 6. Liberar o vinculo na tabela screens
    UPDATE public.screens
    SET bound_device_id = NULL
    WHERE id = v_screen.id;

    -- 7. Manter o registro do device em public.devices SEM alterar
    --    revoked_at (UNPAIR != REVOKE):
    --      - NAO preenche revoked_at (nunca bane por desvincular);
    --      - NAO limpa revoked_at pre-existente (revogacao real so e
    --        revertida por acao administrativa explicita).
    IF v_old_device_id IS NOT NULL AND trim(v_old_device_id) != '' THEN
        IF EXISTS (SELECT 1 FROM public.devices WHERE identity_hash = v_old_device_id) THEN
            UPDATE public.devices
            SET last_seen = now()
            WHERE identity_hash = v_old_device_id;
        ELSE
            INSERT INTO public.devices (name, screen_id, identity_hash, revoked_at, last_seen)
            VALUES (COALESCE(v_screen.name, 'Player'), v_screen.id, v_old_device_id, NULL, now());
        END IF;
    END IF;

    -- 8. Emitir comando remoto Realtime direcionado ao dispositivo antigo
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

    -- 9. Auditoria (tolerante a schema de auditoria ausente)
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
        'message', 'Dispositivo desvinculado com sucesso. A tela e sua playlist permanecem ativas e disponiveis para novo pareamento.',
        'screen_id', v_screen.id,
        'screen_name', v_screen.name,
        'custom_id', v_screen.custom_id,
        'playlist_id', v_screen.playlist_id,
        'previous_device_id', v_old_device_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- FIX B - get_player_playlist_for_screen(text, text):
--   * reuso GLOBAL por identity_hash (elimina duplicate key entre telas);
--   * sincroniza devices.screen_id com a tela assumida (mantem
--     fn_device_attest consistente apos troca de tela);
--   * guarda DEVICE_REVOKED GLOBAL (revogado nao pareia em tela nenhuma);
--   * nunca limpa revoked_at no reuso (revogacao so reverte por admin).
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
-- FIX C1 - fn_device_bind: compativel com o schema VIVO de devices
--   * sem colunas status/registered_at no INSERT;
--   * name NOT NULL recebe o nome da tela (COALESCE 'Player');
--   * resposta mantem contrato: ok / device_id / status / screen_id.
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fn_device_bind(text, uuid);
CREATE OR REPLACE FUNCTION public.fn_device_bind(
  p_identity_hash text,
  p_screen_id uuid,
  p_model text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.devices%ROWTYPE;
  v_device public.devices%ROWTYPE;
  v_screen_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_identity_hash IS NULL OR length(p_identity_hash) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_identity');
  END IF;
  IF NOT public.fn_player_can_access_screen(p_screen_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'screen_denied');
  END IF;

  SELECT name INTO v_screen_name FROM public.screens WHERE id = p_screen_id;

  SELECT * INTO v_existing FROM public.devices WHERE identity_hash = p_identity_hash LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.revoked_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'device_revoked');
    END IF;
    IF v_existing.screen_id IS DISTINCT FROM p_screen_id THEN
      -- ROTACAO: re-vinculacao permitida apenas se o chamador tambem tiver
      -- acesso a tela original (mesmo tenant) - impede roubo de identidade.
      IF v_existing.screen_id IS NOT NULL AND NOT public.fn_player_can_access_screen(v_existing.screen_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'device_bound_other_tenant');
      END IF;
      UPDATE public.devices
        SET screen_id = p_screen_id, last_seen = now(),
            model = COALESCE(p_model, model), activated_at = now()
      WHERE id = v_existing.id
      RETURNING * INTO v_device;
    ELSE
      UPDATE public.devices
        SET last_seen = now(), model = COALESCE(p_model, model)
      WHERE id = v_existing.id
      RETURNING * INTO v_device;
    END IF;
  ELSE
    INSERT INTO public.devices (name, screen_id, identity_hash, model, activated_at, last_seen)
    VALUES (COALESCE(v_screen_name, 'Player'), p_screen_id, p_identity_hash, p_model, now(), now())
    RETURNING * INTO v_device;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'device_id', v_device.id::text,
    'status', 'registered',
    'screen_id', v_device.screen_id::text
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- FIX C2 - fn_device_attest: remove referencia a coluna inexistente
-- devices.status que derrubava TODA attestacao com erro 42703.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_device_attest(
  p_identity_hash text,
  p_screen_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_device public.devices%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF NOT public.fn_player_can_access_screen(p_screen_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'screen_denied');
  END IF;

  SELECT * INTO v_device FROM public.devices WHERE identity_hash = p_identity_hash LIMIT 1;

  IF v_device.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_not_registered');
  END IF;
  IF v_device.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_revoked');
  END IF;
  IF v_device.screen_id IS DISTINCT FROM p_screen_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_bound_other_screen');
  END IF;

  UPDATE public.devices SET last_seen = now(), last_heartbeat = now()
  WHERE id = v_device.id;

  RETURN jsonb_build_object(
    'ok', true,
    'device_id', v_device.id::text,
    'status', 'registered'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- GRANTS (preserva os contratos de acesso existentes; nada novo e aberto)
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.admin_unpair_screen(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_player_playlist_for_screen(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_device_bind(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_device_attest(text, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Registro da migration (best effort; tabela pode nao existir em outros envs)
-- ----------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261014', 'pairing_state_recovery')
ON CONFLICT (version) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';

