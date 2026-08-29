-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20261118: FIX SALDO E RPC
-- Corrige inconsistência financeira P0 onde saldo NULL causava PAGA/R$0
-- e garante que novas cobranças tenham saldo = valor - valor_pago.
-- ======================================================================

-- 1. Backfill de saldo para registros legados (idempotente)
UPDATE public.contas_receber
SET saldo = valor - COALESCE(valor_pago, 0)
WHERE saldo IS NULL;

-- 2. Trigger para garantir saldo preenchido em INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.trg_contas_receber_saldo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Em INSERT, se saldo não informado, calcular
  IF TG_OP = 'INSERT' THEN
    IF NEW.saldo IS NULL THEN
      NEW.saldo := COALESCE(NEW.valor, 0) - COALESCE(NEW.valor_pago, 0);
    END IF;
    IF NEW.valor_pago IS NULL THEN
      NEW.valor_pago := 0;
    END IF;
    RETURN NEW;
  END IF;
  -- Em UPDATE de valor ou valor_pago, recalcular saldo se não foi explicitamente setado
  IF TG_OP = 'UPDATE' THEN
    -- Se valor ou valor_pago mudou e saldo não foi alterado manualmente (ou ficou null), recalcular
    IF (NEW.valor IS DISTINCT FROM OLD.valor OR NEW.valor_pago IS DISTINCT FROM OLD.valor_pago) THEN
      -- Só recalcular se o caller não forneceu saldo explicitamente diferente de valor-valor_pago esperado
      -- Para manter compatibilidade com updates manuais, respeitar saldo enviado se for coerente; caso contrário recalcular
      IF NEW.saldo IS NULL OR NEW.saldo = OLD.saldo THEN
        NEW.saldo := COALESCE(NEW.valor, 0) - COALESCE(NEW.valor_pago, 0);
      END IF;
    END IF;
    -- Garantir saldo não negativo por bug de aplicação (permitir 0, mas não null)
    IF NEW.saldo IS NULL THEN
      NEW.saldo := COALESCE(NEW.valor, 0) - COALESCE(NEW.valor_pago, 0);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saldo_ins ON public.contas_receber;
CREATE TRIGGER trg_saldo_ins
  BEFORE INSERT ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.trg_contas_receber_saldo();

DROP TRIGGER IF EXISTS trg_saldo_upd ON public.contas_receber;
CREATE TRIGGER trg_saldo_upd
  BEFORE UPDATE OF valor, valor_pago, saldo ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.trg_contas_receber_saldo();

-- 3. Corrigir RPC pública para retornar saldo computed quando null (fail-safe frontend + DB)
-- Recria a versão canônica (varchar, varchar) -> jsonb com saldo COALESCE e tratamento de metodos_gateway
DROP FUNCTION IF EXISTS public.rpc_get_public_billing(character varying, character varying);
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
    'valor_pago', COALESCE(c.valor_pago, 0),
    'saldo', COALESCE(c.saldo, c.valor - COALESCE(c.valor_pago, 0)),
    'status', c.status,
    'numero_parcela', c.numero_parcela,
    'total_parcelas', c.total_parcelas,
    'metodo', c.metodo_cobranca,
    'metodos_gateway', COALESCE(c.metodos_gateway, ARRAY['PIX','BOLETO']::text[]),
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

-- 4. Garantir que a versão legada (text, text) também seja corrigida ou removida para evitar ambiguidade
DROP FUNCTION IF EXISTS public.rpc_get_public_billing(text, text);

-- 5. Comentário de auditoria
COMMENT ON FUNCTION public.trg_contas_receber_saldo() IS 'P0 FIX 20261118: garante saldo = valor - valor_pago para evitar PAGA falso com saldo NULL';
