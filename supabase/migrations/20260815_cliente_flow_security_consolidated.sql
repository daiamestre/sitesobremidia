-- ======================================================================
-- SOBRE MÍDIA - MIGRATION CONSOLIDADA 20260815: FLUXO DE CLIENTE SEGURO
-- ======================================================================
-- Objetivo: consolidar (em UMA migration idempotente) todas as correções
-- do módulo Novo Cliente que estavam dispersas ou não aplicadas em
-- produção:
--
--   1. fn_cadastrar_cliente_atomo: contrato oficial com DEFAULTS em todos
--      os parâmetros (espelho exato da função publicada em produção).
--   2. SEGURANÇA: restringe EXECUTE da RPC a authenticated/service_role,
--      removendo o privilégio de PUBLIC/anon (corrige exposição anônima
--      real observada em produção via chamada anon com tenant real).
--   3. get_user_role(): is_owner = true tem precedência e retorna 'OWNER',
--      alinhando as policies de empresas/contatos (baseadas nessa função)
--      com a regra de OWNER do AuthContext.
--   4. propostas: novas colunas comerciais (titulo_campanha, data_inicio,
--      data_fim, duracao_segundos) para que TODOS os dados coletados no
--      wizard comercial tenham destino real no schema (nenhum campo órfão).
--
-- Idempotente: pode ser executada quantas vezes for necessário.

-- ======================================================================
-- 1. FUNÇÃO ATÔMICA DE CADASTRO (contrato oficial com defaults)
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
  -- 1. Autorização: usuário autenticado obrigatório
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

  -- 2. Regra de vinculação de representante_id (segurança dentro da RPC):
  --    OWNER: obrigatoriamente NULL (autonomia administrativa)
  --    Demais perfis: obrigatoriamente o representante do usuário autenticado,
  --    restrito ao próprio tenant. Como a função é SECURITY DEFINER, o RLS
  --    não se aplica internamente; esta guarda é a barreira de autorização.
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

  -- 3. Lock anti-concorrência exclusivo do tenant (codigo_cliente atômico)
  v_lock_key := hashtext('cliente_code_' || p_empresa_operadora_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 4. Próximo codigo_cliente sob o lock do tenant
  SELECT COALESCE(MAX(codigo_cliente), 0) + 1
  INTO v_next_code
  FROM public.clientes
  WHERE empresa_operadora_id = p_empresa_operadora_id;

  -- 5. Registro mestre em public.clientes
  INSERT INTO public.clientes (
    empresa_operadora_id, representante_id, codigo_cliente, status
  ) VALUES (
    p_empresa_operadora_id, p_representante_id, v_next_code, COALESCE(p_status, 'PROSPECT')
  ) RETURNING id INTO v_cliente_id;

  -- 6. Dados cadastrais em public.empresas
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

  -- 7. Contato principal em public.contatos (quando informado)
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
-- 2. SEGURANÇA: RPC EXECUTÁVEL SOMENTE POR AUTHENTICATED/SERVICE_ROLE
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

-- ======================================================================
-- 3. get_user_role: OWNER soberano (is_owner) tem precedência
-- ======================================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    CASE
      WHEN u.is_owner = true THEN 'OWNER'
      ELSE UPPER(COALESCE(p.nome, 'REPRESENTANTE'))
    END
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON u.perfil_id = p.id
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

-- ======================================================================
-- 4. propostas: colunas comerciais para persistir TODOS os dados do wizard
-- ======================================================================
ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS titulo_campanha VARCHAR(150),
  ADD COLUMN IF NOT EXISTS data_inicio DATE,
  ADD COLUMN IF NOT EXISTS data_fim DATE,
  ADD COLUMN IF NOT EXISTS duracao_segundos INTEGER;

-- ======================================================================
-- 5. auditoria_logs: policies de INSERT/SELECT para usuários autenticados
--    (sem policies, o RLS bloqueava TUDO e os logs de auditoria do fluxo
--    de cliente eram perdidos silenciosamente — observado em teste E2E real)
-- ======================================================================
DROP POLICY IF EXISTS audit_insert_policy ON public.auditoria_logs;
CREATE POLICY audit_insert_policy ON public.auditoria_logs
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid());

DROP POLICY IF EXISTS audit_select_policy ON public.auditoria_logs;
CREATE POLICY audit_select_policy ON public.auditoria_logs
  FOR SELECT TO authenticated
  USING (
    usuario_id = auth.uid() OR
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      JOIN public.perfis p ON p.id = u.perfil_id
      WHERE u.id = auth.uid()
        AND ((p.nome)::text = ANY ((ARRAY['ADMIN'::character varying, 'GERENTE'::character varying])::text[])
             OR u.is_owner = true)
    )
  );
