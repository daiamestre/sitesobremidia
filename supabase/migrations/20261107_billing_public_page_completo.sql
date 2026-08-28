-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20261107: PÁGINA PÚBLICA DE COBRANÇA (COMPLETO)
-- Expande a RPC rpc_get_public_billing para incluir contratos e pagamentos.
-- ======================================================================

CREATE OR REPLACE FUNCTION public.rpc_get_public_billing(
  p_codigo VARCHAR(40),
  p_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Busca a cobrança principal, dados do contrato, cliente e empresa,
  -- fazendo join explícito para extrair tudo num único payload JSON.
  SELECT jsonb_build_object(
    'id', c.id,
    'numero_documento', c.numero_documento,
    'codigo_operacional', c.codigo_operacional,
    'competencia', c.competencia_date,
    'vencimento', c.data_vencimento,
    'valor_original', c.valor,
    'valor_pago', c.valor_pago,
    'saldo', c.saldo,
    'status', c.status,
    'numero_parcela', c.numero_parcela,
    'total_parcelas', c.total_parcelas,
    'metodo', c.metodo_cobranca,
    'recorrencia', c.recorrencia,
    'observacoes', c.notes,
    'cliente_nome', COALESCE((SELECT razao_social FROM public.cliente_empresas WHERE cliente_id = c.cliente_id LIMIT 1), 'Cliente'),
    'cliente_documento', (SELECT cnpj FROM public.cliente_empresas WHERE cliente_id = c.cliente_id LIMIT 1),
    'empresa_nome', em.nome_fantasia,
    'empresa_documento', em.cnpj,
    'contrato_codigo', ct.numero_contrato_legivel,
    'contrato_tipo', ct.tipo_contrato,
    'servico_faturado', c.notes, -- fallback caso nao haja servico explicito
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
  ) INTO v_result
  FROM public.contas_receber c
  JOIN public.empresa_operadora em ON em.id = c.empresa_operadora_id
  LEFT JOIN public.contratos ct ON ct.id = c.contrato_id
  WHERE (c.numero_documento = p_codigo OR c.codigo_operacional = p_codigo)
    AND c.public_token = p_token
    AND c.public_enabled = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança não encontrada ou acesso negado. (404)';
  END IF;

  RETURN v_result;
END;
$$;
