-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261280 — F-110
-- Anúncio em ponto parceiro: análise da mídia, escolha das telas, pagamento
-- antes de ir ao ar, renovação mensal e saída do ar com 4 dias de atraso.
--
-- Regras do proprietário:
--   * diretrizes: vídeo até 30 s; sem conteúdo sexual explícito, sem
--     discriminação/racismo; a mídia passa por ROBÔ de análise (Claude) que
--     recusa sozinho o impróprio; sem chave de IA → análise manual (OWNER/ADMIN);
--   * anunciante escolhe as telas do ponto (valor por tela) → cobrança;
--     pago → NO AR, entrando DEPOIS do último anúncio que já toca;
--   * renovação mensal; 4 dias de atraso → sai do ar.
--
-- Aditivo:
--   cliente_assets + moderacao_status/motivo/em/por, quadros (frames de vídeo);
--     gatilho: vídeo > 30 s recusado; documento/outro "não se aplica";
--     só OWNER/ADMIN (ou o robô, service_role) mudam o resultado da análise.
--   ponto_anuncios + telas uuid[], valor_mensal, cobranca_id, valido_ate,
--     ativado_em, motivo; novos status EM_ANALISE, AGUARDANDO_PAGAMENTO,
--     SUSPENSO, RECUSADO.
--   anunciar_no_ponto(ponto, asset, telas[]) — agora gera cobrança (ou aguarda análise).
--   Gatilhos: cobrança PAGA → anúncio ATIVO (+1 mês); mídia aprovada/recusada →
--     anúncio segue/recusa; cron diário de renovação e suspensão.
--   get_player_playlist_for_screen: só telas escolhidas; ordem por ativado_em.
--
-- ROLLBACK: evidência das definições anteriores em docs/engineering/evidence/F-110/;
--   DROP das funções/gatilhos novos; SELECT cron.unschedule('anuncios-ponto-renovacao').
-- ======================================================================

-- 1) Mídia do cliente: análise -------------------------------------------------
ALTER TABLE public.cliente_assets
  ADD COLUMN IF NOT EXISTS moderacao_status text NOT NULL DEFAULT 'PENDENTE'
    CHECK (moderacao_status IN ('PENDENTE', 'EM_ANALISE_MANUAL', 'APROVADA', 'RECUSADA', 'NAO_SE_APLICA')),
  ADD COLUMN IF NOT EXISTS moderacao_motivo text,
  ADD COLUMN IF NOT EXISTS moderacao_em timestamptz,
  ADD COLUMN IF NOT EXISTS moderacao_por text,
  ADD COLUMN IF NOT EXISTS quadros jsonb;

CREATE OR REPLACE FUNCTION public.trg_fn_cliente_assets_moderacao()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tipo NOT IN ('imagem', 'video') THEN
      NEW.moderacao_status := 'NAO_SE_APLICA';
    ELSIF NEW.tipo = 'video' AND coalesce(NEW.duracao, 0) > 30 THEN
      NEW.moderacao_status := 'RECUSADA';
      NEW.moderacao_motivo := 'Vídeo com mais de 30 segundos.';
      NEW.moderacao_por := 'SISTEMA';
      NEW.moderacao_em := now();
    ELSE
      NEW.moderacao_status := 'PENDENTE';  -- quem envia nunca escolhe o resultado
      NEW.moderacao_motivo := NULL; NEW.moderacao_por := NULL; NEW.moderacao_em := NULL;
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: resultado da análise só pelo robô (service_role, sem auth.uid) ou OWNER/ADMIN
  IF (NEW.moderacao_status IS DISTINCT FROM OLD.moderacao_status OR NEW.moderacao_motivo IS DISTINCT FROM OLD.moderacao_motivo
      OR NEW.moderacao_por IS DISTINCT FROM OLD.moderacao_por OR NEW.object_url IS DISTINCT FROM OLD.object_url
      OR NEW.duracao IS DISTINCT FROM OLD.duracao OR NEW.tipo IS DISTINCT FROM OLD.tipo)
     AND auth.uid() IS NOT NULL AND NOT public.fn_eh_owner_ou_admin() THEN
    RAISE EXCEPTION 'A análise da mídia só é feita pelo sistema.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_cliente_assets_moderacao ON public.cliente_assets;
CREATE TRIGGER trg_cliente_assets_moderacao BEFORE INSERT OR UPDATE ON public.cliente_assets
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_cliente_assets_moderacao();

-- 2) Anúncio: novos estados e dados --------------------------------------------
ALTER TABLE public.ponto_anuncios DROP CONSTRAINT IF EXISTS ponto_anuncios_status_check;
ALTER TABLE public.ponto_anuncios
  ADD CONSTRAINT ponto_anuncios_status_check CHECK (status IN ('EM_ANALISE', 'AGUARDANDO_PAGAMENTO', 'ATIVO', 'PAUSADO', 'SUSPENSO', 'RECUSADO')),
  ADD COLUMN IF NOT EXISTS telas uuid[],
  ADD COLUMN IF NOT EXISTS valor_mensal numeric(10,2),
  ADD COLUMN IF NOT EXISTS cobranca_id uuid REFERENCES public.contas_receber(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valido_ate date,
  ADD COLUMN IF NOT EXISTS ativado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo text;
CREATE INDEX IF NOT EXISTS ponto_anuncios_cobranca_idx ON public.ponto_anuncios (cobranca_id);

-- Cobrança do anúncio (avulsa, PIX/boleto, vence em 3 dias ou na data dada)
CREATE OR REPLACE FUNCTION public.fn_cobranca_do_anuncio(p_anuncio uuid, p_vencimento date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE a record; v_id uuid; v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; v_venc date;
BEGIN
  SELECT pa.*, po.nome AS ponto_nome,
         (SELECT string_agg(coalesce(s.local_instalacao, s.name), ', ' ORDER BY s.name) FROM public.screens s
           WHERE s.ponto_id = pa.ponto_id AND s.tipo_tela = 'PARCEIRA' AND (pa.telas IS NULL OR s.id = ANY (pa.telas))) AS locais
    INTO a FROM public.ponto_anuncios pa JOIN public.pontos po ON po.id = pa.ponto_id WHERE pa.id = p_anuncio;
  IF a.id IS NULL OR coalesce(a.valor_mensal, 0) <= 0 THEN RETURN NULL; END IF;
  v_venc := greatest(coalesce(p_vencimento, v_hoje + 3), v_hoje);
  INSERT INTO public.contas_receber (empresa_operadora_id, cliente_id, valor, data_vencimento, competencia_date, status,
                                     recorrencia, metodo_cobranca, metodos_gateway, billing_origin_type, gerada_automaticamente, notes)
  VALUES (a.empresa_operadora_id, a.cliente_id, a.valor_mensal, v_venc, date_trunc('month', v_venc)::date, 'PENDENTE',
          'AVULSA', 'PIX', ARRAY['PIX', 'BOLETO'], 'ANUNCIANTE', true,
          'Anúncio no ponto parceiro ' || a.ponto_nome || coalesce(' — telas: ' || a.locais, '') || '. Vai ao ar quando o pagamento for confirmado.')
  RETURNING id INTO v_id;
  UPDATE public.ponto_anuncios SET cobranca_id = v_id, updated_at = now() WHERE id = p_anuncio;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_cobranca_do_anuncio(uuid, date) FROM public, anon, authenticated;

-- Anunciar: escolhe telas → cobrança (ou aguarda a análise da mídia)
DROP FUNCTION IF EXISTS public.anunciar_no_ponto(uuid, uuid);
CREATE OR REPLACE FUNCTION public.anunciar_no_ponto(p_ponto uuid, p_asset uuid, p_telas uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cliente uuid := public.get_user_cliente_id();
  v_tenant uuid := public.get_user_empresa_operadora_id(auth.uid());
  v_ponto record; v_asset record; v_media uuid; v_id uuid; v_atual record;
  v_telas uuid[]; v_valor numeric; v_status text; v_cob uuid;
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

  -- telas escolhidas (do próprio ponto); sem escolha = todas as telas do ponto
  SELECT array_agg(s.id ORDER BY s.name), sum(s.valor_anuncio) INTO v_telas, v_valor
    FROM public.screens s
   WHERE s.ponto_id = v_ponto.id AND s.tipo_tela = 'PARCEIRA'
     AND (p_telas IS NULL OR cardinality(p_telas) = 0 OR s.id = ANY (p_telas));
  IF p_telas IS NOT NULL AND cardinality(p_telas) > 0 AND coalesce(cardinality(v_telas), 0) <> cardinality(p_telas) THEN
    RAISE EXCEPTION 'Escolha apenas telas deste ponto parceiro.' USING ERRCODE = '22023';
  END IF;
  v_valor := coalesce(v_valor, v_ponto.valor_anuncio);
  IF coalesce(v_valor, 0) <= 0 THEN RAISE EXCEPTION 'Este ponto ainda não tem valor para anunciar.' USING ERRCODE = '22023'; END IF;

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

  v_status := CASE WHEN v_asset.moderacao_status = 'APROVADA' THEN 'AGUARDANDO_PAGAMENTO' ELSE 'EM_ANALISE' END;
  INSERT INTO public.ponto_anuncios (empresa_operadora_id, ponto_id, cliente_id, asset_id, media_id, status, created_by, telas, valor_mensal, motivo)
  VALUES (v_tenant, v_ponto.id, v_cliente, v_asset.id, v_media, v_status, auth.uid(), v_telas, v_valor, NULL)
  ON CONFLICT (ponto_id, asset_id) DO UPDATE
    SET status = EXCLUDED.status, media_id = EXCLUDED.media_id, telas = EXCLUDED.telas, valor_mensal = EXCLUDED.valor_mensal,
        motivo = NULL, updated_at = now()
  RETURNING id INTO v_id;

  IF v_status = 'AGUARDANDO_PAGAMENTO' THEN v_cob := public.fn_cobranca_do_anuncio(v_id); END IF;

  INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
  VALUES (v_tenant, auth.uid(), 'PONTO_ANUNCIO', v_id, 'PLAYLIST_PUBLICADA_PONTO', v_status,
          'Mídia "' || v_asset.nome || '" no ponto ' || v_ponto.nome || ' (' || cardinality(v_telas) || ' tela(s), R$ ' || v_valor || '/mês)');

  RETURN jsonb_build_object('status', v_status, 'anuncio_id', v_id, 'valor', v_valor, 'telas', cardinality(v_telas),
    'cobranca', (SELECT jsonb_build_object('codigo', c.codigo_operacional, 'identificador', c.public_identifier, 'vencimento', c.data_vencimento)
                   FROM public.contas_receber c WHERE c.id = v_cob));
END;
$$;
REVOKE ALL ON FUNCTION public.anunciar_no_ponto(uuid, uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.anunciar_no_ponto(uuid, uuid, uuid[]) TO authenticated;

-- Reativar anúncio pausado: se ainda válido volta ao ar; senão gera nova cobrança
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

-- 3) Pagamento confirmado → anúncio no ar (+1 mês) -----------------------------
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
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_anuncio_pago ON public.contas_receber;
CREATE TRIGGER trg_anuncio_pago AFTER UPDATE OF status ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_anuncio_pago();

-- 4) Análise concluída → anúncio segue para pagamento ou é recusado -----------
CREATE OR REPLACE FUNCTION public.trg_fn_midia_analisada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r record;
BEGIN
  IF NEW.moderacao_status IS NOT DISTINCT FROM OLD.moderacao_status THEN RETURN NEW; END IF;
  IF NEW.moderacao_status = 'APROVADA' THEN
    FOR r IN UPDATE public.ponto_anuncios SET status = 'AGUARDANDO_PAGAMENTO', updated_at = now()
              WHERE asset_id = NEW.id AND status = 'EM_ANALISE' RETURNING id LOOP
      PERFORM public.fn_cobranca_do_anuncio(r.id);
    END LOOP;
    PERFORM public.fn_avisar_cliente(NEW.cliente_id, NEW.empresa_operadora_id, 'MIDIA_APROVADA', 'Mídia aprovada',
      '"' || NEW.nome || '" foi aprovada. Se você escolheu um ponto parceiro, a cobrança já está em Contratos e Faturas.',
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
DROP TRIGGER IF EXISTS trg_midia_analisada ON public.cliente_assets;
CREATE TRIGGER trg_midia_analisada AFTER UPDATE OF moderacao_status ON public.cliente_assets
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_midia_analisada();

-- 5) Análise manual (enquanto não há chave de IA, ou em caso de dúvida do robô) ----
CREATE OR REPLACE FUNCTION public.fn_moderar_midia(p_asset uuid, p_aprovar boolean, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.fn_eh_owner_ou_admin() THEN RAISE EXCEPTION 'Só o dono e os administradores analisam mídias.' USING ERRCODE = '42501'; END IF;
  IF NOT p_aprovar AND length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo da recusa.' USING ERRCODE = '22023'; END IF;
  UPDATE public.cliente_assets
     SET moderacao_status = CASE WHEN p_aprovar THEN 'APROVADA' ELSE 'RECUSADA' END,
         moderacao_motivo = CASE WHEN p_aprovar THEN NULL ELSE btrim(p_motivo) END,
         moderacao_por = 'EQUIPE', moderacao_em = now()
   WHERE id = p_asset AND empresa_operadora_id = public.get_user_tenant_id() AND tipo IN ('imagem', 'video');
  IF NOT FOUND THEN RAISE EXCEPTION 'Mídia não encontrada.' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('status', 'OK');
END;
$$;
REVOKE ALL ON FUNCTION public.fn_moderar_midia(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_moderar_midia(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_midias_em_analise()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN NOT public.fn_eh_owner_ou_admin() THEN '[]'::jsonb ELSE coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'tipo', a.tipo, 'url', a.object_url, 'quadros', a.quadros,
             'duracao', a.duracao, 'status', a.moderacao_status, 'motivo', a.moderacao_motivo, 'enviada_em', a.created_at,
             'cliente', (SELECT coalesce(e.nome_fantasia, e.razao_social) FROM public.empresas e WHERE e.cliente_id = a.cliente_id LIMIT 1))
           ORDER BY a.created_at)
      FROM public.cliente_assets a
     WHERE a.empresa_operadora_id = public.get_user_tenant_id() AND a.moderacao_status IN ('PENDENTE', 'EM_ANALISE_MANUAL')), '[]'::jsonb) END;
$$;
REVOKE ALL ON FUNCTION public.fn_midias_em_analise() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_midias_em_analise() TO authenticated;

-- 6) Renovação mensal e saída do ar (cron diário) -------------------------------
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
           WHERE pa.status = 'ATIVO' AND pa.valido_ate IS NOT NULL AND pa.valido_ate <= v_hoje + 5
             AND (c.id IS NULL OR upper(c.status) IN ('PAGA', 'PAGO', 'CONCILIADA')) LOOP
    PERFORM public.fn_cobranca_do_anuncio(r.id, r.valido_ate);
    v_ren := v_ren + 1;
  END LOOP;
  -- 4 dias depois do vencimento sem pagar → sai do ar
  FOR r IN UPDATE public.ponto_anuncios pa SET status = 'SUSPENSO', updated_at = now()
            WHERE pa.status = 'ATIVO' AND pa.valido_ate IS NOT NULL AND pa.valido_ate + 4 <= v_hoje
              AND EXISTS (SELECT 1 FROM public.contas_receber c WHERE c.id = pa.cobranca_id
                           AND upper(c.status) NOT IN ('PAGA', 'PAGO', 'CONCILIADA', 'CANCELADA', 'CANCELADO'))
           RETURNING pa.id, pa.cliente_id, pa.empresa_operadora_id, (SELECT nome FROM public.pontos WHERE id = pa.ponto_id) AS ponto_nome LOOP
    PERFORM public.fn_avisar_cliente(r.cliente_id, r.empresa_operadora_id, 'ANUNCIO_SUSPENSO_' || to_char(v_hoje, 'YYYYMMDD'),
      'Seu anúncio saiu do ar', 'A renovação do anúncio em ' || r.ponto_nome || ' está com 4 dias de atraso. Pague a fatura para voltar ao ar na hora.',
      'PONTO_ANUNCIO', r.id, 'CRITICO', 'ALERTA');
    v_sus := v_sus + 1;
  END LOOP;
  RETURN jsonb_build_object('renovacoes', v_ren, 'suspensos', v_sus);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_renovar_anuncios_ponto() FROM public, anon, authenticated;
DO $$
BEGIN
  PERFORM cron.unschedule('anuncios-ponto-renovacao') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'anuncios-ponto-renovacao');
  PERFORM cron.schedule('anuncios-ponto-renovacao', '25 6 * * *', 'SELECT public.fn_renovar_anuncios_ponto();');
END $$;

-- 7) Player: telas escolhidas e ordem de entrada no ar
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
                'audio_enabled', COALESCE(v_playlist.audio_enabled, false),
                'playlist_items', v_items
            )
        )
    );
END;
$function$;

-- 8) Ficha do ponto para o anunciante
CREATE OR REPLACE FUNCTION public.portal_ponto_parceiro(p_ponto uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
                                            'orientacao', s.orientation, 'polegadas', s.tamanho_polegadas, 'valor', s.valor_anuncio)
                         ORDER BY s.name)
          FROM public.screens s WHERE s.ponto_id = po.id AND s.tipo_tela = 'PARCEIRA'), '[]'::jsonb),
      'meus_anuncios', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', pa.id, 'status', pa.status, 'asset_id', pa.asset_id,
                                            'nome', a.nome, 'tipo', a.tipo, 'url', a.object_url, 'desde', pa.created_at,
                                            'valor', pa.valor_mensal, 'valido_ate', pa.valido_ate, 'motivo', pa.motivo,
                                            'telas', coalesce(cardinality(pa.telas), 0),
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
$function$;
