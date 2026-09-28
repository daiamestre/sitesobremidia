-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261268 — F-100
-- Portal do Anunciante: o cliente volta a ler o PRÓPRIO cadastro.
--
-- Causa raiz (reproduzida com RLS como alfa_…@homolog-sobremidia.com.br):
--   A 20261207 (hardening lote 4A) removeu a policy ampla
--   "Enable read for active authenticated users" de public.clientes e deixou
--   só a cli_select_policy, que cobre equipe interna e representante mas NÃO
--   o próprio cliente. Resultado: o anunciante enxerga 0 linha em clientes e
--   empresas → useClienteModalidade devolve modalidade null → o
--   CustomerPortalLayout manda todo anunciante para /portal/onboarding
--   ("escolha a modalidade") e o painel fica sem o nome da empresa.
--
-- Correção (aditiva, SÓ leitura, só a própria linha — mesmo padrão de
-- cr_client_select_own): o usuário lê a linha de clientes cujo id é o seu
-- usuarios.cliente_id (get_user_cliente_id, SECURITY DEFINER) dentro do seu
-- tenant, e a(s) linha(s) de empresas desse cliente. Nenhuma escrita nova;
-- as policies existentes não mudam; a policy ampla removida NÃO volta.
-- Player: não usa clientes/empresas com a sessão do usuário (sem impacto).
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS cli_select_proprio_cliente ON public.clientes;
--   DROP POLICY IF EXISTS emp_select_proprio_cliente ON public.empresas;
-- ======================================================================

DROP POLICY IF EXISTS cli_select_proprio_cliente ON public.clientes;
CREATE POLICY cli_select_proprio_cliente ON public.clientes
  FOR SELECT TO authenticated
  USING (
    id IS NOT NULL
    AND id = public.get_user_cliente_id()
    AND deleted_at IS NULL
    AND empresa_operadora_id = (
      SELECT u.empresa_operadora_id FROM public.usuarios u WHERE u.id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS emp_select_proprio_cliente ON public.empresas;
CREATE POLICY emp_select_proprio_cliente ON public.empresas
  FOR SELECT TO authenticated
  USING (
    cliente_id IS NOT NULL
    AND cliente_id = public.get_user_cliente_id()
  );
