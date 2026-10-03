-- F-125 — Fecha tabelas que estavam abertas a qualquer pessoa com a chave pública do site.
-- Achado da validação global:
--   * perfis (OWNER, ADMIN, ANUNCIANTE…): sem proteção por linha e com permissão de alterar/apagar para visitante
--     anônimo. Renomear um perfil daria poderes de administrador a todos os usuários daquele perfil; apagar
--     derrubaria o sistema.
--   * contrato_versoes: leitura e gravação liberadas a qualquer visitante (texto completo dos contratos e dados
--     dos clientes de todas as empresas).
--   * 13 tabelas antigas, vazias e sem uso pelo sistema, abertas para gravação anônima.
-- Só restringe: nada do que o painel, as funções do servidor ou o Player usam deixa de funcionar.

-- 1) perfis: todos os usuários logados leem (o sistema resolve o nome do perfil); ninguém altera pela API.
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.perfis FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS perfis_leitura ON public.perfis;
CREATE POLICY perfis_leitura ON public.perfis FOR SELECT TO authenticated USING (true);

-- 2) contrato_versoes: enxerga e grava versão quem enxerga o contrato (a regra do contrato decide).
DROP POLICY IF EXISTS p_select_contrato_versoes ON public.contrato_versoes;
DROP POLICY IF EXISTS p_insert_contrato_versoes ON public.contrato_versoes;
DROP POLICY IF EXISTS contrato_versoes_leitura ON public.contrato_versoes;
DROP POLICY IF EXISTS contrato_versoes_gravacao ON public.contrato_versoes;
CREATE POLICY contrato_versoes_leitura ON public.contrato_versoes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contratos c WHERE c.id = contrato_versoes.contrato_id));
CREATE POLICY contrato_versoes_gravacao ON public.contrato_versoes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.contratos c WHERE c.id = contrato_versoes.contrato_id));
REVOKE ALL ON public.contrato_versoes FROM PUBLIC, anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.contrato_versoes FROM authenticated;

-- 3) tabelas antigas sem uso: só o servidor acessa.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assinaturas_digitais', 'conciliacoes', 'feature_flags', 'feature_flags_empresa', 'historico_financeiro',
                           'job_tentativas', 'pedidos_insercao_versoes', 'planos', 'roles_permissoes', 'sequencias_numeracao',
                           'storage_migration_map', 'timeline', 'visita_checkins']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;
