-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261220 (MICRO-GATE 05.4 - NOVO MODELO ATÔMICO)
-- CRIAÇÃO SEGURA E ATÔMICA DE MODELOS DE CONTRATO (RPC SERVER-SIDE)
-- ======================================================================

-- 1. CRIAR RPC OFICIAL: fn_criar_modelo_contrato_template
CREATE OR REPLACE FUNCTION public.fn_criar_modelo_contrato_template(
  p_tipo_contrato TEXT,
  p_codigo_template TEXT,
  p_nome TEXT,
  p_conteudo_html TEXT,
  p_descricao TEXT DEFAULT NULL,
  p_empresa_operadora_id UUID DEFAULT NULL,
  p_is_default BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_is_owner BOOLEAN;
  v_is_admin BOOLEAN;
  v_user_tenant UUID;
  v_target_tenant UUID;
  v_tipo TEXT;
  v_codigo TEXT;
  v_nome TEXT;
  v_descricao TEXT;
  v_novo_id UUID;
  v_lock_key BIGINT;
BEGIN
  -- 1. Autenticação Obrigatória
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão inválida.');
  END IF;

  -- 2. Identificação de Papel e Tenant do Usuário
  SELECT COALESCE(u.is_owner, false), u.empresa_operadora_id,
         (UPPER(COALESCE(p.nome, '')) = 'ADMIN')
  INTO v_is_owner, v_user_tenant, v_is_admin
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON p.id = u.perfil_id
  WHERE u.id = v_user_id LIMIT 1;

  IF v_user_tenant IS NULL THEN
    v_user_tenant := public.get_user_tenant_id();
  END IF;

  -- 3. Autorização RBAC Server-side (Somente OWNER, ADMIN ou permissão contracts.manage)
  IF NOT COALESCE(v_is_owner, false) AND NOT COALESCE(v_is_admin, false) THEN
    IF NOT public.has_admin_permission('contracts.manage') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: Requer perfil OWNER, ADMIN ou permissão contracts.manage.');
    END IF;
  END IF;

  -- 4. Isolamento Multi-Tenant Estrito
  IF COALESCE(v_is_owner, false) THEN
    -- OWNER possui autoridade para criar modelos globais (empresa_operadora_id IS NULL) ou vinculados a uma operadora
    v_target_tenant := p_empresa_operadora_id;
  ELSE
    -- ADMIN ou gestor delegado:
    -- Não pode criar template global (exclusivo OWNER)
    IF p_empresa_operadora_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: Criação de template global restrita ao perfil OWNER.');
    END IF;

    -- Não pode criar template para outro tenant
    IF v_user_tenant IS NULL OR p_empresa_operadora_id <> v_user_tenant THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: Administrador não pode criar modelo para outro tenant.');
    END IF;

    v_target_tenant := v_user_tenant;
  END IF;

  -- Se tenant foi especificado, validar existência no cadastro de operadoras
  IF v_target_tenant IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.empresa_operadora WHERE id = v_target_tenant) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Empresa operadora informada não existe.');
    END IF;
  END IF;

  -- 5. Normalização e Validação dos Dados
  v_tipo := UPPER(TRIM(COALESCE(p_tipo_contrato, '')));
  IF v_tipo NOT IN ('ANUNCIANTE', 'PARCEIRO', 'GESTOR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo de contrato inválido. Valores aceitos: ANUNCIANTE, PARCEIRO, GESTOR.');
  END IF;

  v_codigo := UPPER(TRIM(COALESCE(p_codigo_template, '')));
  IF v_codigo IS NULL OR v_codigo = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Código do template é obrigatório.');
  END IF;

  v_nome := TRIM(COALESCE(p_nome, ''));
  IF v_nome IS NULL OR v_nome = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome do template é obrigatório.');
  END IF;

  IF p_conteudo_html IS NULL OR TRIM(p_conteudo_html) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conteúdo HTML do template é obrigatório.');
  END IF;

  v_descricao := NULLIF(TRIM(COALESCE(p_descricao, '')), '');

  -- 6. Lock Concorrente por Escopo e Código (evita duplicidade simultânea)
  v_lock_key := hashtext('tpl_create_lock_' || COALESCE(v_target_tenant::text, 'global') || '_' || v_codigo);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 7. Validação de Unicidade de Versão 1 no Escopo
  IF EXISTS (
    SELECT 1 FROM public.contrato_templates
    WHERE codigo_template = v_codigo
      AND ((v_target_tenant IS NULL AND empresa_operadora_id IS NULL) OR (empresa_operadora_id = v_target_tenant))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Já existe um modelo com o código "' || v_codigo || '" neste escopo. Para atualizar, crie uma nova versão.');
  END IF;

  -- 8. Tratamento Atômico de is_default (se marcado como default)
  IF COALESCE(p_is_default, false) THEN
    -- Lock no escopo de default para sincronizar com fn_definir_contrato_template_padrao
    PERFORM pg_advisory_xact_lock(hashtext('tpl_default_lock_' || COALESCE(v_target_tenant::text, 'global') || '_' || v_tipo));

    IF v_target_tenant IS NULL THEN
      UPDATE public.contrato_templates
      SET is_default = false
      WHERE empresa_operadora_id IS NULL
        AND tipo_contrato = v_tipo
        AND is_default = true;
    ELSE
      UPDATE public.contrato_templates
      SET is_default = false
      WHERE empresa_operadora_id = v_target_tenant
        AND tipo_contrato = v_tipo
        AND is_default = true;
    END IF;
  END IF;

  -- 9. Inserção Segura do Novo Modelo (Versão sempre = 1)
  INSERT INTO public.contrato_templates (
    empresa_operadora_id,
    tipo_contrato,
    codigo_template,
    nome,
    descricao,
    versao,
    conteudo_html,
    ativo,
    is_default
  ) VALUES (
    v_target_tenant,
    v_tipo,
    v_codigo,
    v_nome,
    v_descricao,
    1,
    p_conteudo_html,
    TRUE,
    COALESCE(p_is_default, false)
  ) RETURNING id INTO v_novo_id;

  -- 10. Retorno Estruturado Seguro
  RETURN jsonb_build_object(
    'success', true,
    'template_id', v_novo_id,
    'id', v_novo_id,
    'codigo_template', v_codigo,
    'nome', v_nome,
    'tipo_contrato', v_tipo,
    'versao', 1,
    'empresa_operadora_id', v_target_tenant,
    'is_default', COALESCE(p_is_default, false)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 2. SEGURANÇA: SEARCH PATH, PRIVILÉGIOS E PERMISSÕES DE EXECUTE
REVOKE ALL ON FUNCTION public.fn_criar_modelo_contrato_template(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_criar_modelo_contrato_template(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_criar_modelo_contrato_template(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_criar_modelo_contrato_template(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) TO service_role;
