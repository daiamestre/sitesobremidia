-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261212 (GATE 4)
-- CADASTRO ATÔMICO COM CRIAÇÃO OBRIGATÓRIA DE CONTRATO
-- ======================================================================

-- 1. RPC ATÔMICA DE CADASTRO DE CLIENTE + CONTRATO DE ANUNCIANTE
CREATE OR REPLACE FUNCTION public.fn_cadastrar_cliente_com_contrato(
  p_empresa_operadora_id UUID,
  p_representante_id UUID,
  p_status TEXT,
  p_razao_social TEXT,
  p_nome_fantasia TEXT,
  p_cnpj TEXT,
  p_segmento TEXT,
  p_telefone TEXT,
  p_whatsapp TEXT,
  p_email TEXT,
  p_cep TEXT,
  p_logradouro TEXT,
  p_numero TEXT,
  p_complemento TEXT,
  p_bairro TEXT,
  p_cidade TEXT,
  p_estado TEXT,
  p_representante_legal TEXT,
  p_cargo_representante TEXT,
  p_observacoes TEXT,
  p_contato_nome TEXT,
  p_contato_cargo TEXT,
  p_contato_email TEXT,
  p_contato_telefone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_is_owner BOOLEAN;
  v_own_rep_id UUID;
  v_user_tenant UUID;
  v_lock_key BIGINT;
  v_next_code INT;
  v_cliente_id UUID;
  v_empresa_id UUID;
  v_contato_id UUID;
  v_contrato_id UUID;
  v_numero_contrato VARCHAR(40);
BEGIN
  -- A. Autorização: usuário autenticado obrigatório
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso não autenticado. Faça login para cadastrar clientes.');
  END IF;

  SELECT u.is_owner, r.id, u.empresa_operadora_id
  INTO v_is_owner, v_own_rep_id, v_user_tenant
  FROM public.usuarios u
  LEFT JOIN public.representantes r ON r.usuario_id = u.id
  WHERE u.id = v_user_id
  LIMIT 1;

  IF v_is_owner IS NULL THEN
    -- Fallback para verificação de tenant de sessão
    v_user_tenant := public.get_user_tenant_id();
  END IF;

  IF v_user_tenant IS NOT NULL AND v_user_tenant <> p_empresa_operadora_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tenant incompatível com o usuário autenticado.');
  END IF;

  -- B. Regra de vinculação de representante_id
  IF v_is_owner THEN
    IF p_representante_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'OWNER deve cadastrar clientes sem representante (representante_id NULL).');
    END IF;
  ELSE
    IF v_own_rep_id IS NOT NULL AND (p_representante_id IS NULL OR p_representante_id <> v_own_rep_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Representante inválido: o cliente deve ser vinculado ao representante autenticado.');
    END IF;
  END IF;

  -- C. Lock anti-concorrência exclusivo do tenant
  v_lock_key := hashtext('cliente_code_' || p_empresa_operadora_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- D. Próximo codigo_cliente
  SELECT COALESCE(MAX(codigo_cliente), 0) + 1
  INTO v_next_code
  FROM public.clientes
  WHERE empresa_operadora_id = p_empresa_operadora_id;

  -- E. Registro em public.clientes
  INSERT INTO public.clientes (
    empresa_operadora_id, representante_id, codigo_cliente, status, modalidade
  ) VALUES (
    p_empresa_operadora_id, p_representante_id, v_next_code, COALESCE(NULLIF(p_status, ''), 'PROSPECT'), 'ANUNCIANTE'
  ) RETURNING id INTO v_cliente_id;

  -- F. Registro em public.empresas
  INSERT INTO public.empresas (
    cliente_id, razao_social, nome_fantasia, cnpj, segmento,
    telefone, whatsapp, email, cep, logradouro, numero, complemento,
    bairro, cidade, estado, representante_legal, cargo_representante, observacoes
  ) VALUES (
    v_cliente_id,
    COALESCE(NULLIF(p_razao_social, ''), p_nome_fantasia),
    p_nome_fantasia, p_cnpj, p_segmento,
    p_telefone, p_whatsapp, p_email, p_cep, p_logradouro, p_numero, p_complemento,
    p_bairro, p_cidade, p_estado, p_representante_legal, p_cargo_representante, p_observacoes
  ) RETURNING id INTO v_empresa_id;

  -- G. Contato principal em public.contatos
  IF p_contato_nome IS NOT NULL AND p_contato_nome <> '' THEN
    INSERT INTO public.contatos (
      empresa_id, nome, cargo, email, telefone, is_principal
    ) VALUES (
      v_empresa_id,
      p_contato_nome,
      COALESCE(NULLIF(p_contato_cargo, ''), 'Responsável'),
      COALESCE(NULLIF(p_contato_email, ''), p_email),
      COALESCE(NULLIF(p_contato_telefone, ''), p_whatsapp),
      TRUE
    ) RETURNING id INTO v_contato_id;
  END IF;

  -- H. CRIAÇÃO OBRIGATÓRIA DO CONTRATO DE ANUNCIANTE (GATE 4)
  v_numero_contrato := public.fn_gerar_numero_contrato_atomo(p_empresa_operadora_id);

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
    status_documento,
    status_workflow
  ) VALUES (
    p_empresa_operadora_id,
    v_cliente_id,
    v_empresa_id,
    p_representante_id,
    v_numero_contrato,
    'ANUNCIANTE',
    0.00,
    'PIX',
    CURRENT_DATE,
    (CURRENT_DATE + INTERVAL '1 year')::DATE,
    'RASCUNHO',
    'AGUARDANDO_PAGAMENTO'
  ) RETURNING id INTO v_contrato_id;

  IF v_contrato_id IS NULL THEN
    RAISE EXCEPTION 'Falha ao criar o contrato atômico do anunciante.';
  END IF;

  -- I. Retorno Completo com cliente_id e contrato_id
  RETURN jsonb_build_object(
    'success', true,
    'cliente_id', v_cliente_id,
    'empresa_id', v_empresa_id,
    'contato_id', v_contato_id,
    'contrato_id', v_contrato_id,
    'codigo_cliente', v_next_code,
    'numero_contrato', v_numero_contrato
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;


-- 2. RPC ATÔMICA DE CADASTRO DE PONTO PARCEIRO + CONTRATO DE PARCERIA
CREATE OR REPLACE FUNCTION public.fn_cadastrar_ponto_parceiro_com_contrato(
  p_dados JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_tenant UUID;
  v_nome TEXT;
  v_ponto_id UUID;
  v_codigo_publico TEXT;
  v_contrato_id UUID;
  v_numero_contrato VARCHAR(40);
BEGIN
  -- A. Autorização
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso não autenticado.');
  END IF;

  v_user_tenant := public.get_user_tenant_id();
  IF v_user_tenant IS NULL THEN
    SELECT empresa_operadora_id INTO v_user_tenant FROM public.usuarios WHERE id = v_user_id LIMIT 1;
  END IF;

  IF v_user_tenant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tenant não localizado para o usuário.');
  END IF;

  v_nome := (p_dados->>'nome');
  IF v_nome IS NULL OR trim(v_nome) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome do ponto parceiro é obrigatório.');
  END IF;

  -- B. Inserção em public.pontos (Trigger fn_set_codigo_publico gera código EST-)
  INSERT INTO public.pontos (
    empresa_operadora_id,
    nome,
    categoria,
    descricao,
    foto_url,
    galeria,
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    cidade,
    estado,
    quantidade_telas,
    disponibilidade,
    status_operacional,
    regras_comerciais,
    ativo,
    created_by
  ) VALUES (
    v_user_tenant,
    v_nome,
    p_dados->>'categoria',
    p_dados->>'descricao',
    p_dados->>'foto_capa_url',
    COALESCE(p_dados->'fotos_urls', '[]'::jsonb),
    p_dados->>'cep',
    p_dados->>'logradouro',
    p_dados->>'numero',
    p_dados->>'complemento',
    p_dados->>'bairro',
    p_dados->>'cidade',
    p_dados->>'estado',
    COALESCE((p_dados->>'quantidade_telas')::INT, 1),
    'DISPONIVEL',
    'ATIVO',
    p_dados->>'regras_comerciais',
    TRUE,
    v_user_id
  ) RETURNING id, codigo_publico INTO v_ponto_id, v_codigo_publico;

  -- C. CRIAÇÃO OBRIGATÓRIA DO CONTRATO DE PARCERIA (GATE 4)
  v_numero_contrato := public.fn_gerar_numero_contrato_atomo(v_user_tenant);

  INSERT INTO public.contratos (
    empresa_operadora_id,
    ponto_id,
    numero_contrato,
    tipo_contrato,
    valor_mensal,
    forma_pagamento,
    data_inicio,
    data_fim,
    status_documento,
    status_workflow
  ) VALUES (
    v_user_tenant,
    v_ponto_id,
    v_numero_contrato,
    'PARCEIRO',
    0.00,
    'PIX',
    CURRENT_DATE,
    (CURRENT_DATE + INTERVAL '1 year')::DATE,
    'RASCUNHO',
    'AGUARDANDO_ASSINATURA'
  ) RETURNING id INTO v_contrato_id;

  IF v_contrato_id IS NULL THEN
    RAISE EXCEPTION 'Falha ao criar o contrato atômico do ponto parceiro.';
  END IF;

  -- D. Auditoria
  INSERT INTO public.auditoria_logs (
    empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes
  ) VALUES (
    v_user_tenant, v_user_id, 'PONTO', v_ponto_id, 'INSERT', 'ATIVO',
    'PONTO PARCEIRO cadastrado com contrato (Código: ' || COALESCE(v_codigo_publico, '?') || ', Contrato: ' || v_numero_contrato || ')'
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', v_ponto_id,
    'ponto_id', v_ponto_id,
    'codigo_publico', v_codigo_publico,
    'contrato_id', v_contrato_id,
    'numero_contrato', v_numero_contrato
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;
