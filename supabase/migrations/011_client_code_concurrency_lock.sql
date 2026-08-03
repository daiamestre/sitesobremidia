-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 011: ADVISORY LOCKS & SEGURANÇA DE CONCORRÊNCIA EM CODIGO_CLIENTE
-- ======================================================================

-- Atualiza a função atômica com pg_advisory_xact_lock por tenant e search_path seguro
CREATE OR REPLACE FUNCTION public.fn_cadastrar_cliente_atomo(
  p_empresa_operadora_id UUID,
  p_representante_id UUID,
  p_status VARCHAR(30),
  p_razao_social VARCHAR(150),
  p_nome_fantasia VARCHAR(150),
  p_cnpj VARCHAR(18),
  p_segmento VARCHAR(80),
  p_telefone VARCHAR(20),
  p_whatsapp VARCHAR(20),
  p_email VARCHAR(255),
  p_cep VARCHAR(9),
  p_logradouro VARCHAR(150),
  p_numero VARCHAR(20),
  p_complemento VARCHAR(50),
  p_bairro VARCHAR(100),
  p_cidade VARCHAR(100),
  p_estado VARCHAR(2),
  p_representante_legal VARCHAR(150),
  p_cargo_representante VARCHAR(80),
  p_observacoes TEXT,
  p_contato_nome VARCHAR(150),
  p_contato_cargo VARCHAR(80),
  p_contato_email VARCHAR(255),
  p_contato_telefone VARCHAR(20)
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
BEGIN
  -- 1. Garante trava de concorrência exclusiva do tenant (Transaction Advisory Lock)
  -- serializa apenas transações simultâneas do MESMO tenant sem bloquear outros tenants
  v_lock_key := hashtext('cliente_code_' || p_empresa_operadora_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 2. Seleção do código atômica sob o advisory lock do tenant
  SELECT COALESCE(MAX(codigo_cliente), 0) + 1 
  INTO v_next_code
  FROM public.clientes
  WHERE empresa_operadora_id = p_empresa_operadora_id;

  -- 3. Insere registro principal em public.clientes
  INSERT INTO public.clientes (
    empresa_operadora_id,
    representante_id,
    codigo_cliente,
    status
  ) VALUES (
    p_empresa_operadora_id,
    p_representante_id,
    v_next_code,
    COALESCE(p_status, 'PROSPECT')
  ) RETURNING id INTO v_cliente_id;

  -- 4. Insere dados em public.empresas
  INSERT INTO public.empresas (
    cliente_id,
    razao_social,
    nome_fantasia,
    cnpj,
    segmento,
    telefone,
    whatsapp,
    email,
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    cidade,
    estado,
    representante_legal,
    cargo_representante,
    observacoes
  ) VALUES (
    v_cliente_id,
    COALESCE(p_razao_social, p_nome_fantasia),
    p_nome_fantasia,
    p_cnpj,
    p_segmento,
    p_telefone,
    p_whatsapp,
    p_email,
    p_cep,
    p_logradouro,
    p_numero,
    p_complemento,
    p_bairro,
    p_cidade,
    p_estado,
    p_representante_legal,
    p_cargo_representante,
    p_observacoes
  ) RETURNING id INTO v_empresa_id;

  -- 5. Insere contato principal em public.contatos
  IF p_contato_nome IS NOT NULL AND p_contato_nome <> '' THEN
    INSERT INTO public.contatos (
      empresa_id,
      nome,
      cargo,
      email,
      telefone,
      is_principal
    ) VALUES (
      v_empresa_id,
      p_contato_nome,
      COALESCE(p_contato_cargo, 'Responsável'),
      COALESCE(p_contato_email, p_email),
      COALESCE(p_contato_telefone, p_whatsapp),
      TRUE
    ) RETURNING id INTO v_contato_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cliente_id', v_cliente_id,
    'empresa_id', v_empresa_id,
    'contato_id', v_contato_id,
    'codigo_cliente', v_next_code
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;
