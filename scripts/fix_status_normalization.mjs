import fs from 'fs';
import path from 'path';
import os from 'os';

async function updateSecurityCheck() {
    const tokenFile = path.join(os.tmpdir(), 'sb_token2.tmp');
    const token = fs.readFileSync(tokenFile, 'utf-8').trim();

    const sql = `
    -- 1. UPDATE fn_get_user_security_context TO NORMALIZE STATUS TO 'ACTIVE'
    CREATE OR REPLACE FUNCTION public.fn_get_user_security_context(p_user_id UUID DEFAULT auth.uid())
    RETURNS TABLE(status_ciclo_vida VARCHAR, cargo_nome VARCHAR, empresa_operadora_id UUID)
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        CASE 
          WHEN UPPER(COALESCE(u.status, '')) IN ('ACTIVE', 'APPROVED', 'ATIVO', 'APROVADO') OR u.ativo = true THEN 'ACTIVE'::VARCHAR
          ELSE 'INACTIVE'::VARCHAR
        END AS status_ciclo_vida, 
        COALESCE(p.nome, CASE WHEN u.is_owner = true THEN 'OWNER' ELSE 'USER' END)::VARCHAR AS cargo_nome, 
        u.empresa_operadora_id
      FROM public.usuarios u
      LEFT JOIN public.perfis p ON u.perfil_id = p.id
      WHERE u.id = p_user_id;
    END;
    $$;

    -- 2. UPDATE get_player_playlist_for_screen
    CREATE OR REPLACE FUNCTION public.get_player_playlist_for_screen(
        p_device_id TEXT,
        p_identifier TEXT
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

        -- 1. Extrair Segurança e Contexto se autenticado
        IF v_auth_uid IS NOT NULL THEN
            SELECT * INTO v_user_ctx FROM public.fn_get_user_security_context(v_auth_uid);
            IF v_user_ctx.status_ciclo_vida NOT IN ('ACTIVE', 'APPROVED', 'ATIVO', 'APROVADO') THEN
                RETURN '{"status": "DEVICE_ACCESS_DENIED"}'::JSONB;
            END IF;
        END IF;

        -- 2. Localizar Screen com LOCK (Evita Race Condition)
        BEGIN
            SELECT * INTO v_screen 
            FROM public.screens 
            WHERE id::text = p_identifier OR custom_id = p_identifier
            FOR UPDATE NOWAIT;
        EXCEPTION WHEN lock_not_available THEN
            RETURN '{"status": "DEVICE_ALREADY_BOUND"}'::JSONB;
        END;

        IF NOT FOUND THEN
            RETURN '{"status": "SCREEN_NOT_FOUND"}'::JSONB;
        END IF;

        -- 3. Screen Ownership Check (se autenticado e não for OWNER/ADMIN)
        IF v_auth_uid IS NOT NULL AND v_user_ctx.cargo_nome NOT IN ('OWNER', 'ADMIN') THEN
            SELECT empresa_operadora_id INTO v_screen_owner_empresa 
            FROM public.usuarios 
            WHERE id = v_screen.user_id;

            IF v_screen_owner_empresa IS NOT NULL AND v_screen_owner_empresa != v_user_ctx.empresa_operadora_id THEN
                RETURN '{"status": "SCREEN_ACCESS_DENIED"}'::JSONB;
            END IF;
        END IF;

        -- 4. Device Binding Check
        IF v_screen.bound_device_id IS NULL THEN
            UPDATE public.screens SET bound_device_id = p_device_id, last_ping_at = now() WHERE id = v_screen.id;
        ELSIF v_screen.bound_device_id = p_device_id THEN
            UPDATE public.screens SET last_ping_at = now() WHERE id = v_screen.id;
        ELSE
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
                'medias', (
                    SELECT jsonb_build_object(
                        'id', m.id,
                        'name', m.name,
                        'file_url', m.file_url,
                        'file_type', m.file_type
                    )
                    FROM public.midias m WHERE m.id = pi.media_id
                ),
                'widgets', (
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
                    'playlist_items', v_items
                )
            )
        );
    END;
    $$;

    -- 3. JSONB OVERLOAD
    CREATE OR REPLACE FUNCTION public.get_player_playlist_for_screen(payload JSONB)
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    DECLARE
        v_device_id TEXT;
        v_identifier TEXT;
    BEGIN
        v_device_id := COALESCE(payload->>'p_device_id', payload->>'device_id', payload->>'deviceId');
        v_identifier := COALESCE(payload->>'p_identifier', payload->>'identifier', payload->>'screen_id', payload->>'id');
        RETURN public.get_player_playlist_for_screen(v_device_id, v_identifier);
    END;
    $$;

    GRANT EXECUTE ON FUNCTION public.get_player_playlist_for_screen(TEXT, TEXT) TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.get_player_playlist_for_screen(JSONB) TO anon, authenticated, service_role;

    NOTIFY pgrst, 'reload schema';
    `;

    console.log('[+] Updating status normalization and deploying RPC...');
    const res = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
    });

    const bodyText = await res.text();
    console.log('Status:', res.status, bodyText);
}

updateSecurityCheck().catch(console.error);
