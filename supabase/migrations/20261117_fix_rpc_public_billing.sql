-- =========================================================================================
-- SOBRE MÍDIA - MIGRATION 20261117: FIX RPC PUBLIC BILLING
-- Corrige a regressão introduzida no Gate 6.5 (20261116)
-- Onde a RPC foi recriada usando uma versão legada que procurava a coluna inexistente cnpj_cpf
-- =========================================================================================

-- 1. Remove a versão quebrada (com argumentos text)
DROP FUNCTION IF EXISTS public.rpc_get_public_billing(text, text);

-- 2. Restaura e atualiza a versão correta (com argumentos varchar) 
--    incluindo a nova coluna metodos_gateway.
CREATE OR REPLACE FUNCTION public.rpc_get_public_billing(p_codigo character varying, p_identifier character varying)
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
    'valor_pago', c.valor_pago,
    'saldo', c.saldo,
    'status', c.status,
    'numero_parcela', c.numero_parcela,
    'total_parcelas', c.total_parcelas,
    'metodo', c.metodo_cobranca,
    'metodos_gateway', c.metodos_gateway,
    'recorrencia', c.recorrencia,
    'observacoes', c.notes,
    'cliente_nome', COALESCE((SELECT razao_social FROM public.empresas WHERE cliente_id = c.cliente_id LIMIT 1), 'Cliente'),
    'cliente_documento', (SELECT cnpj FROM public.empresas WHERE cliente_id = c.cliente_id LIMIT 1),
    'empresa_nome', em.nome_fantasia,
    'empresa_documento', em.cnpj,
    'contrato_codigo', ct.numero_contrato,
    'contrato_tipo', ct.tipo_contrato,
    'servico_faturado', c.notes,
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
  WHERE c.codigo_operacional = p_codigo
    AND c.public_identifier = p_identifier
    AND c.public_enabled = TRUE
  LIMIT 1;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Cobrança não encontrada ou acesso negado';
  END IF;

  RETURN v_result;
END;
$function$;
