-- ======================================================================
-- SOBRE MÍDIA ERP - MIGRATION 20260820: ISOLAMENTO DE TENANT EM usuarios
-- ======================================================================
-- Correção da política SELECT de public.usuarios:
--   ANTES: (id = auth.uid()) OR (is_owner = true) OR (jwt org/empresa)
--     - is_owner = true tornava TODOS os owners de TODOS os tenants
--       visíveis para qualquer usuário autenticado (vazamento
--       cross-tenant comprovado em auditoria).
--     - Sem empresa_operadora_id no JWT, usuários do MESMO tenant
--       (não-owners) ficavam INVISÍVEIS entre si, quebrando o chat
--       da Central (participantes do próprio tenant não listados).
--   DEPOIS: tenant isolado via get_user_tenant_id() (auth.uid -> usuarios).
--     - Cada usuário vê apenas usuários do SEU tenant + ele mesmo.
--     - Fluxos dependentes (solicitacoes_acesso, AdminUsers) operam por
--       tenant próprio, sem impacto funcional.
-- Idempotente: seguro para reexecução.
-- ======================================================================

DROP POLICY IF EXISTS "usuarios_select_policy" ON public.usuarios;

CREATE POLICY "usuarios_select_policy" ON public.usuarios
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR empresa_operadora_id = public.get_user_tenant_id()
  );