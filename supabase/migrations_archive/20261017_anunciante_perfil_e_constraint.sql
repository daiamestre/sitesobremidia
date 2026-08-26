-- ============================================================
-- 20261017_anunciante_perfil_e_constraint.sql
-- ADICAO DO PERFIL ANUNCIANTE E ATUALIZACAO DE CONSTRAINT
-- Modelo: RBAC 2.0 - Perfil Anunciante como 7.avo constitucional
-- ============================================================

-- 1. Remover constraint antiga que nao permite ANUNCIANTE
DO $$ 
BEGIN
  ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_nome_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- 2. Adicionar nova constraint que inclui ANUNCIANTE (junto com todos os perfis constitucionais)
ALTER TABLE public.perfis ADD CONSTRAINT perfis_nome_check 
  CHECK (nome IN (
    'OWNER', 'ADMIN', 'GESTOR', 'FUNCIONARIO', 'REPRESENTANTE', 'ANUNCIANTE', 'PARCEIRO',
    -- Legados mantidos para compatibilidade com FKs existentes
    'GERENTE', 'FINANCEIRO', 'DESIGNER', 'OPERACIONAL', 'CLIENTE'
  ));

-- 3. Inserir perfil ANUNCIANTE se nao existir (compatibilidade com ON CONFLICT)
INSERT INTO public.perfis (nome, descricao, ativo) VALUES 
  ('ANUNCIANTE', 'Cliente Anunciante (Aprovacao de Midia e Consultas)', TRUE)
ON CONFLICT (nome) DO UPDATE SET ativo = TRUE;

-- 4. Log de auditoria da mudanca
INSERT INTO public.auditoria_logs
  (empresa_operadora_id, usuario_id, usuario_email, usuario_role, entidade_tipo, entidade_id,
   acao, status_novo, observacoes)
SELECT 
  NULL::uuid, NULL::uuid, 'system@sobremidia.com.br', 'SYSTEM', 'PERFIL', NULL::uuid,
  'PERFIL_INSERIDO', 'CREATED',
  'Migracao 20261017: Perfil ANUNCIANTE inserido e constraint atualizada para permitir esse perfil.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.perfis WHERE nome = 'ANUNCIANTE'
);