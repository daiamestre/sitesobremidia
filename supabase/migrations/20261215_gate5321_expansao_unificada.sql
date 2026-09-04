-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261215 (MICRO-GATE 5.3.2.1-H HARDENING)
-- UNIFICAÇÃO E HARDENING DA EXPANSÃO COMERCIAL — PREÇO AUTORITATIVO E CONSTRAINT
-- ======================================================================

-- 1. Tabelas de Expansão (garantia de existência no schema)
CREATE TABLE IF NOT EXISTS public.expansoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  solicitado_por UUID REFERENCES public.usuarios(id),
  status VARCHAR(30) NOT NULL DEFAULT 'SOLICITADA' CHECK (
    status IN ('SOLICITADA','APROVADA','REJEITADA','CANCELADA')
  ),
  valor_contrato_atual NUMERIC(12,2) NOT NULL CHECK (valor_contrato_atual >= 0),
  valor_novo_contrato NUMERIC(12,2) NOT NULL CHECK (valor_novo_contrato >= valor_contrato_atual),
  justificativa TEXT,
  aprovado_por UUID REFERENCES public.usuarios(id),
  aprovado_em TIMESTAMPTZ,
  motivo_rejeicao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expansoes_tenant ON public.expansoes(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_expansoes_contrato ON public.expansoes(contrato_id);
CREATE INDEX IF NOT EXISTS idx_expansoes_status ON public.expansoes(status);

CREATE TABLE IF NOT EXISTS public.expansao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expansao_id UUID NOT NULL REFERENCES public.expansoes(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  quantidade_telas INT NOT NULL DEFAULT 1 CHECK (quantidade_telas > 0),
  valor_unitario NUMERIC(12,2) NOT NULL CHECK (valor_unitario >= 0),
  valor_total NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expansao_itens_expansao ON public.expansao_itens(expansao_id);

-- Habilitar RLS em expansoes e expansao_itens
ALTER TABLE public.expansoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expansao_itens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expansoes' AND policyname = 'exp_select_tenant') THEN
    CREATE POLICY exp_select_tenant ON public.expansoes FOR SELECT TO authenticated
      USING (empresa_operadora_id = public.get_user_tenant_id() OR public.is_owner());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expansoes' AND policyname = 'exp_insert_tenant') THEN
    CREATE POLICY exp_insert_tenant ON public.expansoes FOR INSERT TO authenticated
      WITH CHECK (empresa_operadora_id = public.get_user_tenant_id() OR public.is_owner());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expansoes' AND policyname = 'exp_update_tenant') THEN
    CREATE POLICY exp_update_tenant ON public.expansoes FOR UPDATE TO authenticated
      USING (empresa_operadora_id = public.get_user_tenant_id() OR public.is_owner());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expansao_itens' AND policyname = 'exp_itens_select_tenant') THEN
    CREATE POLICY exp_itens_select_tenant ON public.expansao_itens FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.expansoes e 
          WHERE e.id = expansao_itens.expansao_id 
            AND (e.empresa_operadora_id = public.get_user_tenant_id() OR public.is_owner())
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expansao_itens' AND policyname = 'exp_itens_insert_tenant') THEN
    CREATE POLICY exp_itens_insert_tenant ON public.expansao_itens FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.expansoes e 
          WHERE e.id = expansao_itens.expansao_id 
            AND (e.empresa_operadora_id = public.get_user_tenant_id() OR public.is_owner())
        )
      );
  END IF;
END $$;

-- 2. Trava Estrutural Anti-Duplicidade no Banco
CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_estabelecimentos_ativo 
ON public.contrato_estabelecimentos (contrato_id, ponto_id) 
WHERE ativo = TRUE AND ponto_id IS NOT NULL;

-- 3. Vínculo de expansao_id em contas_receber (se ainda não existir)
ALTER TABLE public.contas_receber 
  ADD COLUMN IF NOT EXISTS expansao_id UUID REFERENCES public.expansoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contas_receber_expansao ON public.contas_receber(expansao_id);

-- 4. RPC UNIFICADA HARDENED: fn_criar_cobranca_jit_expansao
-- Preço autoritativo estrito (ZERO FALLBACK FRONTEND) + Lock FOR UPDATE de Contrato + Constraint DB
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
  v_ponto_id UUID;
  v_unidade_id UUID;
  v_periodicidade VARCHAR(30);
  v_preco_oficial NUMERIC(12,2);
  v_valor_tabela NUMERIC(12,2);
  v_desconto NUMERIC(12,2);
  v_subtotal_item NUMERIC(12,2);
  v_subtotal_total NUMERIC(12,2) := 0;
  v_expansao_id UUID;
  v_metodos_gateway TEXT[];
  v_codigo_operacional TEXT;
  v_public_identifier TEXT;
  v_conta_id UUID;
  v_vencimento DATE;
  v_lock_key BIGINT;
  v_numero_versao INT;
  v_item_json JSONB;
  v_itens_calculados JSONB := '[]'::JSONB;
BEGIN
  -- A. Validação de Tenant & Security Check
  v_user_tenant := public.get_user_tenant_id();
  IF v_user_tenant IS NOT NULL AND v_user_tenant <> p_empresa_operadora_id THEN
    RAISE EXCEPTION 'Acesso negado: tenant_id divergente da sessão do usuário.';
  END IF;

  -- B. Advisory Lock Atômico por Chave de Idempotência (Purchase Intent)
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
    v_lock_key := hashtext('jit_intent:' || p_empresa_operadora_id::text || ':' || p_idempotency_key);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- C. Verificação Idempotente Preventiva
    SELECT id, codigo_operacional, public_identifier, valor, data_vencimento, status, metodos_gateway, contrato_id, expansao_id
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
        'expansao_id', v_existente.expansao_id,
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

  -- F. Resolução do Contrato com LOCK FOR UPDATE (Serialização no Contrato)
  SELECT id, numero_contrato, forma_pagamento, valor_mensal, status_workflow INTO v_contrato
  FROM public.contratos
  WHERE cliente_id = p_cliente_id
    AND empresa_operadora_id = p_empresa_operadora_id
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

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
      0,
      'PIX',
      CURRENT_DATE,
      (CURRENT_DATE + INTERVAL '1 year')::DATE,
      'AGUARDANDO_PAGAMENTO'
    )
    RETURNING id, numero_contrato, forma_pagamento, valor_mensal, status_workflow INTO v_contrato;
  END IF;

  -- G. Processamento dos Itens com PREÇO AUTORITATIVO ESTRITO (ZERO FALLBACK FRONTEND) + TRAVA DUPLICATA
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_ponto_id := (v_item.value->>'ponto_id')::UUID;
    v_periodicidade := COALESCE(v_item.value->>'periodicidade', 'MENSAL');

    IF v_ponto_id IS NULL THEN
      RAISE EXCEPTION 'Todo item de expansão deve ter um ponto_id válido.';
    END IF;

    -- Obter unidade_id associada ao ponto
    SELECT unidade_id INTO v_unidade_id FROM public.pontos WHERE id = v_ponto_id;
    IF v_unidade_id IS NULL THEN
      SELECT id INTO v_unidade_id FROM public.unidades WHERE id = v_ponto_id;
    END IF;

    IF v_unidade_id IS NULL THEN
      RAISE EXCEPTION 'Unidade não localizada para o ponto %.', v_ponto_id;
    END IF;

    -- DUPLICIDADE DE PONTO: impede contratação de ponto/unidade já pertencente ao contrato deste anunciante
    IF EXISTS (
      SELECT 1 FROM public.contrato_estabelecimentos 
      WHERE contrato_id = v_contrato.id 
        AND (ponto_id = v_ponto_id OR unidade_id = v_unidade_id)
        AND ativo = TRUE
    ) THEN
      RAISE EXCEPTION 'O ponto/unidade já faz parte da composição comercial deste anunciante.';
    END IF;

    -- PREÇO AUTORITATIVO NO SERVIDOR (P0.2 HARDENED — ZERO FALLBACK FRONTEND)
    -- 1º Busca em ponto_precos para o ponto e periodicidade
    SELECT preco INTO v_preco_oficial 
    FROM public.ponto_precos 
    WHERE ponto_id = v_ponto_id 
      AND periodicidade = v_periodicidade 
      AND ativo = TRUE 
    ORDER BY vigencia_inicio DESC, created_at DESC
    LIMIT 1;

    -- 2º Fallback para valor_anuncio na tabela pontos
    IF v_preco_oficial IS NULL THEN
      SELECT valor_anuncio INTO v_preco_oficial 
      FROM public.pontos 
      WHERE id = v_ponto_id;
    END IF;

    -- PREÇO ESTRITO: se o preço for nulo ou <= 0 no servidor, lança erro PRECO_NAO_CONFIGURADO. Jamais confia no frontend!
    v_valor_tabela := COALESCE(v_preco_oficial, 0);

    IF v_valor_tabela <= 0 THEN
      RAISE EXCEPTION 'PRECO_NAO_CONFIGURADO: O ponto % não possui preço oficial ativo configurado no servidor.', v_ponto_id;
    END IF;

    -- Validação de Desconto: desconto não pode ser negativo nem superar o valor de tabela
    v_desconto := LEAST(GREATEST(COALESCE((v_item.value->>'desconto')::NUMERIC, 0), 0), v_valor_tabela);
    v_subtotal_item := v_valor_tabela - v_desconto;

    v_subtotal_total := v_subtotal_total + v_subtotal_item;

    -- Monta snapshot do item com valores autoritativos calculados
    v_item_json := jsonb_build_object(
      'ponto_id', v_ponto_id,
      'unidade_id', v_unidade_id,
      'periodicidade', v_periodicidade,
      'valor_tabela', v_valor_tabela,
      'desconto', v_desconto,
      'subtotal', v_subtotal_item,
      'observacoes', v_item.value->>'observacoes'
    );
    v_itens_calculados := v_itens_calculados || jsonb_build_array(v_item_json);
  END LOOP;

  IF v_subtotal_total <= 0 THEN
    RAISE EXCEPTION 'O valor total autoritativo da expansão deve ser maior que zero.';
  END IF;

  -- H. Inserção na Tabela public.expansoes (Status APROVADA para contratação self-service JIT)
  INSERT INTO public.expansoes (
    empresa_operadora_id,
    contrato_id,
    solicitado_por,
    status,
    valor_contrato_atual,
    valor_novo_contrato,
    justificativa,
    aprovado_por,
    aprovado_em
  )
  VALUES (
    p_empresa_operadora_id,
    v_contrato.id,
    auth.uid(),
    'APROVADA',
    COALESCE(v_contrato.valor_mensal, 0),
    COALESCE(v_contrato.valor_mensal, 0) + v_subtotal_total,
    'Contratação de Expansão Self-Service JIT',
    auth.uid(),
    NOW()
  )
  RETURNING id INTO v_expansao_id;

  -- I. Inserção em public.expansao_itens & public.contrato_estabelecimentos
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_itens_calculados) LOOP
    INSERT INTO public.expansao_itens (
      expansao_id,
      unidade_id,
      quantidade_telas,
      valor_unitario,
      valor_total
    )
    VALUES (
      v_expansao_id,
      (v_item.value->>'unidade_id')::UUID,
      1,
      (v_item.value->>'subtotal')::NUMERIC,
      (v_item.value->>'subtotal')::NUMERIC
    );

    INSERT INTO public.contrato_estabelecimentos (
      contrato_id,
      ponto_id,
      unidade_id,
      periodicidade,
      valor_tabela,
      valor_unitario,
      desconto,
      subtotal,
      observacoes,
      quantidade_telas,
      ativo,
      created_by
    )
    VALUES (
      v_contrato.id,
      (v_item.value->>'ponto_id')::UUID,
      (v_item.value->>'unidade_id')::UUID,
      v_item.value->>'periodicidade',
      (v_item.value->>'valor_tabela')::NUMERIC,
      (v_item.value->>'subtotal')::NUMERIC,
      (v_item.value->>'desconto')::NUMERIC,
      (v_item.value->>'subtotal')::NUMERIC,
      v_item.value->>'observacoes',
      1,
      TRUE,
      auth.uid()
    );
  END LOOP;

  -- J. Atualização do Valor Mensal no Contrato
  UPDATE public.contratos
  SET valor_mensal = COALESCE(v_contrato.valor_mensal, 0) + v_subtotal_total,
      updated_at = NOW(),
      updated_by = auth.uid()
  WHERE id = v_contrato.id;

  -- K. Registro do Aditivo Imutável em public.contrato_versoes (Protegido por Lock e Unique Constraint)
  SELECT COALESCE(MAX(numero_versao), 0) + 1 INTO v_numero_versao
  FROM public.contrato_versoes
  WHERE contrato_id = v_contrato.id;

  INSERT INTO public.contrato_versoes (
    contrato_id,
    numero_versao,
    snapshot_dados,
    motivo_alteracao,
    created_by
  )
  VALUES (
    v_contrato.id,
    v_numero_versao,
    jsonb_build_object(
      'tipo', 'ADITIVO_EXPANSAO_JIT',
      'expansao_id', v_expansao_id,
      'valor_anterior', COALESCE(v_contrato.valor_mensal, 0),
      'valor_novo', COALESCE(v_contrato.valor_mensal, 0) + v_subtotal_total,
      'itens', v_itens_calculados,
      'criado_em', NOW()
    ),
    'Aditivo por expansão comercial self-service (JIT)',
    auth.uid()
  );

  -- L. Definição de metodos_gateway baseada na forma de pagamento do contrato
  v_metodos_gateway := CASE COALESCE(v_contrato.forma_pagamento, 'PIX_BOLETO')
    WHEN 'PIX' THEN ARRAY['PIX']
    WHEN 'BOLETO' THEN ARRAY['BOLETO']
    ELSE ARRAY['PIX', 'BOLETO']
  END;

  BEGIN
    v_codigo_operacional := public.fn_gerar_numero_recebivel_atomo(p_empresa_operadora_id);
  EXCEPTION WHEN OTHERS THEN
    v_codigo_operacional := 'COB-' || to_char(NOW(), 'YYYYMMDD-HH24MISS');
  END;

  v_vencimento := CURRENT_DATE + make_interval(days => LEAST(GREATEST(p_vencimento_dias, 1), 30));

  -- M. Inserção na tabela contas_receber vinculando contrato_id e expansao_id
  INSERT INTO public.contas_receber (
    empresa_operadora_id,
    contrato_id,
    cliente_id,
    expansao_id,
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
    v_contrato.id,
    p_cliente_id,
    v_expansao_id,
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
    'Contratação JIT Expansão | Expansão ID: ' || v_expansao_id::text
  )
  RETURNING id, public_identifier INTO v_conta_id, v_public_identifier;

  -- N. Retorno Completo Unificado
  RETURN jsonb_build_object(
    'success', true,
    'idempotente', false,
    'expansao_id', v_expansao_id,
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

-- 5. CONVERGÊNCIA DO FLUXO LEGADO DE APROVAÇÃO MANUALL DE GESTOR (aprovar_expansao)
-- Quando um gestor aprova manualmente uma expansão solicitada, também garante a fatura contas_receber
CREATE OR REPLACE FUNCTION public.aprovar_expansao(p_expansao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exp public.expansoes%ROWTYPE;
  v_tenant uuid := public.get_user_empresa_operadora_id(auth.uid());
  v_role text := public.get_user_role();
  v_servico_id uuid;
  v_item record;
  v_contrato public.contratos%ROWTYPE;
  v_numero_versao int;
  v_codigo_operacional text;
  v_vencimento date;
  v_metodos_gateway text[];
  v_conta_id uuid;
  v_public_identifier text;
BEGIN
  SELECT * INTO v_exp FROM public.expansoes WHERE id = p_expansao_id FOR UPDATE;
  IF v_exp.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação de expansão não encontrada.');
  END IF;

  IF v_tenant <> v_exp.empresa_operadora_id
     OR v_role NOT IN ('OWNER','ADMIN','GESTOR','GERENTE','SUPERVISOR','FINANCEIRO','OPERACIONAL','FUNCIONARIO','DESIGNER','MARKETING') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: apenas usuários internos autorizados podem aprovar expansões.');
  END IF;

  IF v_exp.status <> 'SOLICITADA' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expansão já foi ' || lower(v_exp.status) || '.');
  END IF;

  SELECT * INTO v_contrato FROM public.contratos WHERE id = v_exp.contrato_id FOR UPDATE;
  IF v_contrato.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contrato não encontrado.');
  END IF;

  SELECT id INTO v_servico_id FROM public.catalogo_servicos
  WHERE empresa_operadora_id = v_tenant AND codigo_servico = 'PONTO_MIDIA' LIMIT 1;

  -- 1. Estabelecimentos adicionados ao contrato + itens
  FOR v_item IN
    SELECT ei.unidade_id, ei.quantidade_telas, ei.valor_unitario, ei.valor_total
    FROM public.expansao_itens ei
    WHERE ei.expansao_id = p_expansao_id
  LOOP
    INSERT INTO public.contrato_estabelecimentos (contrato_id, unidade_id, quantidade_telas, valor_unitario, created_by)
    VALUES (v_exp.contrato_id, v_item.unidade_id, v_item.quantidade_telas, v_item.valor_unitario, auth.uid())
    ON CONFLICT (contrato_id, unidade_id) DO UPDATE
      SET quantidade_telas = EXCLUDED.quantidade_telas, valor_unitario = EXCLUDED.valor_unitario;

    IF v_servico_id IS NOT NULL THEN
      INSERT INTO public.itens_contrato (contrato_id, servico_id, quantidade, valor_unitario, desconto, valor_total)
      VALUES (v_exp.contrato_id, v_servico_id, v_item.quantidade_telas, v_item.valor_unitario, 0, v_item.valor_total);
    END IF;
  END LOOP;

  -- 2. Novo valor do contrato
  UPDATE public.contratos
  SET valor_mensal = v_exp.valor_novo_contrato, updated_at = NOW(), updated_by = auth.uid()
  WHERE id = v_exp.contrato_id;

  -- 3. Aditivo imutável (snapshot)
  SELECT COALESCE(MAX(numero_versao), 0) + 1 INTO v_numero_versao
  FROM public.contrato_versoes WHERE contrato_id = v_exp.contrato_id;

  INSERT INTO public.contrato_versoes (contrato_id, numero_versao, snapshot_dados, motivo_alteracao, created_by)
  VALUES (
    v_exp.contrato_id, v_numero_versao,
    jsonb_build_object(
      'tipo', 'ADITIVO_EXPANSAO_MANUAL',
      'expansao_id', p_expansao_id,
      'valor_anterior', v_exp.valor_contrato_atual,
      'valor_novo', v_exp.valor_novo_contrato,
      'justificativa', v_exp.justificativa,
      'aprovado_por', auth.uid(),
      'aprovado_em', NOW()
    ),
    'Aditivo por expansão de estabelecimentos (aprovação manual de gestor)',
    auth.uid()
  );

  -- 4. Status + trilha de decisão
  UPDATE public.expansoes
  SET status = 'APROVADA', aprovado_por = auth.uid(), aprovado_em = NOW(), updated_at = NOW()
  WHERE id = p_expansao_id;

  -- 5. Auto-geração da fatura inicial em contas_receber (Convergência com o fluxo JIT)
  v_metodos_gateway := CASE COALESCE(v_contrato.forma_pagamento, 'PIX_BOLETO')
    WHEN 'PIX' THEN ARRAY['PIX']
    WHEN 'BOLETO' THEN ARRAY['BOLETO']
    ELSE ARRAY['PIX', 'BOLETO']
  END;

  BEGIN
    v_codigo_operacional := public.fn_gerar_numero_recebivel_atomo(v_tenant);
  EXCEPTION WHEN OTHERS THEN
    v_codigo_operacional := 'COB-MAN-' || to_char(NOW(), 'YYYYMMDD-HH24MISS');
  END;

  v_vencimento := CURRENT_DATE + INTERVAL '5 days';

  INSERT INTO public.contas_receber (
    empresa_operadora_id,
    contrato_id,
    cliente_id,
    expansao_id,
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
    v_tenant,
    v_exp.contrato_id,
    v_contrato.cliente_id,
    p_expansao_id,
    v_codigo_operacional,
    v_codigo_operacional,
    date_trunc('month', CURRENT_DATE)::DATE,
    v_vencimento,
    v_exp.valor_novo_contrato - v_exp.valor_contrato_atual,
    v_exp.valor_novo_contrato - v_exp.valor_contrato_atual,
    'PENDENTE',
    CASE WHEN 'PIX' = ANY(v_metodos_gateway) THEN 'PIX' ELSE 'BOLETO' END,
    v_metodos_gateway,
    'ANUNCIANTE',
    'EXP-MANUAL-' || p_expansao_id::text,
    TRUE,
    'Aprovação Manual Expansão | ID: ' || p_expansao_id::text
  )
  RETURNING id, public_identifier INTO v_conta_id, v_public_identifier;

  -- 6. Notificação ao cliente
  INSERT INTO public.portal_notificacoes (empresa_operadora_id, cliente_id, titulo, mensagem, tipo, prioridade)
  VALUES (
    v_contrato.empresa_operadora_id, v_contrato.cliente_id,
    'Expansão aprovada',
    'Sua solicitação de expansão foi APROVADA. Novo valor mensal do contrato ' ||
    v_contrato.numero_contrato || ': R$ ' || to_char(v_exp.valor_novo_contrato, 'FM999G999G999D90') || '.',
    'EXPANSAO', 'ALTA'
  );

  RETURN jsonb_build_object(
    'success', true,
    'expansao_id', p_expansao_id,
    'cobranca_id', v_conta_id,
    'valor_anterior', v_exp.valor_contrato_atual,
    'valor_novo', v_exp.valor_novo_contrato,
    'numero_versao', v_numero_versao
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_criar_cobranca_jit_expansao(uuid, uuid, jsonb, text, int, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_criar_cobranca_jit_expansao(uuid, uuid, jsonb, text, int, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.aprovar_expansao(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.aprovar_expansao(uuid) FROM anon;

SELECT 'Migration 20261215 GATE 5.3.2.1-H Hardening executada com sucesso' AS status;
