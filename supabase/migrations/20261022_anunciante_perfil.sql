-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20261022: garantir ANUNCIANTE na constraint
-- REVISADA (2026-08-25): versão anterior era destrutiva — removia OWNER,
-- GESTOR, FUNCIONARIO e PARCEIRO da constraint perfis_nome_check.
-- Esta versão é idempotente e preserva TODOS os perfis constitucionais
-- (superset da 20261017_anunciante_perfil_e_constraint.sql).
-- ======================================================================

-- Etapa 1: remover constraint antiga de forma idempotente
ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_nome_check;

-- Etapa 2: recriar constraint com lista completa (RBAC 2.0 + legados)
ALTER TABLE public.perfis ADD CONSTRAINT perfis_nome_check
  CHECK (nome IN (
    'OWNER', 'ADMIN', 'GESTOR', 'FUNCIONARIO', 'REPRESENTANTE', 'ANUNCIANTE', 'PARCEIRO',
    -- Legados mantidos para compatibilidade com FKs existentes
    'GERENTE', 'FINANCEIRO', 'DESIGNER', 'OPERACIONAL', 'CLIENTE'
  ));

-- Etapa 3: inserir perfil ANUNCIANTE se não existir (idempotente)
INSERT INTO public.perfis (nome, descricao, ativo)
VALUES ('ANUNCIANTE', 'Anunciante do sistema', true)
ON CONFLICT (nome) DO UPDATE SET ativo = TRUE;
