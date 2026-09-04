-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261216 (MICRO-GATE 5.3.2.2 & 5.3.2.2-H1 HARDENING)
-- LIBERAÇÃO OPERACIONAL CONDICIONADA À CONFIRMAÇÃO REAL DE PAGAMENTO
-- ======================================================================

-- 1. Vincular expansao_id em contrato_estabelecimentos
ALTER TABLE public.contrato_estabelecimentos 
  ADD COLUMN IF NOT EXISTS expansao_id UUID REFERENCES public.expansoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contrato_estabelecimentos_expansao 
  ON public.contrato_estabelecimentos(expansao_id);

-- Backfill idempotente para vincular expansões existentes
UPDATE public.contrato_estabelecimentos ce
SET expansao_id = ei.expansao_id
FROM public.expansao_itens ei
JOIN public.expansoes ex ON ex.id = ei.expansao_id
WHERE ce.expansao_id IS NULL
  AND ce.contrato_id = ex.contrato_id
  AND (ce.unidade_id = ei.unidade_id OR ce.ponto_id IN (SELECT id FROM public.pontos WHERE unidade_id = ei.unidade_id));

-- 2. Atualização de fn_criar_cobranca_jit_expansao para persistir expansao_id em contrato_estabelecimentos
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

  -- G. Processamento dos Itens com PREÇO AUTORITATIVO ESTRITO + TRAVA DUPLICATA
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

    -- PREÇO AUTORITATIVO NO SERVIDOR (P0.2 HARDENED)
    SELECT preco INTO v_preco_oficial 
    FROM public.ponto_precos 
    WHERE ponto_id = v_ponto_id 
      AND periodicidade = v_periodicidade 
      AND ativo = TRUE 
    ORDER BY vigencia_inicio DESC, created_at DESC
    LIMIT 1;

    IF v_preco_oficial IS NULL THEN
      SELECT valor_anuncio INTO v_preco_oficial 
      FROM public.pontos 
      WHERE id = v_ponto_id;
    END IF;

    v_valor_tabela := COALESCE(v_preco_oficial, 0);

    IF v_valor_tabela <= 0 THEN
      RAISE EXCEPTION 'PRECO_NAO_CONFIGURADO: O ponto % não possui preço oficial ativo configurado no servidor.', v_ponto_id;
    END IF;

    v_desconto := LEAST(GREATEST(COALESCE((v_item.value->>'desconto')::NUMERIC, 0), 0), v_valor_tabela);
    v_subtotal_item := v_valor_tabela - v_desconto;

    v_subtotal_total := v_subtotal_total + v_subtotal_item;

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

  -- H. Inserção em public.expansoes
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

  -- I. Inserção em public.expansao_itens & public.contrato_estabelecimentos (com expansao_id)
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
      expansao_id,
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
      v_expansao_id,
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

  -- K. Registro do Aditivo Imutável em public.contrato_versoes
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

  -- L. Definição de metodos_gateway
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

  -- M. Inserção em contas_receber vinculando contrato_id e expansao_id
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

  -- N. Retorno
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

-- 3. Atualização de aprovar_expansao para também gravar ponto_id e expansao_id em contrato_estabelecimentos
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
  v_ponto_id uuid;
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

  -- 1. Estabelecimentos adicionados ao contrato com ponto_id e expansao_id
  FOR v_item IN
    SELECT ei.unidade_id, ei.quantidade_telas, ei.valor_unitario, ei.valor_total
    FROM public.expansao_itens ei
    WHERE ei.expansao_id = p_expansao_id
  LOOP
    SELECT id INTO v_ponto_id FROM public.pontos 
    WHERE unidade_id = v_item.unidade_id AND empresa_operadora_id = v_tenant 
    ORDER BY created_at ASC LIMIT 1;

    INSERT INTO public.contrato_estabelecimentos (contrato_id, ponto_id, unidade_id, expansao_id, quantidade_telas, valor_unitario, created_by)
    VALUES (v_exp.contrato_id, v_ponto_id, v_item.unidade_id, p_expansao_id, v_item.quantidade_telas, v_item.valor_unitario, auth.uid())
    ON CONFLICT (contrato_id, unidade_id) DO UPDATE
      SET quantidade_telas = EXCLUDED.quantidade_telas, valor_unitario = EXCLUDED.valor_unitario, expansao_id = EXCLUDED.expansao_id, ponto_id = COALESCE(contrato_estabelecimentos.ponto_id, EXCLUDED.ponto_id);

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

  -- 5. Auto-geração da fatura inicial em contas_receber
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

-- 4. HARDENING FORENSE DE ELEGIBILIDADE NO RPC get_player_playlist_for_screen
-- Garante que telas vinculadas a expansões cuja cobrança contas_receber ainda NÃO ESTÁ PAGA não recebam playlist.
-- Hardening H1: Desambiguação de ponto_id vs unidade_id (P2.1) + Tratamento de CANCELADO/CANCELADA (P2.2) + Tenant (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_player_playlist_for_screen(p_identifier text, p_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_user_ctx RECORD;
    v_screen RECORD;
    v_playlist RECORD;
    v_items JSONB;
    v_screen_owner_empresa UUID;
    v_auth_uid UUID;
BEGIN
    v_auth_uid := auth.uid();

    -- 1. Extrair Seguranca e Contexto se autenticado
    IF v_auth_uid IS NOT NULL THEN
        SELECT u.empresa_operadora_id, p.nome AS cargo_nome INTO v_user_ctx
        FROM public.usuarios u
        LEFT JOIN public.perfis p ON u.perfil_id = p.id
        WHERE u.id = v_auth_uid;
    END IF;

    -- Validar que o device_id nao seja nulo ou UNKNOWN
    IF p_device_id IS NULL OR trim(p_device_id) = '' OR p_device_id = 'UNKNOWN_DEVICE' OR p_device_id = 'UNKNOWN' THEN
        RETURN '{"status": "DEVICE_ACCESS_DENIED", "message": "Identidade fisica de hardware invalida ou nao informada."}'::JSONB;
    END IF;

    -- 2. Fetch Screen
    SELECT * INTO v_screen
    FROM public.screens
    WHERE (custom_id ILIKE p_identifier OR (length(p_identifier) > 20 AND id::text = p_identifier));

    IF NOT FOUND THEN
        RETURN '{"status": "SCREEN_NOT_FOUND"}'::JSONB;
    END IF;

    IF NOT v_screen.is_active THEN
        RETURN '{"status": "SCREEN_SUSPENDED"}'::JSONB;
    END IF;

    -- 3. A. Bloqueio Financeiro Global de Contrato: Verificar se a tela pertence a um contrato SUSPENSO_FINANCEIRO
    IF v_screen.ponto_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM public.pontos po
            JOIN public.contrato_estabelecimentos ce ON (
                (ce.ponto_id IS NOT NULL AND ce.ponto_id = po.id)
                OR (ce.ponto_id IS NULL AND ce.unidade_id = po.unidade_id)
            )
            JOIN public.contratos c ON c.id = ce.contrato_id
            WHERE po.id = v_screen.ponto_id
              AND c.status_workflow = 'SUSPENSO_FINANCEIRO'
        ) THEN
            RETURN '{"status": "SCREEN_SUSPENDED", "message": "Tela bloqueada temporariamente (Suspensão Financeira)."}'::JSONB;
        END IF;

        -- 3. B. Trava Atômica de Expansão Pré-Pagamento (Hardened H1: P2.1 Desambiguação de Ponto + P2.2 Semântica CANCELADO + Tenant):
        -- Se o ponto/unidade foi adicionado via expansão cuja fatura contas_receber está em aberto (PENDENTE/VENCIDO), nega distribuição de playlist.
        IF EXISTS (
            SELECT 1
            FROM public.pontos po
            JOIN public.contrato_estabelecimentos ce ON (
                (ce.ponto_id IS NOT NULL AND ce.ponto_id = po.id)
                OR (ce.ponto_id IS NULL AND ce.unidade_id = po.unidade_id)
            )
            JOIN public.contas_receber cr ON cr.expansao_id = ce.expansao_id
            WHERE po.id = v_screen.ponto_id
              AND ce.expansao_id IS NOT NULL
              AND cr.empresa_operadora_id = v_screen.empresa_operadora_id
              AND cr.status IN ('PENDENTE', 'ABERTA', 'VENCIDO', 'VENCIDA', 'ATRASADO', 'ATRASADA', 'VENCENDO_HOJE', 'AGENDADA', 'PARCIAL', 'PARCIAL_PAGA')
        ) THEN
            RETURN '{"status": "SCREEN_SUSPENDED", "message": "Tela bloqueada temporariamente (Aguardando confirmação de pagamento da expansão)."}'::JSONB;
        END IF;
    END IF;

    -- 4. Screen Ownership Check (se autenticado e nao for OWNER/ADMIN)
    IF v_auth_uid IS NOT NULL THEN
        IF v_user_ctx.cargo_nome NOT IN ('OWNER', 'ADMIN') THEN
            IF v_screen.user_id = v_auth_uid THEN
                NULL;
            ELSIF v_screen.empresa_operadora_id IS NOT NULL AND v_screen.empresa_operadora_id = v_user_ctx.empresa_operadora_id THEN
                NULL;
            ELSE
                SELECT empresa_operadora_id INTO v_screen_owner_empresa
                FROM public.usuarios
                WHERE id = v_screen.user_id;

                IF v_screen_owner_empresa IS NOT NULL AND v_screen_owner_empresa != v_user_ctx.empresa_operadora_id THEN
                    RETURN '{"status": "SCREEN_ACCESS_DENIED"}'::JSONB;
                END IF;
            END IF;
        END IF;
    END IF;

    -- 5. Device Binding Check
    IF v_screen.bound_device_id IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.devices
            WHERE identity_hash = p_device_id
              AND revoked_at IS NOT NULL
        ) THEN
            RETURN '{"status": "DEVICE_REVOKED", "message": "O vinculo deste aparelho com esta tela foi revogado pelo administrador."}'::JSONB;
        END IF;

        PERFORM pg_advisory_xact_lock(hashtext('sobremidia:device:' || p_device_id));

        IF EXISTS (
            SELECT 1 FROM public.screens
            WHERE bound_device_id = p_device_id
              AND id <> v_screen.id
        ) THEN
            RETURN '{"status": "DEVICE_ALREADY_BOUND", "message": "Este aparelho ja esta vinculado a outra tela. Desvincule-o antes de parear em uma nova tela."}'::JSONB;
        END IF;

        UPDATE public.screens SET bound_device_id = p_device_id, last_ping_at = now() WHERE id = v_screen.id;

        IF EXISTS (SELECT 1 FROM public.devices WHERE identity_hash = p_device_id) THEN
            UPDATE public.devices
            SET screen_id = v_screen.id, last_seen = now()
            WHERE identity_hash = p_device_id;
        ELSE
            INSERT INTO public.devices (name, screen_id, identity_hash, revoked_at, last_seen)
            VALUES (COALESCE(v_screen.name, 'Player'), v_screen.id, p_device_id, NULL, now());
        END IF;
    ELSIF v_screen.bound_device_id = p_device_id THEN
        IF EXISTS (
            SELECT 1 FROM public.devices
            WHERE identity_hash = p_device_id
              AND revoked_at IS NOT NULL
        ) THEN
            RETURN '{"status": "DEVICE_REVOKED", "message": "O vinculo deste aparelho com esta tela foi revogado pelo administrador."}'::JSONB;
        END IF;

        UPDATE public.devices
        SET last_seen = now(), last_heartbeat = now()
        WHERE identity_hash = p_device_id;

        UPDATE public.screens SET last_ping_at = now() WHERE id = v_screen.id;
    ELSE
        RETURN '{"status": "DEVICE_ALREADY_BOUND"}'::JSONB;
    END IF;

    -- 6. Playlist Validation
    IF v_screen.playlist_id IS NULL THEN
        RETURN '{"status": "NO_PLAYLIST_ASSIGNED"}'::JSONB;
    END IF;

    SELECT * INTO v_playlist FROM public.playlists WHERE id = v_screen.playlist_id;

    IF NOT FOUND THEN
        RETURN '{"status": "PLAYLIST_NOT_FOUND"}'::JSONB;
    END IF;

    -- 7. Fetch Items & Build Payload
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', pi.id,
            'position', pi.position,
            'duration', pi.duration,
            'start_time', pi.start_time,
            'end_time', pi.end_time,
            'days_of_week', pi.days,
            'media', (
                SELECT jsonb_build_object(
                    'id', m.id,
                    'name', m.name,
                    'file_url', m.file_url,
                    'file_type', m.file_type,
                    'file_hash', m.file_hash
                )
                FROM public.media m WHERE m.id = pi.media_id
            ),
            'widget', (
                SELECT jsonb_build_object(
                    'id', w.id,
                    'name', w.name,
                    'widget_type', w.widget_type,
                    'config', w.config
                )
                FROM public.widgets w WHERE w.id = pi.widget_id
            )
        ) ORDER BY pi.position ASC
    ) INTO v_items
    FROM public.playlist_items pi
    WHERE pi.playlist_id = v_playlist.id;

    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        RETURN '{"status": "PLAYLIST_EMPTY"}'::JSONB;
    END IF;

    -- 8. Return Payload
    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'data', jsonb_build_object(
            'id', v_screen.id,
            'name', v_screen.name,
            'custom_id', v_screen.custom_id,
            'is_active', v_screen.is_active,
            'playlist_id', v_screen.playlist_id,
            'orientation', v_screen.orientation,
            'resolution', v_screen.resolution,
            'playlists', jsonb_build_object(
                'id', v_playlist.id,
                'name', v_playlist.name,
                'resolution', v_playlist.resolution,
                'playlist_resolution', v_playlist.resolution,
                'audio_enabled', COALESCE(v_playlist.audio_enabled, false),
                'playlist_items', v_items
            )
        )
    );
END;
$$;

-- 5. Atualização de publicar_playlist_no_ponto para validar pagamento de expansão (Hardened H1)
CREATE OR REPLACE FUNCTION public.publicar_playlist_no_ponto(
    p_playlist_id UUID,
    p_ponto_id UUID
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_cliente UUID;
    v_tenant UUID;
    v_ponto RECORD;
    v_canal UUID;
    v_screen RECORD;
    v_vinculadas INT := 0;
    v_ignoradas INT := 0;
    v_detalhe JSONB := '[]'::jsonb;
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;

    SELECT empresa_operadora_id INTO v_tenant
    FROM public.playlists_cliente
    WHERE id = p_playlist_id AND cliente_id = v_cliente;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Playlist inexistente ou fora do seu escopo.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_ponto FROM public.pontos
    WHERE id = p_ponto_id AND empresa_operadora_id = v_tenant AND ativo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ponto inexistente ou indisponível.' USING ERRCODE = '42501';
    END IF;

    -- Ponto deve estar CONTRATADO e ativo para este cliente
    IF NOT EXISTS (
        SELECT 1
        FROM public.pontos po
        JOIN public.contrato_estabelecimentos ce ON (
            (ce.ponto_id IS NOT NULL AND ce.ponto_id = po.id)
            OR (ce.ponto_id IS NULL AND ce.unidade_id = po.unidade_id)
        )
        JOIN public.contratos k ON k.id = ce.contrato_id
        WHERE po.id = p_ponto_id
          AND po.ativo
          AND k.cliente_id = v_cliente
          AND k.status_workflow IN ('EM_PRODUCAO','AGUARDANDO_APROVACAO','CAMPANHA_APROVADA','CAMPANHA_ATIVA')
    ) THEN
        RAISE EXCEPTION 'Ponto não está contratado/ativo para o seu cliente.' USING ERRCODE = '42501';
    END IF;

    -- Trava Atômica de Expansão (Hardened H1: P2.1 + P2.2 + Multi-Tenant): impedir publicação se houver cobrança em aberto
    IF EXISTS (
        SELECT 1
        FROM public.pontos po
        JOIN public.contrato_estabelecimentos ce ON (
            (ce.ponto_id IS NOT NULL AND ce.ponto_id = po.id)
            OR (ce.ponto_id IS NULL AND ce.unidade_id = po.unidade_id)
        )
        JOIN public.contas_receber cr ON cr.expansao_id = ce.expansao_id
        WHERE po.id = p_ponto_id
          AND ce.expansao_id IS NOT NULL
          AND cr.empresa_operadora_id = v_tenant
          AND cr.status IN ('PENDENTE', 'ABERTA', 'VENCIDO', 'VENCIDA', 'ATRASADO', 'ATRASADA', 'VENCENDO_HOJE', 'AGENDADA', 'PARCIAL', 'PARCIAL_PAGA')
    ) THEN
        RAISE EXCEPTION 'Ponto contratado por expansão aguardando confirmação de pagamento. Regularize a cobrança antes de publicar.' USING ERRCODE = '42501';
    END IF;

    v_canal := (public.publicar_playlist_cliente(p_playlist_id))->>'playlist_player_id';

    FOR v_screen IN
        SELECT id, name, playlist_id
        FROM public.screens
        WHERE ponto_id = p_ponto_id
          AND empresa_operadora_id = v_tenant
          AND is_active
        ORDER BY created_at
    LOOP
        IF v_screen.playlist_id IS NULL OR v_screen.playlist_id = v_canal THEN
            UPDATE public.screens SET playlist_id = v_canal WHERE id = v_screen.id;

            INSERT INTO public.playlist_publicacoes
                (empresa_operadora_id, cliente_id, playlist_cliente_id, ponto_id,
                 screen_id, playlist_player_id, status, published_by)
            VALUES
                (v_tenant, v_cliente, p_playlist_id, p_ponto_id,
                 v_screen.id, v_canal, 'PUBLICADA', auth.uid())
            ON CONFLICT (playlist_cliente_id, screen_id) DO UPDATE
                SET status = 'PUBLICADA',
                    playlist_player_id = EXCLUDED.playlist_player_id,
                    updated_at = NOW();

            v_vinculadas := v_vinculadas + 1;
            v_detalhe := v_detalhe || jsonb_build_object('screen', v_screen.id, 'acao', 'vinculada');
        ELSE
            v_ignoradas := v_ignoradas + 1;
            v_detalhe := v_detalhe || jsonb_build_object('screen', v_screen.id, 'acao', 'ocupada_outra_playlist');
        END IF;
    END LOOP;

    IF v_vinculadas = 0 THEN
        RAISE EXCEPTION 'Nenhuma tela ativa disponível neste ponto (% ocupadas por outras playlists). Vincule telas ao ponto ou libere-as.', v_ignoradas;
    END IF;

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_tenant, auth.uid(), 'PLAYLIST_CLIENTE', p_playlist_id, 'PLAYLIST_PUBLICADA_PONTO', 'ATIVA',
         'Ponto: ' || v_ponto.nome || ' | Telas vinculadas: ' || v_vinculadas ||
         ' | Ignoradas (ocupadas): ' || v_ignoradas || ' | Canal: ' || v_canal::text);

    RETURN jsonb_build_object(
        'ok', true,
        'ponto_id', p_ponto_id,
        'playlist_player_id', v_canal,
        'telas_vinculadas', v_vinculadas,
        'telas_ignoradas', v_ignoradas,
        'detalhe', v_detalhe
    );
END;
$$;

SELECT 'Migration 20261216 GATE 5.3.2.2-H1 Hardening executada com sucesso' AS status;
