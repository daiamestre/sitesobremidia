-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261276 — F-107
-- Pontos parceiros no Portal do Anunciante + "Anunciar aqui".
--
-- 1) pontos: + latitude, longitude, horario_funcionamento, publico_estimado_dia
--    (aditivo; nada existente muda).
-- 2) ponto_anuncios: a mídia do anunciante em um ponto parceiro (ATIVO/PAUSADO).
--    RLS: o cliente vê os seus; equipe interna do tenant vê todos.
-- 3) RPCs do portal (SECURITY DEFINER, escopo get_user_cliente_id / tenant):
--    portal_pontos_parceiros(), portal_ponto_parceiro(id),
--    anunciar_no_ponto(ponto, asset), pausar_anuncio_no_ponto(anuncio).
--    A mídia do cliente (cliente_assets) é espelhada em `media` pelo mesmo
--    padrão de publicar_playlist_cliente (file_path 'portal/<asset>').
-- 4) get_player_playlist_for_screen: tela com ponto_id recebe também os
--    anúncios ATIVOS daquele ponto, no MESMO formato de item de mídia, ao final
--    da playlist. Tela sem ponto_id: resposta idêntica (provado com
--    comparar-telas; hoje nenhuma tela tem ponto_id).
-- 5) fn_portal_anunciante_vitrine: pontos com anúncio contam em
--    "Onde seu anúncio passa".
--
-- ROLLBACK:
--   reaplicar get_player_playlist_for_screen e fn_portal_anunciante_vitrine anteriores
--   (evidência em docs/engineering/evidence/F-107/);
--   DROP FUNCTION IF EXISTS public.portal_pontos_parceiros(), public.portal_ponto_parceiro(uuid),
--     public.anunciar_no_ponto(uuid,uuid), public.pausar_anuncio_no_ponto(uuid);
--   DROP TABLE IF EXISTS public.ponto_anuncios;
--   ALTER TABLE public.pontos DROP COLUMN IF EXISTS latitude, DROP COLUMN IF EXISTS longitude,
--     DROP COLUMN IF EXISTS horario_funcionamento, DROP COLUMN IF EXISTS publico_estimado_dia;
-- ======================================================================

-- 1) Pontos: localização e informações -----------------------------------
ALTER TABLE public.pontos
  ADD COLUMN IF NOT EXISTS latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS horario_funcionamento text,
  ADD COLUMN IF NOT EXISTS publico_estimado_dia integer CHECK (publico_estimado_dia IS NULL OR publico_estimado_dia >= 0);

-- 2) Anúncios por ponto -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_anuncios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id uuid NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  ponto_id uuid NOT NULL REFERENCES public.pontos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.cliente_assets(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'PAUSADO')),
  created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ponto_id, asset_id)
);
CREATE INDEX IF NOT EXISTS ponto_anuncios_ponto_ativo_idx ON public.ponto_anuncios (ponto_id) WHERE status = 'ATIVO';
CREATE INDEX IF NOT EXISTS ponto_anuncios_cliente_idx ON public.ponto_anuncios (cliente_id);
ALTER TABLE public.ponto_anuncios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pa_select ON public.ponto_anuncios;
CREATE POLICY pa_select ON public.ponto_anuncios FOR SELECT TO authenticated
  USING (cliente_id = public.get_user_cliente_id()
         OR (public.is_internal_role() AND empresa_operadora_id = public.get_user_tenant_id()));
REVOKE ALL ON public.ponto_anuncios FROM anon;
GRANT SELECT ON public.ponto_anuncios TO authenticated;
-- escrita só pelas RPCs abaixo

-- 3) RPCs do portal --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_pontos_parceiros()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', po.id, 'nome', po.nome, 'categoria', po.categoria, 'descricao', po.descricao,
      'foto_url', po.foto_url, 'bairro', po.bairro, 'cidade', po.cidade, 'estado', po.estado,
      'logradouro', po.logradouro, 'numero', po.numero,
      'latitude', po.latitude, 'longitude', po.longitude,
      'valor_anuncio', po.valor_anuncio, 'periodicidade', po.periodicidade,
      'quantidade_telas', po.quantidade_telas,
      'telas_conectadas', (SELECT count(*) FROM public.screens s WHERE s.ponto_id = po.id),
      'meus_anuncios', (SELECT count(*) FROM public.ponto_anuncios pa
                         WHERE pa.ponto_id = po.id AND pa.cliente_id = public.get_user_cliente_id() AND pa.status = 'ATIVO')
    ) ORDER BY po.nome), '[]'::jsonb)
  FROM public.pontos po
  WHERE po.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND po.ativo AND po.deleted_at IS NULL
    AND po.disponibilidade <> 'INDISPONIVEL'
    AND po.status_operacional = 'ATIVO';
$$;

CREATE OR REPLACE FUNCTION public.portal_ponto_parceiro(p_ponto uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
      'id', po.id, 'nome', po.nome, 'categoria', po.categoria, 'descricao', po.descricao,
      'foto_url', po.foto_url, 'galeria', po.galeria,
      'cep', po.cep, 'logradouro', po.logradouro, 'numero', po.numero, 'complemento', po.complemento,
      'bairro', po.bairro, 'cidade', po.cidade, 'estado', po.estado,
      'latitude', po.latitude, 'longitude', po.longitude,
      'horario_funcionamento', po.horario_funcionamento, 'publico_estimado_dia', po.publico_estimado_dia,
      'valor_anuncio', po.valor_anuncio, 'periodicidade', po.periodicidade,
      'quantidade_telas', po.quantidade_telas, 'regras_comerciais', po.regras_comerciais,
      'telas_conectadas', (SELECT count(*) FROM public.screens s WHERE s.ponto_id = po.id),
      'telas_online', (SELECT count(*) FROM public.screens s WHERE s.ponto_id = po.id AND s.is_active AND s.last_ping_at > now() - interval '5 minutes'),
      'meus_anuncios', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', pa.id, 'status', pa.status, 'asset_id', pa.asset_id,
                                            'nome', a.nome, 'tipo', a.tipo, 'url', a.object_url, 'desde', pa.created_at)
                         ORDER BY pa.created_at DESC)
          FROM public.ponto_anuncios pa JOIN public.cliente_assets a ON a.id = pa.asset_id
         WHERE pa.ponto_id = po.id AND pa.cliente_id = public.get_user_cliente_id()), '[]'::jsonb)
    )
  FROM public.pontos po
  WHERE po.id = p_ponto
    AND po.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND po.ativo AND po.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.anunciar_no_ponto(p_ponto uuid, p_asset uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cliente uuid := public.get_user_cliente_id();
  v_tenant uuid := public.get_user_empresa_operadora_id(auth.uid());
  v_ponto record;
  v_asset record;
  v_media uuid;
  v_id uuid;
BEGIN
  IF v_cliente IS NULL THEN RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_ponto FROM public.pontos
   WHERE id = p_ponto AND empresa_operadora_id = v_tenant AND ativo AND deleted_at IS NULL
     AND status_operacional = 'ATIVO' AND disponibilidade <> 'INDISPONIVEL';
  IF v_ponto.id IS NULL THEN RAISE EXCEPTION 'Ponto parceiro indisponível.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_asset FROM public.cliente_assets WHERE id = p_asset AND cliente_id = v_cliente;
  IF v_asset.id IS NULL THEN RAISE EXCEPTION 'Mídia não encontrada na sua conta.' USING ERRCODE = '42501'; END IF;
  IF coalesce(v_asset.object_url, '') = '' THEN RAISE EXCEPTION 'Mídia sem arquivo.' USING ERRCODE = '22023'; END IF;
  IF v_asset.tipo NOT IN ('imagem', 'video') THEN RAISE EXCEPTION 'Só imagens e vídeos podem ser anunciados nas telas.' USING ERRCODE = '22023'; END IF;

  -- Espelho da mídia no Player (mesmo padrão de publicar_playlist_cliente)
  SELECT id INTO v_media FROM public.media
   WHERE user_id = auth.uid() AND file_path = 'portal/' || v_asset.id::text LIMIT 1;
  IF v_media IS NULL THEN
    INSERT INTO public.media (user_id, name, file_path, file_url, file_type, file_size, mime_type)
    VALUES (auth.uid(), v_asset.nome, 'portal/' || v_asset.id::text, v_asset.object_url,
            CASE WHEN v_asset.tipo = 'video' THEN 'video' ELSE 'image' END,
            coalesce(v_asset.tamanho, 0), coalesce(v_asset.mime_type, 'application/octet-stream'))
    RETURNING id INTO v_media;
  END IF;

  INSERT INTO public.ponto_anuncios (empresa_operadora_id, ponto_id, cliente_id, asset_id, media_id, status, created_by)
  VALUES (v_tenant, v_ponto.id, v_cliente, v_asset.id, v_media, 'ATIVO', auth.uid())
  ON CONFLICT (ponto_id, asset_id) DO UPDATE SET status = 'ATIVO', media_id = EXCLUDED.media_id, updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
  VALUES (v_tenant, auth.uid(), 'PONTO_ANUNCIO', v_id, 'PLAYLIST_PUBLICADA_PONTO', 'ATIVO',
          'Mídia "' || v_asset.nome || '" no ponto ' || v_ponto.nome);

  RETURN jsonb_build_object('status', 'OK', 'anuncio_id', v_id,
    'telas_no_ponto', (SELECT count(*) FROM public.screens s WHERE s.ponto_id = v_ponto.id));
END;
$$;

CREATE OR REPLACE FUNCTION public.pausar_anuncio_no_ponto(p_anuncio uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.ponto_anuncios SET status = 'PAUSADO', updated_at = now()
   WHERE id = p_anuncio AND cliente_id = public.get_user_cliente_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Anúncio não encontrado.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('status', 'OK');
END;
$$;

REVOKE ALL ON FUNCTION public.portal_pontos_parceiros(), public.portal_ponto_parceiro(uuid),
  public.anunciar_no_ponto(uuid, uuid), public.pausar_anuncio_no_ponto(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_pontos_parceiros(), public.portal_ponto_parceiro(uuid),
  public.anunciar_no_ponto(uuid, uuid), public.pausar_anuncio_no_ponto(uuid) TO authenticated;

-- 4) Player
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
        UNION ALL
        -- F-107: tela ligada a ponto parceiro recebe os anúncios ATIVOS do ponto (mesmo formato de mídia)
        SELECT jsonb_build_object(
            'id', pa.id,
            'position', 100000 + (row_number() OVER (ORDER BY pa.created_at, pa.id))::int,
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
        ) AS item, 100000 AS pos, row_number() OVER (ORDER BY pa.created_at, pa.id) AS sub
        FROM public.ponto_anuncios pa
        JOIN public.media m ON m.id = pa.media_id
        WHERE v_screen.ponto_id IS NOT NULL
          AND pa.ponto_id = v_screen.ponto_id
          AND pa.status = 'ATIVO'
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

-- 5) Vitrine do portal
CREATE OR REPLACE FUNCTION public.fn_portal_anunciante_vitrine()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cliente uuid := public.get_user_cliente_id();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_res jsonb;
BEGIN
  IF v_cliente IS NULL THEN
    RETURN jsonb_build_object('status', 'SEM_PERMISSAO');
  END IF;

  WITH
  meus_contratos AS (
    SELECT k.id FROM public.contratos k
     WHERE k.cliente_id = v_cliente AND k.deleted_at IS NULL
  ),
  minhas_campanhas AS (
    SELECT a.* FROM public.agendamentos a
     WHERE a.cliente_id = v_cliente AND a.deleted_at IS NULL
  ),
  minhas_midias AS (
    SELECT a.media_id::text AS id FROM minhas_campanhas a WHERE a.media_id IS NOT NULL
    UNION
    SELECT m.id::text FROM public.media m
      JOIN public.usuarios u ON u.id = m.user_id
     WHERE u.cliente_id = v_cliente
    UNION
    SELECT i.biblioteca_media_id::text FROM public.cliente_playlist_itens i
      JOIN public.playlists_cliente p ON p.id = i.playlist_id
     WHERE p.cliente_id = v_cliente AND i.biblioteca_media_id IS NOT NULL
    UNION
    SELECT pa.media_id::text FROM public.ponto_anuncios pa WHERE pa.cliente_id = v_cliente
  ),
  exib AS (
    SELECT pl.screen_id, pl.started_at, pl.agendamento_id
      FROM public.playback_logs pl
     WHERE pl.started_at > now() - interval '30 days'
       AND (
         pl.contrato_id IN (SELECT id FROM meus_contratos)
         OR pl.agendamento_id IN (SELECT id FROM minhas_campanhas)
         OR pl.media_id IN (SELECT id FROM minhas_midias)
       )
  ),
  -- chave do local: ponto parceiro (p:<id>) ou, sem ponto, a própria tela (s:<id>)
  exib_local AS (
    SELECT CASE WHEN s.ponto_id IS NOT NULL THEN 'p:' || s.ponto_id ELSE 's:' || s.id END AS chave,
           s.ponto_id, s.id AS screen_id, e.started_at, e.agendamento_id
      FROM exib e
      JOIN public.screens s ON s.id::text = e.screen_id
  ),
  locais_origem AS (
    SELECT 'p:' || coalesce(ce.ponto_id, po.id) AS chave, coalesce(ce.ponto_id, po.id) AS ponto_id,
           NULL::uuid AS screen_id, 'CONTRATO' AS origem
      FROM public.contrato_estabelecimentos ce
      JOIN meus_contratos k ON k.id = ce.contrato_id
      LEFT JOIN public.pontos po ON ce.ponto_id IS NULL AND po.unidade_id = ce.unidade_id AND po.deleted_at IS NULL
     WHERE coalesce(ce.ativo, true) AND coalesce(ce.ponto_id, po.id) IS NOT NULL
    UNION
    SELECT 'p:' || cpp.ponto_id, cpp.ponto_id, NULL::uuid, 'PLAYLIST'
      FROM public.cliente_playlist_pontos cpp
      JOIN public.playlists_cliente p ON p.id = cpp.playlist_id
     WHERE p.cliente_id = v_cliente AND p.status = 'ATIVA'
    UNION
    SELECT CASE WHEN s.ponto_id IS NOT NULL THEN 'p:' || s.ponto_id ELSE 's:' || s.id END,
           s.ponto_id, CASE WHEN s.ponto_id IS NULL THEN s.id END, 'CAMPANHA'
      FROM public.agendamento_telas t
      JOIN minhas_campanhas a ON a.id = t.agendamento_id
      JOIN public.screens s ON s.id = t.screen_id
     WHERE a.fim >= now() AND upper(coalesce(a.status, '')) NOT IN ('CANCELADO', 'CANCELADA')
    UNION
    -- F-107: anúncio ATIVO em ponto parceiro
    SELECT 'p:' || pa.ponto_id, pa.ponto_id, NULL::uuid, 'ANUNCIO'
      FROM public.ponto_anuncios pa
     WHERE pa.cliente_id = v_cliente AND pa.status = 'ATIVO'
    UNION
    SELECT DISTINCT chave, ponto_id, CASE WHEN ponto_id IS NULL THEN screen_id END, 'EXIBICAO'
      FROM exib_local
  ),
  locais AS (
    SELECT lo.chave,
           max(lo.ponto_id::text)::uuid AS ponto_id,
           max(lo.screen_id::text)::uuid AS screen_id,
           array_agg(DISTINCT lo.origem) AS origens
      FROM locais_origem lo
     GROUP BY lo.chave
  ),
  locais_json AS (
    SELECT jsonb_build_object(
             'chave', l.chave,
             'nome', coalesce(po.nome, nullif(s.location, ''), s.name, 'Tela'),
             'cidade', coalesce(po.cidade, s.cidade),
             'bairro', po.bairro,
             'categoria', po.categoria,
             'foto_url', po.foto_url,
             'origens', to_jsonb(l.origens),
             'telas', CASE WHEN l.ponto_id IS NOT NULL
                           THEN (SELECT count(*) FROM public.screens x WHERE x.ponto_id = l.ponto_id)
                           ELSE 1 END,
             'telas_online', CASE WHEN l.ponto_id IS NOT NULL
                           THEN (SELECT count(*) FROM public.screens x WHERE x.ponto_id = l.ponto_id AND x.last_ping_at > now() - interval '5 minutes')
                           ELSE (SELECT count(*) FROM public.screens x WHERE x.id = l.screen_id AND x.last_ping_at > now() - interval '5 minutes') END,
             'exibicoes_hoje', (SELECT count(*) FROM exib_local e WHERE e.chave = l.chave
                                  AND (e.started_at AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje),
             'exibicoes_30d', (SELECT count(*) FROM exib_local e WHERE e.chave = l.chave),
             'ultima_exibicao', (SELECT max(e.started_at) FROM exib_local e WHERE e.chave = l.chave)
           ) AS j
      FROM locais l
      LEFT JOIN public.pontos po ON po.id = l.ponto_id
      LEFT JOIN public.screens s ON s.id = l.screen_id
  ),
  campanhas_json AS (
    SELECT jsonb_build_object(
             'id', a.id,
             'titulo', a.titulo,
             'status', a.status,
             'inicio', a.inicio,
             'fim', a.fim,
             'no_ar', (now() BETWEEN a.inicio AND a.fim) AND upper(coalesce(a.status, '')) NOT IN ('CANCELADO', 'CANCELADA', 'PAUSADO'),
             'total_telas', a.total_telas,
             'pontos', coalesce((
               SELECT jsonb_agg(DISTINCT coalesce(po.nome, nullif(s.location, ''), s.name))
                 FROM public.agendamento_telas t
                 JOIN public.screens s ON s.id = t.screen_id
                 LEFT JOIN public.pontos po ON po.id = s.ponto_id
                WHERE t.agendamento_id = a.id), '[]'::jsonb),
             'exibicoes_30d', (SELECT count(*) FROM exib e WHERE e.agendamento_id = a.id)
           ) AS j,
           a.inicio
      FROM minhas_campanhas a
     WHERE a.fim >= now() - interval '30 days'
       AND upper(coalesce(a.status, '')) NOT IN ('CANCELADO', 'CANCELADA')
  )
  SELECT jsonb_build_object(
    'status', 'OK',
    'gerado_em', now(),
    'exibicoes', jsonb_build_object(
      'hoje', (SELECT count(*) FROM exib e WHERE (e.started_at AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje),
      'ultimos_7_dias', (SELECT count(*) FROM exib e WHERE e.started_at > now() - interval '7 days'),
      'ultimos_30_dias', (SELECT count(*) FROM exib)
    ),
    'pontos', coalesce((SELECT jsonb_agg(j ORDER BY (j->>'exibicoes_30d')::int DESC, j->>'nome') FROM locais_json), '[]'::jsonb),
    'campanhas', coalesce((SELECT jsonb_agg(j ORDER BY (j->>'no_ar')::boolean DESC, inicio DESC) FROM campanhas_json), '[]'::jsonb)
  ) INTO v_res;

  RETURN v_res;
END;
$function$;
