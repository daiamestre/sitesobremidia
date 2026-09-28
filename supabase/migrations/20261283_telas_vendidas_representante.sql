-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261283 — F-113
-- Representante (ou OWNER/ADMIN) vende telas de pontos parceiros no cadastro do anunciante:
--   * cliente_pontos + telas (as telas vendidas de cada ponto) e valor_calculado (soma dos valores das telas);
--   * fn_registrar_telas_anunciante: grava a escolha (o valor negociado vai no contrato; fica na auditoria);
--   * portal_telas_contratadas(p_ponto): telas do contrato do anunciante naquele ponto;
--   * anunciar_no_ponto: nas telas do contrato não gera cobrança avulsa (origem CONTRATO); vai ao ar quando a
--     mídia está aprovada e o contrato em dia (fatura paga e nada com 4+ dias de atraso);
--   * pagamento de fatura do contrato ativa os anúncios CONTRATO do cliente; atraso de 4 dias suspende.
-- ROLLBACK: reaplicar anunciar_no_ponto, trg_fn_anuncio_pago, trg_fn_midia_analisada e fn_renovar_anuncios_ponto
--   de 20261280; DROP das funções novas; ALTER TABLE ... DROP COLUMN das colunas novas.
-- ======================================================================

-- Causa raiz achada na homologação: o gatilho trg_cp_updated_at (handle_updated_at) faz NEW.version = OLD.version + 1,
-- mas cliente_pontos nunca teve a coluna version → TODO UPDATE falhava (inclusive refazer a seleção de pontos de um cliente).
ALTER TABLE public.cliente_pontos ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.cliente_pontos
  ADD COLUMN IF NOT EXISTS telas uuid[],
  ADD COLUMN IF NOT EXISTS valor_calculado numeric(10,2);
ALTER TABLE public.ponto_anuncios
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'PORTAL' CHECK (origem IN ('PORTAL', 'CONTRATO'));

-- Contrato em dia: tem fatura de contrato paga e nenhuma fatura de contrato com 4+ dias de atraso
CREATE OR REPLACE FUNCTION public.fn_contrato_em_dia(p_cliente uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.contas_receber c WHERE c.cliente_id = p_cliente AND c.contrato_id IS NOT NULL
                   AND upper(c.status) IN ('PAGA', 'PAGO', 'CONCILIADA'))
     AND NOT EXISTS (SELECT 1 FROM public.contas_receber c WHERE c.cliente_id = p_cliente AND c.contrato_id IS NOT NULL
                   AND upper(c.status) NOT IN ('PAGA', 'PAGO', 'CONCILIADA', 'CANCELADA', 'CANCELADO')
                   AND c.data_vencimento + 4 <= (now() AT TIME ZONE 'America/Sao_Paulo')::date);
$$;
REVOKE ALL ON FUNCTION public.fn_contrato_em_dia(uuid) FROM public, anon, authenticated;

-- Grava as telas vendidas (chamada pelo assistente depois de selecionar_pontos_prospeccao)
CREATE OR REPLACE FUNCTION public.fn_registrar_telas_anunciante(p_cliente uuid, p_selecao jsonb, p_valor_negociado numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid := public.get_user_empresa_operadora_id(auth.uid());
  v_perfil text; v_rep uuid; v_cliente record; item jsonb; v_ponto uuid; v_pedidas uuid[]; v_telas uuid[]; v_valor numeric;
  v_total numeric := 0; v_n int := 0;
BEGIN
  IF v_caller IS NULL OR v_tenant IS NULL THEN RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501'; END IF;
  SELECT upper(coalesce(p.nome, '')), r.id INTO v_perfil, v_rep
    FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id LEFT JOIN public.representantes r ON r.usuario_id = u.id
   WHERE u.id = v_caller;
  SELECT * INTO v_cliente FROM public.clientes WHERE id = p_cliente AND empresa_operadora_id = v_tenant AND deleted_at IS NULL;
  IF v_cliente.id IS NULL THEN RAISE EXCEPTION 'Cliente inexistente ou fora do seu escopo.' USING ERRCODE = '42501'; END IF;
  IF v_perfil = 'REPRESENTANTE' THEN
    IF v_rep IS NULL OR v_cliente.representante_id IS DISTINCT FROM v_rep THEN
      RAISE EXCEPTION 'Cliente não pertence à sua carteira.' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.is_internal_role() THEN
    RAISE EXCEPTION 'Só representante, dono ou administrador registram telas vendidas.' USING ERRCODE = '42501';
  END IF;
  IF p_valor_negociado IS NOT NULL AND p_valor_negociado < 0 THEN RAISE EXCEPTION 'Valor inválido.' USING ERRCODE = '22023'; END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(coalesce(p_selecao, '[]'::jsonb)) LOOP
    v_ponto := (item->>'ponto')::uuid;
    SELECT array_agg(x::uuid) INTO v_pedidas FROM jsonb_array_elements_text(coalesce(item->'telas', '[]'::jsonb)) x;
    SELECT array_agg(s.id ORDER BY s.name), sum(s.valor_anuncio) INTO v_telas, v_valor
      FROM public.screens s
     WHERE s.ponto_id = v_ponto AND s.tipo_tela = 'PARCEIRA' AND s.empresa_operadora_id = v_tenant AND s.id = ANY (coalesce(v_pedidas, '{}'));
    IF coalesce(cardinality(v_pedidas), 0) = 0 OR coalesce(cardinality(v_telas), 0) <> cardinality(v_pedidas) THEN
      RAISE EXCEPTION 'Escolha ao menos uma tela e apenas telas do próprio ponto parceiro.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.cliente_pontos SET telas = v_telas, valor_calculado = coalesce(v_valor, 0), updated_at = now()
     WHERE cliente_id = p_cliente AND ponto_id = v_ponto;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ponto não selecionado para este cliente.' USING ERRCODE = '22023'; END IF;
    v_total := v_total + coalesce(v_valor, 0); v_n := v_n + cardinality(v_telas);
  END LOOP;

  INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
  VALUES (v_tenant, v_caller, 'CLIENTE_PONTOS', p_cliente, 'PROSPECCAO_PONTOS_SINCRONIZADOS', 'ATIVO',
          v_n || ' tela(s) de pontos parceiros vendidas. Calculado: R$ ' || v_total ||
          coalesce(' · negociado: R$ ' || p_valor_negociado, '') || '/mês.');
  RETURN jsonb_build_object('telas', v_n, 'valor_calculado', v_total, 'valor_negociado', p_valor_negociado);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_registrar_telas_anunciante(uuid, jsonb, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_registrar_telas_anunciante(uuid, jsonb, numeric) TO authenticated;

-- Portal: telas do contrato do anunciante neste ponto
CREATE OR REPLACE FUNCTION public.portal_telas_contratadas(p_ponto uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce((SELECT cp.telas FROM public.cliente_pontos cp
                    WHERE cp.cliente_id = public.get_user_cliente_id() AND cp.ponto_id = p_ponto), '{}'::uuid[]);
$$;
REVOKE ALL ON FUNCTION public.portal_telas_contratadas(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_telas_contratadas(uuid) TO authenticated;

-- Anunciar: telas do contrato não geram cobrança avulsa
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
  IF v_origem = 'PORTAL' AND coalesce(v_valor, 0) <= 0 THEN RAISE EXCEPTION 'Este ponto ainda não tem valor para anunciar.' USING ERRCODE = '22023'; END IF;

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
    WHEN v_origem = 'CONTRATO' AND public.fn_contrato_em_dia(v_cliente) THEN 'ATIVO'
    ELSE 'AGUARDANDO_PAGAMENTO' END;
  INSERT INTO public.ponto_anuncios (empresa_operadora_id, ponto_id, cliente_id, asset_id, media_id, status, created_by, telas, valor_mensal, motivo, origem, ativado_em)
  VALUES (v_tenant, v_ponto.id, v_cliente, v_asset.id, v_media, v_status, auth.uid(), v_telas,
          CASE WHEN v_origem = 'CONTRATO' THEN 0 ELSE v_valor END, NULL, v_origem, CASE WHEN v_status = 'ATIVO' THEN now() END)
  ON CONFLICT (ponto_id, asset_id) DO UPDATE
    SET status = EXCLUDED.status, media_id = EXCLUDED.media_id, telas = EXCLUDED.telas, valor_mensal = EXCLUDED.valor_mensal,
        origem = EXCLUDED.origem, ativado_em = coalesce(public.ponto_anuncios.ativado_em, EXCLUDED.ativado_em), motivo = NULL, updated_at = now()
  RETURNING id INTO v_id;

  IF v_status = 'AGUARDANDO_PAGAMENTO' AND v_origem = 'PORTAL' THEN v_cob := public.fn_cobranca_do_anuncio(v_id); END IF;

  INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
  VALUES (v_tenant, auth.uid(), 'PONTO_ANUNCIO', v_id, 'PLAYLIST_PUBLICADA_PONTO', v_status,
          'Mídia "' || v_asset.nome || '" no ponto ' || v_ponto.nome || ' (' || cardinality(v_telas) || ' tela(s), ' ||
          CASE WHEN v_origem = 'CONTRATO' THEN 'incluídas no contrato' ELSE 'R$ ' || v_valor || '/mês' END || ')');

  RETURN jsonb_build_object('status', v_status, 'anuncio_id', v_id, 'valor', CASE WHEN v_origem = 'CONTRATO' THEN 0 ELSE v_valor END,
    'telas', cardinality(v_telas), 'origem', v_origem,
    'cobranca', (SELECT jsonb_build_object('codigo', c.codigo_operacional, 'identificador', c.public_identifier, 'vencimento', c.data_vencimento)
                   FROM public.contas_receber c WHERE c.id = v_cob));
END;
$$;
REVOKE ALL ON FUNCTION public.anunciar_no_ponto(uuid, uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.anunciar_no_ponto(uuid, uuid, uuid[]) TO authenticated;

-- Pagamento: anúncio avulso (+1 mês) e, se for fatura de contrato, anúncios do contrato do cliente
CREATE OR REPLACE FUNCTION public.trg_fn_anuncio_pago()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r record; v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF upper(coalesce(NEW.status, '')) IN ('PAGA', 'PAGO', 'CONCILIADA') AND upper(coalesce(OLD.status, '')) NOT IN ('PAGA', 'PAGO', 'CONCILIADA') THEN
    FOR r IN
      UPDATE public.ponto_anuncios pa
         SET status = 'ATIVO', ativado_em = coalesce(pa.ativado_em, now()),
             valido_ate = (greatest(coalesce(pa.valido_ate, v_hoje), v_hoje) + interval '1 month')::date, updated_at = now()
       WHERE pa.cobranca_id = NEW.id AND pa.status IN ('AGUARDANDO_PAGAMENTO', 'SUSPENSO', 'ATIVO')
      RETURNING pa.id, pa.cliente_id, pa.empresa_operadora_id, pa.valido_ate,
                (SELECT nome FROM public.pontos WHERE id = pa.ponto_id) AS ponto_nome
    LOOP
      PERFORM public.fn_avisar_cliente(r.cliente_id, r.empresa_operadora_id, 'ANUNCIO_NO_AR_' || NEW.id,
        'Seu anúncio está no ar', 'Pagamento confirmado: sua mídia já está passando em ' || r.ponto_nome ||
        ' até ' || to_char(r.valido_ate, 'DD/MM/YYYY') || '.', 'PONTO_ANUNCIO', r.id, 'SUCESSO', 'INFO');
    END LOOP;
    -- F-113: fatura de contrato paga → anúncios do contrato vão (ou voltam) ao ar, se o contrato estiver em dia
    IF NEW.contrato_id IS NOT NULL AND public.fn_contrato_em_dia(NEW.cliente_id) THEN
      FOR r IN
        UPDATE public.ponto_anuncios pa SET status = 'ATIVO', ativado_em = coalesce(pa.ativado_em, now()), updated_at = now()
         WHERE pa.cliente_id = NEW.cliente_id AND pa.origem = 'CONTRATO' AND pa.status IN ('AGUARDANDO_PAGAMENTO', 'SUSPENSO')
        RETURNING pa.id, pa.cliente_id, pa.empresa_operadora_id, (SELECT nome FROM public.pontos WHERE id = pa.ponto_id) AS ponto_nome
      LOOP
        PERFORM public.fn_avisar_cliente(r.cliente_id, r.empresa_operadora_id, 'ANUNCIO_NO_AR_' || NEW.id,
          'Seu anúncio está no ar', 'Pagamento do contrato confirmado: sua mídia já está passando em ' || r.ponto_nome || '.',
          'PONTO_ANUNCIO', r.id, 'SUCESSO', 'INFO');
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Mídia aprovada: anúncio avulso vai para pagamento; anúncio do contrato vai ao ar se o contrato estiver em dia
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

-- Renovação diária: + anúncios do contrato saem do ar com fatura do contrato 4 dias atrasada
CREATE OR REPLACE FUNCTION public.fn_renovar_anuncios_ponto()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r record; v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; v_ren int := 0; v_sus int := 0;
BEGIN
  -- renovação: faltam 5 dias ou menos e a cobrança atual já foi paga
  FOR r IN SELECT pa.id, pa.valido_ate FROM public.ponto_anuncios pa
            LEFT JOIN public.contas_receber c ON c.id = pa.cobranca_id
           WHERE pa.status = 'ATIVO' AND pa.origem = 'PORTAL' AND pa.valido_ate IS NOT NULL AND pa.valido_ate <= v_hoje + 5
             AND (c.id IS NULL OR upper(c.status) IN ('PAGA', 'PAGO', 'CONCILIADA')) LOOP
    PERFORM public.fn_cobranca_do_anuncio(r.id, r.valido_ate);
    v_ren := v_ren + 1;
  END LOOP;
  -- 4 dias depois do vencimento sem pagar → sai do ar
  FOR r IN UPDATE public.ponto_anuncios pa SET status = 'SUSPENSO', updated_at = now()
            WHERE pa.status = 'ATIVO' AND pa.origem = 'PORTAL' AND pa.valido_ate IS NOT NULL AND pa.valido_ate + 4 <= v_hoje
              AND EXISTS (SELECT 1 FROM public.contas_receber c WHERE c.id = pa.cobranca_id
                           AND upper(c.status) NOT IN ('PAGA', 'PAGO', 'CONCILIADA', 'CANCELADA', 'CANCELADO'))
           RETURNING pa.id, pa.cliente_id, pa.empresa_operadora_id, (SELECT nome FROM public.pontos WHERE id = pa.ponto_id) AS ponto_nome LOOP
    PERFORM public.fn_avisar_cliente(r.cliente_id, r.empresa_operadora_id, 'ANUNCIO_SUSPENSO_' || to_char(v_hoje, 'YYYYMMDD'),
      'Seu anúncio saiu do ar', 'A renovação do anúncio em ' || r.ponto_nome || ' está com 4 dias de atraso. Pague a fatura para voltar ao ar na hora.',
      'PONTO_ANUNCIO', r.id, 'CRITICO', 'ALERTA');
    v_sus := v_sus + 1;
  END LOOP;
  -- F-113: contrato com fatura 4+ dias atrasada → anúncios do contrato saem do ar (voltam quando pagar)
  FOR r IN UPDATE public.ponto_anuncios pa SET status = 'SUSPENSO', updated_at = now()
            WHERE pa.status = 'ATIVO' AND pa.origem = 'CONTRATO' AND NOT public.fn_contrato_em_dia(pa.cliente_id)
           RETURNING pa.id, pa.cliente_id, pa.empresa_operadora_id, (SELECT nome FROM public.pontos WHERE id = pa.ponto_id) AS ponto_nome LOOP
    PERFORM public.fn_avisar_cliente(r.cliente_id, r.empresa_operadora_id, 'ANUNCIO_SUSPENSO_' || to_char(v_hoje, 'YYYYMMDD'),
      'Seu anúncio saiu do ar', 'A fatura do seu contrato está com 4 dias de atraso. O anúncio em ' || r.ponto_nome ||
      ' volta ao ar assim que o pagamento for confirmado.', 'PONTO_ANUNCIO', r.id, 'CRITICO', 'ALERTA');
    v_sus := v_sus + 1;
  END LOOP;
  RETURN jsonb_build_object('renovacoes', v_ren, 'suspensos', v_sus);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_renovar_anuncios_ponto() FROM public, anon, authenticated;

-- Reativar: anúncio do contrato não gera cobrança avulsa
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
