-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261223 (MICRO-GATE P0.3)
-- CORREÇÃO DE UNICIDADE DE CNPJ: PERMITIR REUTILIZAÇÃO DE CNPJ SOFT-DELETED
-- PRESERVANDO 100% A UNICIDADE DE CLIENTES ATIVOS
-- ======================================================================

-- 1. Remover a restrição UNIQUE incondicional da tabela empresas
ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_cnpj_key;

-- 2. Criar índice UNIQUE parcial apenas para registros ativos (onde deleted_at IS NULL e cnpj IS NOT NULL)
DROP INDEX IF EXISTS public.idx_empresas_cnpj_unique_active;
CREATE UNIQUE INDEX idx_empresas_cnpj_unique_active 
  ON public.empresas (cnpj) 
  WHERE deleted_at IS NULL AND cnpj IS NOT NULL;

-- 3. Atualizar a RPC fn_cadastrar_cliente_com_contrato com validação de CNPJ ativo
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
  v_tpl_id UUID;
  v_tpl_nome VARCHAR(255);
  v_tpl_versao INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso não autenticado.');
  END IF;

  SELECT u.is_owner, r.id, u.empresa_operadora_id
  INTO v_is_owner, v_own_rep_id, v_user_tenant
  FROM public.usuarios u
  LEFT JOIN public.representantes r ON r.usuario_id = u.id
  WHERE u.id = v_user_id
  LIMIT 1;

  IF v_user_tenant IS NULL THEN
    v_user_tenant := public.get_user_tenant_id();
  END IF;

  IF v_user_tenant IS NOT NULL AND v_user_tenant <> p_empresa_operadora_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tenant incompatível com o usuário autenticado.');
  END IF;

  IF v_is_owner THEN
    IF p_representante_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'OWNER deve cadastrar clientes sem representante (representante_id NULL).');
    END IF;
  ELSE
    IF v_own_rep_id IS NOT NULL AND (p_representante_id IS NULL OR p_representante_id <> v_own_rep_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Representante inválido: o cliente deve ser vinculado ao representante autenticado.');
    END IF;
  END IF;

  -- Validação explícita de CNPJ ativo duplicado para mensagem amigável antes do lock
  IF p_cnpj IS NOT NULL AND trim(p_cnpj) <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.empresas e
      JOIN public.clientes c ON c.id = e.cliente_id
      WHERE e.cnpj = p_cnpj
        AND e.deleted_at IS NULL
        AND c.deleted_at IS NULL
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'CNPJ já cadastrado para outro cliente ativo.');
    END IF;
  END IF;

  v_lock_key := hashtext('cliente_code_' || p_empresa_operadora_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(codigo_cliente), 0) + 1 INTO v_next_code
  FROM public.clientes WHERE empresa_operadora_id = p_empresa_operadora_id;

  INSERT INTO public.clientes (
    empresa_operadora_id, representante_id, codigo_cliente, status, modalidade
  ) VALUES (
    p_empresa_operadora_id, p_representante_id, v_next_code, COALESCE(NULLIF(p_status, ''), 'PROSPECT'), 'ANUNCIANTE'
  ) RETURNING id INTO v_cliente_id;

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

  IF p_contato_nome IS NOT NULL AND p_contato_nome <> '' THEN
    INSERT INTO public.contatos (
      empresa_id, nome, cargo, email, telefone, is_principal
    ) VALUES (
      v_empresa_id, p_contato_nome,
      COALESCE(NULLIF(p_contato_cargo, ''), 'Responsável'),
      COALESCE(NULLIF(p_contato_email, ''), p_email),
      COALESCE(NULLIF(p_contato_telefone, ''), p_whatsapp),
      TRUE
    ) RETURNING id INTO v_contato_id;
  END IF;

  -- Resolução do Template Padrão (Gate 5.1 / Micro-Gate 5.1.2)
  SELECT t.id, t.nome, t.versao INTO v_tpl_id, v_tpl_nome, v_tpl_versao
  FROM public.fn_obter_template_padrao(p_empresa_operadora_id, 'ANUNCIANTE') t;

  v_numero_contrato := public.fn_gerar_numero_contrato_atomo(p_empresa_operadora_id);

  INSERT INTO public.contratos (
    empresa_operadora_id, cliente_id, empresa_id, representante_id,
    template_id, template_nome, template_versao, versao_atual,
    numero_contrato, tipo_contrato, valor_mensal, forma_pagamento,
    data_inicio, data_fim, status_documento, status_workflow
  ) VALUES (
    p_empresa_operadora_id, v_cliente_id, v_empresa_id, p_representante_id,
    v_tpl_id, v_tpl_nome, COALESCE(v_tpl_versao, 1), COALESCE(v_tpl_versao, 1),
    v_numero_contrato, 'ANUNCIANTE', 0.00, 'PIX',
    CURRENT_DATE, (CURRENT_DATE + INTERVAL '1 year')::DATE,
    'RASCUNHO', 'AGUARDANDO_PAGAMENTO'
  ) RETURNING id INTO v_contrato_id;

  IF v_contrato_id IS NULL THEN
    RAISE EXCEPTION 'Falha ao criar o contrato atômico do anunciante.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cliente_id', v_cliente_id,
    'empresa_id', v_empresa_id,
    'contato_id', v_contato_id,
    'contrato_id', v_contrato_id,
    'codigo_cliente', v_next_code,
    'numero_contrato', v_numero_contrato,
    'template_id', v_tpl_id,
    'template_nome', v_tpl_nome,
    'template_versao', v_tpl_versao
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

SELECT 'Migration 20261223 Micro-Gate P0.3 Unique CNPJ Active only aplicada com sucesso' AS status;
