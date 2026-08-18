-- ============================================================
-- MIGRATION 20260825 — CENTRAL DE ACESSOS CORPORATIVOS: HARDENING
-- SOBRE MÍDIA ERP
--
-- Correções de segurança identificadas na auditoria da Central de
-- Acessos (red team / revisão de RLS):
--
--   F1. Escalada: ADMIN podia auto-promover (e promover terceiros)
--       para OWNER (prevent_self_escalation só barrava quem não era
--       OWNER/ADMIN; RLS self-update permitia a escrita).
--   F2. Auto-reativação: usuário desativado podia reativar a própria
--       conta alterando ativo/status pela própria linha.
--   F3. INSERT forjado em usuarios: a policy permitia id = auth.uid()
--       com perfil/tenant arbitrários (sem trigger de INSERT).
--   F4. RLS legado cross-tenant em usuarios: p_usuarios_self_or_admin
--       (SELECT) e p_write_usuarios_admin_owner (FOR ALL) permitiam a
--       QUALQUER ADMIN de QUALQUER tenant ler/alterar/excluir usuários
--       de outros tenants.
--   F5. RLS legado cross-tenant em representantes
--       (p_representantes_self_or_admin FOR ALL).
--   F6. RLS legado cross-tenant em empresa_operadora (p_admin_all FOR ALL).
--   F7. auditoria_logs: SELECT sem tenant (vazamento) e INSERT sem
--       validação de tenant (forja de auditoria).
--   F8. Perfil ADMIN atribuível via UPDATE sem users.create_admin; perfil
--       OWNER atribuível via perfil_id.
--   F9. Alterações administrativas em usuarios sem trilha de auditoria
--       confiável no banco (auditoria era feita pelo cliente — forjável).
--   F10. Self-update podia trocar empresa_operadora_id (migração de tenant).
--
-- Nota: triggers validam apenas sessões de usuário (auth.uid() não nulo).
-- Contextos administrativos (SQL editor, service role, migrations) não
-- possuem JWT e são considerados confiáveis.
--
-- Idempotente: seguro para reexecução.
-- ============================================================

-- ============================================================
-- 1. REMOÇÃO DE POLÍTICAS RLS LEGADAS CROSS-TENANT (F4, F5, F6)
-- ============================================================
DROP POLICY IF EXISTS p_usuarios_self_or_admin ON public.usuarios;
DROP POLICY IF EXISTS p_write_usuarios_admin_owner ON public.usuarios;
DROP POLICY IF EXISTS p_representantes_self_or_admin ON public.representantes;
DROP POLICY IF EXISTS p_admin_all ON public.empresa_operadora;

-- ============================================================
-- 2. USUARIOS: INSERT restrito a OWNER/ADMIN do MESMO tenant (F3)
--    (todos os fluxos oficiais passam por RPC SECURITY DEFINER ou
--    service role; self-registration direto foi eliminado)
-- ============================================================
DROP POLICY IF EXISTS usuarios_insert_policy ON public.usuarios;
CREATE POLICY usuarios_insert_policy ON public.usuarios
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_tenant_id()
    AND public.is_owner_or_admin()
  );

-- UPDATE: self-update passa a exigir manutenção do próprio tenant (F10)
DROP POLICY IF EXISTS usuarios_update_policy ON public.usuarios;
CREATE POLICY usuarios_update_policy ON public.usuarios
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR (
      empresa_operadora_id = public.get_user_tenant_id()
      AND public.is_owner_or_admin()
    )
  )
  WITH CHECK (
    (id = auth.uid() AND empresa_operadora_id = public.get_user_tenant_id())
    OR (
      empresa_operadora_id = public.get_user_tenant_id()
      AND public.is_owner_or_admin()
    )
  );

-- ============================================================
-- 3. TRIGGER DE INSERT: defesa em profundidade (F3)
--    Bloqueia criação direta com perfil OWNER, is_owner=true ou
--    tenant divergente; valida perfil ADMIN contra users.create_admin.
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_usuario_insert_forgery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_tenant uuid;
  v_caller_owner boolean;
  v_caller_admin boolean;
  v_perfil_nome text;
BEGIN
  -- Contextos administrativos (SQL editor, service role, migrations) não
  -- possuem JWT e são confiáveis: enforcement vale para sessões de usuário.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_caller_tenant := public.get_user_tenant_id();

  -- Chamador sem registro corporativo (ex.: token sem usuarios) não cria linhas
  IF v_caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Acesso Negado: criação direta de usuário não autorizada.' USING ERRCODE = '42501';
  END IF;

  IF NEW.empresa_operadora_id IS DISTINCT FROM v_caller_tenant THEN
    RAISE EXCEPTION 'Acesso Negado: tenant não corresponde ao do chamador.' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(NEW.is_owner, false) THEN
    RAISE EXCEPTION 'Acesso Negado: criação direta de conta OWNER não autorizada.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(u.is_owner, false),
         (UPPER(COALESCE(p.nome, '')) = 'ADMIN')
    INTO v_caller_owner, v_caller_admin
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
   WHERE u.id = auth.uid();

  IF NOT v_caller_owner AND NOT v_caller_admin THEN
    RAISE EXCEPTION 'Acesso Negado: apenas OWNER ou ADMIN criam usuários.' USING ERRCODE = '42501';
  END IF;

  IF NEW.perfil_id IS NOT NULL THEN
    SELECT nome INTO v_perfil_nome FROM public.perfis WHERE id = NEW.perfil_id;
    IF v_perfil_nome = 'OWNER' THEN
      RAISE EXCEPTION 'Acesso Negado: perfil OWNER não pode ser atribuído em criação.' USING ERRCODE = '42501';
    END IF;
    IF v_perfil_nome = 'ADMIN' AND NOT v_caller_owner THEN
      IF NOT public.has_admin_permission('users.create_admin') THEN
        RAISE EXCEPTION 'Acesso Negado: criar ADMIN requer users.create_admin.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_usuario_insert_forgery ON public.usuarios;
CREATE TRIGGER trg_prevent_usuario_insert_forgery
  BEFORE INSERT ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.prevent_usuario_insert_forgery();

-- ============================================================
-- 4. ANTI-ESCALADA: promover OWNER e auto-reativação (F1, F2, F10)
--    - Transição is_owner=false -> true: somente bootstrap (nenhum
--      OWNER existente no tenant) ou pelo próprio OWNER do tenant.
--    - Self-update: bloqueado alterar ativo/status/perfil/tenant.
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_tenant uuid;
  v_caller_owner boolean;
  v_tenant_efetivo uuid;
BEGIN
  -- Contextos administrativos (SQL editor, service role, migrations) não
  -- possuem JWT e são confiáveis: enforcement vale para sessões de usuário.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_caller_tenant := public.get_user_tenant_id();

  -- F1: promoção a OWNER — bootstrap ou pelo próprio OWNER do tenant
  IF NEW.is_owner AND NOT OLD.is_owner THEN
    v_tenant_efetivo := COALESCE(v_caller_tenant, OLD.empresa_operadora_id);
    IF EXISTS (
      SELECT 1 FROM public.usuarios u
       WHERE u.empresa_operadora_id = v_tenant_efetivo
         AND u.is_owner = true
         AND u.id <> OLD.id
         AND u.deleted_at IS NULL
    ) THEN
      SELECT COALESCE(u.is_owner, false) INTO v_caller_owner
        FROM public.usuarios u WHERE u.id = auth.uid();
      IF NOT v_caller_owner THEN
        RAISE EXCEPTION 'Acesso Negado: apenas o OWNER da organização pode conceder status OWNER.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- F2/F10: self-update não altera ativação, status, tenant ou perfil
  IF auth.uid() = OLD.id THEN
    IF NEW.ativo IS DISTINCT FROM OLD.ativo OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Acesso Negado: não é possível alterar o próprio status de ativação.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.empresa_operadora_id IS DISTINCT FROM OLD.empresa_operadora_id THEN
      RAISE EXCEPTION 'Acesso Negado: não é possível alterar o próprio tenant.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.perfil_id IS DISTINCT FROM OLD.perfil_id THEN
      RAISE EXCEPTION 'Acesso Negado: não é possível alterar o próprio perfil.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Legado: usuário comum tentando trocar o próprio perfil
  IF NEW.perfil_id IS DISTINCT FROM OLD.perfil_id AND NOT public.is_owner_or_admin() THEN
    RAISE EXCEPTION 'Acesso Negado: não é possível alterar o próprio perfil.'
      USING ERRCODE = '42501';
  END IF;

  -- Legado: proteção do OWNER contra terceiros
  IF OLD.is_owner AND auth.uid() <> OLD.id
     AND (NEW.is_owner IS DISTINCT FROM OLD.is_owner OR NEW.perfil_id IS DISTINCT FROM OLD.perfil_id) THEN
    RAISE EXCEPTION 'Acesso Negado: apenas o próprio OWNER pode alterar o status de propriedade da conta.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_self_escalation ON public.usuarios;
CREATE TRIGGER trigger_prevent_self_escalation
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_escalation();

-- ============================================================
-- 5. ENFORCEMENT GRANULAR: perfil ADMIN exige users.create_admin,
--    perfil OWNER nunca é atribuível por edição (F8)
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_admin_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_owner boolean;
  v_caller_admin boolean;
  v_perfil_novo text;
BEGIN
  -- Contextos administrativos (SQL editor, service role, migrations) não
  -- possuem JWT e são confiáveis: enforcement vale para sessões de usuário.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Alteração da própria conta: regras tratadas por prevent_self_escalation
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

  -- Alteração de dados cadastrais exige users.edit
  IF NEW.nome IS DISTINCT FROM OLD.nome
     OR NEW.telefone IS DISTINCT FROM OLD.telefone
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    IF NOT public.has_admin_permission('users.edit') THEN
      RAISE EXCEPTION 'Acesso Negado: editar usuário requer users.edit.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Alteração de perfil exige users.edit + regras de perfil (F8)
  IF NEW.perfil_id IS DISTINCT FROM OLD.perfil_id THEN
    IF NOT public.has_admin_permission('users.edit') THEN
      RAISE EXCEPTION 'Acesso Negado: editar usuário requer users.edit.' USING ERRCODE = '42501';
    END IF;
    IF NEW.perfil_id IS NOT NULL THEN
      SELECT nome INTO v_perfil_novo FROM public.perfis WHERE id = NEW.perfil_id;
      IF v_perfil_novo = 'OWNER' THEN
        RAISE EXCEPTION 'Acesso Negado: perfil OWNER não pode ser atribuído via edição.' USING ERRCODE = '42501';
      END IF;
      IF v_perfil_novo = 'ADMIN' THEN
        IF NOT public.has_admin_permission('users.create_admin') THEN
          RAISE EXCEPTION 'Acesso Negado: atribuir perfil ADMIN requer users.create_admin.' USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_admin_permission ON public.usuarios;
CREATE TRIGGER trigger_enforce_admin_permission
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_permission();

-- ============================================================
-- 6. REPRESENTANTES: RLS tenant-scoped (F5)
--    SELECT: próprio ou membro do mesmo tenant.
--    INSERT/UPDATE/DELETE: OWNER/ADMIN do mesmo tenant.
-- ============================================================
DROP POLICY IF EXISTS rep_select_tenant ON public.representantes;
CREATE POLICY rep_select_tenant ON public.representantes
  FOR SELECT TO authenticated
  USING (
    usuario_id = auth.uid()
    OR empresa_operadora_id = public.get_user_tenant_id()
  );

DROP POLICY IF EXISTS rep_insert_tenant ON public.representantes;
CREATE POLICY rep_insert_tenant ON public.representantes
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_tenant_id()
    AND public.is_owner_or_admin()
  );

DROP POLICY IF EXISTS rep_update_tenant ON public.representantes;
CREATE POLICY rep_update_tenant ON public.representantes
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_tenant_id()
    AND public.is_owner_or_admin()
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_tenant_id()
  );

DROP POLICY IF EXISTS rep_delete_tenant ON public.representantes;
CREATE POLICY rep_delete_tenant ON public.representantes
  FOR DELETE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_tenant_id()
    AND public.is_owner_or_admin()
  );

-- ============================================================
-- 7. EMPRESA_OPERADORA: RLS tenant-scoped (F6)
--    SELECT: membro do próprio tenant. UPDATE: OWNER do tenant.
--    INSERT/DELETE: bloqueados para authenticated.
-- ============================================================
DROP POLICY IF EXISTS p_admin_all ON public.empresa_operadora;
DROP POLICY IF EXISTS empresa_operadora_select_policy ON public.empresa_operadora;
DROP POLICY IF EXISTS eo_select_tenant ON public.empresa_operadora;
CREATE POLICY eo_select_tenant ON public.empresa_operadora
  FOR SELECT TO authenticated
  USING (id = public.get_user_tenant_id());

DROP POLICY IF EXISTS eo_update_owner ON public.empresa_operadora;
CREATE POLICY eo_update_owner ON public.empresa_operadora
  FOR UPDATE TO authenticated
  USING (
    id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
       WHERE u.id = auth.uid()
         AND u.empresa_operadora_id = public.get_user_tenant_id()
         AND COALESCE(u.is_owner, false) = true
    )
  )
  WITH CHECK (id = public.get_user_tenant_id());

-- ============================================================
-- 8. AUDITORIA_LOGS: INSERT e SELECT com tenant (F7)
-- ============================================================
DROP POLICY IF EXISTS audit_insert_policy ON public.auditoria_logs;
CREATE POLICY audit_insert_policy ON public.auditoria_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = auth.uid()
    AND (empresa_operadora_id IS NULL OR empresa_operadora_id = public.get_user_tenant_id())
  );

DROP POLICY IF EXISTS audit_select_policy ON public.auditoria_logs;
CREATE POLICY audit_select_policy ON public.auditoria_logs
  FOR SELECT TO authenticated
  USING (
    usuario_id = auth.uid()
    OR (
      empresa_operadora_id = public.get_user_tenant_id()
      AND EXISTS (
        SELECT 1
        FROM public.usuarios u
        JOIN public.perfis p ON p.id = u.perfil_id
        WHERE u.id = auth.uid()
          AND ((p.nome)::text = ANY ((ARRAY['ADMIN'::character varying, 'GERENTE'::character varying])::text[])
               OR u.is_owner = true)
      )
    )
  );

-- ============================================================
-- 9. AUDITORIA SERVER-SIDE de alterações administrativas em
--    usuarios (F9) — rastreabilidade persistente independente
--    do cliente. Não audita self-updates (ruído) nem ações de
--    sistema (auth.uid() nulo).
-- ============================================================
CREATE OR REPLACE FUNCTION public.auditar_alteracao_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_autor uuid := auth.uid();
  v_email text;
  v_role text;
  v_perfil_antigo text;
  v_perfil_novo text;
  v_tenant uuid;
BEGIN
  IF v_autor IS NULL OR v_autor = NEW.id THEN
    RETURN NEW;
  END IF;

  SELECT u.email,
         CASE WHEN u.is_owner THEN 'OWNER' ELSE UPPER(COALESCE(p.nome, '')) END,
         u.empresa_operadora_id
    INTO v_email, v_role, v_tenant
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
   WHERE u.id = v_autor;

  SELECT COALESCE(p.nome, '') INTO v_perfil_antigo FROM public.perfis p WHERE p.id = OLD.perfil_id;
  SELECT COALESCE(p.nome, '') INTO v_perfil_novo FROM public.perfis p WHERE p.id = NEW.perfil_id;

  IF NEW.perfil_id IS DISTINCT FROM OLD.perfil_id THEN
    INSERT INTO public.auditoria_logs
      (empresa_operadora_id, usuario_id, usuario_email, usuario_role,
       entidade_tipo, entidade_id, acao, status_anterior, status_novo, observacoes)
    VALUES
      (v_tenant, v_autor, v_email, v_role,
       'USUARIO', NEW.id, 'USER_ROLE_CHANGED', v_perfil_antigo, v_perfil_novo,
       'Perfil alterado na Central de Acessos de ' || v_perfil_antigo || ' para ' || v_perfil_novo);
  END IF;

  IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    INSERT INTO public.auditoria_logs
      (empresa_operadora_id, usuario_id, usuario_email, usuario_role,
       entidade_tipo, entidade_id, acao, status_anterior, status_novo, observacoes)
    VALUES
      (v_tenant, v_autor, v_email, v_role,
       'USUARIO', NEW.id, CASE WHEN NEW.ativo THEN 'USER_ACTIVATED' ELSE 'USER_DEACTIVATED' END,
       CASE WHEN OLD.ativo THEN 'ACTIVE' ELSE 'INACTIVE' END,
       CASE WHEN NEW.ativo THEN 'ACTIVE' ELSE 'INACTIVE' END,
       'Status de ativação alterado na Central de Acessos');
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.ativo IS NOT DISTINCT FROM OLD.ativo THEN
    INSERT INTO public.auditoria_logs
      (empresa_operadora_id, usuario_id, usuario_email, usuario_role,
       entidade_tipo, entidade_id, acao, status_anterior, status_novo, observacoes)
    VALUES
      (v_tenant, v_autor, v_email, v_role,
       'USUARIO', NEW.id, 'STATUS_CHANGE', OLD.status, NEW.status,
       'Status corporativo alterado na Central de Acessos');
  END IF;

  IF NEW.is_owner IS DISTINCT FROM OLD.is_owner THEN
    INSERT INTO public.auditoria_logs
      (empresa_operadora_id, usuario_id, usuario_email, usuario_role,
       entidade_tipo, entidade_id, acao, status_anterior, status_novo, observacoes)
    VALUES
      (v_tenant, v_autor, v_email, v_role,
       'USUARIO', NEW.id, 'USER_ROLE_CHANGED',
       CASE WHEN OLD.is_owner THEN 'OWNER' ELSE 'MEMBER' END,
       CASE WHEN NEW.is_owner THEN 'OWNER' ELSE 'MEMBER' END,
       'Flag de proprietário alterado');
  END IF;

  IF (NEW.perfil_id IS NOT DISTINCT FROM OLD.perfil_id)
     AND (NEW.ativo IS NOT DISTINCT FROM OLD.ativo)
     AND (NEW.status IS NOT DISTINCT FROM OLD.status)
     AND (NEW.is_owner IS NOT DISTINCT FROM OLD.is_owner)
     AND (NEW.nome IS DISTINCT FROM OLD.nome
          OR NEW.telefone IS DISTINCT FROM OLD.telefone
          OR NEW.email IS DISTINCT FROM OLD.email) THEN
    INSERT INTO public.auditoria_logs
      (empresa_operadora_id, usuario_id, usuario_email, usuario_role,
       entidade_tipo, entidade_id, acao, observacoes)
    VALUES
      (v_tenant, v_autor, v_email, v_role,
       'USUARIO', NEW.id, 'USER_UPDATED',
       'Dados cadastrais atualizados na Central de Acessos');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditar_alteracao_usuario ON public.usuarios;
CREATE TRIGGER trg_auditar_alteracao_usuario
  AFTER UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.auditar_alteracao_usuario();

-- ============================================================
-- 10. RPC ATUALIZAR_USUARIO_CORPORATIVO (F8/F9/F1)
--     OWNER ou ADMIN com users.edit; perfil ADMIN exige
--     users.create_admin; conta OWNER imutável; mesmo tenant.
--     Auditoria registrada pelo trigger server-side (item 9).
-- ============================================================
CREATE OR REPLACE FUNCTION public.atualizar_usuario_corporativo(
  p_alvo_id uuid,
  p_nome text,
  p_telefone text,
  p_perfil_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_tenant uuid;
  v_caller_owner boolean;
  v_caller_admin boolean;
  v_caller_email text;
  v_alvo_tenant uuid;
  v_alvo_owner boolean;
  v_alvo_perfil text;
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

  IF NOT v_caller_owner THEN
    IF NOT v_caller_admin THEN
      RAISE EXCEPTION 'Acesso Negado: apenas OWNER ou ADMIN editam usuários.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_admin_permission('users.edit') THEN
      RAISE EXCEPTION 'Acesso Negado: permissão users.edit não concedida.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_alvo_id = v_caller THEN
    RAISE EXCEPTION 'Acesso Negado: edite seu próprio perfil pela página Meu Perfil.' USING ERRCODE = '42501';
  END IF;

  SELECT u.empresa_operadora_id, COALESCE(u.is_owner, false), COALESCE(p.nome, '')
    INTO v_alvo_tenant, v_alvo_owner, v_alvo_perfil
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
   WHERE u.id = p_alvo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário alvo inexistente.' USING ERRCODE = '22023';
  END IF;
  IF v_alvo_tenant <> v_caller_tenant THEN
    RAISE EXCEPTION 'Acesso Negado: usuário de outro tenant.' USING ERRCODE = '42501';
  END IF;
  IF v_alvo_owner OR v_alvo_perfil = 'OWNER' THEN
    RAISE EXCEPTION 'Acesso Negado: a conta OWNER é protegida e não pode ser alterada.' USING ERRCODE = '42501';
  END IF;

  IF p_perfil_id IS NOT NULL
     AND p_perfil_id <> (SELECT perfil_id FROM public.usuarios WHERE id = p_alvo_id) THEN
    SELECT p.nome, p.ativo INTO v_perfil_nome, v_perfil_ativo
      FROM public.perfis p WHERE p.id = p_perfil_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Perfil alvo inexistente.' USING ERRCODE = '22023';
    END IF;
    IF NOT v_perfil_ativo THEN
      RAISE EXCEPTION 'Perfil alvo inativo.' USING ERRCODE = '22023';
    END IF;
    IF v_perfil_nome = 'OWNER' THEN
      RAISE EXCEPTION 'Acesso Negado: perfil OWNER não pode ser atribuído.' USING ERRCODE = '42501';
    END IF;
    IF v_perfil_nome = 'ADMIN' AND NOT v_caller_owner THEN
      IF NOT public.has_admin_permission('users.create_admin') THEN
        RAISE EXCEPTION 'Acesso Negado: atribuir perfil ADMIN requer users.create_admin.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  UPDATE public.usuarios
     SET nome = COALESCE(NULLIF(trim(p_nome), ''), nome),
         telefone = NULLIF(trim(COALESCE(p_telefone, '')), ''),
         perfil_id = COALESCE(p_perfil_id, perfil_id),
         updated_by = v_caller
   WHERE id = p_alvo_id;

  INSERT INTO public.notificacoes_central
    (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato, titulo, mensagem,
     prioridade, severidade, status_envio, lida, status_notificacao)
  VALUES
    (v_caller_tenant, p_alvo_id, 'USUARIO_ATUALIZADO', 'IN_APP', p_alvo_id,
     'Seus dados corporativos foram atualizados',
     'Suas informações foram atualizadas na Central de Acessos.',
     'SUCESSO', 'INFO', 'SENT', false, 'NAO_LIDA');
END;
$$;

-- ============================================================
-- 11. SOLICITACOES_ACESSO: RLS TENANT-SCOPED + AUDITORIA + DECISAO VIA TOKEN
--     (F11: edge function exigia token opcional; F12: p_admin_solicitacoes
--      sem tenant e p_insert_solicitacao WITH CHECK true; F13: trigger de
--      auditoria de status nunca foi anexado a solicitacoes_acesso)
--
--     Regras:
--       - SELECT: solicitante ve a propria; OWNER/ADMIN ve apenas do
--         PROPRiO tenant. Solicitaes orfas (empresa_operadora_id NULL)
--         NAO sao visiveis via REST (apenas via RPC com token).
--       - INSERT: anon/authenticated estrito (PENDING + token obrigatorio,
--         estados de decisao proibidos). Bloqueia forja de APPROVED.
--       - UPDATE: somente OWNER/ADMIN do mesmo tenant em PENDING.
--       - DELETE: NENHUMA policy (REST DELETE bloqueado).
--       - Decisoes via link de e-mail: RPC get_solicitacao_aprovacao
--         (leitura com token) + edge function handle-approval (service role).
-- ============================================================

DROP POLICY IF EXISTS p_admin_solicitacoes ON public.solicitacoes_acesso;
DROP POLICY IF EXISTS p_insert_solicitacao ON public.solicitacoes_acesso;

DROP POLICY IF EXISTS solicitacoes_select_own_or_tenant ON public.solicitacoes_acesso;
CREATE POLICY solicitacoes_select_own_or_tenant ON public.solicitacoes_acesso
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR (
      is_owner_or_admin()
      AND empresa_operadora_id = get_user_tenant_id()
    )
  );

DROP POLICY IF EXISTS solicitacoes_insert_estrito ON public.solicitacoes_acesso;
CREATE POLICY solicitacoes_insert_estrito ON public.solicitacoes_acesso
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'PENDING'
    AND approval_used_at IS NULL
    AND approval_token_hash IS NOT NULL
    AND approval_token_expires_at IS NOT NULL
    AND approved_at IS NULL
    AND approved_by IS NULL
    AND rejected_at IS NULL
    AND rejected_by IS NULL
    AND motivo_rejeicao IS NULL
  );

DROP POLICY IF EXISTS solicitacoes_update_admin ON public.solicitacoes_acesso;
CREATE POLICY solicitacoes_update_admin ON public.solicitacoes_acesso
  FOR UPDATE TO authenticated
  USING (
    status = 'PENDING'
    AND is_owner_or_admin()
    AND empresa_operadora_id = get_user_tenant_id()
  )
  WITH CHECK (
    is_owner_or_admin()
    AND empresa_operadora_id = get_user_tenant_id()
  );

-- F13: autoria da decisao sempre derivada de auth.uid() no servidor
CREATE OR REPLACE FUNCTION public.solicitacao_decisao_autor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.status = 'APPROVED' AND OLD.status IS DISTINCT FROM 'APPROVED' THEN
      NEW.approved_by := auth.uid();
    ELSIF NEW.status = 'REJECTED' AND OLD.status IS DISTINCT FROM 'REJECTED' THEN
      NEW.rejected_by := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_solicitacao_decisao_autor ON public.solicitacoes_acesso;
CREATE TRIGGER trg_solicitacao_decisao_autor
  BEFORE UPDATE ON public.solicitacoes_acesso
  FOR EACH ROW EXECUTE FUNCTION public.solicitacao_decisao_autor();

-- F13: auditoria de mudanca de status em solicitacoes_acesso
-- (autor cai para approved_by/rejected_by quando a deciso veio da edge
-- function com service role, em que auth.uid() e nulo)
CREATE OR REPLACE FUNCTION public.handle_solicitacao_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := COALESCE(auth.uid(), NEW.approved_by, NEW.rejected_by);
  v_email text;
  v_role text;
BEGIN
  SELECT u.email, COALESCE(UPPER(p.nome), 'SISTEMA')
    INTO v_email, v_role
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON u.perfil_id = p.id
  WHERE u.id = v_user_id;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.auditoria_logs (
      empresa_operadora_id, usuario_id, usuario_email, usuario_role,
      entidade_tipo, entidade_id, acao,
      status_anterior, status_novo, observacoes
    ) VALUES (
      NEW.empresa_operadora_id, v_user_id, v_email, v_role,
      'SOLICITACAO', NEW.id, 'STATUS_CHANGE',
      OLD.status, NEW.status,
      'Decisao registrada via Central de Comunicacao'
    );
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_solicitacao_status ON public.solicitacoes_acesso;
CREATE TRIGGER trg_solicitacao_status
  BEFORE UPDATE ON public.solicitacoes_acesso
  FOR EACH ROW EXECUTE FUNCTION public.handle_solicitacao_update();

-- O trigger generico handle_updated_at referencia NEW.version, coluna
-- inexistente em solicitacoes_acesso (erro 42703 em qualquer UPDATE).
-- O handle_solicitacao_update ja mantem updated_at nesta tabela.
DROP TRIGGER IF EXISTS trg_solicitacoes_acesso_updated_at ON public.solicitacoes_acesso;

-- RPC de leitura autorizada por token (link de e-mail, sem login):
-- valida hash + uso unico + expiracao no servidor antes de devolver a linha
CREATE OR REPLACE FUNCTION public.get_solicitacao_aprovacao(p_request_id uuid, p_token_hash text)
RETURNS TABLE (
  id uuid,
  empresa_operadora_id uuid,
  auth_user_id uuid,
  usuario_id uuid,
  tipo_acesso text,
  nome_usuario text,
  email_usuario text,
  telefone text,
  dados_cadastro jsonb,
  status text,
  approval_used_at timestamptz,
  approval_token_expires_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  motivo_rejeicao text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.solicitacoes_acesso;
BEGIN
  SELECT * INTO v_row FROM public.solicitacoes_acesso r WHERE r.id = p_request_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Solicitacao de acesso nao encontrada.' USING ERRCODE = '22023';
  END IF;
  IF v_row.approval_used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este link de aprovacao ja foi utilizado anteriormente (Token Consumido).' USING ERRCODE = '42501';
  END IF;
  IF v_row.approval_token_expires_at IS NOT NULL AND v_row.approval_token_expires_at < NOW() THEN
    RAISE EXCEPTION 'Este link de aprovacao expirou (validade de 48 horas).' USING ERRCODE = '42501';
  END IF;
  IF v_row.approval_token_hash IS NULL OR v_row.approval_token_hash <> p_token_hash THEN
    RAISE EXCEPTION 'Token de aprovacao invalido ou adulterado.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT r.id, r.empresa_operadora_id, r.auth_user_id, r.usuario_id,
           r.tipo_acesso::text, r.nome_usuario::text, r.email_usuario::text, r.telefone::text,
           r.dados_cadastro, r.status::text, r.approval_used_at,
           r.approval_token_expires_at, r.approved_at, r.rejected_at,
           r.motivo_rejeicao, r.created_at, r.updated_at
    FROM public.solicitacoes_acesso r
    WHERE r.id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_solicitacao_aprovacao(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_solicitacao_aprovacao(uuid, text) TO anon, authenticated;
