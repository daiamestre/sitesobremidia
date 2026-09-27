-- ============================================================================================
-- 20261263 — Pasta inteira da Biblioteca na playlist, com rodízio no Player (1 conteúdo por volta) — F-93
--
-- Pedido do proprietário: adicionar uma pasta completa (ex.: Memes, Loterias) à playlist; o Player toca um conteúdo da
-- pasta a cada volta, do 1º ao último, e recomeça.
--
-- Aditivo:
--   * playlist_items.biblioteca_pasta_id (FK biblioteca_pastas, ON DELETE CASCADE); valid_item_source passa a aceitar
--     exatamente UMA origem entre mídia, widget, link ou pasta (as linhas atuais continuam válidas).
--   * fn_save_playlist_items: grava o item de pasta (só pasta visível ao usuário e fora da Lixeira).
--   * get_player_playlist_for_screen (passo 7): itens comuns com o MESMO objeto de antes; item de pasta vira as mídias
--     da pasta com 'grupo'. W12: só Player >= 5.6.8 recebe itens de pasta.
--   * biblioteca_adicionar_pasta_playlists: adiciona a pasta às playlists do usuário (a partir da Biblioteca).
--   * gatilhos: mudou o conteúdo de uma pasta (item novo/removido, Lixeira) -> playlists que a usam são "tocadas"
--     (Realtime -> o Player ressincroniza e baixa o conteúdo novo).
--
-- ROLLBACK: DROP TRIGGER tr_bi_tocar_playlists ON biblioteca_itens; DROP TRIGGER tr_bp_tocar_playlists ON biblioteca_pastas;
--   DROP FUNCTION fn_bi_tocar_playlists(), fn_bp_tocar_playlists(), biblioteca_adicionar_pasta_playlists(uuid, uuid[]),
--   fn_pasta_suportada_no_aparelho(text), fn_aspecto_da_tela(text);
--   recriar get_player_playlist_for_screen e fn_save_playlist_items como em produção antes desta migração
--   (evidence F-93: live_*.sql); DELETE FROM playlist_items WHERE biblioteca_pasta_id IS NOT NULL;
--   ALTER TABLE playlist_items DROP CONSTRAINT valid_item_source, DROP COLUMN biblioteca_pasta_id; recriar
--   valid_item_source original (uma entre media_id, widget_id, external_link_id).
-- ============================================================================================

ALTER TABLE public.playlist_items
    ADD COLUMN IF NOT EXISTS biblioteca_pasta_id uuid REFERENCES public.biblioteca_pastas(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ix_playlist_items_pasta ON public.playlist_items (biblioteca_pasta_id) WHERE biblioteca_pasta_id IS NOT NULL;
ALTER TABLE public.playlist_items DROP CONSTRAINT IF EXISTS valid_item_source;
ALTER TABLE public.playlist_items ADD CONSTRAINT valid_item_source CHECK (
    (media_id IS NOT NULL)::int + (widget_id IS NOT NULL)::int + (external_link_id IS NOT NULL)::int
    + (biblioteca_pasta_id IS NOT NULL)::int = 1);

-- Proporção de mídia (media.aspect_ratio) que combina com a orientação da tela.
CREATE OR REPLACE FUNCTION public.fn_aspecto_da_tela(p_orientacao text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
    SELECT CASE WHEN lower(coalesce(p_orientacao, '')) IN ('portrait', 'vertical', '9x16', '9:16') THEN '9x16' ELSE '16x9' END;
$$;

-- W12: o rodízio de pasta existe a partir do Player 5.6.8 (mesma leitura de versão do W11).
CREATE OR REPLACE FUNCTION public.fn_pasta_suportada_no_aparelho(p_device_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
    SELECT COALESCE((
        SELECT max((regexp_match(v, '(\d+)\.(\d+)\.(\d+)'))::int[]) >= ARRAY[5, 6, 8]
        FROM (
            SELECT s.version AS v FROM public.screens s WHERE s.bound_device_id = p_device_id
            UNION ALL
            SELECT d.app_version FROM public.devices d WHERE d.identity_hash = p_device_id
        ) versoes
        WHERE v ~ '\d+\.\d+\.\d+'
    ), false);
$$;

CREATE OR REPLACE FUNCTION public.fn_save_playlist_items(p_playlist_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item     jsonb;
  v_ord      integer := 0;
  v_media    uuid;
  v_widget   uuid;
  v_link     uuid;
  v_pasta    uuid;
  v_dur      integer;
  v_start    time;
  v_end      time;
  v_days     integer[];
  v_day      integer;
  v_existing integer;
  v_deleted  integer;
  v_rows     jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid_items: esperado um array' USING ERRCODE = '22023';
  END IF;

  -- A RLS de SELECT em playlists decide se o chamador enxerga (e pode editar) esta playlist.
  PERFORM 1 FROM public.playlists WHERE id = p_playlist_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'playlist_not_found_or_denied' USING ERRCODE = '42501';
  END IF;

  -- 1) Valida e normaliza TUDO antes de apagar qualquer coisa.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_media  := NULLIF(v_item->>'media_id', '')::uuid;
    v_widget := NULLIF(v_item->>'widget_id', '')::uuid;
    v_link   := NULLIF(v_item->>'external_link_id', '')::uuid;
    v_pasta  := NULLIF(v_item->>'biblioteca_pasta_id', '')::uuid;
    IF (v_media IS NOT NULL)::int + (v_widget IS NOT NULL)::int + (v_link IS NOT NULL)::int + (v_pasta IS NOT NULL)::int <> 1 THEN
      RAISE EXCEPTION 'invalid_item_source: item % precisa de exatamente uma origem (midia, widget, link ou pasta)', v_ord + 1
        USING ERRCODE = '22023';
    END IF;

    -- pasta da Biblioteca: só a que o usuário enxerga (RLS de biblioteca_pastas = mesmo tenant) e fora da Lixeira
    IF v_pasta IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.biblioteca_pastas WHERE id = v_pasta AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'pasta_indisponivel: item % usa uma pasta que não existe ou está na Lixeira', v_ord + 1 USING ERRCODE = '22023';
    END IF;

    v_dur := COALESCE(NULLIF(v_item->>'duration', '')::numeric, 10)::integer;
    v_dur := LEAST(GREATEST(v_dur, 1), 86400);           -- 1 s .. 24 h

    v_start := NULLIF(btrim(COALESCE(v_item->>'start_time', '')), '')::time;
    v_end   := NULLIF(btrim(COALESCE(v_item->>'end_time', '')), '')::time;

    v_days := NULL;
    IF v_item ? 'days' AND jsonb_typeof(v_item->'days') = 'array' AND jsonb_array_length(v_item->'days') > 0 THEN
      SELECT array_agg(DISTINCT (d)::integer ORDER BY (d)::integer) INTO v_days
      FROM jsonb_array_elements_text(v_item->'days') AS d;
      FOREACH v_day IN ARRAY v_days LOOP
        IF v_day < 0 OR v_day > 6 THEN
          RAISE EXCEPTION 'invalid_days: dia % fora de 0..6', v_day USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'media_id', v_media, 'widget_id', v_widget, 'external_link_id', v_link, 'biblioteca_pasta_id', v_pasta,
      'position', v_ord, 'duration', v_dur, 'start_time', v_start, 'end_time', v_end, 'days', v_days
    ));
    v_ord := v_ord + 1;
  END LOOP;

  -- 2) Troca atomica.
  SELECT count(*) INTO v_existing FROM public.playlist_items WHERE playlist_id = p_playlist_id;
  DELETE FROM public.playlist_items WHERE playlist_id = p_playlist_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted < v_existing THEN
    -- a RLS impediu de apagar tudo: aborta (a transacao inteira volta atras, nada e perdido)
    RAISE EXCEPTION 'delete_denied: sem permissao para alterar todos os itens desta playlist' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.playlist_items (playlist_id, media_id, widget_id, external_link_id, biblioteca_pasta_id, position, duration, start_time, end_time, days)
  SELECT p_playlist_id,
         (r->>'media_id')::uuid, (r->>'widget_id')::uuid, (r->>'external_link_id')::uuid, (r->>'biblioteca_pasta_id')::uuid,
         (r->>'position')::integer, (r->>'duration')::integer,
         (r->>'start_time')::time, (r->>'end_time')::time,
         CASE WHEN jsonb_typeof(r->'days') = 'array'
              THEN ARRAY(SELECT jsonb_array_elements_text(r->'days')::integer) END
  FROM jsonb_array_elements(v_rows) AS r;

  -- 3) Avisa o Player (Realtime em playlists).
  UPDATE public.playlists SET updated_at = now() WHERE id = p_playlist_id;

  RETURN jsonb_build_object('ok', true, 'count', v_ord);
END;
$function$;

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
    -- F-93: item "pasta da Biblioteca" -> TODAS as mídias ativas da pasta (na orientação da tela, quando a pasta tem
    -- as duas), cada uma com 'grupo' = id do item. O Player >= 5.6.8 baixa todas (offline) e toca UMA por volta da
    -- playlist, em rodízio. W12: aparelho antigo / Player web não recebe itens de pasta (não sabe fazer o rodízio).
    -- Itens comuns: EXATAMENTE o mesmo objeto de antes (mesmos campos e filtros W1/W7/W11).
    SELECT jsonb_agg(x.item ORDER BY x.pos, x.sub) INTO v_items
    FROM (
        SELECT jsonb_build_object(
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
        ) AS item, pi.position AS pos, 0::bigint AS sub
        FROM public.playlist_items pi
        WHERE pi.playlist_id = v_playlist.id
          AND pi.biblioteca_pasta_id IS NULL
      -- W1: widget DESATIVADO no painel não vai para a tela (antes continuava tocando)
      AND NOT EXISTS (SELECT 1 FROM public.widgets w0 WHERE w0.id = pi.widget_id AND w0.is_active = false)
      -- W7: oferta fora do ar (status/datas de Brasília) ou sem itens não vai para a tela
      AND NOT EXISTS (SELECT 1 FROM public.widgets w7 WHERE w7.id = pi.widget_id AND NOT public.fn_widget_pode_exibir(w7.widget_type, w7.config))
      -- W11: tipo novo (sports) só para Player que sabe desenhá-lo (>= 5.6.0); aparelho antigo não recebe nem mostra aviso
      AND NOT EXISTS (SELECT 1 FROM public.widgets w11 WHERE w11.id = pi.widget_id AND NOT public.fn_widget_suportado_no_aparelho(w11.widget_type, p_device_id))
        UNION ALL
        SELECT jsonb_build_object(
            'id', pi.id,
            'position', pi.position,
            'duration', CASE WHEN m.file_type IN ('video', 'audio') THEN public.fn_media_duracao_item(m.id) ELSE pi.duration END,
            'start_time', pi.start_time,
            'end_time', pi.end_time,
            'days_of_week', array_to_string(pi.days, ','),
            'grupo', pi.id::text,
            'media', jsonb_build_object(
                'id', m.id,
                'name', m.name,
                'file_url', m.file_url,
                'file_type', m.file_type,
                'file_hash', m.file_hash
            ),
            'widget', NULL
        ) AS item, pi.position AS pos,
        row_number() OVER (PARTITION BY pi.id ORDER BY bi.ordem, bi.created_at, m.id) AS sub
        FROM public.playlist_items pi
        JOIN public.biblioteca_pastas bp ON bp.id = pi.biblioteca_pasta_id AND bp.deleted_at IS NULL
        JOIN public.biblioteca_itens bi ON bi.pasta_id = bp.id AND bi.deleted_at IS NULL
        JOIN public.media m ON m.id = bi.media_id
        WHERE pi.playlist_id = v_playlist.id
          AND m.file_url IS NOT NULL AND m.file_type IN ('image', 'video')
          -- W12: só Player que faz o rodízio de pasta
          AND public.fn_pasta_suportada_no_aparelho(p_device_id)
          -- orientação: se a pasta tem mídia na orientação da tela, só essas; senão, todas
          AND (m.aspect_ratio = public.fn_aspecto_da_tela(v_screen.orientation)
               OR NOT EXISTS (SELECT 1 FROM public.biblioteca_itens bi2 JOIN public.media m2 ON m2.id = bi2.media_id
                               WHERE bi2.pasta_id = bp.id AND bi2.deleted_at IS NULL
                                 AND m2.aspect_ratio = public.fn_aspecto_da_tela(v_screen.orientation)))
    ) x;

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

-- A pasta na playlist a partir da Biblioteca (mesmas regras de biblioteca_adicionar_playlists: só playlists do usuário).
CREATE OR REPLACE FUNCTION public.biblioteca_adicionar_pasta_playlists(p_pasta_id uuid, p_playlist_ids uuid[], p_duracao integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_pid uuid; v_ok integer := 0; v_recusadas jsonb := '[]'::jsonb; v_dur integer;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.biblioteca_pastas WHERE id = p_pasta_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'pasta_nao_encontrada' USING ERRCODE = '42501';
    END IF;
    v_dur := LEAST(GREATEST(coalesce(p_duracao, 10), 1), 86400);
    FOREACH v_pid IN ARRAY coalesce(p_playlist_ids, '{}') LOOP
        IF NOT EXISTS (SELECT 1 FROM public.playlists WHERE id = v_pid AND user_id = auth.uid()) THEN
            v_recusadas := v_recusadas || jsonb_build_object('id', v_pid, 'motivo', 'sem permissão nesta playlist');
            CONTINUE;
        END IF;
        INSERT INTO public.playlist_items (playlist_id, biblioteca_pasta_id, position, duration)
        VALUES (v_pid, p_pasta_id, coalesce((SELECT max(position) + 1 FROM public.playlist_items WHERE playlist_id = v_pid), 0), v_dur);
        UPDATE public.playlists SET updated_at = now() WHERE id = v_pid;  -- Realtime -> Player ressincroniza
        v_ok := v_ok + 1;
    END LOOP;
    RETURN jsonb_build_object('adicionadas', v_ok, 'recusadas', v_recusadas);
END;
$$;
REVOKE ALL ON FUNCTION public.biblioteca_adicionar_pasta_playlists(uuid, uuid[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.biblioteca_adicionar_pasta_playlists(uuid, uuid[], integer) TO authenticated;

-- Conteúdo da pasta mudou -> playlists que usam a pasta são tocadas (o Player baixa o que entrou).
CREATE OR REPLACE FUNCTION public.fn_bi_tocar_playlists()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    UPDATE public.playlists p SET updated_at = now()
     WHERE p.id IN (SELECT pi.playlist_id FROM public.playlist_items pi
                     WHERE pi.biblioteca_pasta_id IN (CASE WHEN TG_OP = 'DELETE' THEN OLD.pasta_id ELSE NEW.pasta_id END,
                                                      CASE WHEN TG_OP = 'UPDATE' THEN OLD.pasta_id END));
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS tr_bi_tocar_playlists ON public.biblioteca_itens;
CREATE TRIGGER tr_bi_tocar_playlists AFTER INSERT OR UPDATE OR DELETE ON public.biblioteca_itens
    FOR EACH ROW EXECUTE FUNCTION public.fn_bi_tocar_playlists();

CREATE OR REPLACE FUNCTION public.fn_bp_tocar_playlists()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        UPDATE public.playlists p SET updated_at = now()
         WHERE p.id IN (SELECT pi.playlist_id FROM public.playlist_items pi WHERE pi.biblioteca_pasta_id = NEW.id);
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS tr_bp_tocar_playlists ON public.biblioteca_pastas;
CREATE TRIGGER tr_bp_tocar_playlists AFTER UPDATE OF deleted_at ON public.biblioteca_pastas
    FOR EACH ROW EXECUTE FUNCTION public.fn_bp_tocar_playlists();

REVOKE ALL ON FUNCTION public.fn_pasta_suportada_no_aparelho(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_bi_tocar_playlists() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_bp_tocar_playlists() FROM PUBLIC, anon, authenticated;
