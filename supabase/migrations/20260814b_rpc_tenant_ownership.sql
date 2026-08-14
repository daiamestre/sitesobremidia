-- ======================================================================
-- SOBRE MIDIA - MIGRATION 20260814B: RPC COM POSSE DE TENANT OBRIGATORIA
-- ======================================================================
-- Objetivo: fn_cadastrar_cliente_atomo (SECURITY DEFINER) aceitava qualquer
-- p_empresa_operadora_id de qualquer usuario autenticado. Teste real
-- confirmou: usuario autenticado de um tenant consegue invocar a RPC com
-- UUID de outra empresa operadora (se o UUID for valido, o INSERT passa).
-- Esta migration adiciona checagem de posse do tenant antes de inserir:
--   - service_role: bypass (uso administrativo legítimo)
--   - demais roles: auth.uid() deve pertencer (usuarios.empresa_operadora_id
--     = p_empresa_operadora_id, ativo e nao deletado)
-- O restante do corpo e IDENTICO a 20260813c_final_owner_nullable.sql.
-- Idempotente: CREATE OR REPLACE pode ser executado multiplas vezes.
-- INSTRUCOES: Copie e cole TODO este bloco no SQL Editor do Supabase Dashboard.
-- ======================================================================

CREATE OR REPLACE FUNCTION public.fn_cadastrar_cliente_atomo(
  p_empresa_operadora_id UUID,
  p_representante_id UUID DEFAULT NULL,
  p_status VARCHAR(30) DEFAULT 'PROSPECT',
  p_razao_social VARCHAR(150),
  p_nome_fantasia VARCHAR(150),
  p_cnpj VARCHAR(18),
  p_segmento VARCHAR(80) DEFAULT '',
  p_telefone VARCHAR(20) DEFAULT '',
  p_whatsapp VARCHAR(20),
  p_email VARCHAR(255),
  p_cep VARCHAR(9) DEFAULT '',
  p_logradouro VARCHAR(150) DEFAULT '',
  p_numero VARCHAR(20) DEFAULT '',
  p_complemento VARCHAR(50) DEFAULT '',
  p_bairro VARCHAR(100) DEFAULT '',
  p_cidade VARCHAR(100),
  p_estado VARCHAR(2),
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
BEGIN
  -- POSSE DE TENANT: usuario autenticado so pode criar cliente na propria
  -- empresa operadora (service_role permanece com acesso total).
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.empresa_operadora_id = p_empresa_operadora_id
        AND u.ativo = true
        AND u.deleted_at IS NULL
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Acesso negado: usuario autenticado nao pertence a empresa operadora informada.'
      );
    END IF;
  END IF;

  v_lock_key := hashtext('cliente_code_' || p_empresa_operadora_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(codigo_cliente), 0) + 1
  INTO v_next_code
  FROM public.clientes
  WHERE empresa_operadora_id = p_empresa_operadora_id;

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
    v_cliente_id, COALESCE(p_razao_social, p_nome_fantasia),
    p_nome_fantasia, p_cnpj, p_segmento,
    p_telefone, p_whatsapp, p_email, p_cep, p_logradouro, p_numero, p_complemento,
    p_bairro, p_cidade, p_estado, p_representante_legal, p_cargo_representante, p_observacoes
  ) RETURNING id INTO v_empresa_id;

  IF p_contato_nome IS NOT NULL AND p_contato_nome <> '' THEN
    INSERT INTO public.contatos (
      empresa_id, nome, cargo, email, telefone, is_principal
    ) VALUES (
      v_empresa_id, p_contato_nome,
      COALESCE(p_contato_cargo, 'Responsavel'),
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
