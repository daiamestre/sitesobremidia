-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261214 (GATE 5.1 & MICRO-GATE 5.1.4)
-- ÁREA ADMINISTRATIVA DE GESTÃO DE CONTRATO TEMPLATES & DEFAULTS
-- ======================================================================

-- 1. ADICIONAR COLUNA IS_DEFAULT EM CONTRATO_TEMPLATES (IDEMPOTENTE)
ALTER TABLE public.contrato_templates 
ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- 2. REMOVER ÍNDICE LEGADO QUE IMPEDIA MULTIVERSIONAMENTO (VERSAO 1, 2, 3...)
DROP INDEX IF EXISTS uq_contrato_templates_codigo;

-- 3. MARCAR TEMPLATES INICIAIS COMO DEFAULTS SE NÃO HOUVER NENHUM DEFAULT
UPDATE public.contrato_templates 
SET is_default = true 
WHERE codigo_template IN ('TPL-ANUNCIANTE-OFICIAL', 'TPL-PARCEIRO-OFICIAL', 'TPL-GESTOR-OFICIAL')
  AND is_default = false;

-- 4. ÍNDICES ÚNICOS PARCIAIS DE DEFAULT (IDEMPOTENTES)
DROP INDEX IF EXISTS idx_contrato_templates_default_global;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contrato_templates_default_global
ON public.contrato_templates (tipo_contrato)
WHERE (empresa_operadora_id IS NULL AND is_default = true AND ativo = true);

DROP INDEX IF EXISTS idx_contrato_templates_default_tenant;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contrato_templates_default_tenant
ON public.contrato_templates (empresa_operadora_id, tipo_contrato)
WHERE (empresa_operadora_id IS NOT NULL AND is_default = true AND ativo = true);

-- 5. ÍNDICES ÚNICOS PARCIAIS DE VERSÃO (PROTEÇÃO N+1 CONTRA RACE CONDITION - IDEMPOTENTES)
DROP INDEX IF EXISTS idx_contrato_templates_version_global;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contrato_templates_version_global
ON public.contrato_templates (codigo_template, versao)
WHERE (empresa_operadora_id IS NULL);

DROP INDEX IF EXISTS idx_contrato_templates_version_tenant;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contrato_templates_version_tenant
ON public.contrato_templates (empresa_operadora_id, codigo_template, versao)
WHERE (empresa_operadora_id IS NOT NULL);

-- 6. TRIGGER SERVER-SIDE DE PROTEÇÃO INTEGRAL DE IMUTABILIDADE HISTÓRICA
CREATE OR REPLACE FUNCTION public.fn_trg_proteger_contrato_template_aplicado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Proteção de todos os 7 campos que definem o conteúdo e identidade do contrato
  IF (
    OLD.conteudo_html IS DISTINCT FROM NEW.conteudo_html OR
    OLD.nome IS DISTINCT FROM NEW.nome OR
    OLD.codigo_template IS DISTINCT FROM NEW.codigo_template OR
    OLD.versao IS DISTINCT FROM NEW.versao OR
    OLD.tipo_contrato IS DISTINCT FROM NEW.tipo_contrato OR
    OLD.empresa_operadora_id IS DISTINCT FROM NEW.empresa_operadora_id OR
    OLD.pdf_anexo_key IS DISTINCT FROM NEW.pdf_anexo_key
  ) THEN
    IF EXISTS (SELECT 1 FROM public.contratos WHERE template_id = OLD.id) THEN
      RAISE EXCEPTION 'Imutabilidade Histórica: O modelo de contrato "%" (v%) já possui contratos celebrados e seus dados históricos não podem ser alterados diretamente. Crie uma nova versão.', OLD.nome, OLD.versao USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_contrato_template_aplicado ON public.contrato_templates;
CREATE TRIGGER trg_proteger_contrato_template_aplicado
BEFORE UPDATE ON public.contrato_templates
FOR EACH ROW
EXECUTE FUNCTION public.fn_trg_proteger_contrato_template_aplicado();

-- 7. RPC AUXILIAR DE RESOLUÇÃO DO TEMPLATE PADRÃO (PREVISÍVEL E ESTRITO)
CREATE OR REPLACE FUNCTION public.fn_obter_template_padrao(
  p_empresa_operadora_id UUID,
  p_tipo_contrato TEXT
)
RETURNS TABLE (
  id UUID,
  codigo_template VARCHAR,
  nome VARCHAR,
  versao INT,
  conteudo_html TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1º Busca default do tenant específico
  RETURN QUERY
  SELECT t.id, t.codigo_template, t.nome, t.versao, t.conteudo_html
  FROM public.contrato_templates t
  WHERE t.tipo_contrato = p_tipo_contrato
    AND t.ativo = true
    AND t.is_default = true
    AND t.empresa_operadora_id = p_empresa_operadora_id
  ORDER BY t.versao DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- 2º Busca default global (empresa_operadora_id IS NULL)
  RETURN QUERY
  SELECT t.id, t.codigo_template, t.nome, t.versao, t.conteudo_html
  FROM public.contrato_templates t
  WHERE t.tipo_contrato = p_tipo_contrato
    AND t.ativo = true
    AND t.is_default = true
    AND t.empresa_operadora_id IS NULL
  ORDER BY t.versao DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- Sem default configurado: Não seleciona template aleatório
  RETURN;
END;
$$;

-- 8. RPC ATÔMICA PARA DEFINIR TEMPLATE PADRÃO COM RBAC E LOCK CONCORRENTE
CREATE OR REPLACE FUNCTION public.fn_definir_contrato_template_padrao(
  p_template_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_tenant UUID;
  v_is_owner BOOLEAN;
  v_is_admin BOOLEAN;
  v_tpl RECORD;
  v_lock_key BIGINT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão inválida.');
  END IF;

  SELECT u.is_owner, u.empresa_operadora_id,
         (UPPER(COALESCE(p.nome, '')) = 'ADMIN')
  INTO v_is_owner, v_user_tenant, v_is_admin
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON p.id = u.perfil_id
  WHERE u.id = v_user_id LIMIT 1;

  -- Validação Server-side de Autorização (Somente OWNER ou ADMIN)
  IF NOT COALESCE(v_is_owner, false) AND NOT COALESCE(v_is_admin, false) THEN
    IF NOT public.has_admin_permission('contracts.manage') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: Requer perfil OWNER, ADMIN ou permissão contracts.manage.');
    END IF;
  END IF;

  SELECT * INTO v_tpl FROM public.contrato_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template de contrato não encontrado.');
  END IF;

  IF NOT v_tpl.ativo THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não é possível definir um modelo inativo como padrão.');
  END IF;

  IF v_tpl.empresa_operadora_id IS NOT NULL AND v_tpl.empresa_operadora_id <> v_user_tenant AND NOT COALESCE(v_is_owner, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: o template pertence a outro tenant.');
  END IF;

  -- Lock atômico por tipo e escopo para evitar corrida de 2 defaults simultâneos
  v_lock_key := hashtext('tpl_default_lock_' || COALESCE(v_tpl.empresa_operadora_id::text, 'global') || '_' || v_tpl.tipo_contrato);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Remove o default anterior do mesmo escopo
  IF v_tpl.empresa_operadora_id IS NULL THEN
    UPDATE public.contrato_templates
    SET is_default = false
    WHERE empresa_operadora_id IS NULL AND tipo_contrato = v_tpl.tipo_contrato AND is_default = true;
  ELSE
    UPDATE public.contrato_templates
    SET is_default = false
    WHERE empresa_operadora_id = v_tpl.empresa_operadora_id AND tipo_contrato = v_tpl.tipo_contrato AND is_default = true;
  END IF;

  -- Define o novo default
  UPDATE public.contrato_templates
  SET is_default = true, updated_at = NOW()
  WHERE id = p_template_id;

  RETURN jsonb_build_object(
    'success', true, 
    'template_id', p_template_id, 
    'tipo_contrato', v_tpl.tipo_contrato,
    'codigo_template', v_tpl.codigo_template,
    'versao', v_tpl.versao
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 9. RPC ATÔMICA PARA CRIAR NOVA VERSÃO N+1 DE FORMA CONCORRENTE E SEGURA
CREATE OR REPLACE FUNCTION public.fn_criar_nova_versao_contrato_template(
  p_template_id UUID,
  p_novo_conteudo_html TEXT,
  p_novo_nome TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_tenant UUID;
  v_is_owner BOOLEAN;
  v_is_admin BOOLEAN;
  v_tpl RECORD;
  v_possui_contratos BOOLEAN;
  v_nova_versao INT;
  v_novo_id UUID;
  v_lock_key BIGINT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão inválida.');
  END IF;

  SELECT u.is_owner, u.empresa_operadora_id,
         (UPPER(COALESCE(p.nome, '')) = 'ADMIN')
  INTO v_is_owner, v_user_tenant, v_is_admin
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON p.id = u.perfil_id
  WHERE u.id = v_user_id LIMIT 1;

  IF NOT COALESCE(v_is_owner, false) AND NOT COALESCE(v_is_admin, false) THEN
    IF NOT public.has_admin_permission('contracts.manage') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: Requer perfil OWNER, ADMIN ou permissão contracts.manage.');
    END IF;
  END IF;

  SELECT * INTO v_tpl FROM public.contrato_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template de contrato não encontrado.');
  END IF;

  IF v_tpl.empresa_operadora_id IS NOT NULL AND v_tpl.empresa_operadora_id <> v_user_tenant AND NOT COALESCE(v_is_owner, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: template pertence a outro tenant.');
  END IF;

  -- Lock atômico por codigo_template para evitar race-condition no N+1
  v_lock_key := hashtext('tpl_version_lock_' || COALESCE(v_tpl.empresa_operadora_id::text, 'global') || '_' || v_tpl.codigo_template);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT EXISTS (SELECT 1 FROM public.contratos WHERE template_id = p_template_id) INTO v_possui_contratos;

  IF NOT v_possui_contratos THEN
    -- Edição em rascunho sem contratos vinculados
    UPDATE public.contrato_templates
    SET nome = COALESCE(NULLIF(trim(p_novo_nome), ''), v_tpl.nome),
        conteudo_html = p_novo_conteudo_html,
        updated_at = NOW()
    WHERE id = p_template_id;

    RETURN jsonb_build_object('success', true, 'template_id', p_template_id, 'versao', v_tpl.versao, 'is_new_version', false);
  ELSE
    -- Versão aplicada -> Cria a Versão N+1 atômica
    SELECT COALESCE(MAX(versao), 1) + 1 INTO v_nova_versao
    FROM public.contrato_templates
    WHERE codigo_template = v_tpl.codigo_template
      AND ((v_tpl.empresa_operadora_id IS NULL AND empresa_operadora_id IS NULL) OR (empresa_operadora_id = v_tpl.empresa_operadora_id));

    -- Desmarca o default anterior ANTES de inserir o novo default para não violar o índice único parcial
    IF v_tpl.empresa_operadora_id IS NULL THEN
      UPDATE public.contrato_templates
      SET is_default = false
      WHERE empresa_operadora_id IS NULL AND tipo_contrato = v_tpl.tipo_contrato AND is_default = true;
    ELSE
      UPDATE public.contrato_templates
      SET is_default = false
      WHERE empresa_operadora_id = v_tpl.empresa_operadora_id AND tipo_contrato = v_tpl.tipo_contrato AND is_default = true;
    END IF;

    INSERT INTO public.contrato_templates (
      empresa_operadora_id, tipo_contrato, codigo_template, nome, descricao,
      versao, conteudo_html, ativo, is_default
    ) VALUES (
      v_tpl.empresa_operadora_id, v_tpl.tipo_contrato, v_tpl.codigo_template,
      COALESCE(NULLIF(trim(p_novo_nome), ''), v_tpl.nome), v_tpl.descricao,
      v_nova_versao, p_novo_conteudo_html, TRUE, TRUE
    ) RETURNING id INTO v_novo_id;

    RETURN jsonb_build_object('success', true, 'template_id', v_novo_id, 'versao', v_nova_versao, 'is_new_version', true);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 10. ATUALIZAÇÃO SEGURA DA RPC DE ANUNCIANTES (GATE 4) COM SELEÇÃO DO DEFAULT
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
    'numero_contrato', v_numero_contrato
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 11. ATUALIZAÇÃO SEGURA DA RPC DE PONTO PARCEIRO (GATE 4) COM SELEÇÃO DO DEFAULT
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
  v_tpl_id UUID;
  v_tpl_nome VARCHAR(255);
  v_tpl_versao INT;
BEGIN
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

  INSERT INTO public.pontos (
    empresa_operadora_id, nome, categoria, descricao, foto_url, galeria,
    cep, logradouro, numero, complemento, bairro, cidade, estado,
    quantidade_telas, disponibilidade, status_operacional, regras_comerciais, ativo, created_by
  ) VALUES (
    v_user_tenant, v_nome, p_dados->>'categoria', p_dados->>'descricao', p_dados->>'foto_capa_url',
    COALESCE(p_dados->'fotos_urls', '[]'::jsonb), p_dados->>'cep', p_dados->>'logradouro',
    p_dados->>'numero', p_dados->>'complemento', p_dados->>'bairro', p_dados->>'cidade', p_dados->>'estado',
    COALESCE((p_dados->>'quantidade_telas')::INT, 1), 'DISPONIVEL', 'ATIVO', p_dados->>'regras_comerciais', TRUE, v_user_id
  ) RETURNING id, codigo_publico INTO v_ponto_id, v_codigo_publico;

  -- Resolução do Template Padrão (Gate 5.1 / Micro-Gate 5.1.2)
  SELECT t.id, t.nome, t.versao INTO v_tpl_id, v_tpl_nome, v_tpl_versao
  FROM public.fn_obter_template_padrao(v_user_tenant, 'PARCEIRO') t;

  v_numero_contrato := public.fn_gerar_numero_contrato_atomo(v_user_tenant);

  INSERT INTO public.contratos (
    empresa_operadora_id, ponto_id,
    template_id, template_nome, template_versao, versao_atual,
    numero_contrato, tipo_contrato, valor_mensal, forma_pagamento,
    data_inicio, data_fim, status_documento, status_workflow
  ) VALUES (
    v_user_tenant, v_ponto_id,
    v_tpl_id, v_tpl_nome, COALESCE(v_tpl_versao, 1), COALESCE(v_tpl_versao, 1),
    v_numero_contrato, 'PARCEIRO', 0.00, 'PIX',
    CURRENT_DATE, (CURRENT_DATE + INTERVAL '1 year')::DATE,
    'RASCUNHO', 'AGUARDANDO_ASSINATURA'
  ) RETURNING id INTO v_contrato_id;

  IF v_contrato_id IS NULL THEN
    RAISE EXCEPTION 'Falha ao criar o contrato atômico do ponto parceiro.';
  END IF;

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
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 12. ATUALIZAÇÃO SEGURA DA RPC DE GESTOR DE MÍDIAS (GATE 4.1) COM SELEÇÃO DO DEFAULT
DROP FUNCTION IF EXISTS public.provisionar_usuario_corporativo(UUID, TEXT, TEXT, TEXT, UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION public.provisionar_usuario_corporativo(
  p_uid UUID,
  p_email TEXT,
  p_nome TEXT,
  p_telefone TEXT,
  p_perfil_id UUID,
  p_cliente_id UUID DEFAULT NULL,
  p_dados_extra JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_caller_tenant uuid;
    v_caller_owner boolean;
    v_caller_admin boolean;
    v_caller_perfil text;
    v_caller_cliente uuid;
    v_caller_rep uuid;
    v_perfil_nome text;
    v_perfil_ativo boolean;
    v_cliente_final uuid := NULL;
    v_contrato_id uuid := NULL;
    v_numero_contrato varchar(40) := NULL;
    v_tpl_id UUID;
    v_tpl_nome VARCHAR(255);
    v_tpl_versao INT;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Acesso Negado: sessão inválida.' USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('app.sobremidia.provisioning', 'on', true);

    SELECT u.empresa_operadora_id, COALESCE(u.is_owner, false),
           (UPPER(COALESCE(p.nome, '')) = 'ADMIN'),
           UPPER(COALESCE(p.nome, '')), u.cliente_id, r.id
      INTO v_caller_tenant, v_caller_owner, v_caller_admin, v_caller_perfil, v_caller_cliente, v_caller_rep
      FROM public.usuarios u
      LEFT JOIN public.perfis p ON p.id = u.perfil_id
      LEFT JOIN public.representantes r ON r.usuario_id = u.id
     WHERE u.id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Acesso Negado: usuário não registrado.' USING ERRCODE = '42501';
    END IF;

    SELECT p.nome, p.ativo INTO v_perfil_nome, v_perfil_ativo
      FROM public.perfis p WHERE p.id = p_perfil_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Perfil alvo inexistente.' USING ERRCODE = '22023'; END IF;
    IF NOT v_perfil_ativo THEN RAISE EXCEPTION 'Perfil alvo inativo.' USING ERRCODE = '22023'; END IF;
    IF v_perfil_nome = 'OWNER' THEN
        RAISE EXCEPTION 'Acesso Negado: não é possível criar contas OWNER.' USING ERRCODE = '42501';
    END IF;

    IF v_caller_owner OR v_caller_admin THEN
        IF NOT v_caller_owner THEN
            IF NOT public.has_admin_permission('users.create') THEN
                RAISE EXCEPTION 'Acesso Negado: permissão users.create não concedida.' USING ERRCODE = '42501';
            END IF;
            IF v_perfil_nome = 'ADMIN' AND NOT public.has_admin_permission('users.create_admin') THEN
                RAISE EXCEPTION 'Acesso Negado: criar ADMIN requer users.create_admin.' USING ERRCODE = '42501';
            END IF;
        END IF;
        IF p_cliente_id IS NOT NULL THEN
            SELECT c.id INTO v_cliente_final
              FROM public.clientes c
             WHERE c.id = p_cliente_id AND c.empresa_operadora_id = v_caller_tenant;
            IF v_cliente_final IS NULL THEN
                RAISE EXCEPTION 'Cliente informado não pertence à empresa operadora.' USING ERRCODE = '22023';
            END IF;
        END IF;

    ELSIF v_caller_perfil = 'REPRESENTANTE' THEN
        IF v_caller_rep IS NULL THEN
            RAISE EXCEPTION 'Acesso Negado: representante não registrado.' USING ERRCODE = '42501';
        END IF;

        IF v_perfil_nome IN ('CLIENTE','ANUNCIANTE') THEN
            SELECT c.id INTO v_cliente_final
              FROM public.clientes c
              JOIN public.representantes r ON r.id = c.representante_id
             WHERE c.id = p_cliente_id
               AND c.empresa_operadora_id = v_caller_tenant
               AND r.usuario_id = v_caller
               AND r.ativo;
            IF v_cliente_final IS NULL OR p_cliente_id IS NULL THEN
                RAISE EXCEPTION 'Acesso Negado: cliente inexistente ou fora da sua carteira.' USING ERRCODE = '42501';
            END IF;

        ELSIF v_perfil_nome = 'GESTOR' THEN
            IF p_cliente_id IS NOT NULL THEN
                RAISE EXCEPTION 'Acesso Negado: GESTOR de prospecção não pode nascer vinculado a cliente.' USING ERRCODE = '42501';
            END IF;
            v_cliente_final := NULL;

        ELSE
            RAISE EXCEPTION 'Acesso Negado: representante provisiona apenas CLIENTE/ANUNCIANTE da carteira ou GESTOR.' USING ERRCODE = '42501';
        END IF;

    ELSIF v_caller_perfil = 'ANUNCIANTE' THEN
        IF v_caller_cliente IS NULL THEN
            RAISE EXCEPTION 'Acesso Negado: anunciante sem vínculo comercial.' USING ERRCODE = '42501';
        END IF;
        IF v_perfil_nome NOT IN ('CLIENTE','ANUNCIANTE') THEN
            RAISE EXCEPTION 'Acesso Negado: equipe do anunciante aceita apenas perfis CLIENTE ou ANUNCIANTE.' USING ERRCODE = '42501';
        END IF;
        v_cliente_final := v_caller_cliente;

    ELSE
        RAISE EXCEPTION 'Acesso Negado: provisionamento restrito a OWNER, ADMIN, REPRESENTANTE ou ANUNCIANTE.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.usuarios
        (id, empresa_operadora_id, perfil_id, nome, email, telefone, ativo, status,
         status_ciclo_vida, cliente_id, created_by, approved_by, must_change_password, version)
    VALUES
        (p_uid, v_caller_tenant, p_perfil_id, p_nome, p_email, p_telefone,
         true, 'ACTIVE', 'APPROVED', v_cliente_final, v_caller, v_caller, TRUE, 1);

    INSERT INTO public.solicitacoes_acesso
        (id, empresa_operadora_id, auth_user_id, usuario_id, tipo_acesso,
         nome_usuario, email_usuario, telefone, dados_cadastro,
         status, approved_by, approved_at, origem, perfil_solicitado_id, criado_por)
    VALUES
        (gen_random_uuid(), v_caller_tenant, p_uid, p_uid,
         CASE v_perfil_nome
           WHEN 'REPRESENTANTE' THEN 'REPRESENTANTE'
           WHEN 'GESTOR'        THEN 'GESTOR_TELAS'
           WHEN 'ANUNCIANTE'    THEN 'ANUNCIANTE'
           WHEN 'PARCEIRO'      THEN 'PARCEIRO'
           ELSE 'FUNCIONARIO'
         END,
         p_nome, p_email, p_telefone,
         jsonb_build_object(
             'criado_via',
             CASE v_caller_perfil WHEN 'REPRESENTANTE' THEN 'FECHAMENTO_COMERCIAL' ELSE 'PROVISIONAMENTO_DIRETO' END,
             'perfil_nome', v_perfil_nome,
             'cliente_id', v_cliente_final
         )
         || COALESCE(p_dados_extra, '{}'::jsonb),
         'APPROVED', v_caller, NOW(), 'CRIACAO_CORPORATIVA_PROVISIONADA', p_perfil_id, v_caller);

    IF v_perfil_nome = 'GESTOR' THEN
        -- Resolução do Template Padrão (Gate 5.1 / Micro-Gate 5.1.2)
        SELECT t.id, t.nome, t.versao INTO v_tpl_id, v_tpl_nome, v_tpl_versao
        FROM public.fn_obter_template_padrao(v_caller_tenant, 'GESTOR') t;

        v_numero_contrato := public.fn_gerar_numero_contrato_atomo(v_caller_tenant);

        INSERT INTO public.contratos (
            empresa_operadora_id, gestor_usuario_id,
            template_id, template_nome, template_versao, versao_atual,
            numero_contrato, tipo_contrato, valor_mensal, forma_pagamento,
            data_inicio, data_fim, status_documento, status_workflow
        ) VALUES (
            v_caller_tenant, p_uid,
            v_tpl_id, v_tpl_nome, COALESCE(v_tpl_versao, 1), COALESCE(v_tpl_versao, 1),
            v_numero_contrato, 'GESTOR', 0.00, 'PIX',
            CURRENT_DATE, (CURRENT_DATE + INTERVAL '1 year')::DATE,
            'RASCUNHO', 'AGUARDANDO_ASSINATURA'
        ) RETURNING id INTO v_contrato_id;

        IF v_contrato_id IS NULL THEN
            RAISE EXCEPTION 'Falha ao criar o contrato atômico do gestor de mídias.' USING ERRCODE = '22023';
        END IF;
    END IF;

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_caller_tenant, v_caller, 'USUARIO', p_uid, 'USER_PROVISIONED', 'ACTIVE',
         'Usuário provisionado com acesso imediato e contrato (Perfil: '
         || v_perfil_nome || ', Contrato ID: ' || COALESCE(v_contrato_id::text, 'N/A') || ')');

    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato, titulo, mensagem,
         prioridade, severidade, status_envio, lida, status_notificacao)
    VALUES
        (v_caller_tenant, p_uid, 'USER_PROVISIONED', 'IN_APP', p_uid,
         'Bem-vindo(a) à SOBRE MÍDIA',
         'Seu acesso foi criado. Utilize a senha inicial fornecida pelo administrador/comercial e defina uma nova senha no primeiro login.',
         'SUCESSO', 'INFO', 'SENT', false, 'NAO_LIDA');

    RETURN p_uid;
END;
$$;
