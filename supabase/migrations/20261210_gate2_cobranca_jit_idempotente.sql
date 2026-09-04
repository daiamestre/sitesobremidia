-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261210 (GATE 2 REVISADO)
-- COBRANÇA JIT IDEMPOTENTE COM PURCHASE INTENT & DESBLOQUEIO INTEGRADO
-- ======================================================================

-- 1. Coluna idempotency_key em contas_receber + Índice Único Parcial
ALTER TABLE public.contas_receber 
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

COMMENT ON COLUMN public.contas_receber.idempotency_key IS 'GATE 2: Chave de idempotência ligada ao purchase_intent_id da intenção de contratação.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_contas_receber_idempotency 
ON public.contas_receber (empresa_operadora_id, idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- 2. RPC ATÔMICA, TRANSACIONAL E IDEMPOTENTE DE COBRANÇA JIT POR INTENÇÃO DE COMPRA
CREATE OR REPLACE FUNCTION public.fn_criar_cobranca_jit_expansao(
  p_empresa_operadora_id UUID,
  p_cliente_id UUID,
  p_itens JSONB,
  p_idempotency_key TEXT,
  p_vencimento_dias INT DEFAULT 5,
  p_composition_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_tenant UUID;
  v_existente RECORD;
  v_cliente RECORD;
  v_contrato RECORD;
  v_item RECORD;
  v_subtotal_total NUMERIC(12,2) := 0;
  v_metodos_gateway TEXT[];
  v_codigo_operacional TEXT;
  v_public_identifier TEXT;
  v_conta_id UUID;
  v_vencimento DATE;
  v_lock_key BIGINT;
BEGIN
  -- A. Validação de Tenant & Security Check
  v_user_tenant := public.get_user_tenant_id();
  IF v_user_tenant IS NOT NULL AND v_user_tenant <> p_empresa_operadora_id THEN
    RAISE EXCEPTION 'Acesso negado: tenant_id divergente da sessão do usuário.';
  END IF;

  -- B. Advisory Lock Atômico por Chave de Idempotência da Operação (Purchase Intent)
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
    v_lock_key := hashtext('jit_intent:' || p_empresa_operadora_id::text || ':' || p_idempotency_key);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- C. Verificação Idempotente Preventiva (Retorna cobrança existente se já criada para este purchase_intent)
    SELECT id, codigo_operacional, public_identifier, valor, data_vencimento, status, metodos_gateway, contrato_id
    INTO v_existente
    FROM public.contas_receber
    WHERE empresa_operadora_id = p_empresa_operadora_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_existente.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotente', true,
        'id', v_existente.id,
        'codigo_operacional', v_existente.codigo_operacional,
        'public_identifier', v_existente.public_identifier,
        'valor', v_existente.valor,
        'vencimento', v_existente.data_vencimento,
        'status', v_existente.status,
        'metodos_gateway', v_existente.metodos_gateway,
        'contrato_id', v_existente.contrato_id
      );
    END IF;
  END IF;

  -- D. Validação do Cliente
  SELECT id, modalidade INTO v_cliente
  FROM public.clientes
  WHERE id = p_cliente_id
    AND empresa_operadora_id = p_empresa_operadora_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado no tenant especificado.';
  END IF;

  -- E. Validação dos Itens de Composição
  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'A composição comercial deve conter ao menos um item válido.';
  END IF;

  SELECT COALESCE(SUM((item->>'subtotal')::NUMERIC), 0) INTO v_subtotal_total
  FROM jsonb_array_elements(p_itens) AS item;

  IF v_subtotal_total <= 0 THEN
    RAISE EXCEPTION 'O valor total da composição comercial deve ser maior que zero.';
  END IF;

  -- F. Resolução ou Criação do Contrato (Garantia de contrato_id NOT NULL)
  SELECT id, numero_contrato, forma_pagamento, status_workflow INTO v_contrato
  FROM public.contratos
  WHERE cliente_id = p_cliente_id
    AND empresa_operadora_id = p_empresa_operadora_id
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.contratos (
      empresa_operadora_id,
      cliente_id,
      empresa_id,
      representante_id,
      numero_contrato,
      tipo_contrato,
      valor_mensal,
      forma_pagamento,
      data_inicio,
      data_fim,
      status_workflow
    )
    VALUES (
      p_empresa_operadora_id,
      p_cliente_id,
      (SELECT id FROM public.empresas WHERE cliente_id = p_cliente_id LIMIT 1),
      (SELECT representante_id FROM public.clientes WHERE id = p_cliente_id LIMIT 1),
      COALESCE(public.fn_gerar_numero_contrato_atomo(p_empresa_operadora_id), 'CTR-' || to_char(NOW(), 'YYYYMMDD-HH24MISS')),
      'ANUNCIANTE',
      v_subtotal_total,
      'PIX',
      CURRENT_DATE,
      (CURRENT_DATE + INTERVAL '1 year')::DATE,
      'AGUARDANDO_PAGAMENTO'
    )
    RETURNING id, numero_contrato, forma_pagamento, status_workflow INTO v_contrato;
  END IF;

  -- G. Definição de metodos_gateway baseada na forma de pagamento do contrato
  v_metodos_gateway := CASE COALESCE(v_contrato.forma_pagamento, 'PIX_BOLETO')
    WHEN 'PIX' THEN ARRAY['PIX']
    WHEN 'BOLETO' THEN ARRAY['BOLETO']
    ELSE ARRAY['PIX', 'BOLETO']
  END;

  -- H. Persistência dos Itens de Composição em contrato_estabelecimentos
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    INSERT INTO public.contrato_estabelecimentos (
      contrato_id,
      ponto_id,
      unidade_id,
      periodicidade,
      valor_tabela,
      valor_unitario,
      desconto,
      subtotal,
      observacoes
    )
    VALUES (
      v_contrato.id,
      (v_item.value->>'ponto_id')::UUID,
      (SELECT unidade_id FROM public.pontos WHERE id = (v_item.value->>'ponto_id')::UUID LIMIT 1),
      COALESCE(v_item.value->>'periodicidade', 'MENSAL'),
      (v_item.value->>'valor_tabela')::NUMERIC,
      (v_item.value->>'subtotal')::NUMERIC,
      COALESCE((v_item.value->>'desconto')::NUMERIC, 0),
      (v_item.value->>'subtotal')::NUMERIC,
      v_item.value->>'observacoes'
    );
  END LOOP;

  BEGIN
    v_codigo_operacional := public.fn_gerar_numero_recebivel_atomo(p_empresa_operadora_id);
  EXCEPTION WHEN OTHERS THEN
    v_codigo_operacional := 'COB-' || to_char(NOW(), 'YYYYMMDD-HH24MISS');
  END;

  v_vencimento := CURRENT_DATE + make_interval(days => LEAST(GREATEST(p_vencimento_dias, 1), 30));

  -- J. Inserção na tabela contas_receber (contrato_id É OBRIGATÓRIO E NOT NULL)
  INSERT INTO public.contas_receber (
    empresa_operadora_id,
    contrato_id,
    cliente_id,
    codigo_operacional,
    numero_documento,
    competencia_date,
    data_vencimento,
    valor,
    saldo,
    status,
    metodo_cobranca,
    metodos_gateway,
    billing_origin_type,
    idempotency_key,
    public_enabled,
    notes
  )
  VALUES (
    p_empresa_operadora_id,
    v_contrato.id, -- MANDATÓRIO: contrato_id nunca nulo
    p_cliente_id,
    v_codigo_operacional,
    v_codigo_operacional,
    date_trunc('month', CURRENT_DATE)::DATE,
    v_vencimento,
    v_subtotal_total,
    v_subtotal_total,
    'PENDENTE',
    CASE WHEN 'PIX' = ANY(v_metodos_gateway) THEN 'PIX' ELSE 'BOLETO' END,
    v_metodos_gateway,
    'ANUNCIANTE',
    p_idempotency_key,
    TRUE,
    COALESCE('Contratação JIT | Hash: ' || p_composition_hash, 'Contratação JIT — Expansão Comercial Portal Anunciante')
  )
  RETURNING id, public_identifier INTO v_conta_id, v_public_identifier;

  -- K. Retorno Completo
  RETURN jsonb_build_object(
    'success', true,
    'idempotente', false,
    'id', v_conta_id,
    'codigo_operacional', v_codigo_operacional,
    'public_identifier', v_public_identifier,
    'valor', v_subtotal_total,
    'vencimento', v_vencimento,
    'status', 'PENDENTE',
    'metodos_gateway', v_metodos_gateway,
    'contrato_id', v_contrato.id
  );
END;
$$;

SELECT 'Migration 20261210 GATE 2 Cobrança JIT Idempotente revisada com sucesso' AS status;
