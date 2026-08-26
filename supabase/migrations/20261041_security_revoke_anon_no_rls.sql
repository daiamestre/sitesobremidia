-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261041
-- SEGURANÇA: revoga SELECT anônimo em tabelas sem RLS com dados sensíveis
-- ======================================================================
-- Reauditoria (missão Fase 17, §10) constatou 19 tabelas públicas sem RLS
-- e COM grant de SELECT a `anon` — legíveis via REST sem autenticação.
-- Destas, 11 carregam domínio sensível/operacional. Nenhuma é consumida
-- por fluxo anônimo legítimo: o Player consome SOMENTE RPCs SECURITY
-- DEFINER; o Dashboard sempre atua autenticado.
--
-- Ação mínima e reversível: REVOKE SELECT FROM anon.
--  - Tabelas usadas pelo app (autenticado): operacoes, itens_contrato,
--    itens_proposta, conciliacoes → mantêm acesso authenticated.
--  - Tabelas sem referência no frontend: acesso também revogado de
--    authenticated até receberem RLS dedicada (pendência documentada).
-- service_role NÃO é tocado (Edge Functions preservadas).
-- Config pública (feature_flags, planos, catalogo_servicos, roles_permissoes,
-- perfis) permanece legível — dado não sensível.
-- ======================================================================

-- Grupo 1 — usado pelo app (mantém authenticated; corta anon)
REVOKE SELECT ON public.operacoes FROM anon;
REVOKE SELECT ON public.itens_contrato FROM anon;
REVOKE SELECT ON public.itens_proposta FROM anon;
REVOKE SELECT ON public.conciliacoes FROM anon;

-- Grupo 2 — sem uso no frontend (corta anon + authenticated)
REVOKE SELECT ON public.historico_financeiro FROM anon, authenticated;
REVOKE SELECT ON public.assinaturas_digitais FROM anon, authenticated;
REVOKE SELECT ON public.job_tentativas FROM anon, authenticated;
REVOKE SELECT ON public.timeline FROM anon, authenticated;
REVOKE SELECT ON public.visita_checkins FROM anon, authenticated;
REVOKE SELECT ON public.proposta_versoes FROM anon, authenticated;
REVOKE SELECT ON public.pedidos_insercao_versoes FROM anon, authenticated;
REVOKE SELECT ON public.storage_migration_map FROM anon, authenticated;
REVOKE SELECT ON public.sequencias_numeracao FROM anon, authenticated;

-- GATE: nenhuma das tabelas do grupo sensível pode seguir legível por anon
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'operacoes','itens_contrato','itens_proposta','conciliacoes',
    'historico_financeiro','assinaturas_digitais','job_tentativas',
    'timeline','visita_checkins','proposta_versoes',
    'pedidos_insercao_versoes','storage_migration_map','sequencias_numeracao'
  ] LOOP
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'GATE: % ainda legível por anon', t;
    END IF;
  END LOOP;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261041','security_revoke_anon_no_rls','{}')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

NOTIFY pgrst, 'reload schema';
