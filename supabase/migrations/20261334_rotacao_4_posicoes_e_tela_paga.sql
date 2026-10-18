-- F-194 — Rotação da tela em 4 posições (9x16 nasce em 270), código da tela na escolha do Player,
-- tela de gestor de mídia só com pagamento (Pix do Banco Inter) e capa/rotação na tela paga.
-- Rollback: definições anteriores em docs/engineering/evidence/F-194_rotacao_e_tela_paga/.

-- 1. Rotação escolhida por tela -------------------------------------------------------------------------------
ALTER TABLE public.screens ADD COLUMN IF NOT EXISTS rotacao_tela integer;

CREATE OR REPLACE FUNCTION public.fn_tela_em_pe(p_resolution text, p_orientation text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT lower(coalesce(p_orientation, '')) IN ('portrait', 'vertical')
      OR coalesce(p_resolution, '') = '9x16'
      OR (coalesce(p_resolution, '') ~ '^[0-9]+x[0-9]+$'
          AND split_part(p_resolution, 'x', 1)::int < split_part(p_resolution, 'x', 2)::int);
$f$;

-- padrão: em pé (9x16) = 270; deitada = 0. Totens já marcados com 270 continuam 270.
UPDATE public.screens SET rotacao_tela = CASE WHEN public.fn_tela_em_pe(resolution, orientation) THEN 270 ELSE 0 END
 WHERE rotacao_tela IS NULL;

ALTER TABLE public.screens ALTER COLUMN rotacao_tela SET NOT NULL;
ALTER TABLE public.screens DROP CONSTRAINT IF EXISTS screens_rotacao_tela_check;
ALTER TABLE public.screens ADD CONSTRAINT screens_rotacao_tela_check CHECK (rotacao_tela IN (0, 90, 180, 270));

-- Tela nova sem rotação = padrão do formato; formato trocado sem mexer na rotação = padrão do novo formato.
-- giro_quadro (Player 5.7.8) acompanha a rotação em pé.
CREATE OR REPLACE FUNCTION public.trg_fn_screens_rotacao_padrao()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.rotacao_tela IS NULL THEN
      NEW.rotacao_tela := CASE WHEN public.fn_tela_em_pe(NEW.resolution, NEW.orientation) THEN 270 ELSE 0 END;
    END IF;
  ELSIF NEW.rotacao_tela IS NOT DISTINCT FROM OLD.rotacao_tela
        AND (NEW.resolution IS DISTINCT FROM OLD.resolution OR NEW.orientation IS DISTINCT FROM OLD.orientation)
        AND public.fn_tela_em_pe(NEW.resolution, NEW.orientation) IS DISTINCT FROM public.fn_tela_em_pe(OLD.resolution, OLD.orientation) THEN
    NEW.rotacao_tela := CASE WHEN public.fn_tela_em_pe(NEW.resolution, NEW.orientation) THEN 270 ELSE 0 END;
  END IF;
  IF NEW.rotacao_tela IN (90, 270) THEN NEW.giro_quadro := NEW.rotacao_tela; END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS trg_screens_rotacao_padrao ON public.screens;
CREATE TRIGGER trg_screens_rotacao_padrao BEFORE INSERT OR UPDATE OF rotacao_tela, resolution, orientation ON public.screens
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_screens_rotacao_padrao();

UPDATE public.screens SET giro_quadro = rotacao_tela WHERE rotacao_tela IN (90, 270) AND giro_quadro IS DISTINCT FROM rotacao_tela;

-- 2. Resposta da playlist leva a rotação ------------------------------------------------------------------------
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

        -- F-185: um aparelho mostra uma tela por vez. Ao conectar nesta, ele SOLTA a tela em que estava (antes o servidor
        -- recusava com "aparelho ja vinculado a outra tela" e o usuario nao conseguia conectar nenhuma tela livre).
        UPDATE public.screens
        SET bound_device_id = NULL
        WHERE bound_device_id = p_device_id
          AND id <> v_screen.id;

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
    ELSIF v_auth_uid IS NOT NULL AND public.fn_tela_com_aparelho_parado(v_screen.last_ping_at) THEN
        -- F-184: a tela está ligada a um aparelho que PAROU de dar sinal (desligado, trocado, reinstalado, ou o mesmo
        -- aparelho com identidade nova depois de atualizar o aplicativo). Ela não está "conectada em outro aparelho":
        -- quem fez login e a escolheu passa a ser o aparelho dela. Tela com aparelho vivo continua recusada (abaixo).
        IF EXISTS (
            SELECT 1 FROM public.devices
            WHERE identity_hash = p_device_id
              AND revoked_at IS NOT NULL
        ) THEN
            RETURN '{"status": "DEVICE_REVOKED", "message": "O vinculo deste aparelho com esta tela foi revogado pelo administrador."}'::JSONB;
        END IF;

        PERFORM pg_advisory_xact_lock(hashtext('sobremidia:device:' || p_device_id));

        -- F-185: um aparelho mostra uma tela por vez. Ao conectar nesta, ele SOLTA a tela em que estava (antes o servidor
        -- recusava com "aparelho ja vinculado a outra tela" e o usuario nao conseguia conectar nenhuma tela livre).
        UPDATE public.screens
        SET bound_device_id = NULL
        WHERE bound_device_id = p_device_id
          AND id <> v_screen.id;

        UPDATE public.screens SET bound_device_id = p_device_id, last_ping_at = now() WHERE id = v_screen.id;

        IF EXISTS (SELECT 1 FROM public.devices WHERE identity_hash = p_device_id) THEN
            UPDATE public.devices
            SET screen_id = v_screen.id, last_seen = now()
            WHERE identity_hash = p_device_id;
        ELSE
            INSERT INTO public.devices (name, screen_id, identity_hash, revoked_at, last_seen)
            VALUES (COALESCE(v_screen.name, 'Player'), v_screen.id, p_device_id, NULL, now());
        END IF;
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
        UNION ALL
        -- F-107: tela ligada a ponto parceiro recebe os anúncios ATIVOS do ponto (mesmo formato de mídia)
        SELECT jsonb_build_object(
            'id', pa.id,
            'position', 100000 + (row_number() OVER (ORDER BY coalesce(pa.ativado_em, pa.created_at), pa.id))::int,
            'duration', CASE WHEN m.file_type = 'video' THEN public.fn_media_duracao_item(m.id) ELSE 10 END,
            'start_time', NULL,
            'end_time', NULL,
            'days_of_week', NULL,
            'media', jsonb_build_object(
                'id', m.id,
                'name', m.name,
                'file_url', m.file_url,
                'file_type', m.file_type,
                'file_hash', m.file_hash
            ),
            'widget', NULL
        ) AS item, 100000 AS pos, row_number() OVER (ORDER BY coalesce(pa.ativado_em, pa.created_at), pa.id) AS sub
        FROM public.ponto_anuncios pa
        JOIN public.media m ON m.id = pa.media_id
        WHERE v_screen.ponto_id IS NOT NULL
          AND pa.ponto_id = v_screen.ponto_id
          AND pa.status = 'ATIVO'
          AND (pa.telas IS NULL OR v_screen.id = ANY (pa.telas))
          AND m.file_url IS NOT NULL AND m.file_type IN ('image', 'video')
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
            -- F-192: sentido do giro do quadro em totem/TV em pé (90 ou 270); Player < 5.7.8 ignora o campo
            'giro_quadro', coalesce(v_screen.giro_quadro, 90),
            -- F-194: rotação da tela em 4 posições (0/90/180/270); Player < 5.7.9 ignora o campo
            'rotacao_tela', v_screen.rotacao_tela,
            'playlists', jsonb_build_object(
                'id', v_playlist.id,
                'name', v_playlist.name,
                'resolution', v_playlist.resolution,
                'playlist_resolution', v_playlist.resolution,
                -- F-150: quem liga o som é a TELA (nasce desligado); com a Rádio Comércio ligada, as mídias ficam mudas
                'audio_enabled', (COALESCE(v_screen.audio_enabled, false) AND NOT COALESCE(v_screen.radio_ativa, false)),
                'playlist_items', v_items
            )
        )
    );
END;
$function$;

-- 3. Escolha de tela no Player leva o código da tela -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_authorized_screens_for_player()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
            -- F-194: código da tela, mostrado embaixo do nome na escolha de tela do Player
            'codigo_operacional', s.codigo_operacional,
            'is_active', s.is_active,
            -- F-184: tela cujo aparelho parou de dar sinal aparece LIVRE na escolha de tela (ver fn_tela_com_aparelho_parado)
            'bound_device_id', CASE WHEN public.fn_tela_com_aparelho_parado(s.last_ping_at) THEN NULL ELSE s.bound_device_id END
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
$function$;

-- 4. Gestor de mídia: tela nova só com pagamento ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_screens_gestor_paga()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  IF auth.uid() IS NULL OR coalesce(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  IF NEW.cobranca_id IS NOT NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id
              WHERE u.id = auth.uid() AND NOT coalesce(u.is_owner, false) AND upper(coalesce(p.nome, '')) = 'GESTOR') THEN
    RAISE EXCEPTION 'Gestor de mídia: cada tela nova é paga (R$ 22,99 no Pix). Use "Nova Tela (R$ 22,99)".' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS trg_screens_gestor_paga ON public.screens;
CREATE TRIGGER trg_screens_gestor_paga BEFORE INSERT ON public.screens
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_screens_gestor_paga();

-- 5. Tela paga: formato certo (antes gravava 'vertical' sem resolução), rotação e capa -------------------------
DROP FUNCTION IF EXISTS public.criar_tela_gestor(uuid, uuid, character varying, character varying, character varying, text, uuid);
CREATE OR REPLACE FUNCTION public.criar_tela_gestor(
  p_empresa_operadora_id uuid, p_cobranca_id uuid, p_nome character varying,
  p_localizacao character varying DEFAULT NULL::character varying,
  p_orientacao character varying DEFAULT 'horizontal'::character varying,
  p_capa_url text DEFAULT NULL::text, p_usuario_id uuid DEFAULT NULL::uuid,
  p_rotacao integer DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status TEXT;
  v_valor NUMERIC;
  v_tela UUID;
  v_em_pe boolean := lower(coalesce(p_orientacao, '')) IN ('vertical', 'portrait', '9x16');
BEGIN
  -- F-129: só logado, só na própria empresa e para si mesmo (dono/administrador pode criar para outro usuário)
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso negado: é preciso estar logado.' USING ERRCODE = '42501'; END IF;
    IF p_empresa_operadora_id IS DISTINCT FROM public.get_user_empresa_operadora_id(auth.uid()) THEN
      RAISE EXCEPTION 'Acesso negado: tela de outra empresa.' USING ERRCODE = '42501';
    END IF;
    IF p_usuario_id IS NOT NULL AND p_usuario_id <> auth.uid() AND NOT public.fn_eh_owner_ou_admin() THEN
      RAISE EXCEPTION 'Acesso negado: tela em nome de outro usuário.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_rotacao IS NOT NULL AND p_rotacao NOT IN (0, 90, 180, 270) THEN
    RAISE EXCEPTION 'rotação inválida (use 0, 90, 180 ou 270)';
  END IF;
  -- Gate server-side: pagamento REAL confirmado pela conciliação
  SELECT status, valor INTO v_status, v_valor
  FROM public.contas_receber WHERE id = p_cobranca_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'cobranca nao encontrada'; END IF;
  IF v_status NOT IN ('PAGA','PAGO') THEN
    RAISE EXCEPTION 'pagamento pendente (status %) — tela bloqueada', v_status;
  END IF;

  -- Idempotência: cobrança já utilizada por outra tela?
  IF EXISTS (SELECT 1 FROM public.screens WHERE cobranca_id = p_cobranca_id) THEN
    RAISE EXCEPTION 'cobranca ja utilizada em outra tela';
  END IF;

  INSERT INTO public.screens (
    empresa_operadora_id, user_id, name, location, orientation, resolution, rotacao_tela,
    status, is_active, capa_url, cobranca_id, criada_por_gestor
  ) VALUES (
    p_empresa_operadora_id, coalesce(p_usuario_id, auth.uid()), p_nome, p_localizacao,
    CASE WHEN v_em_pe THEN 'portrait' ELSE 'landscape' END, CASE WHEN v_em_pe THEN '9x16' ELSE '16x9' END,
    coalesce(p_rotacao, CASE WHEN v_em_pe THEN 270 ELSE 0 END),
    'offline', FALSE, p_capa_url, p_cobranca_id, TRUE
  ) RETURNING id INTO v_tela;

  INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
  VALUES (p_empresa_operadora_id, 'TELA_CRIADA_POS_PAGAMENTO', p_usuario_id,
          jsonb_build_object('tela_id', v_tela, 'cobranca_id', p_cobranca_id, 'valor', v_valor));

  RETURN json_build_object('ok', true, 'tela_id', v_tela);
END;
$function$;

REVOKE ALL ON FUNCTION public.criar_tela_gestor(uuid, uuid, character varying, character varying, character varying, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_tela_gestor(uuid, uuid, character varying, character varying, character varying, text, uuid, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
