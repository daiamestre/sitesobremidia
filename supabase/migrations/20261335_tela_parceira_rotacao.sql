-- F-194 — Tela de ponto parceiro com rotação em 4 posições (p_dados.rotacao). Sem rotação: igual a antes
-- (o padrão sai do formato pelo gatilho trg_screens_rotacao_padrao). Rollback: evidence/F-194_rotacao_e_tela_paga/fn_salvar_tela_parceira.antes.json
CREATE OR REPLACE FUNCTION public.fn_salvar_tela_parceira(p_ponto uuid, p_tela uuid, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_empresa_operadora_id(auth.uid());
  v_ponto record; v_tela record; v_dono uuid; v_n int; v_id uuid;
  v_local text := nullif(btrim(coalesce(p_dados->>'local', '')), '');
  v_foto text := nullif(btrim(coalesce(p_dados->>'foto_url', '')), '');
  v_orient text := CASE WHEN lower(coalesce(p_dados->>'orientacao', '')) IN ('portrait', 'vertical', 'em_pe') THEN 'portrait' ELSE 'landscape' END;
  v_pol int := nullif(regexp_replace(coalesce(p_dados->>'polegadas', ''), '\D', '', 'g'), '')::int;
  v_valor numeric := nullif(replace(coalesce(p_dados->>'valor', ''), ',', '.'), '')::numeric;
  -- F-194: rotação em 4 posições (0/90/180/270); quando vem, ela decide se a tela fica em pé
  v_rot int := nullif(regexp_replace(coalesce(p_dados->>'rotacao', ''), '\D', '', 'g'), '')::int;
BEGIN
  IF v_rot IS NOT NULL AND v_rot NOT IN (0, 90, 180, 270) THEN RAISE EXCEPTION 'Rotação inválida (0, 90, 180 ou 270).' USING ERRCODE = '22023'; END IF;
  IF v_rot IS NOT NULL THEN v_orient := CASE WHEN v_rot IN (90, 270) THEN 'portrait' ELSE 'landscape' END; END IF;
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
                                endereco_instalacao, cidade, estado, capa_url, location, rotacao_tela)
    VALUES (left(v_ponto.nome || ' — Tela ' || v_n || ' · ' || v_local, 120), 'Tela do ponto parceiro ' || v_ponto.nome,
            coalesce(v_dono, auth.uid()), v_tenant, v_orient, CASE WHEN v_orient = 'portrait' THEN '1080x1920' ELSE '1920x1080' END, true,
            p_ponto, 'PARCEIRA', v_local, v_foto, v_pol, v_valor, 'AGUARDANDO_GRADE', false, auth.uid(),
            CASE WHEN (SELECT is_owner FROM public.usuarios WHERE id = auth.uid()) THEN 'OWNER' ELSE 'ADMIN' END,
            concat_ws(', ', v_ponto.logradouro, v_ponto.numero, v_ponto.bairro), coalesce(v_ponto.cidade, ''), coalesce(v_ponto.estado, ''),
            v_foto, v_local, v_rot)
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_tela FROM public.screens WHERE id = p_tela AND ponto_id = p_ponto AND tipo_tela = 'PARCEIRA';
    IF v_tela.id IS NULL THEN RAISE EXCEPTION 'Tela não encontrada neste ponto.' USING ERRCODE = 'P0002'; END IF;
    UPDATE public.screens SET
      name = left(v_ponto.nome || coalesce(' — Tela ' || substring(v_tela.name from 'Tela (\d+)'), '') || ' · ' || v_local, 120),
      local_instalacao = v_local, location = v_local,
      foto_local_url = coalesce(v_foto, foto_local_url), capa_url = coalesce(v_foto, capa_url),
      orientation = v_orient, resolution = CASE WHEN v_orient = 'portrait' THEN '1080x1920' ELSE '1920x1080' END,
      tamanho_polegadas = v_pol, valor_anuncio = v_valor,
      rotacao_tela = coalesce(v_rot, rotacao_tela)
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
$function$;
