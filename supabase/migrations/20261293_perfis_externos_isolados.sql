-- F-127 — Perfis externos (ANUNCIANTE, CLIENTE, PARCEIRO) isolados dos dados internos da operadora.
-- Achado: várias tabelas liberavam leitura E escrita para "qualquer usuário da mesma empresa". Como o anunciante é
-- um usuário da empresa operadora, ele conseguia (pela API, fora das telas do portal):
--   * ler e APAGAR a auditoria financeira, o fluxo de caixa, os eventos do sistema e os alertas do NOC;
--   * ler e APAGAR agendamentos, campanhas e pedidos de inserção de outros clientes;
--   * ler a lista de usuários da operadora e os dados bancários dos representantes;
--   * mandar comando remoto (reiniciar etc.) para telas que não são dele;
--   * ler a auditoria de contratos de TODAS as empresas (regra "true").
-- Correção só com regras RESTRITIVAS (somam-se às que já existem; não liberam nada novo):
--   * equipe da operadora (OWNER, ADMIN, FINANCEIRO, REPRESENTANTE, GESTOR…) continua exatamente como estava;
--   * perfil externo: nada das tabelas internas; nas tabelas comerciais, só as linhas do próprio cliente.
-- Auditoria passa a ser só de acréscimo: ninguém altera nem apaga pela API.

CREATE OR REPLACE FUNCTION public.fn_perfil_cliente_externo()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id
                  WHERE u.id = auth.uid() AND NOT coalesce(u.is_owner, false)
                    AND upper(coalesce(p.nome, '')) IN ('ANUNCIANTE', 'CLIENTE', 'PARCEIRO'));
$$;
REVOKE ALL ON FUNCTION public.fn_perfil_cliente_externo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_perfil_cliente_externo() TO authenticated;

-- A) Tabelas internas da operadora: perfil externo não acessa.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['financeiro_auditoria', 'fluxo_caixa', 'system_events', 'noc_alerts', 'jobs', 'representantes',
                           'ordens_producao', 'producao_historico', 'pi_historico', 'agendamento_auditoria']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS externo_sem_acesso ON public.%I', t);
    EXECUTE format('CREATE POLICY externo_sem_acesso ON public.%I AS RESTRICTIVE FOR ALL TO public USING (NOT public.fn_perfil_cliente_externo()) WITH CHECK (NOT public.fn_perfil_cliente_externo())', t);
  END LOOP;
END $$;

-- B) Tabelas comerciais: perfil externo só enxerga e só mexe no que é do próprio cliente.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agendamentos', 'campanhas', 'pedidos_insercao']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS externo_so_o_proprio ON public.%I', t);
    EXECUTE format('CREATE POLICY externo_so_o_proprio ON public.%I AS RESTRICTIVE FOR ALL TO public USING (NOT public.fn_perfil_cliente_externo() OR cliente_id = public.get_user_cliente_id()) WITH CHECK (NOT public.fn_perfil_cliente_externo() OR cliente_id = public.get_user_cliente_id())', t);
  END LOOP;
END $$;
-- produções seguem o pedido de inserção (que já ficou restrito ao próprio cliente)
DROP POLICY IF EXISTS externo_so_o_proprio ON public.producoes;
CREATE POLICY externo_so_o_proprio ON public.producoes AS RESTRICTIVE FOR ALL TO public
  USING (NOT public.fn_perfil_cliente_externo() OR EXISTS (SELECT 1 FROM public.pedidos_insercao pi WHERE pi.id = producoes.pedido_insercao_id))
  WITH CHECK (NOT public.fn_perfil_cliente_externo() OR EXISTS (SELECT 1 FROM public.pedidos_insercao pi WHERE pi.id = producoes.pedido_insercao_id));

-- B2) Agendamentos e pedidos de inserção são gravados pela operadora: perfil externo só consulta os seus.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agendamentos', 'pedidos_insercao']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS externo_nao_inclui ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS externo_nao_altera ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS externo_nao_apaga ON public.%I', t);
    EXECUTE format('CREATE POLICY externo_nao_inclui ON public.%I AS RESTRICTIVE FOR INSERT TO public WITH CHECK (NOT public.fn_perfil_cliente_externo())', t);
    EXECUTE format('CREATE POLICY externo_nao_altera ON public.%I AS RESTRICTIVE FOR UPDATE TO public USING (NOT public.fn_perfil_cliente_externo())', t);
    EXECUTE format('CREATE POLICY externo_nao_apaga ON public.%I AS RESTRICTIVE FOR DELETE TO public USING (NOT public.fn_perfil_cliente_externo())', t);
  END LOOP;
END $$;

-- C) Usuários:
--    * perfil externo vê a si mesmo e a equipe do próprio cliente (não a lista da operadora);
--    * equipe vê os usuários da PRÓPRIA empresa (antes, ADMIN/GESTOR/GERENTE/FINANCEIRO de uma empresa liam os
--      usuários de TODAS as empresas).
DROP POLICY IF EXISTS externo_so_a_propria_equipe ON public.usuarios;
DROP POLICY IF EXISTS usuarios_so_da_propria_empresa ON public.usuarios;
CREATE POLICY usuarios_so_da_propria_empresa ON public.usuarios AS RESTRICTIVE FOR SELECT TO public
  USING (
    id = auth.uid()
    OR (public.fn_perfil_cliente_externo() AND cliente_id IS NOT NULL AND cliente_id = public.get_user_cliente_id())
    OR (NOT public.fn_perfil_cliente_externo()
        AND empresa_operadora_id = public.get_user_tenant_id())
  );

-- D) Auditoria de contratos: lê e registra quem enxerga o contrato (antes: "true" para qualquer logado).
DROP POLICY IF EXISTS p_read_contrato_auditoria ON public.contrato_auditoria;
DROP POLICY IF EXISTS p_insert_contrato_auditoria ON public.contrato_auditoria;
DROP POLICY IF EXISTS contrato_auditoria_leitura ON public.contrato_auditoria;
DROP POLICY IF EXISTS contrato_auditoria_registro ON public.contrato_auditoria;
CREATE POLICY contrato_auditoria_leitura ON public.contrato_auditoria FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contratos c WHERE c.id = contrato_auditoria.contrato_id));
CREATE POLICY contrato_auditoria_registro ON public.contrato_auditoria FOR INSERT TO authenticated
  WITH CHECK (contrato_id IS NULL OR EXISTS (SELECT 1 FROM public.contratos c WHERE c.id = contrato_auditoria.contrato_id));

-- E) Comando remoto: quem não administra as telas da empresa só manda comando para tela própria.
DROP POLICY IF EXISTS comando_so_tela_propria ON public.remote_commands;
CREATE POLICY comando_so_tela_propria ON public.remote_commands AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (NOT public.fn_perfil_sem_gestao_de_telas()
              OR EXISTS (SELECT 1 FROM public.screens s WHERE s.id = remote_commands.screen_id AND s.user_id = auth.uid()));

-- F) Auditoria é só de acréscimo: ninguém altera nem apaga pela API (o servidor continua gravando).
REVOKE UPDATE, DELETE, TRUNCATE ON public.financeiro_auditoria, public.auditoria_logs, public.contrato_auditoria,
  public.agendamento_auditoria, public.security_logs FROM PUBLIC, anon, authenticated;
