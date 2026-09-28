-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261274 — F-105
-- rpc_get_public_billing: + valor_recebido_banco (aditivo; demais campos iguais).
-- A página da fatura mostra "Fatura paga" com o valor recebido pelo Banco Inter.
-- ROLLBACK: reaplicar a definição anterior (sem a chave valor_recebido_banco).
-- ======================================================================
CREATE OR REPLACE FUNCTION public.rpc_get_public_billing(p_codigo character varying, p_identifier character varying DEFAULT NULL::character varying)
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
    -- F-105: valor que o Banco Inter efetivamente recebeu (PIX)
    'valor_recebido_banco', c.inter_pix_valor_recebido,
    'numero_parcela', c.numero_parcela,
    'total_parcelas', c.total_parcelas,
    'metodo', c.metodo_cobranca,
    'metodos_gateway', COALESCE(c.metodos_gateway, ARRAY['PIX','BOLETO']::text[]),
    'recorrencia', c.recorrencia,
    'observacoes', c.notes,
    -- GATE 6.7: campos canônicos
    'billing_origin_type', COALESCE(c.billing_origin_type, 'GERAL'),
    'establishment_name', COALESCE(
        NULLIF((SELECT nome_fantasia FROM public.empresas WHERE cliente_id = c.cliente_id LIMIT 1), ''),
        NULLIF((SELECT razao_social FROM public.empresas WHERE cliente_id = c.cliente_id LIMIT 1), ''),
        'Cliente'
    ),
    'establishment_slug', lower(regexp_replace(trim(regexp_replace(
        COALESCE(
          NULLIF((SELECT nome_fantasia FROM public.empresas WHERE cliente_id = c.cliente_id LIMIT 1), ''),
          NULLIF((SELECT razao_social FROM public.empresas WHERE cliente_id = c.cliente_id LIMIT 1), ''),
          'estabelecimento'
        ), '[^a-zA-Z0-9]+', '-', 'g')), '^-|-$', '', 'g')),
    'invoice_month', EXTRACT(MONTH FROM COALESCE(c.competencia_date, c.data_vencimento)),
    'invoice_year', EXTRACT(YEAR FROM COALESCE(c.competencia_date, c.data_vencimento)),
    -- serviço canônico: para ANUNCIANTE sempre "Aluguel de Software de Mídia"
    'service_name', CASE
        WHEN COALESCE(c.billing_origin_type, '') = 'ANUNCIANTE' THEN 'Aluguel de Software de Mídia'
        WHEN c.billing_origin_type IS NULL AND c.cliente_id IN (SELECT id FROM public.clientes WHERE modalidade='ANUNCIANTE') THEN 'Aluguel de Software de Mídia'
        ELSE COALESCE(NULLIF(c.notes, ''), 'Aluguel de Software de Mídia')
      END,
    'issuer_name', 'Sobre Mídia Designer Ltda',
    'cliente_nome', COALESCE(
       (SELECT NULLIF(nome_fantasia, '') FROM public.empresas WHERE cliente_id = c.cliente_id LIMIT 1),
       (SELECT NULLIF(razao_social, '') FROM public.empresas WHERE cliente_id = c.cliente_id LIMIT 1),
       'Cliente'
    ),
    'cliente_documento', (SELECT cnpj FROM public.empresas WHERE cliente_id = c.cliente_id LIMIT 1),
    'empresa_nome', COALESCE(em.nome, em.nome_fantasia, 'Sobre Mídia Designer Ltda'),
    'empresa_documento', em.cnpj,
    'contrato_codigo', ct.numero_contrato,
    'contrato_tipo', ct.tipo_contrato,
    'servico_faturado', CASE
        WHEN COALESCE(c.billing_origin_type, '') = 'ANUNCIANTE' THEN 'Aluguel de Software de Mídia'
        WHEN c.billing_origin_type IS NULL AND c.cliente_id IN (SELECT id FROM public.clientes WHERE modalidade='ANUNCIANTE') THEN 'Aluguel de Software de Mídia'
        ELSE COALESCE(NULLIF(c.notes, ''), 'Aluguel de Software de Mídia')
      END,
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
