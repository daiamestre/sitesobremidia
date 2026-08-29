-- =========================================================================================
-- SOBRE MÍDIA - MIGRATION 20261116: METODOS GATEWAY
-- Criação de autonomia PIX/BOLETO para cobranças
-- =========================================================================================

-- 1. Adiciona a coluna para a configuração de pagamento do gateway.
-- As cobranças antigas receberão PIX e BOLETO por default para manter retrocompatibilidade.
ALTER TABLE public.contas_receber
ADD COLUMN metodos_gateway text[] DEFAULT '{"PIX", "BOLETO"}'::text[];

-- 2. Restrição de Integridade (Check):
-- Somente valores PIX e/ou BOLETO. Array não pode ser vazio.
ALTER TABLE public.contas_receber
ADD CONSTRAINT chk_metodos_gateway_values 
CHECK ( metodos_gateway <@ ARRAY['PIX', 'BOLETO']::text[] AND array_length(metodos_gateway, 1) > 0 );

-- 3. Atualizar a RPC pública rpc_get_public_billing para expor metodos_gateway
-- A RPC foi criada nas migrations 20261107_billing_public_page_completo.sql e 20261108_public_identifier.sql
CREATE OR REPLACE FUNCTION public.rpc_get_public_billing(p_codigo text, p_identifier text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
BEGIN
  -- Segurança: a function é SECURITY DEFINER, bypassa RLS, mas aplica matching estrito
  SELECT json_build_object(
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
    'cliente_nome', emp.razao_social,
    'cliente_documento', emp.cnpj_cpf,
    'empresa_nome', op.razao_social,
    'empresa_documento', op.cnpj_cpf,
    'contrato_codigo', co.numero_contrato,
    'contrato_tipo', co.tipo_contrato,
    'pagamentos', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', p.id,
          'valor_pago', p.valor_pago,
          'data_liquidacao', p.data_liquidacao,
          'meio_pagamento', p.meio_pagamento,
          'transacao_id_externo', p.transacao_id_externo
        )
      ), '[]'::json)
      FROM public.pagamentos p
      WHERE p.conta_receber_id = c.id
    )
  ) INTO v_result
  FROM public.contas_receber c
  LEFT JOIN public.empresas emp ON c.cliente_id = emp.cliente_id
  LEFT JOIN public.empresas op ON c.empresa_operadora_id = op.cliente_id
  LEFT JOIN public.contratos co ON c.contrato_id = co.id
  WHERE c.codigo_operacional = p_codigo
    AND c.public_identifier = p_identifier
    AND c.public_enabled = true;

  IF NOT FOUND OR v_result IS NULL THEN
    RAISE EXCEPTION 'Acesso negado ou cobrança não encontrada';
  END IF;

  RETURN v_result;
END;
$$;
