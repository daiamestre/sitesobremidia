-- ============================================================
-- 20260824_central_acessos_delegacao.sql
-- CENTRAL CORPORATIVA DE ACESSOS — DELEGAÇÃO DE AUTONOMIA
-- Modelo: ROLE ADMIN + PERMISSÕES GRANULARES POR USUÁRIO
-- Permissões: users.view, users.create, users.edit, users.activate,
--             users.deactivate, users.create_admin, users.manage_permissions
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABELA DE PERMISSÕES DELEGADAS POR USUÁRIO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permissoes_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  permissao text NOT NULL,
  empresa_operadora_id uuid NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  concedida_por uuid REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, permissao)
);

COMMENT ON TABLE public.permissoes_usuarios IS
  'Permissões administrativas delegadas por usuário (Central Corporativa de Acessos). OWNER possui implicitamente todas.';

ALTER TABLE public.permissoes_usuarios ENABLE ROW LEVEL SECURITY;

-- SELECT: o próprio usuário vê as próprias permissões; OWNER/ADMIN veem as do tenant.
-- Sem policies de INSERT/UPDATE/DELETE: somente via RPC gerenciar_autonomia (SECURITY DEFINER).
CREATE POLICY permissoes_usuarios_select ON public.permissoes_usuarios
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_tenant_id()
    AND (usuario_id = auth.uid() OR public.is_owner_or_admin())
  );

-- ------------------------------------------------------------
-- 2. FUNÇÕES DE PERMISSÃO GRANULAR
-- ------------------------------------------------------------

-- REPs criados via wizard (Central) não coletam CPF/CNPJ: o placeholder '' não pode
-- ser único globalmente (violaria representantes_cpf_cnpj_key no 2º REP). A unicidade
-- passa a valer apenas para valores reais.
ALTER TABLE public.representantes DROP CONSTRAINT IF EXISTS representantes_cpf_cnpj_key;
CREATE UNIQUE INDEX IF NOT EXISTS representantes_cpf_cnpj_key ON public.representantes(cpf_cnpj)
  WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj <> '';

CREATE OR REPLACE FUNCTION public.get_my_admin_permissions()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN (SELECT COALESCE(is_owner, false) FROM public.usuarios WHERE id = auth.uid())
      THEN ARRAY['users.view','users.create','users.edit','users.activate',
                 'users.deactivate','users.create_admin','users.manage_permissions']::text[]
    ELSE COALESCE(
      (SELECT array_agg(p.permissao) FROM public.permissoes_usuarios p WHERE p.usuario_id = auth.uid()),
      ARRAY[]::text[])
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_admin_permission(p_permissao text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p_permissao = ANY (public.get_my_admin_permissions());
$$;

-- ------------------------------------------------------------
-- 3. RPC CRIAR_USUARIO_CORPORATIVO
-- Valida no servidor: sessão, tenant, OWNER ou ADMIN com users.create,
-- perfil alvo autorizado (ADMIN exige users.create_admin), e grava
-- usuário + representantes (se REPRESENTANTE) + auditoria + notificação.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_usuario_corporativo(
  p_uid uuid,
  p_email text,
  p_nome text,
  p_telefone text,
  p_perfil_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_tenant uuid;
  v_caller_owner boolean;
  v_caller_admin boolean;
  v_caller_email text;
  v_perfil_nome text;
  v_perfil_ativo boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Acesso Negado: sessão inválida.' USING ERRCODE = '42501';
  END IF;

  SELECT u.empresa_operadora_id, COALESCE(u.is_owner, false),
         (UPPER(COALESCE(p.nome, '')) = 'ADMIN'), u.email
    INTO v_caller_tenant, v_caller_owner, v_caller_admin, v_caller_email
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
   WHERE u.id = v_caller;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso Negado: usuário não registrado.' USING ERRCODE = '42501';
  END IF;

  -- Autorização: OWNER ou ADMIN com users.create
  IF NOT v_caller_owner THEN
    IF NOT v_caller_admin THEN
      RAISE EXCEPTION 'Acesso Negado: apenas OWNER ou ADMIN podem criar usuários.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_admin_permission('users.create') THEN
      RAISE EXCEPTION 'Acesso Negado: permissão users.create não concedida.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Perfil alvo
  SELECT p.nome, p.ativo INTO v_perfil_nome, v_perfil_ativo
    FROM public.perfis p WHERE p.id = p_perfil_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil alvo inexistente.' USING ERRCODE = '22023';
  END IF;
  IF NOT v_perfil_ativo THEN
    RAISE EXCEPTION 'Perfil alvo inativo.' USING ERRCODE = '22023';
  END IF;
  IF v_perfil_nome = 'OWNER' THEN
    RAISE EXCEPTION 'Acesso Negado: não é possível criar contas OWNER.' USING ERRCODE = '42501';
  END IF;

  -- Criar ADMIN exige users.create_admin (exceto OWNER)
  IF v_perfil_nome = 'ADMIN' AND NOT v_caller_owner THEN
    IF NOT public.has_admin_permission('users.create_admin') THEN
      RAISE EXCEPTION 'Acesso Negado: criar ADMIN requer users.create_admin.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Registro corporativo (tenant do chamador — isolamento por construção)
  INSERT INTO public.usuarios
    (id, empresa_operadora_id, perfil_id, nome, email, telefone, ativo, status, created_by, version)
  VALUES
    (p_uid, v_caller_tenant, p_perfil_id, p_nome, p_email, p_telefone, true, 'ACTIVE', v_caller, 1);

  -- Estrutura comercial real: REPRESENTANTE ganha registro em representantes
  IF v_perfil_nome = 'REPRESENTANTE' THEN
    INSERT INTO public.representantes (empresa_operadora_id, usuario_id, cpf_cnpj, ativo)
    VALUES (v_caller_tenant, p_uid, '', true);
  END IF;

  -- Auditoria (infraestrutura existente)
  INSERT INTO public.auditoria_logs
    (empresa_operadora_id, usuario_id, usuario_email, usuario_role, entidade_tipo, entidade_id,
     acao, status_novo, observacoes)
  VALUES
    (v_caller_tenant, v_caller, v_caller_email,
     CASE WHEN v_caller_owner THEN 'OWNER' ELSE 'ADMIN' END,
     'USUARIO', p_uid, 'USER_CREATED', 'CREATED',
     'Usuário criado via Central de Acessos. Perfil: ' || v_perfil_nome);

  -- Integração com Central de Comunicação (Mensagens)
  INSERT INTO public.notificacoes_central
    (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato, titulo, mensagem,
     prioridade, severidade, status_envio, lida, status_notificacao)
  VALUES
    (v_caller_tenant, p_uid, 'USUARIO_CREATED', 'IN_APP', p_uid,
     'Seu acesso corporativo foi criado',
     'Um convite foi enviado por e-mail. Complete seu primeiro acesso.',
     'SUCESSO', 'INFO', 'SENT', false, 'NAO_LIDA');

  RETURN p_uid;
END;
$$;

-- ------------------------------------------------------------
-- 4. RPC GERENCIAR_AUTONOMIA (conceder/revogar permissões de ADMIN)
-- Somente OWNER, ou ADMIN com users.manage_permissions.
-- Regra: permissões concedíveis ⊆ permissões do próprio administrador.
-- Proibido: alterar OWNER, alterar a si mesmo, outro tenant.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gerenciar_autonomia(
  p_alvo_id uuid,
  p_permissoes text[],
  p_conceder boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_tenant uuid;
  v_caller_owner boolean;
  v_caller_admin boolean;
  v_alvo_tenant uuid;
  v_alvo_owner boolean;
  v_alvo_perfil text;
  v_alvo_nome text;
  v_minhas text[];
  v_permissao text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Acesso Negado: sessão inválida.' USING ERRCODE = '42501';
  END IF;

  SELECT u.empresa_operadora_id, COALESCE(u.is_owner, false),
         (UPPER(COALESCE(p.nome, '')) = 'ADMIN')
    INTO v_caller_tenant, v_caller_owner, v_caller_admin
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
   WHERE u.id = v_caller;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso Negado: usuário não registrado.' USING ERRCODE = '42501';
  END IF;

  IF NOT v_caller_owner AND NOT (v_caller_admin AND public.has_admin_permission('users.manage_permissions')) THEN
    RAISE EXCEPTION 'Acesso Negado: sem permissão para gerenciar autonomia.' USING ERRCODE = '42501';
  END IF;

  -- Alvo: deve existir, mesmo tenant, perfil ADMIN, não OWNER, não o próprio
  SELECT u.empresa_operadora_id, COALESCE(u.is_owner, false),
         COALESCE(p.nome, ''), u.nome
    INTO v_alvo_tenant, v_alvo_owner, v_alvo_perfil, v_alvo_nome
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
   WHERE u.id = p_alvo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário alvo inexistente.' USING ERRCODE = '22023';
  END IF;
  IF v_alvo_tenant <> v_caller_tenant THEN
    RAISE EXCEPTION 'Acesso Negado: usuário de outro tenant.' USING ERRCODE = '42501';
  END IF;
  IF v_alvo_owner THEN
    RAISE EXCEPTION 'Acesso Negado: não é possível alterar permissões da conta OWNER.' USING ERRCODE = '42501';
  END IF;
  IF p_alvo_id = v_caller THEN
    RAISE EXCEPTION 'Acesso Negado: não é possível alterar a própria autoridade.' USING ERRCODE = '42501';
  END IF;
  IF UPPER(v_alvo_perfil) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Acesso Negado: autonomia administrativa é concedida apenas a perfis ADMIN.' USING ERRCODE = '42501';
  END IF;

  -- Princípio do menor privilégio: administrador só concede o que possui
  IF NOT v_caller_owner THEN
    v_minhas := public.get_my_admin_permissions();
    FOREACH v_permissao IN ARRAY p_permissoes LOOP
      IF NOT (v_permissao = ANY (v_minhas)) THEN
        RAISE EXCEPTION 'Acesso Negado: não é possível conceder permissão superior às suas (%).', v_permissao
          USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;

  IF p_conceder THEN
    FOREACH v_permissao IN ARRAY p_permissoes LOOP
      INSERT INTO public.permissoes_usuarios (usuario_id, permissao, empresa_operadora_id, concedida_por)
      VALUES (p_alvo_id, v_permissao, v_caller_tenant, v_caller)
      ON CONFLICT (usuario_id, permissao) DO NOTHING;
    END LOOP;
    INSERT INTO public.auditoria_logs
      (empresa_operadora_id, usuario_id, usuario_email, usuario_role, entidade_tipo, entidade_id,
       acao, status_novo, observacoes)
    VALUES
      (v_caller_tenant, v_caller,
       (SELECT email FROM public.usuarios WHERE id = v_caller),
       CASE WHEN v_caller_owner THEN 'OWNER' ELSE 'ADMIN' END,
       'USUARIO', p_alvo_id, 'AUTONOMY_GRANTED', 'DELEGATED',
       'Autonomia concedida a ' || v_alvo_nome || ': ' || array_to_string(p_permissoes, ', '));
    INSERT INTO public.notificacoes_central
      (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato, titulo, mensagem,
       prioridade, severidade, status_envio, lida, status_notificacao)
    VALUES
      (v_caller_tenant, p_alvo_id, 'AUTONOMIA_CONCEDIDA', 'IN_APP', p_alvo_id,
       'Autonomia administrativa concedida',
       'Você recebeu permissões administrativas: ' || array_to_string(p_permissoes, ', '),
       'SUCESSO', 'INFO', 'SENT', false, 'NAO_LIDA');
  ELSE
    FOREACH v_permissao IN ARRAY p_permissoes LOOP
      DELETE FROM public.permissoes_usuarios
       WHERE usuario_id = p_alvo_id AND permissao = v_permissao;
    END LOOP;
    INSERT INTO public.auditoria_logs
      (empresa_operadora_id, usuario_id, usuario_email, usuario_role, entidade_tipo, entidade_id,
       acao, status_novo, observacoes)
    VALUES
      (v_caller_tenant, v_caller,
       (SELECT email FROM public.usuarios WHERE id = v_caller),
       CASE WHEN v_caller_owner THEN 'OWNER' ELSE 'ADMIN' END,
       'USUARIO', p_alvo_id, 'AUTONOMY_REVOKED', 'REVOKED',
       'Autonomia revogada de ' || v_alvo_nome || ': ' || array_to_string(p_permissoes, ', '));
    INSERT INTO public.notificacoes_central
      (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato, titulo, mensagem,
       prioridade, severidade, status_envio, lida, status_notificacao)
    VALUES
      (v_caller_tenant, p_alvo_id, 'AUTONOMIA_REVOGADA', 'IN_APP', p_alvo_id,
       'Autonomia administrativa revogada',
       'Suas permissões administrativas foram revogadas: ' || array_to_string(p_permissoes, ', '),
       'IMPORTANTE', 'ALERTA', 'SENT', false, 'NAO_LIDA');
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 5. RPC LISTAR_USUARIOS_CENTRAL (lista real + último acesso + convite)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_usuarios_central()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_result jsonb;
BEGIN
  SELECT empresa_operadora_id INTO v_tenant FROM public.usuarios WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso Negado: usuário não registrado.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_owner_or_admin() AND NOT public.has_admin_permission('users.view') THEN
    RAISE EXCEPTION 'Acesso Negado: requer users.view.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(row_to_json(t) ORDER BY t.nome)
    INTO v_result
    FROM (
      SELECT u.id, u.nome, u.email, u.telefone, u.ativo, u.status,
             COALESCE(u.is_owner, false) AS is_owner, u.created_at, u.updated_at,
             COALESCE(p.nome, '') AS perfil_nome,
             COALESCE(o.name, '') AS organizacao_nome,
             au.last_sign_in_at AS ultimo_acesso,
             (au.confirmed_at IS NULL) AS convite_pendente
        FROM public.usuarios u
        LEFT JOIN public.perfis p ON p.id = u.perfil_id
        LEFT JOIN public.organizations o ON o.id = u.organization_id
        LEFT JOIN auth.users au ON au.id = u.id
       WHERE u.empresa_operadora_id = v_tenant
         AND u.deleted_at IS NULL
    ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------
-- 6. RPC GET_CENTRAL_ACESSOS_DASHBOARD (indicadores reais)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_central_acessos_dashboard()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_result jsonb;
BEGIN
  SELECT empresa_operadora_id INTO v_tenant FROM public.usuarios WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso Negado: usuário não registrado.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_owner_or_admin() AND NOT public.has_admin_permission('users.view') THEN
    RAISE EXCEPTION 'Acesso Negado: requer users.view.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM public.usuarios u WHERE u.empresa_operadora_id = v_tenant AND u.deleted_at IS NULL),
      'ativos', (SELECT count(*) FROM public.usuarios u WHERE u.empresa_operadora_id = v_tenant AND u.ativo AND u.deleted_at IS NULL),
      'inativos', (SELECT count(*) FROM public.usuarios u WHERE u.empresa_operadora_id = v_tenant AND NOT u.ativo AND u.deleted_at IS NULL),
      'pendentes', (SELECT count(*) FROM public.usuarios u WHERE u.empresa_operadora_id = v_tenant AND u.ativo AND (u.status IS NULL OR u.status NOT IN ('ACTIVE','ATIVO')) AND u.deleted_at IS NULL),
      'por_perfil', (
        SELECT COALESCE(jsonb_agg(x ORDER BY x->>'perfil'), '[]'::jsonb)
          FROM (
            SELECT jsonb_build_object(
                     'perfil', p.nome,
                     'total', count(u.id),
                     'ativos', count(u.id) FILTER (WHERE u.ativo)
                   ) AS x
              FROM public.perfis p
              LEFT JOIN public.usuarios u
                ON u.perfil_id = p.id AND u.empresa_operadora_id = v_tenant AND u.deleted_at IS NULL
             WHERE p.ativo
             GROUP BY p.nome
          ) s
      )
    ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- 7. TRIGGER DE ENFORCEMENT GRANULAR NO UPDATE DE USUÁRIOS
-- ADMIN só altera terceiros com a permissão específica.
-- (Complementa RLS: a autorização também existe na camada de dados.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_admin_permission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_caller_owner boolean;
  v_caller_admin boolean;
BEGIN
  -- Alteração da própria conta: regras já tratadas por prevent_self_escalation
  IF NEW.id = auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(u.is_owner, false),
         (UPPER(COALESCE(p.nome, '')) = 'ADMIN')
    INTO v_caller_owner, v_caller_admin
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
   WHERE u.id = auth.uid();

  IF v_caller_owner THEN
    RETURN NEW;
  END IF;

  IF NOT v_caller_admin THEN
    RAISE EXCEPTION 'Acesso Negado: sem autorização para alterar outro usuário.' USING ERRCODE = '42501';
  END IF;

  -- Alteração de status (ativo/status) exige permissão específica
  IF NEW.ativo IS DISTINCT FROM OLD.ativo OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.has_admin_permission(CASE WHEN COALESCE(NEW.ativo, true) THEN 'users.activate' ELSE 'users.deactivate' END) THEN
      RAISE EXCEPTION 'Acesso Negado: alterar status requer users.deactivate/users.activate.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Alteração de dados cadastrais/perfil de terceiros exige users.edit
  IF NEW.nome IS DISTINCT FROM OLD.nome
     OR NEW.telefone IS DISTINCT FROM OLD.telefone
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.perfil_id IS DISTINCT FROM OLD.perfil_id THEN
    IF NOT public.has_admin_permission('users.edit') THEN
      RAISE EXCEPTION 'Acesso Negado: editar usuário requer users.edit.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_admin_permission ON public.usuarios;
CREATE TRIGGER trigger_enforce_admin_permission
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_permission();

-- ------------------------------------------------------------
-- 8. EXTENSÃO DO CHECK DE AÇÕES DE AUDITORIA
-- ------------------------------------------------------------
ALTER TABLE public.auditoria_logs DROP CONSTRAINT IF EXISTS auditoria_logs_acao_check;
ALTER TABLE public.auditoria_logs ADD CONSTRAINT auditoria_logs_acao_check CHECK (
  acao IN ('INSERT','UPDATE','DELETE','STATUS_CHANGE','LOGIN',
           'USER_CREATED','USER_UPDATED','USER_ACTIVATED','USER_DEACTIVATED',
           'USER_ROLE_CHANGED','USER_PERMISSIONS_CHANGED','USER_INVITE_SENT',
           'USER_INVITE_RESENT','USER_ACCESS_REVOKED','AUTONOMY_GRANTED','AUTONOMY_REVOKED')
);