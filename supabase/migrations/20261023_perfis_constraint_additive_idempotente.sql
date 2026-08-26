-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20261023: CONSTRAINT ADITIVA E IDEMPOTENTE
-- Correção estrutural do RBAC — Portal do Anunciante (Fase 2)
-- ----------------------------------------------------------------------
-- CONTEXTO:
-- A migration 20261022_anunciante_perfil.sql (NUNCA aplicada no Cloud)
-- recriou perfis_nome_check com apenas 8 valores, removendo OWNER,
-- GESTOR, FUNCIONARIO e PARCEIRO. Esta migration SUPERSEDA-a de forma
-- ADITIVA: restaura/preserva TODOS os perfis constitucionais e legados
-- sem remover nenhum valor existente.
-- ----------------------------------------------------------------------
-- PERFIS OBRIGATÓRIOS PRESERVADOS:
--   OWNER, ADMIN, ANUNCIANTE, REPRESENTANTE, GERENTE, FINANCEIRO,
--   GESTOR, FUNCIONARIO, PARCEIRO
-- VALORES LEGADOS TAMBÉM PRESERVADOS (em uso por dados existentes):
--   DESIGNER, OPERACIONAL, CLIENTE
-- ----------------------------------------------------------------------
-- IDEMPOTENTE: pode ser reaplicada sem efeito colateral.
-- NENHUM registro é apagado. Nenhuma migration histórica é alterada.
-- ======================================================================

-- Etapa 1: Garantir que todos os perfis existam como linhas (aditivo)
INSERT INTO public.perfis (nome, descricao, ativo) VALUES
  ('OWNER',        'Proprietário da Plataforma',              true),
  ('ADMIN',        'Administrador do Sistema',                true),
  ('ANUNCIANTE',   'Cliente Anunciante (Portal próprio)',     true),
  ('REPRESENTANTE','Representante Comercial de Vendas',       true),
  ('GERENTE',      'Gestor da Operação',                      true),
  ('FINANCEIRO',   'Responsável pelo Financeiro',             true),
  ('GESTOR',       'Gestor de Mídias',                        true),
  ('FUNCIONARIO',  'Funcionário Operacional',                 true),
  ('PARCEIRO',     'Parceiro Comercial',                      true),
  ('DESIGNER',     'Designer (legado)',                       true),
  ('OPERACIONAL',  'Operacional (legado)',                    true),
  ('CLIENTE',      'Cliente (legado, unificado ao ANUNCIANTE)', true)
ON CONFLICT (nome) DO NOTHING;

-- Etapa 2: Recriar a constraint com o conjunto COMPLETO (união aditiva).
-- Nunca remover valores desta lista em migrations futuras.
ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_nome_check;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_nome_check
  CHECK (nome IN (
    'OWNER',
    'ADMIN',
    'ANUNCIANTE',
    'REPRESENTANTE',
    'GERENTE',
    'FINANCEIRO',
    'GESTOR',
    'FUNCIONARIO',
    'PARCEIRO',
    'DESIGNER',
    'OPERACIONAL',
    'CLIENTE'
  ));

-- Etapa 3: Verificação interna (falha a migration se algum perfil sumir)
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(p, ', ') INTO v_missing
  FROM unnest(ARRAY[
    'OWNER','ADMIN','ANUNCIANTE','REPRESENTANTE','GERENTE',
    'FINANCEIRO','GESTOR','FUNCIONARIO','PARCEIRO'
  ]) AS req(p)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.perfis pf WHERE pf.nome = req.p
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '[RBAC] Perfis constitucionais ausentes apos migration: %', v_missing;
  END IF;
END $$;

-- Etapa 4: Auditoria da operação (schema real de auditoria_logs)
INSERT INTO public.auditoria_logs (usuario_email, acao, entidade_tipo, entidade_id, valor_novo, observacoes)
SELECT 'sistema@sobremidia.com.br', 'UPDATE', 'perfis',
  (SELECT id FROM public.perfis WHERE nome='ANUNCIANTE'),
  jsonb_build_object(
    'migration', '20261023_perfis_constraint_additive_idempotente',
    'perfis_preservados', 12,
    'anunciante_garantido', EXISTS (SELECT 1 FROM public.perfis WHERE nome='ANUNCIANTE')
  ),
  'Fase 2 - constraint aditiva do RBAC: 9 perfis constitucionais + 3 legados preservados'
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema='public' AND table_name='auditoria_logs'
)
AND NOT EXISTS (
  SELECT 1 FROM public.auditoria_logs
  WHERE acao='UPDATE'
    AND entidade_tipo='perfis'
    AND valor_novo->>'migration' = '20261023_perfis_constraint_additive_idempotente'
);
