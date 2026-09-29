-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261287 — F-119
-- "Sala" de pontos parceiros (pedido do proprietário):
--   * pontos.dados_cadastro: o formulário completo do cadastro (7 etapas) — tudo volta editável;
--   * fn_gravar_dados_cadastro_ponto: o cadastro grava o formulário ao terminar (quem cadastra: papéis internos);
--   * fn_atualizar_ponto_parceiro (OWNER/ADMIN): edita capa, galeria, dados, endereço, estrutura/público, comercial;
--     leva nome e endereço para as telas do ponto;
--   * fn_salvar_tela_parceira (OWNER/ADMIN): cria UMA tela nova no ponto ou edita uma existente
--     (foto do local, local, orientação, tamanho, valor); recalcula a ficha do ponto;
--   * valor R$ 0,00 = tela GRÁTIS: anúncio só em telas grátis não gera cobrança e vai ao ar quando a mídia é aprovada
--     (ponto_anuncios.origem 'GRATUITO').
-- ROLLBACK: reaplicar anunciar_no_ponto, trg_fn_midia_analisada e reativar_anuncio_no_ponto de 20261283;
--   DROP das funções novas; ALTER TABLE pontos DROP COLUMN dados_cadastro; restaurar o check de origem (PORTAL/CONTRATO).
-- ======================================================================

ALTER TABLE public.pontos ADD COLUMN IF NOT EXISTS dados_cadastro jsonb;

ALTER TABLE public.ponto_anuncios DROP CONSTRAINT IF EXISTS ponto_anuncios_origem_check;
ALTER TABLE public.ponto_anuncios ADD CONSTRAINT ponto_anuncios_origem_check CHECK (origem IN ('PORTAL', 'CONTRATO', 'GRATUITO'));

-- Ficha do ponto a partir das telas reais (quantidade, onde ficam, valor "a partir de")
CREATE OR REPLACE FUNCTION public.fn_recalcular_ponto(p_ponto uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.pontos po SET
    quantidade_telas = (SELECT count(*) FROM public.screens s WHERE s.ponto_id = po.id AND s.tipo_tela = 'PARCEIRA'),
    onde_ficam_as_telas = coalesce((
      SELECT jsonb_agg(jsonb_build_object('local', coalesce(s.local_instalacao, s.name), 'detalhe', NULL)
                       ORDER BY coalesce(substring(s.name from 'Tela (\d+)')::int, 999), s.created_at)
        FROM public.screens s WHERE s.ponto_id = po.id AND s.tipo_tela = 'PARCEIRA'), '[]'::jsonb),
    valor_anuncio = coalesce((SELECT min(s.valor_anuncio) FROM public.screens s
                               WHERE s.ponto_id = po.id AND s.tipo_tela = 'PARCEIRA' AND s.valor_anuncio IS NOT NULL), po.valor_anuncio),
    updated_at = now()
  WHERE po.id = p_ponto;
$$;
REVOKE ALL ON FUNCTION public.fn_recalcular_ponto(uuid) FROM public, anon, authenticated;

-- O cadastro grava o formulário completo (para a edição trazer tudo de volta)
CREATE OR REPLACE FUNCTION public.fn_gravar_dados_cadastro_ponto(p_ponto uuid, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_internal_role() THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501'; END IF;
  UPDATE public.pontos SET dados_cadastro = p_dados, updated_at = now()
   WHERE id = p_ponto AND empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
     AND (dados_cadastro IS NULL OR public.fn_eh_owner_ou_admin());
END;
$$;
REVOKE ALL ON FUNCTION public.fn_gravar_dados_cadastro_ponto(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_gravar_dados_cadastro_ponto(uuid, jsonb) TO authenticated;

-- Edição completa do ponto (OWNER/ADMIN)
CREATE OR REPLACE FUNCTION public.fn_atualizar_ponto_parceiro(p_ponto uuid, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_ponto record; v_tenant uuid := public.get_user_empresa_operadora_id(auth.uid()); v_nome text;
BEGIN
  IF NOT public.fn_eh_owner_ou_admin() THEN RAISE EXCEPTION 'Só o dono e os administradores editam pontos parceiros.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_ponto FROM public.pontos WHERE id = p_ponto AND empresa_operadora_id = v_tenant AND deleted_at IS NULL;
  IF v_ponto.id IS NULL THEN RAISE EXCEPTION 'Ponto parceiro não encontrado.' USING ERRCODE = 'P0002'; END IF;
  v_nome := nullif(btrim(coalesce(p_dados->>'nome', '')), '');
  IF v_nome IS NULL OR length(v_nome) < 2 THEN RAISE EXCEPTION 'Informe o nome do ponto parceiro.' USING ERRCODE = '22023'; END IF;

  UPDATE public.pontos SET
    nome = v_nome,
    categoria = nullif(btrim(coalesce(p_dados->>'categoria', '')), ''),
    descricao = nullif(btrim(coalesce(p_dados->>'descricao', '')), ''),
    foto_url = nullif(btrim(coalesce(p_dados->>'foto_url', '')), ''),
    galeria = coalesce(p_dados->'galeria', galeria),
    cep = nullif(btrim(coalesce(p_dados->>'cep', '')), ''),
    logradouro = nullif(btrim(coalesce(p_dados->>'logradouro', '')), ''),
    numero = nullif(btrim(coalesce(p_dados->>'numero', '')), ''),
    complemento = nullif(btrim(coalesce(p_dados->>'complemento', '')), ''),
    bairro = nullif(btrim(coalesce(p_dados->>'bairro', '')), ''),
    cidade = nullif(btrim(coalesce(p_dados->>'cidade', '')), ''),
    estado = upper(left(nullif(btrim(coalesce(p_dados->>'estado', '')), ''), 2)),
    latitude = nullif(p_dados->>'latitude', '')::numeric,
    longitude = nullif(p_dados->>'longitude', '')::numeric,
    horario_funcionamento = nullif(btrim(coalesce(p_dados->>'horario_funcionamento', '')), ''),
    publico_estimado_dia = nullif(regexp_replace(coalesce(p_dados->>'publico_estimado_dia', ''), '\D', '', 'g'), '')::int,
    regras_comerciais = nullif(btrim(coalesce(p_dados->>'regras_comerciais', '')), ''),
    modelo_comercial = coalesce(nullif(p_dados->>'modelo_comercial', ''), modelo_comercial),
    disponibilidade = coalesce(nullif(p_dados->>'disponibilidade', ''), disponibilidade),
    ativo = coalesce((p_dados->>'ativo')::boolean, ativo),
    dados_cadastro = coalesce(p_dados->'dados_cadastro', dados_cadastro),
    updated_at = now()
  WHERE id = p_ponto;

  -- nome e endereço seguem para as telas do ponto (o nome da tela mantém "— Tela N · local")
  PERFORM set_config('sobremidia.sistema', 'on', true);
  UPDATE public.screens s SET
    name = left(v_nome || coalesce(substring(s.name from ' — Tela \d+.*$'), ''), 120),
    description = 'Tela do ponto parceiro ' || v_nome,
    endereco_instalacao = concat_ws(', ', nullif(btrim(coalesce(p_dados->>'logradouro', '')), ''), nullif(btrim(coalesce(p_dados->>'numero', '')), ''), nullif(btrim(coalesce(p_dados->>'bairro', '')), '')),
    cidade = coalesce(nullif(btrim(coalesce(p_dados->>'cidade', '')), ''), ''),
    estado = coalesce(upper(left(nullif(btrim(coalesce(p_dados->>'estado', '')), ''), 2)), '')
  WHERE s.ponto_id = p_ponto AND s.tipo_tela = 'PARCEIRA';
  PERFORM set_config('sobremidia.sistema', '', true);

  PERFORM public.fn_recalcular_ponto(p_ponto);
  RETURN jsonb_build_object('status', 'OK');
END;
$$;
REVOKE ALL ON FUNCTION public.fn_atualizar_ponto_parceiro(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_ponto_parceiro(uuid, jsonb) TO authenticated;

-- Criar UMA tela nova no ponto ou editar uma tela existente (OWNER/ADMIN)
CREATE OR REPLACE FUNCTION public.fn_salvar_tela_parceira(p_ponto uuid, p_tela uuid, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tenant uuid := public.get_user_empresa_operadora_id(auth.uid());
  v_ponto record; v_tela record; v_dono uuid; v_n int; v_id uuid;
  v_local text := nullif(btrim(coalesce(p_dados->>'local', '')), '');
  v_foto text := nullif(btrim(coalesce(p_dados->>'foto_url', '')), '');
  v_orient text := CASE WHEN lower(coalesce(p_dados->>'orientacao', '')) IN ('portrait', 'vertical', 'em_pe') THEN 'portrait' ELSE 'landscape' END;
  v_pol int := nullif(regexp_replace(coalesce(p_dados->>'polegadas', ''), '\D', '', 'g'), '')::int;
  v_valor numeric := nullif(replace(coalesce(p_dados->>'valor', ''), ',', '.'), '')::numeric;
BEGIN
  IF NOT public.fn_eh_owner_ou_admin() THEN RAISE EXCEPTION 'Só o dono e os administradores cadastram e editam telas de pontos parceiros.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_ponto FROM public.pontos WHERE id = p_ponto AND empresa_operadora_id = v_tenant AND deleted_at IS NULL;
  IF v_ponto.id IS NULL THEN RAISE EXCEPTION 'Ponto parceiro não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF v_local IS NULL THEN RAISE EXCEPTION 'Informe onde a tela fica no estabelecimento.' USING ERRCODE = '22023'; END IF;
  IF v_valor IS NULL OR v_valor < 0 THEN RAISE EXCEPTION 'Informe o valor da tela (R$ 0,00 = grátis).' USING ERRCODE = '22023'; END IF;
  IF v_pol IS NOT NULL AND (v_pol < 10 OR v_pol > 200) THEN RAISE EXCEPTION 'Tamanho da tela inválido (10 a 200 polegadas).' USING ERRCODE = '22023'; END IF;

  PERFORM set_config('sobremidia.sistema', 'on', true);
  IF p_tela IS NULL THEN
    SELECT id INTO v_dono FROM public.usuarios WHERE empresa_operadora_id = v_tenant AND is_owner ORDER BY created_at LIMIT 1;
    SELECT coalesce(max(substring(name from 'Tela (\d+)')::int), 0) + 1 INTO v_n
      FROM public.screens WHERE ponto_id = p_ponto AND tipo_tela = 'PARCEIRA';
    INSERT INTO public.screens (name, description, user_id, empresa_operadora_id, orientation, resolution, is_active,
                                ponto_id, tipo_tela, local_instalacao, foto_local_url, tamanho_polegadas, valor_anuncio,
                                status_grade, criada_por_gestor, cadastrada_por, cadastrada_por_papel,
                                endereco_instalacao, cidade, estado, capa_url, location)
    VALUES (left(v_ponto.nome || ' — Tela ' || v_n || ' · ' || v_local, 120), 'Tela do ponto parceiro ' || v_ponto.nome,
            coalesce(v_dono, auth.uid()), v_tenant, v_orient, CASE WHEN v_orient = 'portrait' THEN '1080x1920' ELSE '1920x1080' END, true,
            p_ponto, 'PARCEIRA', v_local, v_foto, v_pol, v_valor, 'AGUARDANDO_GRADE', false, auth.uid(),
            CASE WHEN (SELECT is_owner FROM public.usuarios WHERE id = auth.uid()) THEN 'OWNER' ELSE 'ADMIN' END,
            concat_ws(', ', v_ponto.logradouro, v_ponto.numero, v_ponto.bairro), coalesce(v_ponto.cidade, ''), coalesce(v_ponto.estado, ''),
            v_foto, v_local)
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_tela FROM public.screens WHERE id = p_tela AND ponto_id = p_ponto AND tipo_tela = 'PARCEIRA';
    IF v_tela.id IS NULL THEN RAISE EXCEPTION 'Tela não encontrada neste ponto.' USING ERRCODE = 'P0002'; END IF;
    UPDATE public.screens SET
      name = left(v_ponto.nome || coalesce(' — Tela ' || substring(v_tela.name from 'Tela (\d+)'), '') || ' · ' || v_local, 120),
      local_instalacao = v_local, location = v_local,
      foto_local_url = coalesce(v_foto, foto_local_url), capa_url = coalesce(v_foto, capa_url),
      orientation = v_orient, resolution = CASE WHEN v_orient = 'portrait' THEN '1080x1920' ELSE '1920x1080' END,
      tamanho_polegadas = v_pol, valor_anuncio = v_valor
    WHERE id = p_tela
    RETURNING id INTO v_id;
  END IF;
  PERFORM set_config('sobremidia.sistema', '', true);

  -- foto nova do local entra na galeria do ponto (sem repetir)
  IF v_foto IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_ponto.galeria, '[]'::jsonb)) g WHERE g->>'url' = v_foto) THEN
    UPDATE public.pontos SET galeria = coalesce(galeria, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('url', v_foto, 'legenda', v_local))
     WHERE id = p_ponto;
  END IF;
  PERFORM public.fn_recalcular_ponto(p_ponto);
  RETURN jsonb_build_object('status', 'OK', 'tela', v_id, 'gratis', v_valor = 0);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_salvar_tela_parceira(uuid, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_salvar_tela_parceira(uuid, uuid, jsonb) TO authenticated;

-- ======================================================================
-- Telas grátis (valor R$ 0,00) — a partir das versões de 20261283
-- ======================================================================
CREATE OR REPLACE FUNCTION public.anunciar_no_ponto(p_ponto uuid, p_asset uuid, p_telas uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cliente uuid := public.get_user_cliente_id();
  v_tenant uuid := public.get_user_empresa_operadora_id(auth.uid());
  v_ponto record; v_asset record; v_media uuid; v_id uuid; v_atual record;
  v_telas uuid[]; v_valor numeric; v_status text; v_cob uuid; v_contratadas uuid[]; v_origem text := 'PORTAL';
BEGIN
  IF v_cliente IS NULL THEN RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_ponto FROM public.pontos
   WHERE id = p_ponto AND empresa_operadora_id = v_tenant AND ativo AND deleted_at IS NULL
     AND status_operacional = 'ATIVO' AND disponibilidade <> 'INDISPONIVEL';
  IF v_ponto.id IS NULL THEN RAISE EXCEPTION 'Ponto parceiro indisponível.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_asset FROM public.cliente_assets WHERE id = p_asset AND cliente_id = v_cliente;
  IF v_asset.id IS NULL THEN RAISE EXCEPTION 'Mídia não encontrada na sua conta.' USING ERRCODE = '42501'; END IF;
  IF v_asset.tipo NOT IN ('imagem', 'video') THEN RAISE EXCEPTION 'Só imagens e vídeos podem ser anunciados nas telas.' USING ERRCODE = '22023'; END IF;
  IF v_asset.moderacao_status = 'RECUSADA' THEN
    RAISE EXCEPTION 'Esta mídia não foi aprovada: %', coalesce(v_asset.moderacao_motivo, 'fora das diretrizes de conteúdo.') USING ERRCODE = '22023';
  END IF;

  -- F-113: telas vendidas pelo representante (contrato)
  SELECT coalesce(cp.telas, '{}') INTO v_contratadas FROM public.cliente_pontos cp WHERE cp.cliente_id = v_cliente AND cp.ponto_id = v_ponto.id;
  v_contratadas := coalesce(v_contratadas, '{}');
  IF cardinality(v_contratadas) > 0 AND (p_telas IS NULL OR cardinality(p_telas) = 0 OR p_telas <@ v_contratadas) THEN
    v_origem := 'CONTRATO';
    p_telas := CASE WHEN p_telas IS NULL OR cardinality(p_telas) = 0 THEN v_contratadas ELSE p_telas END;
  END IF;

  -- telas escolhidas (do próprio ponto); sem escolha = todas as telas do ponto
  SELECT array_agg(s.id ORDER BY s.name), sum(s.valor_anuncio) INTO v_telas, v_valor
    FROM public.screens s
   WHERE s.ponto_id = v_ponto.id AND s.tipo_tela = 'PARCEIRA'
     AND (p_telas IS NULL OR cardinality(p_telas) = 0 OR s.id = ANY (p_telas));
  IF p_telas IS NOT NULL AND cardinality(p_telas) > 0 AND coalesce(cardinality(v_telas), 0) <> cardinality(p_telas) THEN
    RAISE EXCEPTION 'Escolha apenas telas deste ponto parceiro.' USING ERRCODE = '22023';
  END IF;
  v_valor := coalesce(v_valor, v_ponto.valor_anuncio);
  IF v_origem = 'PORTAL' AND v_valor IS NULL THEN RAISE EXCEPTION 'Este ponto ainda não tem valor para anunciar.' USING ERRCODE = '22023'; END IF;
  -- F-119: só telas com valor R$ 0,00 = grátis (sem cobrança; no ar quando a mídia for aprovada)
  IF v_origem = 'PORTAL' AND v_valor = 0 THEN v_origem := 'GRATUITO'; END IF;

  SELECT * INTO v_atual FROM public.ponto_anuncios WHERE ponto_id = v_ponto.id AND asset_id = v_asset.id;
  IF v_atual.id IS NOT NULL AND v_atual.status IN ('ATIVO', 'AGUARDANDO_PAGAMENTO', 'EM_ANALISE') THEN
    RAISE EXCEPTION 'Esta mídia já está neste ponto (situação: %).',
      CASE v_atual.status WHEN 'ATIVO' THEN 'no ar' WHEN 'AGUARDANDO_PAGAMENTO' THEN 'aguardando pagamento' ELSE 'em análise' END
      USING ERRCODE = '22023';
  END IF;

  -- espelho da mídia no Player (mesmo padrão de publicar_playlist_cliente)
  SELECT id INTO v_media FROM public.media WHERE user_id = auth.uid() AND file_path = 'portal/' || v_asset.id::text LIMIT 1;
  IF v_media IS NULL THEN
    INSERT INTO public.media (user_id, name, file_path, file_url, file_type, file_size, mime_type)
    VALUES (auth.uid(), v_asset.nome, 'portal/' || v_asset.id::text, v_asset.object_url,
            CASE WHEN v_asset.tipo = 'video' THEN 'video' ELSE 'image' END,
            coalesce(v_asset.tamanho, 0), coalesce(v_asset.mime_type, 'application/octet-stream'))
    RETURNING id INTO v_media;
  END IF;

  v_status := CASE
    WHEN v_asset.moderacao_status <> 'APROVADA' THEN 'EM_ANALISE'
    WHEN v_origem = 'GRATUITO' THEN 'ATIVO'
    WHEN v_origem = 'CONTRATO' AND public.fn_contrato_em_dia(v_cliente) THEN 'ATIVO'
    ELSE 'AGUARDANDO_PAGAMENTO' END;
  INSERT INTO public.ponto_anuncios (empresa_operadora_id, ponto_id, cliente_id, asset_id, media_id, status, created_by, telas, valor_mensal, motivo, origem, ativado_em)
  VALUES (v_tenant, v_ponto.id, v_cliente, v_asset.id, v_media, v_status, auth.uid(), v_telas,
          CASE WHEN v_origem IN ('CONTRATO', 'GRATUITO') THEN 0 ELSE v_valor END, NULL, v_origem, CASE WHEN v_status = 'ATIVO' THEN now() END)
  ON CONFLICT (ponto_id, asset_id) DO UPDATE
    SET status = EXCLUDED.status, media_id = EXCLUDED.media_id, telas = EXCLUDED.telas, valor_mensal = EXCLUDED.valor_mensal,
        origem = EXCLUDED.origem, ativado_em = coalesce(public.ponto_anuncios.ativado_em, EXCLUDED.ativado_em), motivo = NULL, updated_at = now()
  RETURNING id INTO v_id;

  IF v_status = 'AGUARDANDO_PAGAMENTO' AND v_origem = 'PORTAL' THEN v_cob := public.fn_cobranca_do_anuncio(v_id); END IF;

  INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
  VALUES (v_tenant, auth.uid(), 'PONTO_ANUNCIO', v_id, 'PLAYLIST_PUBLICADA_PONTO', v_status,
          'Mídia "' || v_asset.nome || '" no ponto ' || v_ponto.nome || ' (' || cardinality(v_telas) || ' tela(s), ' ||
          CASE WHEN v_origem = 'CONTRATO' THEN 'incluídas no contrato' WHEN v_origem = 'GRATUITO' THEN 'telas grátis' ELSE 'R$ ' || v_valor || '/mês' END || ')');

  RETURN jsonb_build_object('status', v_status, 'anuncio_id', v_id, 'valor', CASE WHEN v_origem IN ('CONTRATO', 'GRATUITO') THEN 0 ELSE v_valor END,
    'telas', cardinality(v_telas), 'origem', v_origem,
    'cobranca', (SELECT jsonb_build_object('codigo', c.codigo_operacional, 'identificador', c.public_identifier, 'vencimento', c.data_vencimento)
                   FROM public.contas_receber c WHERE c.id = v_cob));
END;
$$;
REVOKE ALL ON FUNCTION public.anunciar_no_ponto(uuid, uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.anunciar_no_ponto(uuid, uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_fn_midia_analisada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r record; v_em_dia boolean;
BEGIN
  IF NEW.moderacao_status IS NOT DISTINCT FROM OLD.moderacao_status THEN RETURN NEW; END IF;
  IF NEW.moderacao_status = 'APROVADA' THEN
    FOR r IN UPDATE public.ponto_anuncios SET status = 'AGUARDANDO_PAGAMENTO', updated_at = now()
              WHERE asset_id = NEW.id AND status = 'EM_ANALISE' AND origem = 'PORTAL' RETURNING id LOOP
      PERFORM public.fn_cobranca_do_anuncio(r.id);
    END LOOP;
    -- F-119: telas grátis — no ar assim que a mídia é aprovada
    UPDATE public.ponto_anuncios SET status = 'ATIVO', ativado_em = coalesce(ativado_em, now()), updated_at = now()
     WHERE asset_id = NEW.id AND status = 'EM_ANALISE' AND origem = 'GRATUITO';
    v_em_dia := public.fn_contrato_em_dia(NEW.cliente_id);
    UPDATE public.ponto_anuncios
       SET status = CASE WHEN v_em_dia THEN 'ATIVO' ELSE 'AGUARDANDO_PAGAMENTO' END,
           ativado_em = CASE WHEN v_em_dia THEN coalesce(ativado_em, now()) ELSE ativado_em END, updated_at = now()
     WHERE asset_id = NEW.id AND status = 'EM_ANALISE' AND origem = 'CONTRATO';
    PERFORM public.fn_avisar_cliente(NEW.cliente_id, NEW.empresa_operadora_id, 'MIDIA_APROVADA', 'Mídia aprovada',
      '"' || NEW.nome || '" foi aprovada. Se você escolheu um ponto parceiro, veja a situação do anúncio na página do ponto.',
      'CLIENTE_ASSET', NEW.id, 'SUCESSO', 'INFO');
  ELSIF NEW.moderacao_status = 'RECUSADA' THEN
    UPDATE public.ponto_anuncios SET status = 'RECUSADO', motivo = NEW.moderacao_motivo, updated_at = now()
     WHERE asset_id = NEW.id AND status IN ('EM_ANALISE', 'AGUARDANDO_PAGAMENTO');
    PERFORM public.fn_avisar_cliente(NEW.cliente_id, NEW.empresa_operadora_id, 'MIDIA_RECUSADA', 'Mídia não aprovada',
      '"' || NEW.nome || '" não atende às diretrizes de conteúdo' || coalesce(': ' || NEW.moderacao_motivo, '.'),
      'CLIENTE_ASSET', NEW.id, 'ATENCAO', 'AVISO');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reativar_anuncio_no_ponto(p_anuncio uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE a record; v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT * INTO a FROM public.ponto_anuncios WHERE id = p_anuncio AND cliente_id = public.get_user_cliente_id();
  IF a.id IS NULL THEN RAISE EXCEPTION 'Anúncio não encontrado.' USING ERRCODE = '42501'; END IF;
  IF a.status NOT IN ('PAUSADO', 'SUSPENSO') THEN RETURN jsonb_build_object('status', a.status); END IF;
  IF a.origem = 'GRATUITO' THEN
    UPDATE public.ponto_anuncios SET status = 'ATIVO', updated_at = now() WHERE id = a.id;
    RETURN jsonb_build_object('status', 'ATIVO');
  END IF;
  IF a.origem = 'CONTRATO' THEN
    UPDATE public.ponto_anuncios
       SET status = CASE WHEN public.fn_contrato_em_dia(a.cliente_id) THEN 'ATIVO' ELSE 'AGUARDANDO_PAGAMENTO' END, updated_at = now()
     WHERE id = a.id RETURNING status INTO a.status;
    RETURN jsonb_build_object('status', a.status);
  END IF;
  IF a.valido_ate IS NOT NULL AND a.valido_ate >= v_hoje AND a.status = 'PAUSADO' THEN
    UPDATE public.ponto_anuncios SET status = 'ATIVO', updated_at = now() WHERE id = a.id;
    RETURN jsonb_build_object('status', 'ATIVO');
  END IF;
  UPDATE public.ponto_anuncios SET status = 'AGUARDANDO_PAGAMENTO', updated_at = now() WHERE id = a.id;
  PERFORM public.fn_cobranca_do_anuncio(a.id);
  RETURN jsonb_build_object('status', 'AGUARDANDO_PAGAMENTO');
END;
$$;
REVOKE ALL ON FUNCTION public.reativar_anuncio_no_ponto(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reativar_anuncio_no_ponto(uuid) TO authenticated;

-- F-119: valor da tela aceita R$ 0,00 (grátis) — a partir da definição viva
CREATE OR REPLACE FUNCTION public.fn_atualizar_valor_tela(p_tela uuid, p_valor numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ponto uuid;
BEGIN
  IF NOT public.fn_eh_owner_ou_admin() THEN
    RAISE EXCEPTION 'Só o dono e os administradores alteram o valor da tela parceira.' USING ERRCODE = '42501';
  END IF;
  IF p_valor IS NULL OR p_valor < 0 THEN RAISE EXCEPTION 'Informe o valor da tela (R$ 0,00 = grátis).' USING ERRCODE = '22023'; END IF;
  UPDATE public.screens SET valor_anuncio = round(p_valor, 2), updated_at = now()
   WHERE id = p_tela AND tipo_tela = 'PARCEIRA' AND empresa_operadora_id = public.get_user_tenant_id()
   RETURNING ponto_id INTO v_ponto;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tela parceira não encontrada.' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.pontos SET valor_anuncio = (SELECT min(valor_anuncio) FROM public.screens WHERE ponto_id = v_ponto AND tipo_tela = 'PARCEIRA'),
         updated_at = now()
   WHERE id = v_ponto;
  RETURN jsonb_build_object('status', 'OK');
END;
$function$;
