-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261275 — F-106
-- Avisos do cliente: faturas e mídia pausada chegam à Central do anunciante;
-- aviso visto sai do contador e o OWNER/ADMIN vê QUANDO o cliente viu.
--
-- 1) notificacoes_central.lida_em: preenchido automaticamente quando o aviso
--    passa a LIDA (aditivo; nada existente muda).
-- 2) fn_avisar_cliente(): aviso IN_APP para todos os usuários do cliente.
-- 3) jobs COLECTION_* (régua de cobrança, já existentes) passam a gerar
--    também o aviso na Central do cliente: vence em N dias / vence hoje /
--    em atraso / pagamento confirmado. O envio externo (e-mail/WhatsApp)
--    continua igual.
-- 4) fn_reavaliar_bloqueio_cliente (F-105): avisa "mídia pausada por atraso"
--    e "mídia de volta ao ar".
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_jobs_aviso_cliente ON public.jobs;
--   DROP TRIGGER IF EXISTS trg_nc_lida_em ON public.notificacoes_central;
--   DROP FUNCTION IF EXISTS public.trg_fn_jobs_aviso_cliente(), public.trg_fn_nc_lida_em(),
--     public.fn_avisar_cliente(uuid,uuid,text,text,text,text,uuid,text,text);
--   (fn_reavaliar_bloqueio_cliente: reaplicar a versão da 20261272)
--   ALTER TABLE public.notificacoes_central DROP COLUMN IF EXISTS lida_em;
-- ======================================================================

-- 1) Quando foi visto ---------------------------------------------------------
ALTER TABLE public.notificacoes_central ADD COLUMN IF NOT EXISTS lida_em timestamptz;

CREATE OR REPLACE FUNCTION public.trg_fn_nc_lida_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.status_notificacao IN ('LIDA', 'RESOLVIDA') OR NEW.lida IS TRUE) AND NEW.lida_em IS NULL THEN
    NEW.lida_em := now();
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_nc_lida_em ON public.notificacoes_central;
CREATE TRIGGER trg_nc_lida_em BEFORE UPDATE ON public.notificacoes_central
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_nc_lida_em();

-- 2) Aviso para todos os usuários de um cliente ------------------------------
CREATE OR REPLACE FUNCTION public.fn_avisar_cliente(
  p_cliente uuid, p_tenant uuid, p_tipo text, p_titulo text, p_mensagem text,
  p_entidade_tipo text, p_entidade_id uuid, p_prioridade text DEFAULT 'IMPORTANTE', p_severidade text DEFAULT 'AVISO')
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v int;
BEGIN
  IF p_cliente IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.notificacoes_central
    (empresa_operadora_id, usuario_id, tipo_evento, canal, titulo, mensagem, status_envio, lida,
     prioridade, severidade, status_notificacao, rota_destino, entidade_relacionada_tipo, entidade_relacionada_id, enviado_em)
  SELECT coalesce(p_tenant, u.empresa_operadora_id), u.id, p_tipo, 'IN_APP', left(p_titulo, 250), left(p_mensagem, 1000), 'SENT', false,
         p_prioridade, p_severidade, 'NAO_LIDA', '/portal/financeiro', p_entidade_tipo, p_entidade_id, now()
    FROM public.usuarios u
   WHERE u.cliente_id = p_cliente
     AND upper(coalesce(u.status, 'ACTIVE')) NOT IN ('DELETED', 'INACTIVE', 'SUSPENDED')
     -- não repete o mesmo aviso para a mesma fatura
     AND NOT EXISTS (SELECT 1 FROM public.notificacoes_central n
                      WHERE n.usuario_id = u.id AND n.tipo_evento = p_tipo
                        AND n.entidade_relacionada_id IS NOT DISTINCT FROM p_entidade_id);
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_avisar_cliente(uuid, uuid, text, text, text, text, uuid, text, text) FROM public, anon, authenticated;

-- 3) Régua de cobrança → aviso na Central do cliente --------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_jobs_aviso_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  p jsonb := NEW.payload;
  v_cliente uuid;
  v_conta uuid;
  v_doc text;
  v_valor text;
  v_venc text;
  v_dias int;
  v_titulo text;
  v_msg text;
  v_prio text := 'IMPORTANTE';
  v_sev text := 'AVISO';
BEGIN
  BEGIN
    v_cliente := nullif(p->>'cliente_id', '')::uuid;
    v_conta := nullif(p->>'conta_receber_id', '')::uuid;
  EXCEPTION WHEN others THEN RETURN NEW;
  END;
  IF v_cliente IS NULL OR v_conta IS NULL THEN RETURN NEW; END IF;

  SELECT coalesce(c.codigo_operacional, c.numero_documento, 'sua fatura'),
         to_char(coalesce(c.saldo, c.valor), 'FM999G999G990D00'),
         to_char(c.data_vencimento, 'DD/MM/YYYY'),
         (now() AT TIME ZONE 'America/Sao_Paulo')::date - c.data_vencimento
    INTO v_doc, v_valor, v_venc, v_dias
    FROM public.contas_receber c WHERE c.id = v_conta;
  IF v_doc IS NULL THEN RETURN NEW; END IF;

  IF NEW.tipo_job LIKE 'COLECTION_REMINDER_D%' THEN
    v_titulo := 'Fatura vence em ' || replace(NEW.tipo_job, 'COLECTION_REMINDER_D', '') || ' dias';
    v_msg := v_doc || ' — R$ ' || v_valor || ', vencimento ' || v_venc || '. Toque para pagar.';
    v_prio := 'INFORMATIVO'; v_sev := 'INFO';
  ELSIF NEW.tipo_job = 'COLECTION_DUE_TODAY' THEN
    v_titulo := 'Fatura vence hoje';
    v_msg := v_doc || ' — R$ ' || v_valor || '. Pague hoje para manter sua mídia no ar.';
    v_prio := 'ATENCAO';
  ELSIF NEW.tipo_job LIKE 'COLECTION_OVERDUE_%' THEN
    v_titulo := 'Fatura em atraso há ' || greatest(v_dias, 1) || CASE WHEN greatest(v_dias, 1) = 1 THEN ' dia' ELSE ' dias' END;
    v_msg := v_doc || ' — R$ ' || v_valor || ' venceu em ' || v_venc || '. Com 4 dias de atraso a mídia é pausada.';
    v_prio := 'CRITICO'; v_sev := 'ALERTA';
  ELSIF NEW.tipo_job = 'COLECTION_PAID' THEN
    v_titulo := 'Pagamento confirmado';
    v_msg := v_doc || ' foi paga. Obrigado!';
    v_prio := 'SUCESSO'; v_sev := 'INFO';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.fn_avisar_cliente(v_cliente, NEW.empresa_operadora_id, 'FATURA_' || NEW.tipo_job, v_titulo, v_msg,
                                   'CONTA_RECEBER', v_conta, v_prio, v_sev);
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'trg_fn_jobs_aviso_cliente: %', SQLERRM;  -- aviso nunca bloqueia a régua
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_jobs_aviso_cliente ON public.jobs;
CREATE TRIGGER trg_jobs_aviso_cliente AFTER INSERT ON public.jobs
  FOR EACH ROW WHEN (NEW.tipo_job LIKE 'COLECTION_%') EXECUTE FUNCTION public.trg_fn_jobs_aviso_cliente();

-- 4) Mídia pausada / de volta ao ar ------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reavaliar_bloqueio_cliente(p_cliente uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_desde date;
  v_bloq int := 0;
  v_reat int := 0;
  v_tenant uuid;
BEGIN
  IF p_cliente IS NULL THEN RETURN jsonb_build_object('status', 'SEM_CLIENTE'); END IF;
  PERFORM set_config('sobremidia.bloqueio_auto', 'on', true);
  v_desde := public.fn_cliente_inadimplente_desde(p_cliente);

  IF v_desde IS NOT NULL THEN
    UPDATE public.screens s
       SET is_active = false, bloqueada_por_inadimplencia = true, updated_at = now()
     WHERE s.cliente_id = p_cliente
       AND s.is_active IS TRUE
       AND (s.bloqueio_auto_liberado_em IS NULL
            OR s.bloqueio_auto_liberado_em < (v_desde::timestamp AT TIME ZONE 'America/Sao_Paulo'));
    GET DIAGNOSTICS v_bloq = ROW_COUNT;
  ELSE
    UPDATE public.screens s
       SET is_active = true, bloqueada_por_inadimplencia = false, updated_at = now()
     WHERE s.cliente_id = p_cliente
       AND s.bloqueada_por_inadimplencia;
    GET DIAGNOSTICS v_reat = ROW_COUNT;
  END IF;

  PERFORM set_config('sobremidia.bloqueio_auto', '', true);
  IF v_bloq > 0 OR v_reat > 0 THEN
    SELECT empresa_operadora_id INTO v_tenant FROM public.clientes WHERE id = p_cliente;
    INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
    VALUES (v_tenant,
            CASE WHEN v_bloq > 0 THEN 'TELAS_BLOQUEADAS_INADIMPLENCIA' ELSE 'TELAS_REATIVADAS_PAGAMENTO' END,
            NULL,
            jsonb_build_object('cliente_id', p_cliente, 'bloqueadas', v_bloq, 'reativadas', v_reat, 'atraso_desde', v_desde));
    -- F-106: aviso ao cliente (um por evento/dia)
    PERFORM public.fn_avisar_cliente(
      p_cliente, v_tenant,
      CASE WHEN v_bloq > 0 THEN 'MIDIA_PAUSADA_' ELSE 'MIDIA_REATIVADA_' END || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMMDD'),
      CASE WHEN v_bloq > 0 THEN 'Sua mídia foi pausada' ELSE 'Sua mídia voltou ao ar' END,
      CASE WHEN v_bloq > 0 THEN 'Há fatura com 4 dias ou mais de atraso. Assim que o pagamento for confirmado, a mídia volta ao ar automaticamente.'
           ELSE 'Pagamento confirmado: suas telas foram reativadas.' END,
      'CLIENTE', p_cliente,
      CASE WHEN v_bloq > 0 THEN 'CRITICO' ELSE 'SUCESSO' END,
      CASE WHEN v_bloq > 0 THEN 'ALERTA' ELSE 'INFO' END);
  END IF;
  RETURN jsonb_build_object('status', 'OK', 'bloqueadas', v_bloq, 'reativadas', v_reat);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_reavaliar_bloqueio_cliente(uuid) FROM public, anon, authenticated;
