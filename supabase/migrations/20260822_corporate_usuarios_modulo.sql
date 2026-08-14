-- ============================================================
-- MIGRATION 20260822 — Módulo Corporativo de Usuários e Acessos
-- SOBRE MÍDIA ERP
--
-- 1. Seed dos perfis corporativos GERENTE e FINANCEIRO na tabela
--    oficial `perfis` (ambos já previstos pela constraint oficial
--    `perfis_nome_check` — GESTOR é papel constitucional equivalente
--    a GERENTE no RBAC do sistema; nenhum papel novo foi inventado).
-- 2. Helper `is_owner_or_admin()` (OWNER ou perfil ADMIN) — mesmo
--    padrão já utilizado por `is_central_privileged()`.
-- 3. Políticas RLS de INSERT/UPDATE em `usuarios` com isolamento de
--    tenant + criação/edição restrita a OWNER/ADMIN do MESMO tenant.
--    Corrige a lacuna de segurança legada: a política anterior
--    (is_owner = true no ROW) permitia escalada de privilégio por
--    qualquer usuário.
--
-- Idempotente: seguro para reexecução.
-- ============================================================

-- 1. Perfis corporativos constitucionais (GERENTE e FINANCEIRO)
INSERT INTO public.perfis (nome, descricao, ativo)
SELECT 'GERENTE', 'Gestor da Operação (equivalente constitucional de GESTOR)', true
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE nome = 'GERENTE');

INSERT INTO public.perfis (nome, descricao, ativo)
SELECT 'FINANCEIRO', 'Responsável pelo Financeiro', true
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE nome = 'FINANCEIRO');

-- 2. Helper: usuário logado é OWNER ou possui perfil ADMIN
CREATE OR REPLACE FUNCTION public.is_owner_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON u.perfil_id = p.id
    WHERE u.id = auth.uid()
      AND (
        u.is_owner = true
        OR UPPER(COALESCE(p.nome, '')) IN ('ADMIN')
      )
  );
$function$;

-- 3. RLS de INSERT: auto-cadastro (id próprio) OU OWNER/ADMIN do mesmo tenant
DROP POLICY IF EXISTS usuarios_insert_policy ON public.usuarios;
CREATE POLICY usuarios_insert_policy ON public.usuarios
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    OR (
      empresa_operadora_id = public.get_user_tenant_id()
      AND public.is_owner_or_admin()
    )
  );

-- 4. RLS de UPDATE: próprio usuário OU OWNER/ADMIN do mesmo tenant.
--    A anti-escalada (não auto-promover a OWNER / não trocar o próprio
--    perfil) é garantida pelo trigger trigger_prevent_self_escalation,
--    pois políticas RLS não referenciam OLD/NEW.
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
    id = auth.uid()
    OR (
      empresa_operadora_id = public.get_user_tenant_id()
      AND public.is_owner_or_admin()
    )
  );

-- 5. Anti-escalada de privilégio em usuarios
CREATE OR REPLACE FUNCTION public.prevent_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Escalada: usuário comum tentando se tornar OWNER
  IF NEW.is_owner AND NOT OLD.is_owner AND NOT public.is_owner_or_admin() THEN
    RAISE EXCEPTION 'Acesso Negado: não é possível auto-promover a OWNER.';
  END IF;

  -- Escalada: usuário comum tentando trocar o próprio perfil
  IF NEW.perfil_id IS DISTINCT FROM OLD.perfil_id AND NOT public.is_owner_or_admin() THEN
    RAISE EXCEPTION 'Acesso Negado: não é possível alterar o próprio perfil.';
  END IF;

  -- Proteção do OWNER: apenas o próprio OWNER pode alterar os campos de
  -- propriedade da conta (complementa trigger_prevent_owner_downgrade)
  IF OLD.is_owner AND auth.uid() <> OLD.id
     AND (NEW.is_owner IS DISTINCT FROM OLD.is_owner OR NEW.perfil_id IS DISTINCT FROM OLD.perfil_id) THEN
    RAISE EXCEPTION 'Acesso Negado: apenas o próprio OWNER pode alterar o status de propriedade da conta.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_prevent_self_escalation ON public.usuarios;
CREATE TRIGGER trigger_prevent_self_escalation
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_escalation();

-- 6. DELETE permanece bloqueado para usuários (sem política) — a conta
--    OWNER é adicionalmente protegida pelos triggers existentes
--    (trigger_prevent_owner_deletion / trigger_prevent_owner_downgrade).
