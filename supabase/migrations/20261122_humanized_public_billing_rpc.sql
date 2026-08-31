-- ============================================================================
-- GATE 6.5: EVOLUÇÃO DA RPC PÚBLICA DE COBRANÇA PARA URL HUMANIZADA E CABEÇALHO
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_get_public_billing(character varying, character varying);
DROP FUNCTION IF EXISTS public.rpc_get_public_billing(text, text);
DROP FUNCTION IF EXISTS public.rpc_get_public_billing(character varying);
DROP FUNCTION IF EXISTS public.rpc_get_public_billing(text);

CREATE OR REPLACE FUNCTION public.rpc_get_public_billing(
  p_codigo character varying, 
  p_identifier character varying DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', c.id,
    'numero_documento', c.numero_documento,
    'codigo_operacional', c.codigo_operacional,
    'public_identifier', c.public_identifier,
    'competencia', c.competencia_date,
    'vencimento', c.data_vencimento,
    'valor_original', c.valor,
    'valor_pago', COALESCE(c.valor_pago, 0),
    'saldo', COALESCE(c.saldo, c.valor - COALESCE(c.valor_pago, 0)),
    'status', c.status,
    'numero_parcela', c.numero_parcela,
    'total_parcelas', c.total_parcelas,
    'metodo', c.metodo_cobranca,
    'metodos_gateway', COALESCE(c.metodos_gateway, ARRAY['PIX','BOLETO']::text[]),
    'recorrencia', c.recorrencia,
    'observacoes', c.notes,
    'cliente_nome', COALESCE(
       (SELECT NULLIF(nome_fantasia, '') FROM public.empresas WHERE cliente_id = c.cliente_id LIMIT 1),
       (SELECT NULLIF(razao_social, '') FROM public.empresas WHERE cliente_id = c.cliente_id LIMIT 1),
       'Cliente'
    ),
    'cliente_documento', (SELECT cnpj FROM public.empresas WHERE cliente_id = c.cliente_id LIMIT 1),
    'empresa_nome', COALESCE(em.nome, em.nome_fantasia, 'Sobre Mídia LTDA'),
    'empresa_documento', em.cnpj,
    'contrato_codigo', ct.numero_contrato,
    'contrato_tipo', ct.tipo_contrato,
    'servico_faturado', COALESCE(NULLIF(c.notes, ''), 'Aluguel de Software de Mídia'),
    'pagamentos', (
       SELECT COALESCE(jsonb_agg(
         jsonb_build_object(
           'id', p.id,
           'valor_pago', p.valor_pago,
           'data_liquidacao', p.data_liquidacao,
           'meio_pagamento', p.meio_pagamento,
           'transacao_id_externo', p.transacao_id_externo
         ) ORDER BY p.data_liquidacao DESC
       ), '[]'::jsonb)
       FROM public.pagamentos p
       WHERE p.conta_receber_id = c.id
    )
  )
  INTO v_result
  FROM public.contas_receber c
  JOIN public.empresa_operadora em ON em.id = c.empresa_operadora_id
  LEFT JOIN public.contratos ct ON ct.id = c.contrato_id
  WHERE (
    (c.codigo_operacional = p_codigo AND c.public_identifier = p_identifier)
    OR (c.codigo_operacional = p_codigo AND (p_identifier IS NULL OR p_identifier = '' OR p_identifier = p_codigo))
    OR (c.public_identifier = p_codigo AND (p_identifier IS NULL OR p_identifier = '' OR p_identifier = p_codigo))
    OR (c.public_identifier = p_identifier)
  )
  AND c.public_enabled = TRUE
  LIMIT 1;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Cobrança não encontrada ou acesso negado';
  END IF;

  RETURN v_result;
END;
$function$;

-- Conceder permissões canônicas de execução pública (anon & authenticated)
GRANT EXECUTE ON FUNCTION public.rpc_get_public_billing(character varying, character varying) TO anon, authenticated, service_role;
