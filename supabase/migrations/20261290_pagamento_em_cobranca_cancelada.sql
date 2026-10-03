-- F-124 — Pagamento que chega em cobrança CANCELADA não some mais em silêncio.
-- Cancelar a cobrança no sistema não cancela o boleto/PIX no banco: o cliente ainda consegue pagar. Antes, esse
-- pagamento era descartado sem registro (o dinheiro entrava na conta e ninguém ficava sabendo). Agora a cobrança
-- continua cancelada (ninguém é "pago" por engano), mas o recebimento fica anotado na própria cobrança e na
-- auditoria financeira — uma vez por transação — para a equipe devolver o valor ou reabrir a cobrança.

CREATE OR REPLACE FUNCTION public.fn_registrar_pagamento_inter(p_conta uuid, p_valor_recebido numeric, p_data timestamp with time zone, p_transacao text, p_meio text, p_e2e text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- F-124: deixa rastro do dinheiro recebido (só na primeira vez que esta transação aparece)
    IF NOT EXISTS (SELECT 1 FROM public.financeiro_auditoria a
                    WHERE a.evento = 'PAGAMENTO_EM_COBRANCA_CANCELADA' AND a.detalhes->>'transacao' = p_transacao) THEN
      INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
      VALUES (c.empresa_operadora_id, 'PAGAMENTO_EM_COBRANCA_CANCELADA', NULL,
              jsonb_build_object('conta_receber_id', c.id, 'codigo', c.codigo_operacional, 'cliente_id', c.cliente_id,
                                 'valor_recebido', p_valor_recebido, 'meio', upper(p_meio), 'transacao', p_transacao,
                                 'data', coalesce(p_data, now())));
      v_nota := 'ATENÇÃO: pagamento recebido pelo Banco Inter (' || upper(p_meio) || ') DEPOIS do cancelamento: R$ '
                || to_char(p_valor_recebido, 'FM999G999G990D00') || ' em '
                || to_char(coalesce(p_data, now()) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                || '. Devolver o valor ao cliente ou reabrir a cobrança.';
      UPDATE public.contas_receber
         SET notes = CASE WHEN coalesce(notes, '') = '' THEN v_nota ELSE notes || E'\n' || v_nota END
       WHERE id = c.id;
    END IF;
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
$function$;
