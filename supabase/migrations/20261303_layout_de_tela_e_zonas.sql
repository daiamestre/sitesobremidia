-- ======================================================================
-- SOBRE MÍDIA — MIGRAÇÃO 20261303 — F-147 / MG-SLZ-01 e MG-SLZ-02
-- Divisão da tela em zonas (Screen Layout & Zone Engine) — modelo de dados e contrato do Player.
--
-- Decisões do proprietário (05/10/2026):
--   * layout POR TELA (uma tela tem no máximo um layout);
--   * zonas à vontade, em pixels da tela lógica (criadas por números ou clicando e arrastando);
--   * cada zona tem a sua playlist e o seu ciclo; a zona PRINCIPAL usa a playlist da própria tela;
--   * anúncio pago entra em todas as zonas que aceitam anúncio (o Player não repete a mesma mídia em duas zonas);
--   * prova de exibição por zona.
--
-- ADITIVA: 2 tabelas novas, 2 colunas opcionais em playback_logs, funções novas.
-- NÃO altera get_player_playlist_for_screen (o Player atual recebe exatamente o que recebia). O layout é entregue
-- por uma função NOVA (get_player_layout_for_screen), que só o Player que conhece zonas chama.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.get_player_layout_for_screen(text, text);
--   DROP FUNCTION IF EXISTS public.fn_player_itens_da_playlist(uuid, uuid, text, boolean);
--   DROP FUNCTION IF EXISTS public.fn_salvar_layout_da_tela(uuid, integer, integer, text, jsonb, boolean);
--   DROP FUNCTION IF EXISTS public.fn_excluir_layout_da_tela(uuid);
--   DROP FUNCTION IF EXISTS public.fn_pode_gerir_layout_da_tela(uuid);
--   ALTER TABLE public.playback_logs DROP COLUMN IF EXISTS zona_id, DROP COLUMN IF EXISTS zona_numero;
--   DROP TABLE IF EXISTS public.layout_zones; DROP TABLE IF EXISTS public.screen_layouts;
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.screen_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id uuid NOT NULL UNIQUE REFERENCES public.screens(id) ON DELETE CASCADE,
  empresa_operadora_id uuid REFERENCES public.empresa_operadora(id),
  largura_px integer NOT NULL CHECK (largura_px BETWEEN 16 AND 32768),
  altura_px integer NOT NULL CHECK (altura_px BETWEEN 16 AND 32768),
  cor_fundo text NOT NULL DEFAULT '#000000' CHECK (cor_fundo ~ '^#[0-9A-Fa-f]{6}$'),
  ativo boolean NOT NULL DEFAULT true,
  versao integer NOT NULL DEFAULT 1,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.screen_layouts IS 'F-147: divisão de uma tela em zonas. Uma linha por tela; sem linha = tela cheia tradicional.';

CREATE TABLE IF NOT EXISTS public.layout_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL REFERENCES public.screen_layouts(id) ON DELETE CASCADE,
  numero integer NOT NULL CHECK (numero >= 1),
  nome text CHECK (nome IS NULL OR length(nome) <= 80),
  x integer NOT NULL CHECK (x >= 0),
  y integer NOT NULL CHECK (y >= 0),
  largura integer NOT NULL CHECK (largura >= 1),
  altura integer NOT NULL CHECK (altura >= 1),
  ordem_z integer NOT NULL DEFAULT 0,
  rotacao integer NOT NULL DEFAULT 0 CHECK (rotacao IN (0, 90, 180, 270)),
  modo_encaixe text NOT NULL DEFAULT 'CONTER' CHECK (modo_encaixe IN ('CONTER', 'COBRIR', 'ESTICAR')),
  visivel boolean NOT NULL DEFAULT true,
  travada boolean NOT NULL DEFAULT false,
  principal boolean NOT NULL DEFAULT false,
  audio boolean NOT NULL DEFAULT false,
  anuncios_pagos boolean NOT NULL DEFAULT true,
  playlist_id uuid REFERENCES public.playlists(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (layout_id, numero),
  -- a zona principal usa a playlist da própria tela (screens.playlist_id): uma só fonte de verdade
  CHECK (NOT principal OR playlist_id IS NULL)
);
COMMENT ON TABLE public.layout_zones IS 'F-147: zona de um layout, em pixels da tela lógica. Conteúdo = playlist (a principal usa a da tela).';
CREATE UNIQUE INDEX IF NOT EXISTS layout_zones_uma_principal ON public.layout_zones (layout_id) WHERE principal;
CREATE UNIQUE INDEX IF NOT EXISTS layout_zones_um_audio ON public.layout_zones (layout_id) WHERE audio;
CREATE INDEX IF NOT EXISTS layout_zones_playlist ON public.layout_zones (playlist_id) WHERE playlist_id IS NOT NULL;

-- Prova de exibição por zona (opcional: registros de tela cheia continuam sem zona)
ALTER TABLE public.playback_logs ADD COLUMN IF NOT EXISTS zona_id uuid;
ALTER TABLE public.playback_logs ADD COLUMN IF NOT EXISTS zona_numero integer;
COMMENT ON COLUMN public.playback_logs.zona_id IS 'F-147: zona em que a mídia foi exibida (nulo = tela cheia).';

-- ---------------------------------------------------------------------- quem pode mexer no layout de uma tela
-- Mesma autoridade de quem já pode alterar a tela (regras scr_update_own + scr_update_so_gestao); tela parceira,
-- só dono/administrador.
CREATE OR REPLACE FUNCTION public.fn_pode_gerir_layout_da_tela(p_screen uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.screens s
     WHERE s.id = p_screen
       AND public.fn_player_can_access_screen(s.id)
       AND (s.user_id = auth.uid() OR NOT public.fn_perfil_sem_gestao_de_telas())
       AND (s.tipo_tela IS DISTINCT FROM 'PARCEIRA' OR public.fn_eh_owner_ou_admin()));
$$;
REVOKE ALL ON FUNCTION public.fn_pode_gerir_layout_da_tela(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_pode_gerir_layout_da_tela(uuid) TO authenticated;

ALTER TABLE public.screen_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layout_zones ENABLE ROW LEVEL SECURITY;

-- Leitura: quem enxerga a tela (a subconsulta respeita as regras de screens). Escrita: só pelas funções abaixo.
DROP POLICY IF EXISTS sl_select ON public.screen_layouts;
CREATE POLICY sl_select ON public.screen_layouts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.screens s WHERE s.id = screen_layouts.screen_id));
DROP POLICY IF EXISTS lz_select ON public.layout_zones;
CREATE POLICY lz_select ON public.layout_zones FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.screen_layouts l JOIN public.screens s ON s.id = l.screen_id WHERE l.id = layout_zones.layout_id));

REVOKE ALL ON public.screen_layouts, public.layout_zones FROM anon, public;
REVOKE INSERT, UPDATE, DELETE ON public.screen_layouts, public.layout_zones FROM authenticated;
GRANT SELECT ON public.screen_layouts, public.layout_zones TO authenticated;

-- ---------------------------------------------------------------------- salvar o layout inteiro (atômico)
-- p_zonas: [{id?, numero, nome?, x, y, largura, altura, ordem_z?, rotacao?, modo_encaixe?, visivel?, travada?,
--            principal?, audio?, anuncios_pagos?, playlist_id?}]
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
                                           visivel, travada, principal, audio, anuncios_pagos, playlist_id)
    VALUES (v_id, v_layout, (z->>'numero')::integer, NULLIF(btrim(left(coalesce(z->>'nome', ''), 80)), ''),
            (z->>'x')::integer, (z->>'y')::integer, (z->>'largura')::integer, (z->>'altura')::integer,
            coalesce((z->>'ordem_z')::integer, 0),
            CASE WHEN (z->>'rotacao') IN ('90', '180', '270') THEN (z->>'rotacao')::integer ELSE 0 END,
            CASE WHEN upper(coalesce(z->>'modo_encaixe', '')) IN ('COBRIR', 'ESTICAR') THEN upper(z->>'modo_encaixe') ELSE 'CONTER' END,
            coalesce((z->>'visivel')::boolean, true), coalesce((z->>'travada')::boolean, false),
            v_principal, coalesce((z->>'audio')::boolean, false), coalesce((z->>'anuncios_pagos')::boolean, true), v_playlist)
    ON CONFLICT (id) DO UPDATE
      SET numero = EXCLUDED.numero, nome = EXCLUDED.nome, x = EXCLUDED.x, y = EXCLUDED.y, largura = EXCLUDED.largura,
          altura = EXCLUDED.altura, ordem_z = EXCLUDED.ordem_z, rotacao = EXCLUDED.rotacao, modo_encaixe = EXCLUDED.modo_encaixe,
          visivel = EXCLUDED.visivel, travada = EXCLUDED.travada, principal = EXCLUDED.principal, audio = EXCLUDED.audio,
          anuncios_pagos = EXCLUDED.anuncios_pagos, playlist_id = EXCLUDED.playlist_id, updated_at = now();
  END LOOP;

  RETURN jsonb_build_object('layout_id', v_layout, 'versao', v_versao, 'zonas', v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_salvar_layout_da_tela(uuid, integer, integer, text, jsonb, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_salvar_layout_da_tela(uuid, integer, integer, text, jsonb, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_excluir_layout_da_tela(p_screen uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.fn_pode_gerir_layout_da_tela(p_screen) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar a divisão desta tela.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.screen_layouts WHERE screen_id = p_screen;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_excluir_layout_da_tela(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_excluir_layout_da_tela(uuid) TO authenticated;

-- ---------------------------------------------------------------------- itens de uma playlist no formato do Player
-- MESMA regra de itens de get_player_playlist_for_screen (itens comuns com os filtros W1/W7/W11, pasta da Biblioteca
-- com rodízio W12 e anúncios ativos do ponto F-107), para uma playlist qualquer da tela. A função principal não foi
-- alterada; o teste layoutDeTela confere que as duas devolvem a mesma lista para a playlist da tela.
CREATE OR REPLACE FUNCTION public.fn_player_itens_da_playlist(p_playlist uuid, p_screen uuid, p_device_id text, p_com_anuncios boolean DEFAULT true)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH v_screen AS (SELECT s.id, s.orientation, s.ponto_id FROM public.screens s WHERE s.id = p_screen)
  SELECT jsonb_agg(x.item ORDER BY x.pos, x.sub)
  FROM (
        SELECT jsonb_build_object(
            'id', pi.id,
            'position', pi.position,
            'duration', pi.duration,
            'start_time', pi.start_time,
            'end_time', pi.end_time,
            'days_of_week', array_to_string(pi.days, ','),
            'media', (
                SELECT jsonb_build_object('id', m.id, 'name', m.name, 'file_url', m.file_url, 'file_type', m.file_type, 'file_hash', m.file_hash)
                FROM public.media m WHERE m.id = pi.media_id
            ),
            'widget', (
                SELECT jsonb_build_object('id', w.id, 'name', w.name, 'widget_type', w.widget_type,
                                          'config', public.fn_widget_config_resolvido(w.widget_type, w.config))
                FROM public.widgets w WHERE w.id = pi.widget_id
            )
        ) AS item, pi.position AS pos, 0::bigint AS sub
        FROM public.playlist_items pi
        WHERE pi.playlist_id = p_playlist
          AND pi.biblioteca_pasta_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.widgets w0 WHERE w0.id = pi.widget_id AND w0.is_active = false)
          AND NOT EXISTS (SELECT 1 FROM public.widgets w7 WHERE w7.id = pi.widget_id AND NOT public.fn_widget_pode_exibir(w7.widget_type, w7.config))
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
            'start_time', NULL,
            'end_time', NULL,
            'days_of_week', NULL,
            'media', jsonb_build_object('id', m.id, 'name', m.name, 'file_url', m.file_url, 'file_type', m.file_type, 'file_hash', m.file_hash),
            'widget', NULL
        ) AS item, 100000 AS pos, row_number() OVER (ORDER BY coalesce(pa.ativado_em, pa.created_at), pa.id) AS sub
        FROM public.ponto_anuncios pa
        JOIN public.media m ON m.id = pa.media_id
        CROSS JOIN v_screen
        WHERE coalesce(p_com_anuncios, true)
          AND v_screen.ponto_id IS NOT NULL
          AND pa.ponto_id = v_screen.ponto_id
          AND pa.status = 'ATIVO'
          AND (pa.telas IS NULL OR v_screen.id = ANY (pa.telas))
          AND m.file_url IS NOT NULL AND m.file_type IN ('image', 'video')
  ) x;
$$;
REVOKE ALL ON FUNCTION public.fn_player_itens_da_playlist(uuid, uuid, text, boolean) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------- contrato do Player: layout da tela
-- Chamado DEPOIS de get_player_playlist_for_screen devolver SUCCESS (é ela que faz o vínculo do aparelho, a presença
-- e as checagens de suspensão). Aqui só se confere que o aparelho é o que está vinculado à tela.
-- Resposta: {status: SUCCESS | SEM_LAYOUT | SEM_ACESSO,
--            layout: {id, tela_id, versao, largura, altura, cor_fundo,
--                     zonas: [{id, numero, nome, x, y, largura, altura, ordem_z, rotacao, modo_encaixe, principal, audio,
--                              playlist: {id, name, audio_enabled, playlist_items[]} | null}]}}
-- A zona principal vem com playlist = null: o conteúdo dela é a playlist da tela, já entregue pela função principal.
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
           'playlist', CASE WHEN z.principal OR z.playlist_id IS NULL THEN NULL ELSE (
               SELECT jsonb_build_object('id', p.id, 'name', p.name, 'audio_enabled', coalesce(p.audio_enabled, false),
                                         'playlist_items', coalesce(public.fn_player_itens_da_playlist(p.id, v_tela.id, p_device_id, z.anuncios_pagos), '[]'::jsonb))
                 FROM public.playlists p WHERE p.id = z.playlist_id) END
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
