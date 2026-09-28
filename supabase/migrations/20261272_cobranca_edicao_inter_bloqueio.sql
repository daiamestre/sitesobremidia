-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261272 — F-105
-- Cobranças: edição que vale no link de pagamento, retorno do Banco Inter
-- que sempre registra o dinheiro recebido, e bloqueio/desbloqueio
-- automático das telas por inadimplência (4 dias).
--
-- Causa raiz reproduzida (Hotel Maxsuel, REC-2026-834997):
--   1) a cobrança foi editada de 622 para 618, mas o PIX emitido no Inter
--      (txid SMf1d0…, valor 622, válido 30 dias) continuou guardado em
--      contas_receber e era o que a página de pagamento mostrava;
--   2) o cliente pagou 622; o webhook chegou (23/09 13:03) e o registro do
--      pagamento foi RECUSADO por trg_valida_integridade_pagamento
--      (ERR_VALOR_EXCEDENTE 622 > saldo 618) → cobrança ficou em aberto.
--
-- Correção (aditiva):
--   A) contas_receber_emissoes_antigas: histórico de PIX/boleto aposentados
--      (o QR/boleto antigo ainda pode ser pago; o retorno continua casando).
--   B) trg_reemitir_cobranca_editada: ao mudar valor/vencimento/formas de uma
--      cobrança não paga, aposenta o PIX/boleto emitido; a página de
--      pagamento emite um novo com os dados editados.
--   C) fn_registrar_pagamento_inter(): registra o valor REALMENTE recebido
--      pelo banco; aplica até o saldo (a trava de integridade continua) e
--      anota o excedente; idempotente pela transação externa. Só service_role.
--   D) Telas × cliente: screens.cliente_id (vínculo explícito),
--      bloqueada_por_inadimplencia, bloqueio_auto_liberado_em.
--      fn_aplicar_bloqueio_inadimplencia(): 4+ dias de atraso → desativa as
--      telas do cliente (mesmo is_active do botão "Tela Ativa").
--      Pagamento (status PAGA) → reativa na hora as telas bloqueadas
--      automaticamente. Reativação manual pelo responsável continua valendo
--      (não é rebloqueada pelo mesmo atraso).
--   E) pg_cron: bloqueio a cada hora.
--
-- Player: get_player_playlist_for_screen NÃO muda (já devolve
-- SCREEN_SUSPENDED quando is_active = false). Colunas novas em screens são
-- ignoradas pelo Player (payload montado campo a campo).
--
-- ROLLBACK:
--   SELECT cron.unschedule('bloqueio-inadimplencia');
--   DROP TRIGGER IF EXISTS trg_reavaliar_bloqueio_pagamento ON public.contas_receber;
--   DROP TRIGGER IF EXISTS trg_reemitir_cobranca_editada ON public.contas_receber;
--   DROP TRIGGER IF EXISTS trg_screens_liberacao_manual ON public.screens;
--   DROP FUNCTION IF EXISTS public.fn_reavaliar_bloqueio_cliente(uuid), public.fn_aplicar_bloqueio_inadimplencia(),
--     public.fn_registrar_pagamento_inter(uuid,numeric,timestamptz,text,text,text), public.trg_fn_reemitir_cobranca_editada(),
--     public.trg_fn_screens_liberacao_manual(), public.trg_fn_reavaliar_bloqueio_pagamento(), public.fn_cliente_inadimplente_desde(uuid);
--   ALTER TABLE public.screens DROP COLUMN IF EXISTS cliente_id, DROP COLUMN IF EXISTS bloqueada_por_inadimplencia,
--     DROP COLUMN IF EXISTS bloqueio_auto_liberado_em;
--   DROP TABLE IF EXISTS public.contas_receber_emissoes_antigas;
-- ======================================================================

-- A) Histórico de emissões aposentadas -----------------------------------
CREATE TABLE IF NOT EXISTS public.contas_receber_emissoes_antigas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_receber_id uuid NOT NULL REFERENCES public.contas_receber(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('PIX', 'BOLETO')),
  identificador text NOT NULL,
  valor numeric(14,2),
  data_vencimento date,
  retirado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, identificador)
);
CREATE INDEX IF NOT EXISTS cr_emissoes_antigas_conta_idx ON public.contas_receber_emissoes_antigas (conta_receber_id);
ALTER TABLE public.contas_receber_emissoes_antigas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crea_select_interno ON public.contas_receber_emissoes_antigas;
CREATE POLICY crea_select_interno ON public.contas_receber_emissoes_antigas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contas_receber c
                  WHERE c.id = contas_receber_emissoes_antigas.conta_receber_id
                    AND c.empresa_operadora_id = (SELECT u.empresa_operadora_id FROM public.usuarios u WHERE u.id = auth.uid() LIMIT 1)
                    AND public.is_internal_role()));
REVOKE ALL ON public.contas_receber_emissoes_antigas FROM anon;
GRANT SELECT ON public.contas_receber_emissoes_antigas TO authenticated;

-- B) Edição aposenta PIX/boleto emitidos com os dados antigos -------------
CREATE OR REPLACE FUNCTION public.trg_fn_reemitir_cobranca_editada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF upper(coalesce(OLD.status, '')) IN ('PAGA', 'PAGO', 'CONCILIADA', 'CANCELADA', 'CANCELADO') THEN
    RETURN NEW;
  END IF;
  IF NEW.valor IS NOT DISTINCT FROM OLD.valor
     AND NEW.data_vencimento IS NOT DISTINCT FROM OLD.data_vencimento
     AND NEW.metodos_gateway IS NOT DISTINCT FROM OLD.metodos_gateway THEN
    RETURN NEW;
  END IF;

  -- PIX emitido (e não trocado nesta mesma atualização)
  IF OLD.inter_pix_txid IS NOT NULL AND NEW.inter_pix_txid IS NOT DISTINCT FROM OLD.inter_pix_txid THEN
    INSERT INTO public.contas_receber_emissoes_antigas (conta_receber_id, tipo, identificador, valor, data_vencimento)
    VALUES (OLD.id, 'PIX', OLD.inter_pix_txid, OLD.valor, OLD.data_vencimento)
    ON CONFLICT (tipo, identificador) DO NOTHING;
    NEW.inter_pix_txid := NULL;
    NEW.inter_pix_copia_e_cola := NULL;
    NEW.inter_pix_status := NULL;
    NEW.inter_pix_location := NULL;
    NEW.inter_pix_lock_timestamp := NULL;
  END IF;

  -- Boleto emitido
  IF OLD.inter_codigo_solicitacao IS NOT NULL AND NEW.inter_codigo_solicitacao IS NOT DISTINCT FROM OLD.inter_codigo_solicitacao THEN
    INSERT INTO public.contas_receber_emissoes_antigas (conta_receber_id, tipo, identificador, valor, data_vencimento)
    VALUES (OLD.id, 'BOLETO', OLD.inter_codigo_solicitacao, OLD.valor, OLD.data_vencimento)
    ON CONFLICT (tipo, identificador) DO NOTHING;
    NEW.inter_codigo_solicitacao := NULL;
    NEW.inter_seu_numero := NULL;
    NEW.inter_nosso_numero := NULL;
    NEW.inter_status := NULL;
    NEW.inter_txid := NULL;
    NEW.inter_lock_timestamp := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_reemitir_cobranca_editada ON public.contas_receber;
CREATE TRIGGER trg_reemitir_cobranca_editada BEFORE UPDATE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_reemitir_cobranca_editada();

-- C) Registro do dinheiro recebido pelo banco ------------------------------
CREATE OR REPLACE FUNCTION public.fn_registrar_pagamento_inter(
  p_conta uuid, p_valor_recebido numeric, p_data timestamptz, p_transacao text, p_meio text, p_e2e text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c public.contas_receber%ROWTYPE;
  v_saldo numeric(14,2);
  v_aplicado numeric(14,2);
  v_excedente numeric(14,2);
  v_pag uuid;
  v_nota text;
BEGIN
  IF p_conta IS NULL OR p_transacao IS NULL OR coalesce(p_valor_recebido, 0) <= 0 THEN
    RETURN jsonb_build_object('status', 'INVALIDO');
  END IF;
  SELECT * INTO c FROM public.contas_receber WHERE id = p_conta FOR UPDATE;
  IF c.id IS NULL THEN RETURN jsonb_build_object('status', 'NAO_ENCONTRADA'); END IF;
  IF upper(coalesce(c.status, '')) IN ('CANCELADA', 'CANCELADO') THEN
    RETURN jsonb_build_object('status', 'CANCELADA');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagamentos WHERE transacao_id_externo = p_transacao) THEN
    RETURN jsonb_build_object('status', 'JA_REGISTRADO');
  END IF;

  v_saldo := greatest(coalesce(c.saldo, c.valor - coalesce(c.valor_pago, 0)), 0);
  -- já quitada por outro aviso do mesmo pagamento (ex.: boleto pago via PIX gera 2 avisos): não duplica nem anota excedente
  IF v_saldo <= 0 AND EXISTS (SELECT 1 FROM public.pagamentos WHERE conta_receber_id = c.id) THEN
    RETURN jsonb_build_object('status', 'JA_QUITADA');
  END IF;
  v_aplicado := least(p_valor_recebido, v_saldo);
  v_excedente := p_valor_recebido - v_aplicado;

  IF v_aplicado > 0 THEN
    INSERT INTO public.pagamentos (empresa_operadora_id, conta_receber_id, contrato_id, meio_pagamento, valor_pago, data_liquidacao, transacao_id_externo)
    VALUES (c.empresa_operadora_id, c.id, c.contrato_id, upper(p_meio), v_aplicado, coalesce(p_data, now()), p_transacao)
    RETURNING id INTO v_pag;
  END IF;

  v_nota := 'Recebido pelo Banco Inter (' || upper(p_meio) || '): R$ ' || to_char(p_valor_recebido, 'FM999G999G990D00')
            || ' em ' || to_char(coalesce(p_data, now()) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  IF v_excedente > 0 THEN
    v_nota := v_nota || ' — excedente de R$ ' || to_char(v_excedente, 'FM999G999G990D00') || ' sobre o saldo';
  END IF;

  UPDATE public.contas_receber
     SET notes = CASE WHEN coalesce(notes, '') = '' THEN v_nota ELSE notes || E'\n' || v_nota END,
         inter_pix_status = CASE WHEN upper(p_meio) = 'PIX' THEN 'CONCLUIDA' ELSE inter_pix_status END,
         inter_pix_valor_recebido = CASE WHEN upper(p_meio) = 'PIX' THEN coalesce(inter_pix_valor_recebido, 0) + p_valor_recebido ELSE inter_pix_valor_recebido END,
         inter_pix_horario = CASE WHEN upper(p_meio) = 'PIX' THEN coalesce(p_data, now()) ELSE inter_pix_horario END,
         inter_pix_e2e_id = CASE WHEN upper(p_meio) = 'PIX' THEN coalesce(p_e2e, inter_pix_e2e_id) ELSE inter_pix_e2e_id END,
         inter_status = CASE WHEN upper(p_meio) = 'BOLETO' THEN 'RECEBIDO' ELSE inter_status END
   WHERE id = c.id;

  RETURN jsonb_build_object('status', 'OK', 'pagamento_id', v_pag, 'aplicado', v_aplicado, 'excedente', v_excedente);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_registrar_pagamento_inter(uuid, numeric, timestamptz, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_registrar_pagamento_inter(uuid, numeric, timestamptz, text, text, text) TO service_role;

-- D) Telas × cliente e bloqueio automático ---------------------------------
ALTER TABLE public.screens
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bloqueada_por_inadimplencia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bloqueio_auto_liberado_em timestamptz;
CREATE INDEX IF NOT EXISTS screens_cliente_idx ON public.screens (cliente_id) WHERE cliente_id IS NOT NULL;

-- Menor "data em que o atraso completou 4 dias" entre as cobranças em aberto do cliente
CREATE OR REPLACE FUNCTION public.fn_cliente_inadimplente_desde(p_cliente uuid)
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT min(cr.data_vencimento + 4)
    FROM public.contas_receber cr
   WHERE cr.cliente_id = p_cliente
     AND upper(coalesce(cr.status, '')) NOT IN ('PAGA', 'PAGO', 'CONCILIADA', 'CANCELADA', 'CANCELADO')
     AND coalesce(cr.saldo, cr.valor - coalesce(cr.valor_pago, 0)) > 0
     AND cr.data_vencimento + 4 <= (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

-- Liberação manual: responsável reativa uma tela bloqueada automaticamente
CREATE OR REPLACE FUNCTION public.trg_fn_screens_liberacao_manual()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF coalesce(current_setting('sobremidia.bloqueio_auto', true), '') = 'on' THEN
    RETURN NEW;  -- mudança feita pelo próprio bloqueio automático
  END IF;
  IF NEW.is_active IS TRUE AND OLD.is_active IS FALSE AND OLD.bloqueada_por_inadimplencia THEN
    NEW.bloqueada_por_inadimplencia := false;
    NEW.bloqueio_auto_liberado_em := now();
  ELSIF NEW.is_active IS FALSE AND OLD.is_active IS TRUE THEN
    NEW.bloqueada_por_inadimplencia := false;  -- desligada à mão: não será religada pelo pagamento
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_screens_liberacao_manual ON public.screens;
CREATE TRIGGER trg_screens_liberacao_manual BEFORE UPDATE OF is_active ON public.screens
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_screens_liberacao_manual();

-- Reavalia UM cliente: bloqueia (4+ dias) ou reativa (quitado)
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
    INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
    SELECT cl.empresa_operadora_id,
           CASE WHEN v_bloq > 0 THEN 'TELAS_BLOQUEADAS_INADIMPLENCIA' ELSE 'TELAS_REATIVADAS_PAGAMENTO' END,
           NULL,
           jsonb_build_object('cliente_id', p_cliente, 'bloqueadas', v_bloq, 'reativadas', v_reat, 'atraso_desde', v_desde)
      FROM public.clientes cl WHERE cl.id = p_cliente;
  END IF;
  RETURN jsonb_build_object('status', 'OK', 'bloqueadas', v_bloq, 'reativadas', v_reat);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_reavaliar_bloqueio_cliente(uuid) FROM public, anon, authenticated;

-- Varredura (cron): todos os clientes com tela vinculada
CREATE OR REPLACE FUNCTION public.fn_aplicar_bloqueio_inadimplencia()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r record; v jsonb; v_b int := 0; v_r int := 0;
BEGIN
  FOR r IN SELECT DISTINCT cliente_id FROM public.screens WHERE cliente_id IS NOT NULL LOOP
    v := public.fn_reavaliar_bloqueio_cliente(r.cliente_id);
    v_b := v_b + coalesce((v->>'bloqueadas')::int, 0);
    v_r := v_r + coalesce((v->>'reativadas')::int, 0);
  END LOOP;
  RETURN jsonb_build_object('bloqueadas', v_b, 'reativadas', v_r);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_aplicar_bloqueio_inadimplencia() FROM public, anon, authenticated;

-- Pagamento (ou mudança de vencimento/valor) → reavalia na hora
CREATE OR REPLACE FUNCTION public.trg_fn_reavaliar_bloqueio_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.cliente_id IS NOT NULL
     AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento
          OR NEW.saldo IS DISTINCT FROM OLD.saldo)
     AND EXISTS (SELECT 1 FROM public.screens s WHERE s.cliente_id = NEW.cliente_id) THEN
    PERFORM public.fn_reavaliar_bloqueio_cliente(NEW.cliente_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_reavaliar_bloqueio_pagamento ON public.contas_receber;
CREATE TRIGGER trg_reavaliar_bloqueio_pagamento AFTER UPDATE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_reavaliar_bloqueio_pagamento();

-- E) Cron: bloqueio a cada hora ------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('bloqueio-inadimplencia') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bloqueio-inadimplencia');
  PERFORM cron.schedule('bloqueio-inadimplencia', '10 * * * *', 'SELECT public.fn_aplicar_bloqueio_inadimplencia();');
END $$;
