-- ======================================================================
-- SOBRE MÍDIA — MIGRAÇÃO 20261305 — F-148
-- Zonas: relatório por zona, anúncio em zona específica, painel da rede por estabelecimento, "Nossos Clientes" e
-- mapa da rede. Tudo ADITIVO. get_player_playlist_for_screen continua sem alteração.
--
-- ROLLBACK (resumo): DROP das funções novas; ALTER TABLE ... DROP COLUMN zona_numero / exibir_publicamente;
--   recriar a chave de exibicoes_diarias como (dia, screen_id, media_id) e reaplicar delete_old_logs / portal_ponto_parceiro
--   das migrações anteriores (20261289 e 20261276).
-- ======================================================================

-- ---------------------------------------------------------------------- 1. resumo permanente por zona
-- 0 = tela cheia (todo o histórico anterior). Quem soma por tela/mídia continua somando certo.
ALTER TABLE public.exibicoes_diarias ADD COLUMN IF NOT EXISTS zona_numero integer NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.exibicoes_diarias'::regclass AND contype = 'p'
               AND pg_get_constraintdef(oid) = 'PRIMARY KEY (dia, screen_id, media_id)') THEN
    EXECUTE (SELECT 'ALTER TABLE public.exibicoes_diarias DROP CONSTRAINT ' || quote_ident(conname)
               FROM pg_constraint WHERE conrelid = 'public.exibicoes_diarias'::regclass AND contype = 'p');
    ALTER TABLE public.exibicoes_diarias ADD PRIMARY KEY (dia, screen_id, media_id, zona_numero);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.delete_old_logs()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  WITH apagadas AS (
    DELETE FROM public.playback_logs
     WHERE started_at < now() - interval '20 days'
    RETURNING screen_id, media_id, started_at, coalesce(duracao_segundos, duration, 0) AS seg, coalesce(zona_numero, 0) AS zona
  ), resumo AS (
    SELECT (a.started_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           a.screen_id,
           coalesce(a.media_id, '') AS media_id,
           a.zona AS zona_numero,
           count(*) AS exibicoes,
           sum(greatest(a.seg, 0)) AS segundos,
           min(a.started_at) AS primeira,
           max(a.started_at) AS ultima
      FROM apagadas a
     WHERE a.screen_id IS NOT NULL
     GROUP BY 1, 2, 3, 4
  )
  INSERT INTO public.exibicoes_diarias AS e (dia, screen_id, media_id, zona_numero, exibicoes, segundos, primeira, ultima)
  SELECT r.dia, r.screen_id, r.media_id, r.zona_numero, r.exibicoes, r.segundos, r.primeira, r.ultima FROM resumo r
  ON CONFLICT (dia, screen_id, media_id, zona_numero) DO UPDATE
     SET exibicoes = e.exibicoes + EXCLUDED.exibicoes,
         segundos  = e.segundos + EXCLUDED.segundos,
         primeira  = least(e.primeira, EXCLUDED.primeira),
         ultima    = greatest(e.ultima, EXCLUDED.ultima);

  -- históricos técnicos (o painel não lê o passado deles): prazo fixo
  DELETE FROM public.player_heartbeats WHERE ping_at < now() - interval '15 days';
  DELETE FROM public.device_telemetry WHERE recorded_at < now() - interval '30 days';
  DELETE FROM public.device_logs WHERE created_at < now() - interval '90 days';
  DELETE FROM public.monitoring_logs WHERE created_at < now() - interval '180 days';

  -- histórico das rotinas agendadas: uma falha aqui não pode impedir a faxina
  BEGIN
    DELETE FROM cron.job_run_details WHERE end_time < now() - interval '14 days';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'faxina: histórico das rotinas não foi limpo (%)', SQLERRM;
  END;
END;
$fn$;

-- Exibições por zona de uma tela (registros recentes + resumo antigo). Respeita as regras de leitura de quem chama.
CREATE OR REPLACE FUNCTION public.fn_playback_por_zona(p_screen_id text, p_from timestamptz, p_to timestamptz, p_tz text DEFAULT 'America/Sao_Paulo')
RETURNS TABLE (zona_numero integer, zona_nome text, exibicoes bigint, segundos bigint, midias bigint)
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH base AS (
    SELECT coalesce(pl.zona_numero, 0) AS zona, pl.media_id, 1::bigint AS n, greatest(coalesce(pl.duracao_segundos, pl.duration, 0), 0)::bigint AS seg
      FROM public.playback_logs pl
     WHERE pl.screen_id = p_screen_id AND pl.started_at >= p_from AND pl.started_at <= p_to
    UNION ALL
    SELECT ed.zona_numero, ed.media_id, ed.exibicoes::bigint, ed.segundos::bigint
      FROM public.exibicoes_diarias ed
     WHERE ed.screen_id = p_screen_id AND ed.dia >= (p_from AT TIME ZONE p_tz)::date AND ed.dia <= (p_to AT TIME ZONE p_tz)::date
  )
  SELECT b.zona,
         CASE WHEN b.zona = 0 THEN 'Tela cheia'
              ELSE coalesce((SELECT coalesce(nullif(z.nome, ''), 'Zona ' || z.numero)
                               FROM public.screen_layouts l JOIN public.layout_zones z ON z.layout_id = l.id
                              WHERE l.screen_id::text = p_screen_id AND z.numero = b.zona), 'Zona ' || b.zona) END,
         sum(b.n)::bigint, sum(b.seg)::bigint, count(DISTINCT b.media_id)::bigint
    FROM base b GROUP BY b.zona ORDER BY b.zona;
$$;
REVOKE ALL ON FUNCTION public.fn_playback_por_zona(text, timestamptz, timestamptz, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_playback_por_zona(text, timestamptz, timestamptz, text) TO authenticated;

-- ---------------------------------------------------------------------- 2. anúncio em zona específica
-- nulo = como sempre (o anúncio entra em todas as zonas que recebem anúncios); N = só na zona N das telas escolhidas.
ALTER TABLE public.ponto_anuncios ADD COLUMN IF NOT EXISTS zona_numero integer CHECK (zona_numero IS NULL OR zona_numero >= 1);
COMMENT ON COLUMN public.ponto_anuncios.zona_numero IS 'F-148: zona da tela em que o anúncio toca (nulo = todas as zonas que recebem anúncios).';

-- Anunciar numa zona: MESMO fluxo de anunciar_no_ponto (moderação, valor, cobrança, contrato) e depois fixa a zona.
CREATE OR REPLACE FUNCTION public.anunciar_no_ponto_na_zona(p_ponto uuid, p_asset uuid, p_telas uuid[], p_zona integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_r jsonb; v_sem integer;
BEGIN
  IF p_zona IS NULL THEN RETURN public.anunciar_no_ponto(p_ponto, p_asset, p_telas); END IF;
  IF p_telas IS NULL OR cardinality(p_telas) = 0 THEN
    RAISE EXCEPTION 'Escolha a tela para anunciar numa zona.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_sem FROM unnest(p_telas) t(id)
   WHERE NOT EXISTS (SELECT 1 FROM public.screens s JOIN public.screen_layouts l ON l.screen_id = s.id AND l.ativo
                       JOIN public.layout_zones z ON z.layout_id = l.id
                      WHERE s.id = t.id AND s.ponto_id = p_ponto AND z.numero = p_zona AND z.visivel AND z.anuncios_pagos);
  IF v_sem > 0 THEN RAISE EXCEPTION 'A zona % não está disponível para anúncio em todas as telas escolhidas.', p_zona USING ERRCODE = '22023'; END IF;
  v_r := public.anunciar_no_ponto(p_ponto, p_asset, p_telas);
  UPDATE public.ponto_anuncios SET zona_numero = p_zona, updated_at = now() WHERE id = (v_r->>'anuncio_id')::uuid;
  RETURN v_r || jsonb_build_object('zona', p_zona);
END;
$$;
REVOKE ALL ON FUNCTION public.anunciar_no_ponto_na_zona(uuid, uuid, uuid[], integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.anunciar_no_ponto_na_zona(uuid, uuid, uuid[], integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_ponto_parceiro(p_ponto uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT jsonb_build_object(
      'id', po.id, 'nome', po.nome, 'categoria', po.categoria, 'descricao', po.descricao,
      'foto_url', po.foto_url, 'galeria', po.galeria,
      'onde_ficam_as_telas', po.onde_ficam_as_telas,
      'cep', po.cep, 'logradouro', po.logradouro, 'numero', po.numero, 'complemento', po.complemento,
      'bairro', po.bairro, 'cidade', po.cidade, 'estado', po.estado,
      'latitude', po.latitude, 'longitude', po.longitude,
      'horario_funcionamento', po.horario_funcionamento, 'publico_estimado_dia', po.publico_estimado_dia,
      'valor_anuncio', po.valor_anuncio, 'periodicidade', po.periodicidade,
      'quantidade_telas', po.quantidade_telas, 'regras_comerciais', po.regras_comerciais,
      'telas_conectadas', (SELECT count(*) FROM public.screens s WHERE s.ponto_id = po.id),
      'telas_online', (SELECT count(*) FROM public.screens s WHERE s.ponto_id = po.id AND s.is_active AND s.last_ping_at > now() - interval '5 minutes'),
      -- F-110: telas do ponto com valor, para o anunciante escolher
      'telas', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', s.id, 'local', coalesce(s.local_instalacao, s.name), 'foto_url', s.foto_local_url,
                                            'orientacao', s.orientation, 'polegadas', s.tamanho_polegadas, 'valor', s.valor_anuncio,
                                            -- F-148: zonas da tela que aceitam anúncio (vazio = tela sem divisão)
                                            'zonas', coalesce((SELECT jsonb_agg(jsonb_build_object('numero', z.numero, 'nome', coalesce(z.nome, 'Zona ' || z.numero),
                                                                 'parte_da_tela', round(100.0 * z.largura * z.altura / (l.largura_px * l.altura_px), 1)) ORDER BY z.numero)
                                                                 FROM public.screen_layouts l JOIN public.layout_zones z ON z.layout_id = l.id
                                                                WHERE l.screen_id = s.id AND l.ativo AND z.visivel AND z.anuncios_pagos), '[]'::jsonb))
                         ORDER BY s.name)
          FROM public.screens s WHERE s.ponto_id = po.id AND s.tipo_tela = 'PARCEIRA'), '[]'::jsonb),
      'meus_anuncios', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', pa.id, 'status', pa.status, 'asset_id', pa.asset_id,
                                            'nome', a.nome, 'tipo', a.tipo, 'url', a.object_url, 'desde', pa.created_at,
                                            'valor', pa.valor_mensal, 'valido_ate', pa.valido_ate, 'motivo', pa.motivo,
                                            'telas', coalesce(cardinality(pa.telas), 0), 'zona', pa.zona_numero,
                                            'cobranca', (SELECT jsonb_build_object('codigo', c.codigo_operacional, 'identificador', c.public_identifier,
                                                                                    'status', c.status, 'vencimento', c.data_vencimento)
                                                           FROM public.contas_receber c WHERE c.id = pa.cobranca_id))
                         ORDER BY pa.created_at DESC)
          FROM public.ponto_anuncios pa JOIN public.cliente_assets a ON a.id = pa.asset_id
         WHERE pa.ponto_id = po.id AND pa.cliente_id = public.get_user_cliente_id()), '[]'::jsonb)
    )
  FROM public.pontos po
  WHERE po.id = p_ponto
    AND po.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND po.ativo AND po.deleted_at IS NULL;
$fn$;

-- itens da playlist de uma zona: agora sabe em qual zona está (anúncio fixado numa zona só entra nela)
DROP FUNCTION IF EXISTS public.fn_player_itens_da_playlist(uuid, uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.fn_player_itens_da_playlist(p_playlist uuid, p_screen uuid, p_device_id text, p_com_anuncios boolean DEFAULT true, p_zona integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH v_screen AS (SELECT s.id, s.orientation, s.ponto_id FROM public.screens s WHERE s.id = p_screen)
  SELECT jsonb_agg(x.item ORDER BY x.pos, x.sub)
  FROM (
        SELECT jsonb_build_object(
            'id', pi.id, 'position', pi.position, 'duration', pi.duration, 'start_time', pi.start_time, 'end_time', pi.end_time,
            'days_of_week', array_to_string(pi.days, ','),
            'media', (SELECT jsonb_build_object('id', m.id, 'name', m.name, 'file_url', m.file_url, 'file_type', m.file_type, 'file_hash', m.file_hash)
                        FROM public.media m WHERE m.id = pi.media_id),
            'widget', (SELECT jsonb_build_object('id', w.id, 'name', w.name, 'widget_type', w.widget_type,
                                                 'config', public.fn_widget_config_resolvido(w.widget_type, w.config))
                         FROM public.widgets w WHERE w.id = pi.widget_id)
        ) AS item, pi.position AS pos, 0::bigint AS sub
        FROM public.playlist_items pi
        WHERE pi.playlist_id = p_playlist
          AND pi.biblioteca_pasta_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.widgets w0 WHERE w0.id = pi.widget_id AND w0.is_active = false)
          AND NOT EXISTS (SELECT 1 FROM public.widgets w7 WHERE w7.id = pi.widget_id AND NOT public.fn_widget_pode_exibir(w7.widget_type, w7.config))
          AND NOT EXISTS (SELECT 1 FROM public.widgets w11 WHERE w11.id = pi.widget_id AND NOT public.fn_widget_suportado_no_aparelho(w11.widget_type, p_device_id))
        UNION ALL
        SELECT jsonb_build_object(
            'id', pi.id, 'position', pi.position,
            'duration', CASE WHEN m.file_type IN ('video', 'audio') THEN public.fn_media_duracao_item(m.id) ELSE pi.duration END,
            'start_time', pi.start_time, 'end_time', pi.end_time, 'days_of_week', array_to_string(pi.days, ','),
            'grupo', pi.id::text,
            'media', jsonb_build_object('id', m.id, 'name', m.name, 'file_url', m.file_url, 'file_type', m.file_type, 'file_hash', m.file_hash),
            'widget', NULL
        ) AS item, pi.position AS pos,
        row_number() OVER (PARTITION BY pi.id ORDER BY bi.ordem, bi.created_at, m.id) AS sub
        FROM public.playlist_items pi
        JOIN public.biblioteca_pastas bp ON bp.id = pi.biblioteca_pasta_id AND bp.deleted_at IS NULL
        JOIN public.biblioteca_itens bi ON bi.pasta_id = bp.id AND bi.deleted_at IS NULL
        JOIN public.media m ON m.id = bi.media_id
        CROSS JOIN v_screen
        WHERE pi.playlist_id = p_playlist
          AND m.file_url IS NOT NULL AND m.file_type IN ('image', 'video')
          AND public.fn_pasta_suportada_no_aparelho(p_device_id)
          AND (m.aspect_ratio = public.fn_aspecto_da_tela(v_screen.orientation)
               OR NOT EXISTS (SELECT 1 FROM public.biblioteca_itens bi2 JOIN public.media m2 ON m2.id = bi2.media_id
                               WHERE bi2.pasta_id = bp.id AND bi2.deleted_at IS NULL
                                 AND m2.aspect_ratio = public.fn_aspecto_da_tela(v_screen.orientation)))
        UNION ALL
        SELECT jsonb_build_object(
            'id', pa.id,
            'position', 100000 + (row_number() OVER (ORDER BY coalesce(pa.ativado_em, pa.created_at), pa.id))::int,
            'duration', CASE WHEN m.file_type = 'video' THEN public.fn_media_duracao_item(m.id) ELSE 10 END,
            'start_time', NULL, 'end_time', NULL, 'days_of_week', NULL,
            'media', jsonb_build_object('id', m.id, 'name', m.name, 'file_url', m.file_url, 'file_type', m.file_type, 'file_hash', m.file_hash),
            'widget', NULL
        ) AS item, 100000 AS pos, row_number() OVER (ORDER BY coalesce(pa.ativado_em, pa.created_at), pa.id) AS sub
        FROM public.ponto_anuncios pa
        JOIN public.media m ON m.id = pa.media_id
        CROSS JOIN v_screen
        WHERE v_screen.ponto_id IS NOT NULL
          AND pa.ponto_id = v_screen.ponto_id
          AND pa.status = 'ATIVO'
          AND (pa.telas IS NULL OR v_screen.id = ANY (pa.telas))
          AND m.file_url IS NOT NULL AND m.file_type IN ('image', 'video')
          -- anúncio geral: zonas que recebem anúncios; anúncio fixado numa zona: só nela
          AND ((pa.zona_numero IS NULL AND coalesce(p_com_anuncios, true)) OR (pa.zona_numero IS NOT NULL AND pa.zona_numero = p_zona))
  ) x;
$$;
REVOKE ALL ON FUNCTION public.fn_player_itens_da_playlist(uuid, uuid, text, boolean, integer) FROM public, anon, authenticated;

-- layout para o Player: cada zona recebe os seus anúncios; a principal informa quais itens da playlist da tela são de
-- OUTRA zona ('excluir_itens'), para o Player com zonas não repetir ali o anúncio vendido para outra área.
-- (Aparelho sem zonas continua mostrando esses anúncios em tela cheia: o anúncio pago nunca deixa de aparecer.)
CREATE OR REPLACE FUNCTION public.get_player_layout_for_screen(p_identifier text, p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tela public.screens%ROWTYPE;
  v_layout public.screen_layouts%ROWTYPE;
  v_zonas jsonb;
BEGIN
  IF p_device_id IS NULL OR btrim(p_device_id) = '' OR p_device_id IN ('UNKNOWN', 'UNKNOWN_DEVICE') THEN
    RETURN '{"status": "SEM_ACESSO"}'::jsonb;
  END IF;
  IF p_identifier ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    SELECT * INTO v_tela FROM public.screens WHERE id = p_identifier::uuid;
  END IF;
  IF v_tela.id IS NULL THEN
    SELECT * INTO v_tela FROM public.screens WHERE custom_id = p_identifier LIMIT 1;
  END IF;
  IF v_tela.id IS NULL OR v_tela.bound_device_id IS DISTINCT FROM p_device_id
     OR coalesce(v_tela.is_active, true) = false OR coalesce(v_tela.bloqueada_por_inadimplencia, false) THEN
    RETURN '{"status": "SEM_ACESSO"}'::jsonb;
  END IF;

  SELECT * INTO v_layout FROM public.screen_layouts WHERE screen_id = v_tela.id AND ativo;
  IF NOT FOUND THEN RETURN '{"status": "SEM_LAYOUT"}'::jsonb; END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'id', z.id, 'numero', z.numero, 'nome', z.nome, 'x', z.x, 'y', z.y, 'largura', z.largura, 'altura', z.altura,
           'ordem_z', z.ordem_z, 'rotacao', z.rotacao, 'modo_encaixe', z.modo_encaixe, 'principal', z.principal, 'audio', z.audio,
           'excluir_itens', CASE WHEN z.principal THEN coalesce((
               SELECT jsonb_agg(pa.id) FROM public.ponto_anuncios pa
                WHERE v_tela.ponto_id IS NOT NULL AND pa.ponto_id = v_tela.ponto_id AND pa.status = 'ATIVO'
                  AND (pa.telas IS NULL OR v_tela.id = ANY (pa.telas))
                  AND ((pa.zona_numero IS NOT NULL AND pa.zona_numero <> z.numero) OR (pa.zona_numero IS NULL AND NOT z.anuncios_pagos))), '[]'::jsonb)
             ELSE '[]'::jsonb END,
           -- as mesmas, pelo id da MÍDIA (o Player Android identifica o item pela mídia)
           'excluir_midias', CASE WHEN z.principal THEN coalesce((
               SELECT jsonb_agg(DISTINCT pa.media_id) FROM public.ponto_anuncios pa
                WHERE v_tela.ponto_id IS NOT NULL AND pa.ponto_id = v_tela.ponto_id AND pa.status = 'ATIVO'
                  AND (pa.telas IS NULL OR v_tela.id = ANY (pa.telas))
                  AND ((pa.zona_numero IS NOT NULL AND pa.zona_numero <> z.numero) OR (pa.zona_numero IS NULL AND NOT z.anuncios_pagos))), '[]'::jsonb)
             ELSE '[]'::jsonb END,
           'playlist', CASE
             WHEN z.principal THEN NULL
             WHEN z.playlist_id IS NOT NULL THEN (
               SELECT jsonb_build_object('id', p.id, 'name', p.name, 'audio_enabled', coalesce(p.audio_enabled, false),
                                         'playlist_items', coalesce(public.fn_player_itens_da_playlist(p.id, v_tela.id, p_device_id, z.anuncios_pagos, z.numero), '[]'::jsonb))
                 FROM public.playlists p WHERE p.id = z.playlist_id)
             -- zona sem playlist própria ainda pode tocar os anúncios vendidos para ela
             ELSE (SELECT jsonb_build_object('id', z.id, 'name', coalesce(z.nome, 'Zona ' || z.numero), 'audio_enabled', false, 'playlist_items', it)
                     FROM (SELECT public.fn_player_itens_da_playlist(NULL, v_tela.id, p_device_id, z.anuncios_pagos, z.numero) AS it) q
                    WHERE q.it IS NOT NULL) END
         ) ORDER BY z.ordem_z, z.numero)
    INTO v_zonas
    FROM public.layout_zones z WHERE z.layout_id = v_layout.id AND z.visivel;

  IF v_zonas IS NULL THEN RETURN '{"status": "SEM_LAYOUT"}'::jsonb; END IF;
  RETURN jsonb_build_object('status', 'SUCCESS', 'layout', jsonb_build_object(
           'id', v_layout.id, 'tela_id', v_tela.id, 'versao', v_layout.versao, 'largura', v_layout.largura_px, 'altura', v_layout.altura_px,
           'cor_fundo', v_layout.cor_fundo, 'zonas', v_zonas));
END;
$$;
REVOKE ALL ON FUNCTION public.get_player_layout_for_screen(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_player_layout_for_screen(text, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------- 3. painel da rede por estabelecimento
-- Só leitura, com as regras de quem chama (enxerga as telas que já enxergava). "Online" = sinal nos últimos N minutos.
CREATE OR REPLACE FUNCTION public.fn_rede_por_estabelecimento(p_offline_min integer DEFAULT 10)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH telas AS (
    SELECT s.id, s.name, s.ponto_id, s.playlist_id, s.cidade, s.estado, s.is_active,
           greatest(s.last_ping_at, (SELECT max(d.last_heartbeat) FROM public.devices d
                                      WHERE d.screen_id = s.id AND d.revoked_at IS NULL AND d.identity_hash = s.bound_device_id)) AS sinal,
           (SELECT count(*) FROM public.layout_zones z JOIN public.screen_layouts l ON l.id = z.layout_id WHERE l.screen_id = s.id AND l.ativo AND z.visivel) AS zonas,
           (SELECT count(*) FROM public.playlist_items pi WHERE pi.playlist_id = s.playlist_id)
             + (SELECT count(*) FROM public.playlist_items pi JOIN public.layout_zones z ON z.playlist_id = pi.playlist_id
                  JOIN public.screen_layouts l ON l.id = z.layout_id WHERE l.screen_id = s.id AND l.ativo) AS midias
      FROM public.screens s
  ), marcadas AS (
    SELECT t.*, (t.sinal IS NOT NULL AND t.sinal > now() - make_interval(mins => greatest(p_offline_min, 1))) AS online FROM telas t
  )
  SELECT jsonb_build_object(
    'gerado_em', now(),
    'totais', (SELECT jsonb_build_object('telas', count(*), 'online', count(*) FILTER (WHERE online), 'offline', count(*) FILTER (WHERE NOT online),
                                         'midias', coalesce(sum(midias), 0), 'zonas', coalesce(sum(zonas), 0)) FROM marcadas),
    'estabelecimentos', coalesce((
      SELECT jsonb_agg(e ORDER BY (e->>'nome')) FROM (
        SELECT jsonb_build_object(
                 'id', m.ponto_id, 'nome', coalesce(po.nome, 'Sem estabelecimento'),
                 'cidade', coalesce(nullif(po.cidade, ''), max(nullif(m.cidade, ''))), 'estado', upper(coalesce(nullif(po.estado, ''), max(nullif(m.estado, '')))),
                 'telas', count(*), 'online', count(*) FILTER (WHERE m.online), 'offline', count(*) FILTER (WHERE NOT m.online),
                 'midias', coalesce(sum(m.midias), 0), 'zonas', coalesce(sum(m.zonas), 0), 'ultimo_sinal', max(m.sinal),
                 'lista', jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.name, 'online', m.online, 'midias', m.midias, 'zonas', m.zonas,
                                                       'ultimo_sinal', m.sinal, 'sem_playlist', m.playlist_id IS NULL) ORDER BY m.name)) AS e
          FROM marcadas m LEFT JOIN public.pontos po ON po.id = m.ponto_id
         GROUP BY m.ponto_id, po.nome, po.cidade, po.estado) q), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.fn_rede_por_estabelecimento(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_rede_por_estabelecimento(integer) TO authenticated;

-- ---------------------------------------------------------------------- 4. "Nossos Clientes" e mapa da rede
-- O cliente só aparece em público com autorização explícita (padrão: não aparece).
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS exibir_publicamente boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.clientes.exibir_publicamente IS 'F-148: autorizado a aparecer em "Nossos Clientes" e no mapa público (só nome, logo, cidade e UF).';

CREATE OR REPLACE FUNCTION public.fn_definir_cliente_publico(p_cliente uuid, p_exibir boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.fn_eh_owner_ou_admin() THEN
    RAISE EXCEPTION 'Só o dono ou o administrador autoriza a exibição pública de um cliente.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.clientes SET exibir_publicamente = coalesce(p_exibir, false)
   WHERE id = p_cliente AND empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = 'P0002'; END IF;
  RETURN coalesce(p_exibir, false);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_definir_cliente_publico(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_definir_cliente_publico(uuid, boolean) TO authenticated;

-- Página inicial (sem login): lista FIXA de campos — nome, logo, cidade e UF dos clientes autorizados. Nada além disso.
CREATE OR REPLACE FUNCTION public.fn_rede_publica()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH autorizados AS (
    SELECT c.id, c.brand_logo_url AS logo,
           (SELECT coalesce(nullif(btrim(e.nome_fantasia), ''), e.razao_social) FROM public.empresas e
             WHERE e.cliente_id = c.id AND e.deleted_at IS NULL ORDER BY e.created_at LIMIT 1) AS nome,
           (SELECT nullif(btrim(e.cidade), '') FROM public.empresas e WHERE e.cliente_id = c.id AND e.deleted_at IS NULL ORDER BY e.created_at LIMIT 1) AS cidade,
           (SELECT upper(nullif(btrim(e.estado), '')) FROM public.empresas e WHERE e.cliente_id = c.id AND e.deleted_at IS NULL ORDER BY e.created_at LIMIT 1) AS uf
      FROM public.clientes c
     WHERE c.exibir_publicamente AND c.deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'clientes', coalesce((SELECT jsonb_agg(jsonb_build_object('nome', a.nome, 'logo', CASE WHEN a.logo ~ '^https://' THEN a.logo END, 'cidade', a.cidade, 'uf', a.uf) ORDER BY a.nome)
                            FROM (SELECT * FROM autorizados WHERE nome IS NOT NULL ORDER BY nome LIMIT 200) a), '[]'::jsonb),
    'por_uf', coalesce((SELECT jsonb_agg(jsonb_build_object('uf', u.uf, 'clientes', u.n, 'cidades', u.cidades) ORDER BY u.uf)
                          FROM (SELECT uf, count(*) n, count(DISTINCT cidade) cidades FROM autorizados WHERE uf ~ '^[A-Z]{2}$' AND nome IS NOT NULL GROUP BY uf) u), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.fn_rede_publica() FROM public;
GRANT EXECUTE ON FUNCTION public.fn_rede_publica() TO anon, authenticated, service_role;

-- Mapa interno (dono/administrador e quem já vê as telas): telas e estabelecimentos por UF, com as regras de quem chama.
CREATE OR REPLACE FUNCTION public.fn_rede_por_uf()
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('uf', x.uf, 'telas', x.telas, 'estabelecimentos', x.pontos, 'cidades', x.cidades) ORDER BY x.uf), '[]'::jsonb)
    FROM (SELECT upper(coalesce(nullif(btrim(po.estado), ''), nullif(btrim(s.estado), ''))) AS uf, count(*) AS telas,
                 count(DISTINCT s.ponto_id) AS pontos, count(DISTINCT lower(coalesce(nullif(btrim(po.cidade), ''), nullif(btrim(s.cidade), '')))) AS cidades
            FROM public.screens s LEFT JOIN public.pontos po ON po.id = s.ponto_id
           GROUP BY 1) x
   WHERE x.uf ~ '^[A-Z]{2}$';
$$;
REVOKE ALL ON FUNCTION public.fn_rede_por_uf() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_rede_por_uf() TO authenticated;
