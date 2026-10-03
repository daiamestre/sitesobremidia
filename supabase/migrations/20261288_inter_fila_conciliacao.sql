-- F-122 — Conciliação com o Banco Inter preparada para volume (meses/anos de operação).
-- Antes: cada rodada (15 em 15 min) pegava "até 150" cobranças em aberto SEM ordem definida — passando de 150
-- boletos/PIX em aberto, as mesmas 150 eram consultadas sempre e as demais nunca. Códigos que o banco não
-- reconhece (404) eram reconsultados em toda rodada, para sempre.
-- Agora: fila em rodízio — quem nunca foi consultado e quem foi consultado há mais tempo vão primeiro;
-- aviso de pagamento ainda não processado passa na frente; código inválido só volta 1 vez por dia.

CREATE TABLE IF NOT EXISTS public.inter_conciliacao_fila (
  tipo text NOT NULL CHECK (tipo IN ('BOLETO', 'PIX')),
  identificador text NOT NULL,
  consultado_em timestamptz NOT NULL DEFAULT now(),
  invalido boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tipo, identificador)
);
COMMENT ON TABLE public.inter_conciliacao_fila IS 'F-122: controle de rodízio da conciliação Inter (quando cada boleto/PIX foi consultado no banco). Só o servidor usa.';

-- Só o servidor (service_role) enxerga: RLS ligado e nenhuma política.
ALTER TABLE public.inter_conciliacao_fila ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inter_conciliacao_fila FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_inter_proximos_conciliar(p_tipo text, p_max integer DEFAULT 120)
RETURNS TABLE (identificador text, e2e text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
BEGIN
  IF p_tipo NOT IN ('BOLETO', 'PIX') THEN RAISE EXCEPTION 'tipo inválido'; END IF;

  -- controle antigo (cobrança já saiu da fila há muito tempo) não precisa ficar guardado
  DELETE FROM public.inter_conciliacao_fila f WHERE f.tipo = p_tipo AND f.consultado_em < now() - interval '180 days';

  RETURN QUERY
  WITH candidatos AS (
    -- avisos de pagamento ainda não processados
    SELECT e.codigo_solicitacao::text AS id, NULL::text AS e2e, 0 AS ordem
      FROM public.inter_webhook_events e
     WHERE p_tipo = 'BOLETO' AND e.processed IS NOT TRUE AND e.codigo_solicitacao IS NOT NULL
       AND e.situacao IN ('RECEBIDO', 'PAGO', 'MARCADO_RECEBIDO', 'LIQUIDADO')
       AND e.created_at > now() - interval '60 days'
    UNION ALL
    SELECT e.txid::text, e.e2e_id::text, 0
      FROM public.inter_pix_webhook_events e
     WHERE p_tipo = 'PIX' AND e.processed IS NOT TRUE AND e.txid IS NOT NULL AND e.txid <> 'UNKNOWN'
       AND e.created_at > now() - interval '60 days'
    UNION ALL
    -- cobranças em aberto com boleto/PIX emitido
    SELECT c.inter_codigo_solicitacao::text, NULL::text, 1
      FROM public.contas_receber c
     WHERE p_tipo = 'BOLETO' AND c.inter_codigo_solicitacao IS NOT NULL
       AND upper(coalesce(c.status, '')) NOT IN ('PAGA', 'PAGO', 'CONCILIADA', 'CANCELADA', 'CANCELADO')
    UNION ALL
    SELECT c.inter_pix_txid::text, NULL::text, 1
      FROM public.contas_receber c
     WHERE p_tipo = 'PIX' AND c.inter_pix_txid IS NOT NULL
       AND upper(coalesce(c.status, '')) NOT IN ('PAGA', 'PAGO', 'CONCILIADA', 'CANCELADA', 'CANCELADO')
    UNION ALL
    -- emissões aposentadas por edição (o cliente ainda pode pagar o documento antigo)
    SELECT a.identificador::text, NULL::text, 1
      FROM public.contas_receber_emissoes_antigas a
     WHERE a.tipo = p_tipo AND a.identificador IS NOT NULL
       AND a.retirado_em > now() - CASE WHEN p_tipo = 'BOLETO' THEN interval '90 days' ELSE interval '35 days' END
  ), unicos AS (
    SELECT c.id, max(c.e2e) AS e2e, min(c.ordem) AS ordem FROM candidatos c GROUP BY c.id
  )
  SELECT u.id, u.e2e
    FROM unicos u
    LEFT JOIN public.inter_conciliacao_fila f ON f.tipo = p_tipo AND f.identificador = u.id
   WHERE NOT (coalesce(f.invalido, false) AND f.consultado_em > now() - interval '1 day')
   ORDER BY
     -- aviso de pagamento passa na frente, mas no máximo 1 vez por hora (aviso falso não trava a fila)
     CASE WHEN u.ordem = 0 AND (f.consultado_em IS NULL OR f.consultado_em < now() - interval '1 hour') THEN 0 ELSE 1 END,
     f.consultado_em NULLS FIRST,
     u.id
   LIMIT greatest(1, least(coalesce(p_max, 120), 300));
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_inter_marcar_conciliado(p_tipo text, p_identificador text, p_invalido boolean DEFAULT false)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.inter_conciliacao_fila (tipo, identificador, consultado_em, invalido)
  VALUES (p_tipo, p_identificador, now(), coalesce(p_invalido, false))
  ON CONFLICT (tipo, identificador) DO UPDATE SET consultado_em = now(), invalido = EXCLUDED.invalido;
$$;

REVOKE ALL ON FUNCTION public.fn_inter_proximos_conciliar(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_inter_marcar_conciliado(text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_inter_proximos_conciliar(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_inter_marcar_conciliado(text, text, boolean) TO service_role;
