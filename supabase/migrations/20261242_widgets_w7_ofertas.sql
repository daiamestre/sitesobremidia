-- W7 (Widget Engine): widget de Oferta lê a oferta REAL (ofertas/oferta_itens/produtos) — nenhum preço é copiado.
--
-- O widget guarda só a referência (widgets.config.ofertaId). A cada sincronização o Player recebe, junto do config,
-- os dados atuais da oferta (chave "oferta", montada aqui e NUNCA gravada em widgets). Mudou preço/item/validade ->
-- as playlists que usam a oferta são "tocadas" -> Realtime -> o Player ressincroniza (mesmo caminho do F-58).
-- Oferta fora do ar (status fora de APPROVED/SCHEDULED/PUBLISHED — a mesma regra da tela Ofertas — ou fora das datas,
-- no dia de Brasília) não vai para a tela: nunca exibir preço vencido.
--
-- Aditivo: contrato do payload inalterado (config ganha uma chave; Players antigos ignoram chaves desconhecidas).
-- ROLLBACK:
--   recriar get_player_playlist_for_screen(text,text) com a definição de 20261241_widgets_w1_correcoes.sql;
--   DROP TRIGGER tr_ofertas_touch_playlists ON public.ofertas; DROP TRIGGER tr_oferta_itens_touch_playlists ON public.oferta_itens;
--   DROP TRIGGER tr_produtos_touch_playlists ON public.produtos; DROP FUNCTION public.fn_ofertas_touch_playlists();
--   DROP FUNCTION public.fn_widget_config_resolvido(text, jsonb); DROP FUNCTION public.fn_widget_pode_exibir(text, jsonb);
--   DROP FUNCTION public.fn_widget_oferta_dados(uuid);

-- Dados atuais da oferta para exibição (até 6 itens, destaques primeiro). null se não existir.
CREATE OR REPLACE FUNCTION public.fn_widget_oferta_dados(p_oferta_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'id', o.id,
        'titulo', o.titulo,
        'descricao', o.descricao,
        'status', o.status,
        'data_inicio', o.data_inicio,
        'data_fim', o.data_fim,
        'vigente', (o.status IN ('APPROVED', 'SCHEDULED', 'PUBLISHED')
                    AND (now() AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN o.data_inicio AND o.data_fim),
        'itens', COALESCE((
            SELECT jsonb_agg(x.item ORDER BY x.destaque DESC, x.nome ASC)
            FROM (
                SELECT i.destaque, p.nome,
                       jsonb_build_object(
                           'nome', p.nome,
                           'marca', p.marca,
                           'unidade', p.unidade_medida,
                           'imagem_url', p.imagem_url,
                           'preco_original', i.preco_original,
                           'preco_oferta', i.preco_oferta,
                           'desconto', i.desconto_porcentagem,
                           'destaque', i.destaque
                       ) AS item
                FROM public.oferta_itens i
                JOIN public.produtos p ON p.id = i.produto_id
                WHERE i.oferta_id = o.id AND p.ativo
                ORDER BY i.destaque DESC, p.nome ASC
                LIMIT 6
            ) x
        ), '[]'::jsonb)
    )
    FROM public.ofertas o
    WHERE o.id = p_oferta_id;
$$;

-- Config enviado ao Player: o gravado + dados vivos do conteúdo referenciado (hoje: oferta).
CREATE OR REPLACE FUNCTION public.fn_widget_config_resolvido(p_type text, p_config jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_type = 'offer' AND (p_config->>'ofertaId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN COALESCE(p_config, '{}'::jsonb)
                 || jsonb_build_object('oferta', public.fn_widget_oferta_dados((p_config->>'ofertaId')::uuid))
        ELSE p_config
    END;
$$;

-- O widget pode ir para a tela? (oferta: só vigente e com ao menos 1 item; demais tipos: sim)
CREATE OR REPLACE FUNCTION public.fn_widget_pode_exibir(p_type text, p_config jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_type = 'offer' THEN COALESCE((
            SELECT (d->>'vigente')::boolean AND jsonb_array_length(d->'itens') > 0
            FROM (SELECT public.fn_widget_config_resolvido(p_type, p_config)->'oferta' AS d) s
        ), false)
        ELSE true
    END;
$$;

REVOKE ALL ON FUNCTION public.fn_widget_oferta_dados(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_widget_config_resolvido(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_widget_pode_exibir(text, jsonb) FROM PUBLIC, anon, authenticated;

-- Mudou oferta, item ou produto -> playlists com widget dessa oferta são tocadas (Realtime -> Player ressincroniza).
CREATE OR REPLACE FUNCTION public.fn_ofertas_touch_playlists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ofertas uuid[];
    v_row record;
BEGIN
    v_row := COALESCE(NEW, OLD);
    IF TG_TABLE_NAME = 'ofertas' THEN
        v_ofertas := ARRAY[v_row.id];
    ELSIF TG_TABLE_NAME = 'oferta_itens' THEN
        v_ofertas := ARRAY[v_row.oferta_id];
    ELSE
        SELECT array_agg(DISTINCT i.oferta_id) INTO v_ofertas FROM public.oferta_itens i WHERE i.produto_id = v_row.id;
    END IF;
    IF v_ofertas IS NULL THEN
        RETURN v_row;
    END IF;
    UPDATE public.playlists p
       SET updated_at = now()
     WHERE p.id IN (
        SELECT pi.playlist_id
          FROM public.playlist_items pi
          JOIN public.widgets w ON w.id = pi.widget_id
         WHERE w.widget_type = 'offer' AND w.config->>'ofertaId' = ANY (v_ofertas::text[])
     );
    RETURN v_row;
END;
$$;

DROP TRIGGER IF EXISTS tr_ofertas_touch_playlists ON public.ofertas;
CREATE TRIGGER tr_ofertas_touch_playlists AFTER INSERT OR UPDATE OR DELETE ON public.ofertas
    FOR EACH ROW EXECUTE FUNCTION public.fn_ofertas_touch_playlists();
DROP TRIGGER IF EXISTS tr_oferta_itens_touch_playlists ON public.oferta_itens;
CREATE TRIGGER tr_oferta_itens_touch_playlists AFTER INSERT OR UPDATE OR DELETE ON public.oferta_itens
    FOR EACH ROW EXECUTE FUNCTION public.fn_ofertas_touch_playlists();
DROP TRIGGER IF EXISTS tr_produtos_touch_playlists ON public.produtos;
CREATE TRIGGER tr_produtos_touch_playlists AFTER UPDATE ON public.produtos
    FOR EACH ROW EXECUTE FUNCTION public.fn_ofertas_touch_playlists();

-- get_player_playlist_for_screen: definição em produção + as 2 alterações do W7 (config resolvido e filtro de oferta).
CREATE OR REPLACE FUNCTION public.get_player_playlist_for_screen(p_identifier text, p_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

    -- 2. Fetch Screen
    SELECT * INTO v_screen
    FROM public.screens
    WHERE (custom_id ILIKE p_identifier OR (length(p_identifier) > 20 AND id::text = p_identifier));

    IF NOT FOUND THEN
        RETURN '{"status": "SCREEN_NOT_FOUND"}'::JSONB;
    END IF;

    IF NOT v_screen.is_active THEN
        RETURN '{"status": "SCREEN_SUSPENDED"}'::JSONB;
    END IF;

    -- 3. A. Bloqueio Financeiro Global de Contrato: Verificar se a tela pertence a um contrato SUSPENSO_FINANCEIRO
    IF v_screen.ponto_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM public.pontos po
            JOIN public.contrato_estabelecimentos ce ON (
                (ce.ponto_id IS NOT NULL AND ce.ponto_id = po.id)
                OR (ce.ponto_id IS NULL AND ce.unidade_id = po.unidade_id)
            )
            JOIN public.contratos c ON c.id = ce.contrato_id
            WHERE po.id = v_screen.ponto_id
              AND c.status_workflow = 'SUSPENSO_FINANCEIRO'
        ) THEN
            RETURN '{"status": "SCREEN_SUSPENDED", "message": "Tela bloqueada temporariamente (Suspensão Financeira)."}'::JSONB;
        END IF;

        -- 3. B. Trava Atômica de Expansão Pré-Pagamento (Hardened H1: P2.1 Desambiguação de Ponto + P2.2 Semântica CANCELADO + Tenant):
        -- Se o ponto/unidade foi adicionado via expansão cuja fatura contas_receber está em aberto (PENDENTE/VENCIDO), nega distribuição de playlist.
        IF EXISTS (
            SELECT 1
            FROM public.pontos po
            JOIN public.contrato_estabelecimentos ce ON (
                (ce.ponto_id IS NOT NULL AND ce.ponto_id = po.id)
                OR (ce.ponto_id IS NULL AND ce.unidade_id = po.unidade_id)
            )
            JOIN public.contas_receber cr ON cr.expansao_id = ce.expansao_id
            WHERE po.id = v_screen.ponto_id
              AND ce.expansao_id IS NOT NULL
              AND cr.empresa_operadora_id = v_screen.empresa_operadora_id
              AND cr.status IN ('PENDENTE', 'ABERTA', 'VENCIDO', 'VENCIDA', 'ATRASADO', 'ATRASADA', 'VENCENDO_HOJE', 'AGENDADA', 'PARCIAL', 'PARCIAL_PAGA')
        ) THEN
            RETURN '{"status": "SCREEN_SUSPENDED", "message": "Tela bloqueada temporariamente (Aguardando confirmação de pagamento da expansão)."}'::JSONB;
        END IF;
    END IF;

    -- 4. Screen Ownership Check (se autenticado e nao for OWNER/ADMIN)
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

    -- 5. Device Binding Check
    IF v_screen.bound_device_id IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.devices
            WHERE identity_hash = p_device_id
              AND revoked_at IS NOT NULL
        ) THEN
            RETURN '{"status": "DEVICE_REVOKED", "message": "O vinculo deste aparelho com esta tela foi revogado pelo administrador."}'::JSONB;
        END IF;

        PERFORM pg_advisory_xact_lock(hashtext('sobremidia:device:' || p_device_id));

        IF EXISTS (
            SELECT 1 FROM public.screens
            WHERE bound_device_id = p_device_id
              AND id <> v_screen.id
        ) THEN
            RETURN '{"status": "DEVICE_ALREADY_BOUND", "message": "Este aparelho ja esta vinculado a outra tela. Desvincule-o antes de parear em uma nova tela."}'::JSONB;
        END IF;

        UPDATE public.screens SET bound_device_id = p_device_id, last_ping_at = now() WHERE id = v_screen.id;

        IF EXISTS (SELECT 1 FROM public.devices WHERE identity_hash = p_device_id) THEN
            UPDATE public.devices
            SET screen_id = v_screen.id, last_seen = now()
            WHERE identity_hash = p_device_id;
        ELSE
            INSERT INTO public.devices (name, screen_id, identity_hash, revoked_at, last_seen)
            VALUES (COALESCE(v_screen.name, 'Player'), v_screen.id, p_device_id, NULL, now());
        END IF;
    ELSIF v_screen.bound_device_id = p_device_id THEN
        IF EXISTS (
            SELECT 1 FROM public.devices
            WHERE identity_hash = p_device_id
              AND revoked_at IS NOT NULL
        ) THEN
            RETURN '{"status": "DEVICE_REVOKED", "message": "O vinculo deste aparelho com esta tela foi revogado pelo administrador."}'::JSONB;
        END IF;

        UPDATE public.devices
        SET last_seen = now(), last_heartbeat = now()
        WHERE identity_hash = p_device_id;

        UPDATE public.screens SET last_ping_at = now() WHERE id = v_screen.id;
    ELSE
        RETURN '{"status": "DEVICE_ALREADY_BOUND"}'::JSONB;
    END IF;

    -- 6. Playlist Validation
    IF v_screen.playlist_id IS NULL THEN
        RETURN '{"status": "NO_PLAYLIST_ASSIGNED"}'::JSONB;
    END IF;

    SELECT * INTO v_playlist FROM public.playlists WHERE id = v_screen.playlist_id;

    IF NOT FOUND THEN
        RETURN '{"status": "PLAYLIST_NOT_FOUND"}'::JSONB;
    END IF;

    -- 7. Fetch Items & Build Payload
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', pi.id,
            'position', pi.position,
            'duration', pi.duration,
            'start_time', pi.start_time,
            'end_time', pi.end_time,
            'days_of_week', array_to_string(pi.days, ','),
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
                    'config', public.fn_widget_config_resolvido(w.widget_type, w.config)
                )
                FROM public.widgets w WHERE w.id = pi.widget_id
            )
        ) ORDER BY pi.position ASC
    ) INTO v_items
    FROM public.playlist_items pi
    WHERE pi.playlist_id = v_playlist.id
      -- W1: widget DESATIVADO no painel não vai para a tela (antes continuava tocando)
      AND NOT EXISTS (SELECT 1 FROM public.widgets w0 WHERE w0.id = pi.widget_id AND w0.is_active = false)
      -- W7: oferta fora do ar (status/datas de Brasília) ou sem itens não vai para a tela
      AND NOT EXISTS (SELECT 1 FROM public.widgets w7 WHERE w7.id = pi.widget_id AND NOT public.fn_widget_pode_exibir(w7.widget_type, w7.config));

    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        RETURN '{"status": "PLAYLIST_EMPTY"}'::JSONB;
    END IF;

    -- 8. Return Payload
    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'data', jsonb_build_object(
            'id', v_screen.id,
            'name', v_screen.name,
            'custom_id', v_screen.custom_id,
            'is_active', v_screen.is_active,
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
$function$;
