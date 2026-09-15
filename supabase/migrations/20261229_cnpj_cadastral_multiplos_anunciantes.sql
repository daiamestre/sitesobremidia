-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261229
-- CORREÇÃO FORENSE DO CNPJ: TRATAMENTO COMO ATRIBUTO CADASTRAL
-- PERMITE MÚLTIPLOS ANUNCIANTES INDEPENDENTES COM O MESMO CNPJ
-- ======================================================================

-- 1. Remoção de qualquer índice de unicidade ou constraint de CNPJ em public.empresas
-- CNPJ não é identidade única do anunciante: múltiplos cadastros independentes são permitidos.
ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_cnpj_key;
DROP INDEX IF EXISTS public.idx_empresas_cnpj_unique_active;

-- 2. Garantir índice não-único para performance de consultas cadastrais
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON public.empresas (cnpj);

-- 3. Atualizar a RPC atômica fn_cadastrar_cliente_com_contrato
-- Cada chamada para novo anunciante CRIA SEMPRE uma nova entidade independente:
-- - Novo cliente_id (UUID próprio)
-- - Nova empresa_id vinculada ao novo cliente
-- - Novo contrato_id com número sequencial e template padrão
-- - NUNCA reaproveita, sequestra, atualiza ou mescla cadastro anterior por coincidência de CNPJ
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
  -- A. Autorização e validação de sessão
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

  -- B. Regra de vinculação de representante
  IF v_is_owner THEN
    IF p_representante_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'OWNER deve cadastrar clientes sem representante (representante_id NULL).');
    END IF;
  ELSE
    IF v_own_rep_id IS NOT NULL AND (p_representante_id IS NULL OR p_representante_id <> v_own_rep_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Representante inválido: o cliente deve ser vinculado ao representante autenticado.');
    END IF;
  END IF;

  -- C. Criação da nova entidade independente (clientes)
  v_lock_key := hashtext('cliente_code_' || p_empresa_operadora_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(codigo_cliente), 0) + 1 INTO v_next_code
  FROM public.clientes WHERE empresa_operadora_id = p_empresa_operadora_id;

  INSERT INTO public.clientes (
    empresa_operadora_id, representante_id, codigo_cliente, status, modalidade
  ) VALUES (
    p_empresa_operadora_id, p_representante_id, v_next_code, COALESCE(NULLIF(p_status, ''), 'PROSPECT'), 'ANUNCIANTE'
  ) RETURNING id INTO v_cliente_id;

  -- D. Criação da nova empresa independente (public.empresas)
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

  -- E. Contato principal da nova empresa
  IF p_contato_nome IS NOT NULL AND trim(p_contato_nome) <> '' THEN
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

  -- F. Resolução do Template Padrão e Criação do NOVO Contrato Atômico Independente
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
    'template_versao', v_tpl_versao,
    'empresa_reutilizada', false
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4. Atualizar a RPC fn_cadastrar_cliente_atomo
CREATE OR REPLACE FUNCTION public.fn_cadastrar_cliente_atomo(
  p_empresa_operadora_id UUID,
  p_representante_id UUID DEFAULT NULL,
  p_status VARCHAR(30) DEFAULT 'PROSPECT',
  p_razao_social VARCHAR(150) DEFAULT '',
  p_nome_fantasia VARCHAR(150) DEFAULT '',
  p_cnpj VARCHAR(18) DEFAULT '',
  p_segmento VARCHAR(80) DEFAULT '',
  p_telefone VARCHAR(20) DEFAULT '',
  p_whatsapp VARCHAR(20) DEFAULT '',
  p_email VARCHAR(255) DEFAULT '',
  p_cep VARCHAR(9) DEFAULT '',
  p_logradouro VARCHAR(150) DEFAULT '',
  p_numero VARCHAR(20) DEFAULT '',
  p_complemento VARCHAR(50) DEFAULT '',
  p_bairro VARCHAR(100) DEFAULT '',
  p_cidade VARCHAR(100) DEFAULT '',
  p_estado VARCHAR(2) DEFAULT '',
  p_representante_legal VARCHAR(150) DEFAULT '',
  p_cargo_representante VARCHAR(80) DEFAULT '',
  p_observacoes TEXT DEFAULT '',
  p_contato_nome VARCHAR(150) DEFAULT '',
  p_contato_cargo VARCHAR(80) DEFAULT '',
  p_contato_email VARCHAR(255) DEFAULT '',
  p_contato_telefone VARCHAR(20) DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock_key BIGINT;
  v_next_code INT;
  v_cliente_id UUID;
  v_empresa_id UUID;
  v_contato_id UUID;
  v_user_id UUID;
  v_is_owner BOOLEAN;
  v_own_rep_id UUID;
  v_user_tenant UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso não autenticado.');
  END IF;

  SELECT u.is_owner, r.id, r.empresa_operadora_id
  INTO v_is_owner, v_own_rep_id, v_user_tenant
  FROM public.usuarios u
  LEFT JOIN public.representantes r ON r.usuario_id = u.id
  WHERE u.id = v_user_id
  LIMIT 1;

  IF v_is_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil de usuário não localizado.');
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = v_user_id
        AND u.empresa_operadora_id = p_empresa_operadora_id
        AND u.ativo = true
        AND u.deleted_at IS NULL
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Acesso negado: usuário não pertence à empresa operadora informada.'
      );
    END IF;
  END IF;

  IF v_is_owner THEN
    IF p_representante_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'OWNER deve cadastrar clientes sem representante (representante_id NULL).');
    END IF;
  ELSE
    IF p_representante_id IS NULL OR p_representante_id <> v_own_rep_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Representante inválido: o cliente deve ser vinculado ao representante autenticado.');
    END IF;
    IF p_empresa_operadora_id <> v_user_tenant THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tenant incompatível com o representante autenticado.');
    END IF;
  END IF;

  -- Cada execução cria sempre uma entidade independente
  v_lock_key := hashtext('cliente_code_' || p_empresa_operadora_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(codigo_cliente), 0) + 1 INTO v_next_code
  FROM public.clientes WHERE empresa_operadora_id = p_empresa_operadora_id;

  INSERT INTO public.clientes (
    empresa_operadora_id, representante_id, codigo_cliente, status
  ) VALUES (
    p_empresa_operadora_id, p_representante_id, v_next_code, COALESCE(p_status, 'PROSPECT')
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

  RETURN jsonb_build_object(
    'success', true,
    'cliente_id', v_cliente_id,
    'empresa_id', v_empresa_id,
    'contato_id', v_contato_id,
    'codigo_cliente', v_next_code,
    'empresa_reutilizada', false
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. Função atômica com pg_advisory_xact_lock por tenant para geração de numero_contrato sequencial robusto
CREATE OR REPLACE FUNCTION public.fn_gerar_numero_contrato_atomo(
  p_empresa_operadora_id UUID
)
RETURNS VARCHAR(40)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock_key BIGINT;
  v_last_num BIGINT;
  v_next_num BIGINT;
  v_year VARCHAR(4);
  v_numero_contrato VARCHAR(40);
BEGIN
  v_lock_key := hashtext('contrato_code_' || p_empresa_operadora_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_year := TO_CHAR(NOW(), 'YYYY');

  SELECT COALESCE(MAX(
    CASE 
      WHEN numero_contrato ~ ('^CTR-' || v_year || '-\d+$')
      THEN CAST(SPLIT_PART(numero_contrato, '-', 3) AS BIGINT)
      ELSE 0 
    END
  ), 0)
  INTO v_last_num
  FROM public.contratos
  WHERE empresa_operadora_id = p_empresa_operadora_id;

  v_next_num := v_last_num + 1;
  IF v_next_num < 10000 THEN
    v_numero_contrato := 'CTR-' || v_year || '-' || LPAD(v_next_num::text, 4, '0');
  ELSE
    v_numero_contrato := 'CTR-' || v_year || '-' || v_next_num::text;
  END IF;

  RETURN v_numero_contrato;
END;
$$;

SELECT 'Migration 20261229 CNPJ Cadastral Multiplos Anunciantes aplicada com sucesso' AS status;
