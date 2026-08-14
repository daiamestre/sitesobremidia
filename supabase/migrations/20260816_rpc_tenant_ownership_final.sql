-- ======================================================================
-- SOBRE MIDIA - MIGRATION 20260816: RPC FINAL COM POSSE DE TENANT UNIVERSAL
-- ======================================================================
-- Objetivo: fechar a lacuna deixada pela 20260815 (em producao): um OWNER
-- autenticado consegue invocar fn_cadastrar_cliente_atomo com o UUID de
-- QUALQUER empresa operadora (a 20260815 so valida tenant para nao-owners).
-- Esta versao consolida:
--   1. Tudo que a 20260815 ja garante (auth obrigatoria, OWNER->rep NULL,
--      nao-owner->rep proprio + tenant proprio, lock anti-concorrencia,
--      dados comerciais do wizard, REVOKE anon/PUBLIC).
--   2. Guarda UNIVERSAL de posse de tenant (era a 20260814b): qualquer
--      usuario autenticado (inclusive OWNER) so pode cadastrar cliente na
--      empresa operadora a qual pertence (usuarios.empresa_operadora_id).
--      service_role permanece com bypass administrativo.
-- Idempotente: CREATE OR REPLACE + REVOKE/GRANT podem ser executados
-- multiplas vezes. Nao precisa rodar a 20260814b (ela esta embutida aqui).
-- INSTRUCOES: Cole TODO este bloco no SQL Editor do Supabase Dashboard
-- (projeto bhwsybgsyvvhqtkdqozb) e execute. Depois avise para o re-teste.
-- ======================================================================

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
  -- 1. Autorizacao: usuario autenticado obrigatorio
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso nao autenticado. Faca login para cadastrar clientes.');
  END IF;

  SELECT u.is_owner, r.id, r.empresa_operadora_id
  INTO v_is_owner, v_own_rep_id, v_user_tenant
  FROM public.usuarios u
  LEFT JOIN public.representantes r ON r.usuario_id = u.id
  WHERE u.id = v_user_id
  LIMIT 1;

  IF v_is_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil de usuario nao localizado.');
  END IF;

  -- 2. GUARDA UNIVERSAL DE POSSE DE TENANT (20260816):
  --    qualquer usuario autenticado so pode criar cliente na propria
  --    empresa operadora; service_role mantem bypass administrativo.
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
        'error', 'Acesso negado: usuario autenticado nao pertence a empresa operadora informada.'
      );
    END IF;
  END IF;

  -- 3. Regra de vinculacao de representante_id (seguranca dentro da RPC):
  --    OWNER: obrigatoriamente NULL (autonomia administrativa)
  --    Demais perfis: obrigatoriamente o representante do usuario autenticado,
  --    restrito ao proprio tenant.
  IF v_is_owner THEN
    IF p_representante_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'OWNER deve cadastrar clientes sem representante (representante_id NULL).');
    END IF;
  ELSE
    IF p_representante_id IS NULL OR p_representante_id <> v_own_rep_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Representante invalido: o cliente deve ser vinculado ao representante autenticado.');
    END IF;
    IF p_empresa_operadora_id <> v_user_tenant THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tenant incompativel com o representante autenticado.');
    END IF;
  END IF;

  -- 4. Lock anti-concorrencia exclusivo do tenant (codigo_cliente atomico)
  v_lock_key := hashtext('cliente_code_' || p_empresa_operadora_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 5. Proximo codigo_cliente sob o lock do tenant
  SELECT COALESCE(MAX(codigo_cliente), 0) + 1
  INTO v_next_code
  FROM public.clientes
  WHERE empresa_operadora_id = p_empresa_operadora_id;

  -- 6. Registro mestre em public.clientes
  INSERT INTO public.clientes (
    empresa_operadora_id, representante_id, codigo_cliente, status
  ) VALUES (
    p_empresa_operadora_id, p_representante_id, v_next_code, COALESCE(p_status, 'PROSPECT')
  ) RETURNING id INTO v_cliente_id;

  -- 7. Dados cadastrais em public.empresas
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

  -- 8. Contato principal em public.contatos (quando informado)
  IF p_contato_nome IS NOT NULL AND p_contato_nome <> '' THEN
    INSERT INTO public.contatos (
      empresa_id, nome, cargo, email, telefone, is_principal
    ) VALUES (
      v_empresa_id,
      p_contato_nome,
      COALESCE(NULLIF(p_contato_cargo, ''), 'Responsavel'),
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
    'codigo_cliente', v_next_code
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- ======================================================================
-- SEGURANCA: RPC EXECUTAVEL SOMENTE POR AUTHENTICATED/SERVICE_ROLE
-- ======================================================================
REVOKE EXECUTE ON FUNCTION public.fn_cadastrar_cliente_atomo(
  uuid, uuid, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, text, character varying,
  character varying, character varying, character varying
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.fn_cadastrar_cliente_atomo(
  uuid, uuid, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, text, character varying,
  character varying, character varying, character varying
) FROM anon;

GRANT EXECUTE ON FUNCTION public.fn_cadastrar_cliente_atomo(
  uuid, uuid, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, text, character varying,
  character varying, character varying, character varying
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_cadastrar_cliente_atomo(
  uuid, uuid, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, character varying, character varying,
  character varying, character varying, text, character varying,
  character varying, character varying, character varying
) TO service_role;