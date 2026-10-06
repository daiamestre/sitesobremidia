-- ======================================================================
-- SOBRE MÍDIA — MIGRAÇÃO 20261306 — F-150
-- Preço por zona; som só na mídia principal, comandado pela tela; gráfico de exibições por zona; presença da rede por
-- cidade e estado (mapa automático); estrutura da Rádio Comércio (playlists de áudio por tela).
--
-- ÚNICA mudança no que o Player atual recebe: o campo audio_enabled passa a obedecer a chave de som DA TELA
-- (antes obedecia a playlist). Todas as telas existentes estão com o som desligado, como definido pelo proprietário.
--
-- ROLLBACK (resumo): reaplicar get_player_playlist_for_screen da migração anterior (audio_enabled = playlist);
--   DROP das funções novas; DROP TABLE radio_playlist_itens, radio_playlists; DROP COLUMN das colunas novas.
-- ======================================================================

-- ---------------------------------------------------------------------- 1. preço por zona
ALTER TABLE public.layout_zones ADD COLUMN IF NOT EXISTS valor_anuncio numeric(10,2) CHECK (valor_anuncio IS NULL OR valor_anuncio >= 0);
COMMENT ON COLUMN public.layout_zones.valor_anuncio IS 'F-150: valor mensal para anunciar SÓ nesta zona (nulo = vale o valor da tela).';

-- zona é complemento: nunca tem som (só a mídia principal pode ter)
UPDATE public.layout_zones SET audio = false WHERE audio;

CREATE OR REPLACE FUNCTION public.fn_salvar_layout_da_tela(
  p_screen uuid, p_largura integer, p_altura integer, p_cor_fundo text DEFAULT '#000000',
  p_zonas jsonb DEFAULT '[]'::jsonb, p_ativo boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tela public.screens%ROWTYPE;
  v_layout uuid;
  v_versao integer;
  z jsonb;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_n integer; v_x integer; v_y integer; v_w integer; v_h integer;
  v_principais integer := 0; v_audios integer := 0;
  v_principal boolean; v_playlist uuid;
  v_numeros integer[] := '{}';
  v_total integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Faça login para alterar a divisão da tela.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_tela FROM public.screens WHERE id = p_screen;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tela não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.fn_pode_gerir_layout_da_tela(p_screen) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar a divisão desta tela.' USING ERRCODE = '42501';
  END IF;
  IF p_largura IS NULL OR p_altura IS NULL OR p_largura NOT BETWEEN 16 AND 32768 OR p_altura NOT BETWEEN 16 AND 32768 THEN
    RAISE EXCEPTION 'Informe a largura e a altura da tela em pixels (de 16 a 32768).' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_zonas) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lista de zonas inválida.' USING ERRCODE = '22023'; END IF;
  v_total := jsonb_array_length(p_zonas);
  IF v_total = 0 THEN RAISE EXCEPTION 'Crie pelo menos uma zona (ou remova a divisão da tela).' USING ERRCODE = '22023'; END IF;
  IF v_total > 500 THEN RAISE EXCEPTION 'Limite de 500 zonas por tela.' USING ERRCODE = '22023'; END IF;

  -- 1ª passada: validar tudo antes de gravar
  FOR z IN SELECT * FROM jsonb_array_elements(p_zonas) LOOP
    BEGIN
      v_n := (z->>'numero')::integer; v_x := (z->>'x')::integer; v_y := (z->>'y')::integer;
      v_w := (z->>'largura')::integer; v_h := (z->>'altura')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Zona com número, posição ou tamanho inválido.' USING ERRCODE = '22023';
    END;
    IF v_n IS NULL OR v_n < 1 THEN RAISE EXCEPTION 'Toda zona precisa de um número (a partir de 1).' USING ERRCODE = '22023'; END IF;
    IF v_n = ANY (v_numeros) THEN RAISE EXCEPTION 'A zona % está repetida.', v_n USING ERRCODE = '22023'; END IF;
    v_numeros := v_numeros || v_n;
    IF v_x IS NULL OR v_y IS NULL OR v_w IS NULL OR v_h IS NULL OR v_x < 0 OR v_y < 0 OR v_w < 1 OR v_h < 1 THEN
      RAISE EXCEPTION 'A zona % tem posição ou tamanho inválido.', v_n USING ERRCODE = '22023';
    END IF;
    IF v_x + v_w > p_largura OR v_y + v_h > p_altura THEN
      RAISE EXCEPTION 'A zona % passa do limite da tela (% x % px).', v_n, p_largura, p_altura USING ERRCODE = '22023';
    END IF;
    IF coalesce((z->>'principal')::boolean, false) THEN v_principais := v_principais + 1; END IF;
    IF coalesce((z->>'audio')::boolean, false) THEN v_audios := v_audios + 1; END IF;
    v_playlist := NULLIF(z->>'playlist_id', '')::uuid;
    IF v_playlist IS NOT NULL AND NOT coalesce((z->>'principal')::boolean, false) AND NOT EXISTS (
         SELECT 1 FROM public.playlists p
          WHERE p.id = v_playlist AND (p.user_id = v_uid OR public.fn_admin_da_empresa_do_usuario(p.user_id))) THEN
      RAISE EXCEPTION 'A playlist escolhida para a zona % não existe ou não é sua.', v_n USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF v_principais > 1 THEN RAISE EXCEPTION 'Só uma zona pode ser a principal.' USING ERRCODE = '22023'; END IF;
  IF v_audios > 1 THEN RAISE EXCEPTION 'Só uma zona pode ter som.' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.screen_layouts (screen_id, empresa_operadora_id, largura_px, altura_px, cor_fundo, ativo, created_by, updated_by)
  VALUES (p_screen, v_tela.empresa_operadora_id, p_largura, p_altura, coalesce(p_cor_fundo, '#000000'), coalesce(p_ativo, true), v_uid, v_uid)
  ON CONFLICT (screen_id) DO UPDATE
    SET largura_px = EXCLUDED.largura_px, altura_px = EXCLUDED.altura_px, cor_fundo = EXCLUDED.cor_fundo,
        ativo = EXCLUDED.ativo, versao = public.screen_layouts.versao + 1, updated_by = v_uid, updated_at = now()
  RETURNING id, versao INTO v_layout, v_versao;

  -- zonas que saíram da lista são removidas; as demais mantêm o mesmo id (a prova de exibição aponta para ele)
  SELECT coalesce(array_agg((e->>'id')::uuid), '{}') INTO v_ids
    FROM jsonb_array_elements(p_zonas) e WHERE e->>'id' ~ '^[0-9a-fA-F-]{36}$';
  DELETE FROM public.layout_zones WHERE layout_id = v_layout AND NOT (id = ANY (v_ids));
  -- libera os números e as marcas únicas antes de regravar (evita choque de unicidade durante a troca)
  UPDATE public.layout_zones SET numero = numero + 100000, principal = false, audio = false WHERE layout_id = v_layout;

  FOR z IN SELECT * FROM jsonb_array_elements(p_zonas) ORDER BY (value->>'numero')::integer LOOP
    v_principal := coalesce((z->>'principal')::boolean, false) OR (v_principais = 0 AND (z->>'numero')::integer = (SELECT min(n) FROM unnest(v_numeros) n));
    v_playlist := CASE WHEN v_principal THEN NULL ELSE NULLIF(z->>'playlist_id', '')::uuid END;
    v_id := CASE WHEN z->>'id' ~ '^[0-9a-fA-F-]{36}$'
                  AND EXISTS (SELECT 1 FROM public.layout_zones o WHERE o.id = (z->>'id')::uuid AND o.layout_id = v_layout)
                 THEN (z->>'id')::uuid ELSE gen_random_uuid() END;
    INSERT INTO public.layout_zones AS lz (id, layout_id, numero, nome, x, y, largura, altura, ordem_z, rotacao, modo_encaixe,
                                           visivel, travada, principal, audio, anuncios_pagos, playlist_id, valor_anuncio)
    VALUES (v_id, v_layout, (z->>'numero')::integer, NULLIF(btrim(left(coalesce(z->>'nome', ''), 80)), ''),
            (z->>'x')::integer, (z->>'y')::integer, (z->>'largura')::integer, (z->>'altura')::integer,
            coalesce((z->>'ordem_z')::integer, 0),
            CASE WHEN (z->>'rotacao') IN ('90', '180', '270') THEN (z->>'rotacao')::integer ELSE 0 END,
            CASE WHEN upper(coalesce(z->>'modo_encaixe', '')) IN ('COBRIR', 'ESTICAR') THEN upper(z->>'modo_encaixe') ELSE 'CONTER' END,
            coalesce((z->>'visivel')::boolean, true), coalesce((z->>'travada')::boolean, false),
            v_principal, false, coalesce((z->>'anuncios_pagos')::boolean, true), v_playlist,
            CASE WHEN (z->>'valor_anuncio') ~ '^\d{1,7}(\.\d{1,2})?$' THEN (z->>'valor_anuncio')::numeric END)
    ON CONFLICT (id) DO UPDATE
      SET numero = EXCLUDED.numero, nome = EXCLUDED.nome, x = EXCLUDED.x, y = EXCLUDED.y, largura = EXCLUDED.largura,
          altura = EXCLUDED.altura, ordem_z = EXCLUDED.ordem_z, rotacao = EXCLUDED.rotacao, modo_encaixe = EXCLUDED.modo_encaixe,
          visivel = EXCLUDED.visivel, travada = EXCLUDED.travada, principal = EXCLUDED.principal, audio = EXCLUDED.audio,
          anuncios_pagos = EXCLUDED.anuncios_pagos, playlist_id = EXCLUDED.playlist_id, valor_anuncio = EXCLUDED.valor_anuncio, updated_at = now();
  END LOOP;

  RETURN jsonb_build_object('layout_id', v_layout, 'versao', v_versao, 'zonas', v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_salvar_layout_da_tela(uuid, integer, integer, text, jsonb, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_salvar_layout_da_tela(uuid, integer, integer, text, jsonb, boolean) TO authenticated;

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
                                                                 'parte_da_tela', round(100.0 * z.largura * z.altura / (l.largura_px * l.altura_px), 1), 'valor', z.valor_anuncio) ORDER BY z.numero)
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

-- anunciar numa zona: quando a zona tem valor próprio, é ele que vale (ajuste feito na mesma transação, com a
-- cobrança ainda recém-criada e pendente). Contrato e telas grátis continuam sem cobrança avulsa.
CREATE OR REPLACE FUNCTION public.anunciar_no_ponto_na_zona(p_ponto uuid, p_asset uuid, p_telas uuid[], p_zona integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_r jsonb; v_sem integer; v_preco numeric; v_sem_preco integer; v_anuncio uuid;
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
  v_anuncio := (v_r->>'anuncio_id')::uuid;
  UPDATE public.ponto_anuncios SET zona_numero = p_zona, updated_at = now() WHERE id = v_anuncio;

  -- valor da zona (soma das telas escolhidas); só vale se TODAS as zonas escolhidas tiverem valor maior que zero
  SELECT sum(z.valor_anuncio), count(*) FILTER (WHERE coalesce(z.valor_anuncio, 0) <= 0) INTO v_preco, v_sem_preco
    FROM public.screen_layouts l JOIN public.layout_zones z ON z.layout_id = l.id
   WHERE l.screen_id = ANY (p_telas) AND z.numero = p_zona;
  IF v_r->>'origem' = 'PORTAL' AND v_sem_preco = 0 AND v_preco > 0 THEN
    UPDATE public.ponto_anuncios SET valor_mensal = v_preco, updated_at = now() WHERE id = v_anuncio;
    UPDATE public.contas_receber c SET valor = v_preco
      FROM public.ponto_anuncios pa WHERE pa.id = v_anuncio AND c.id = pa.cobranca_id AND c.status = 'PENDENTE';
    v_r := v_r || jsonb_build_object('valor', v_preco);
  END IF;
  RETURN v_r || jsonb_build_object('zona', p_zona);
END;
$$;
REVOKE ALL ON FUNCTION public.anunciar_no_ponto_na_zona(uuid, uuid, uuid[], integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.anunciar_no_ponto_na_zona(uuid, uuid, uuid[], integer) TO authenticated;

-- ---------------------------------------------------------------------- 2. gráfico de exibições por zona
-- p_zona: nulo = a tela inteira (igual a fn_playback_stats); 0 = tela principal (tela cheia + zona principal);
--         N = só a zona N. Mesmas fontes (registros recentes + resumo permanente) e mesmas regras de leitura.
CREATE OR REPLACE FUNCTION public.fn_playback_stats_zona(p_screen_id text, p_from timestamptz, p_to timestamptz, p_bucket text DEFAULT 'day', p_tz text DEFAULT 'America/Sao_Paulo', p_zona integer DEFAULT NULL)
RETURNS TABLE (bucket timestamptz, total bigint)
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH principal AS (
    SELECT coalesce((SELECT z.numero FROM public.screen_layouts l JOIN public.layout_zones z ON z.layout_id = l.id
                      WHERE l.screen_id::text = p_screen_id AND z.principal LIMIT 1), 0) AS numero
  )
  SELECT x.bucket, sum(x.total)::bigint AS total
    FROM (
      SELECT (date_trunc(CASE WHEN p_bucket = 'hour' THEN 'hour' ELSE 'day' END, pl.started_at AT TIME ZONE p_tz)) AT TIME ZONE p_tz AS bucket,
             count(*)::bigint AS total
        FROM public.playback_logs pl, principal pr
       WHERE pl.started_at >= p_from AND pl.started_at <= p_to
         AND pl.screen_id = p_screen_id
         AND (p_zona IS NULL
              OR (p_zona = 0 AND coalesce(pl.zona_numero, 0) IN (0, pr.numero))
              OR (p_zona > 0 AND pl.zona_numero = p_zona AND p_zona <> pr.numero))
       GROUP BY 1
      UNION ALL
      SELECT (ed.dia::timestamp AT TIME ZONE p_tz) AS bucket, sum(ed.exibicoes)::bigint AS total
        FROM public.exibicoes_diarias ed, principal pr
       WHERE p_bucket IS DISTINCT FROM 'hour'
         AND ed.dia >= (p_from AT TIME ZONE p_tz)::date AND ed.dia <= (p_to AT TIME ZONE p_tz)::date
         AND ed.screen_id = p_screen_id
         AND (p_zona IS NULL
              OR (p_zona = 0 AND ed.zona_numero IN (0, pr.numero))
              OR (p_zona > 0 AND ed.zona_numero = p_zona AND p_zona <> pr.numero))
       GROUP BY 1
    ) x
   GROUP BY x.bucket ORDER BY x.bucket;
$$;
REVOKE ALL ON FUNCTION public.fn_playback_stats_zona(text, timestamptz, timestamptz, text, text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_playback_stats_zona(text, timestamptz, timestamptz, text, text, integer) TO authenticated;

-- ---------------------------------------------------------------------- 3. presença da rede (mapa automático)
-- Sai do CADASTRO: endereço do anunciante, do ponto parceiro e do gestor de mídias. Ninguém marca nada à mão.
-- Só números por cidade/UF — nenhum nome, contato ou dado de contrato. Por isso pode ser lida sem login.
CREATE OR REPLACE FUNCTION public.fn_rede_presenca()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH origem AS (
    -- anunciantes: endereço da empresa do cliente
    SELECT 'anunciantes' AS tipo, e.cidade, e.estado
      FROM public.clientes c
      JOIN LATERAL (SELECT em.cidade, em.estado FROM public.empresas em
                     WHERE em.cliente_id = c.id AND em.deleted_at IS NULL ORDER BY em.created_at LIMIT 1) e ON true
     WHERE c.deleted_at IS NULL
    UNION ALL
    -- pontos parceiros: endereço do ponto
    SELECT 'pontos', p.cidade, p.estado FROM public.pontos p WHERE p.deleted_at IS NULL AND coalesce(p.ativo, true)
    UNION ALL
    -- gestores de mídias: cidade/UF informadas no cadastro (ou o final do endereço: "..., Cidade, UF")
    SELECT 'gestores',
           coalesce(nullif(btrim(s.dados_cadastro->>'cidade'), ''),
                    CASE WHEN array_length(s.partes, 1) >= 2 AND s.partes[array_length(s.partes, 1)] ~ '^\s*[A-Za-z]{2}\s*$'
                         THEN s.partes[array_length(s.partes, 1) - 1] END),
           coalesce(nullif(btrim(s.dados_cadastro->>'estado'), ''),
                    CASE WHEN array_length(s.partes, 1) >= 2 AND s.partes[array_length(s.partes, 1)] ~ '^\s*[A-Za-z]{2}\s*$'
                         THEN s.partes[array_length(s.partes, 1)] END)
      FROM public.usuarios u
      JOIN public.perfis pf ON pf.id = u.perfil_id AND upper(pf.nome) = 'GESTOR'
      JOIN LATERAL (SELECT sa.dados_cadastro, string_to_array(coalesce(sa.dados_cadastro->>'endereco', ''), ',') AS partes
                      FROM public.solicitacoes_acesso sa
                     WHERE sa.usuario_id = u.id OR sa.auth_user_id = u.id ORDER BY sa.created_at DESC LIMIT 1) s ON true
     WHERE u.deleted_at IS NULL AND coalesce(u.ativo, true)
  ), limpo AS (
    SELECT tipo, nullif(regexp_replace(btrim(cidade), '\s+', ' ', 'g'), '') AS cidade, upper(nullif(btrim(estado), '')) AS uf FROM origem
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('cidade', x.cidade, 'uf', x.uf, 'anunciantes', x.anunciantes, 'pontos', x.pontos,
                                              'gestores', x.gestores, 'total', x.total) ORDER BY x.total DESC), '[]'::jsonb)
    FROM (SELECT cidade, CASE WHEN uf ~ '^[A-Z]{2}$' THEN uf END AS uf,
                 count(*) FILTER (WHERE tipo = 'anunciantes') AS anunciantes, count(*) FILTER (WHERE tipo = 'pontos') AS pontos,
                 count(*) FILTER (WHERE tipo = 'gestores') AS gestores, count(*) AS total
            FROM limpo WHERE cidade IS NOT NULL OR uf ~ '^[A-Z]{2}$'
           GROUP BY 1, 2) x;
$$;
REVOKE ALL ON FUNCTION public.fn_rede_presenca() FROM public;
GRANT EXECUTE ON FUNCTION public.fn_rede_presenca() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------- 4. Rádio Comércio (playlists de áudio)
CREATE TABLE IF NOT EXISTS public.radio_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  empresa_operadora_id uuid REFERENCES public.empresa_operadora(id),
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 80),
  embaralhar boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.radio_playlists IS 'F-150: playlist de áudio (Rádio Comércio): músicas e promoções do estabelecimento. Pode tocar em qualquer tela.';
CREATE TABLE IF NOT EXISTS public.radio_playlist_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.radio_playlists(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
  posicao integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS radio_playlist_itens_ordem ON public.radio_playlist_itens (playlist_id, posicao);

ALTER TABLE public.radio_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radio_playlist_itens ENABLE ROW LEVEL SECURITY;
-- mesma regra das playlists de mídia: o dono e o administrador da empresa dele
DROP POLICY IF EXISTS rp_tudo ON public.radio_playlists;
CREATE POLICY rp_tudo ON public.radio_playlists FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.fn_admin_da_empresa_do_usuario(user_id))
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS rpi_tudo ON public.radio_playlist_itens;
CREATE POLICY rpi_tudo ON public.radio_playlist_itens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.radio_playlists p WHERE p.id = radio_playlist_itens.playlist_id
                   AND (p.user_id = auth.uid() OR public.fn_admin_da_empresa_do_usuario(p.user_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.radio_playlists p WHERE p.id = radio_playlist_itens.playlist_id
                   AND (p.user_id = auth.uid() OR public.fn_admin_da_empresa_do_usuario(p.user_id)))
              -- só áudio que o próprio usuário enxerga entra na rádio
              AND EXISTS (SELECT 1 FROM public.media m WHERE m.id = radio_playlist_itens.media_id AND m.file_type = 'audio'));
REVOKE ALL ON public.radio_playlists, public.radio_playlist_itens FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.radio_playlists, public.radio_playlist_itens TO authenticated;

-- a tela escolhe: sem áudio (padrão), som das mídias (audio_enabled) ou Rádio Comércio
ALTER TABLE public.screens ADD COLUMN IF NOT EXISTS radio_ativa boolean NOT NULL DEFAULT false;
ALTER TABLE public.screens ADD COLUMN IF NOT EXISTS radio_playlist_id uuid REFERENCES public.radio_playlists(id) ON DELETE SET NULL;
ALTER TABLE public.screens ADD COLUMN IF NOT EXISTS radio_volume integer NOT NULL DEFAULT 70 CHECK (radio_volume BETWEEN 0 AND 100);
COMMENT ON COLUMN public.screens.radio_ativa IS 'F-150: Rádio Comércio ligada nesta tela (as mídias ficam mudas enquanto a rádio toca).';

-- Som da tela num lugar só (atômico): 'MUDO' | 'MIDIAS' | 'RADIO'
CREATE OR REPLACE FUNCTION public.fn_definir_som_da_tela(p_screen uuid, p_modo text, p_radio uuid DEFAULT NULL, p_volume integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_modo text := upper(coalesce(p_modo, ''));
BEGIN
  IF NOT public.fn_pode_gerir_layout_da_tela(p_screen) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar o som desta tela.' USING ERRCODE = '42501';
  END IF;
  IF v_modo NOT IN ('MUDO', 'MIDIAS', 'RADIO') THEN RAISE EXCEPTION 'Opção de som inválida.' USING ERRCODE = '22023'; END IF;
  IF v_modo = 'RADIO' THEN
    IF p_radio IS NULL OR NOT EXISTS (SELECT 1 FROM public.radio_playlists r
                                       WHERE r.id = p_radio AND (r.user_id = auth.uid() OR public.fn_admin_da_empresa_do_usuario(r.user_id))) THEN
      RAISE EXCEPTION 'Escolha uma playlist de áudio sua para a Rádio Comércio.' USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE public.screens
     SET audio_enabled = (v_modo = 'MIDIAS'),
         radio_ativa = (v_modo = 'RADIO'),
         radio_playlist_id = CASE WHEN v_modo = 'RADIO' THEN p_radio ELSE radio_playlist_id END,
         radio_volume = coalesce(least(greatest(p_volume, 0), 100), radio_volume)
   WHERE id = p_screen;
  RETURN jsonb_build_object('modo', v_modo);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_definir_som_da_tela(uuid, text, uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_definir_som_da_tela(uuid, text, uuid, integer) TO authenticated;

-- contrato do Player: a rádio da tela (só o aparelho vinculado; tela bloqueada não recebe)
CREATE OR REPLACE FUNCTION public.get_player_radio_for_screen(p_identifier text, p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_tela public.screens%ROWTYPE; v_faixas jsonb; v_embaralhar boolean;
BEGIN
  IF p_device_id IS NULL OR btrim(p_device_id) = '' OR p_device_id IN ('UNKNOWN', 'UNKNOWN_DEVICE') THEN
    RETURN '{"status": "SEM_ACESSO"}'::jsonb;
  END IF;
  IF p_identifier ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    SELECT * INTO v_tela FROM public.screens WHERE id = p_identifier::uuid;
  END IF;
  IF v_tela.id IS NULL THEN SELECT * INTO v_tela FROM public.screens WHERE custom_id = p_identifier LIMIT 1; END IF;
  IF v_tela.id IS NULL OR v_tela.bound_device_id IS DISTINCT FROM p_device_id
     OR coalesce(v_tela.is_active, true) = false OR coalesce(v_tela.bloqueada_por_inadimplencia, false) THEN
    RETURN '{"status": "SEM_ACESSO"}'::jsonb;
  END IF;
  IF NOT coalesce(v_tela.radio_ativa, false) OR v_tela.radio_playlist_id IS NULL THEN RETURN '{"status": "SEM_RADIO"}'::jsonb; END IF;

  SELECT r.embaralhar INTO v_embaralhar FROM public.radio_playlists r WHERE r.id = v_tela.radio_playlist_id;
  SELECT jsonb_agg(jsonb_build_object('id', i.id, 'media_id', m.id, 'nome', m.name, 'url', m.file_url,
                                      'duracao', CASE WHEN m.duration_ms > 0 THEN ceil(m.duration_ms / 1000.0)::int END) ORDER BY i.posicao, i.created_at)
    INTO v_faixas
    FROM public.radio_playlist_itens i JOIN public.media m ON m.id = i.media_id
   WHERE i.playlist_id = v_tela.radio_playlist_id AND m.file_type = 'audio' AND m.file_url IS NOT NULL;
  IF v_faixas IS NULL THEN RETURN '{"status": "SEM_RADIO"}'::jsonb; END IF;
  RETURN jsonb_build_object('status', 'SUCCESS', 'radio', jsonb_build_object(
           'playlist_id', v_tela.radio_playlist_id, 'volume', v_tela.radio_volume, 'embaralhar', coalesce(v_embaralhar, false), 'faixas', v_faixas));
END;
$$;
REVOKE ALL ON FUNCTION public.get_player_radio_for_screen(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_player_radio_for_screen(text, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------- 5. som comandado pela tela (função do Player)
CREATE OR REPLACE FUNCTION public.get_player_playlist_for_screen(p_identifier text, p_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
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
$fn$;
