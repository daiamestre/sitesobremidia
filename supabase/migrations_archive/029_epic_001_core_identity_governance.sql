-- ======================================================================
-- SOBRE MÍDIA ERP - MIGRATION 029: GOVERNANÇA E IDENTIDADE CORPORATIVA (EPIC 001 - SPRINT 1)
-- ======================================================================
-- Constituição Técnica do Sistema & Aditivo Nº 01 Homologados e Congelados.
-- Esta migration consolida a estrutura oficial do Núcleo de Identidade:
-- 1. Unificação dos 7 perfis corporativos (OWNER, ADMIN, GESTOR, FUNCIONÁRIO, REPRESENTANTE, ANUNCIANTE, PARCEIRO)
-- 2. Rastreabilidade patrimonial completa (created/updated/approved/suspended/deleted _by e _at)
-- 3. Consolidação do ciclo de vida em 7 estados institucionais
-- 4. Proteção soberana e incondicional do perfil OWNER no backend via Triggers & RLS.
-- ======================================================================

-- 1. Evolução da Tabela de Perfis (RBAC 2.0 - 7 Perfis Constitucionais)
-- Removendo constraint antiga de check para estender com os perfis do Aditivo 01 mantendo compatibilidade
DO $$ 
BEGIN
  ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_nome_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.perfis ADD CONSTRAINT perfis_nome_check 
  CHECK (nome IN (
    'OWNER', 'ADMIN', 'GESTOR', 'FUNCIONARIO', 'REPRESENTANTE', 'ANUNCIANTE', 'PARCEIRO',
    -- Legados mantidos temporariamente para não quebrar FKs durante transição suave:
    'GERENTE', 'FINANCEIRO', 'DESIGNER', 'OPERACIONAL', 'CLIENTE'
  ));

-- Inserindo os perfis corporativos oficiais caso não existam
INSERT INTO public.perfis (nome, descricao, ativo) VALUES 
  ('OWNER', 'Proprietário Geral da Plataforma Operacional Sobre Mídia (Soberano)', TRUE),
  ('ADMIN', 'Administrador Geral da Plataforma (Gestão de Módulos e Cadastros)', TRUE),
  ('GESTOR', 'Gestor de Departamento (Comercial, Operações, Financeiro, Mídia)', TRUE),
  ('FUNCIONARIO', 'Funcionário Interno Operacional e Administrativo', TRUE),
  ('REPRESENTANTE', 'Representante Comercial e Vendas Externas', TRUE),
  ('ANUNCIANTE', 'Cliente Anunciante (Aprovação de Mídia e Consultas)', TRUE),
  ('PARCEIRO', 'Parceiro de Rede e Proprietário de Estabelecimentos com Telas', TRUE)
ON CONFLICT (nome) DO UPDATE SET ativo = TRUE;

-- 2. Evolução da Tabela de Usuários: Rastreabilidade, Hierarquia e Ciclo de Vida
ALTER TABLE public.usuarios 
  ADD COLUMN IF NOT EXISTS status_ciclo_vida VARCHAR(30) DEFAULT 'ACTIVE' NOT NULL,
  ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- Aplicando verificação do Ciclo de Vida Oficial (7 Estados)
DO $$ 
BEGIN
  ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS chk_usuarios_ciclo_vida;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.usuarios ADD CONSTRAINT chk_usuarios_ciclo_vida 
  CHECK (status_ciclo_vida IN ('PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'INACTIVE', 'DELETED'));

-- Atualizando tabela solicitacoes_acesso para suportar os novos estados
DO $$ 
BEGIN
  ALTER TABLE public.solicitacoes_acesso DROP CONSTRAINT IF EXISTS solicitacoes_acesso_status_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.solicitacoes_acesso ADD CONSTRAINT solicitacoes_acesso_status_check 
  CHECK (status IN ('PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'INACTIVE', 'DELETED'));

-- 3. Índices de alta performance para consulta hierárquica e de RLS
CREATE INDEX IF NOT EXISTS idx_usuarios_status_ciclo ON public.usuarios(status_ciclo_vida);
CREATE INDEX IF NOT EXISTS idx_usuarios_responsavel ON public.usuarios(responsavel_id);

-- ======================================================================
-- 4. PROTEÇÃO DEFINITIVA DO OWNER NO BACKEND (ZERO-TRUST ENGINE)
-- ======================================================================

-- Função Trigger: Blindagem incondicional do perfil e usuários OWNER contra rebaixamento, suspensão ou exclusão
CREATE OR REPLACE FUNCTION public.fn_protect_owner_account()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_role_id UUID;
  v_current_role_id UUID;
BEGIN
  -- Identifica o UUID da role OWNER no sistema
  SELECT id INTO v_owner_role_id FROM public.perfis WHERE nome = 'OWNER' LIMIT 1;
  
  IF v_owner_role_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Se for operação na tabela de PERFIS: Impede desativação, alteração ou exclusão do registro 'OWNER'
  IF TG_TABLE_NAME = 'perfis' THEN
    IF OLD.nome = 'OWNER' THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION '[ERRO CONSTITUCIONAL] O perfil OWNER não pode ser excluído do sistema por nenhuma autoridade.';
      ELSIF TG_OP = 'UPDATE' AND (NEW.nome != 'OWNER' OR NEW.ativo = FALSE) THEN
        RAISE EXCEPTION '[ERRO CONSTITUCIONAL] O perfil OWNER não pode ser desativado ou renomeado.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Se for operação na tabela de USUARIO: Protege usuário constituído com a patente OWNER
  IF TG_TABLE_NAME = 'usuarios' THEN
    IF OLD.perfil_id = v_owner_role_id THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION '[ERRO CONSTITUCIONAL] A conta do OWNER não pode ser excluída do sistema.';
      ELSIF TG_OP = 'UPDATE' THEN
        -- 1. Impede rebaixamento (alteração para outra role)
        IF NEW.perfil_id != OLD.perfil_id THEN
          RAISE EXCEPTION '[ERRO CONSTITUCIONAL] Tentativa de rebaixar a conta OWNER bloqueada pelo motor governamental do ERP.';
        END IF;
        -- 2. Impede suspensão, bloqueio ou exclusão lógica do OWNER
        IF NEW.status_ciclo_vida IN ('SUSPENDED', 'REJECTED', 'INACTIVE', 'DELETED') OR NEW.ativo = FALSE OR NEW.deleted_at IS NOT NULL THEN
          RAISE EXCEPTION '[ERRO CONSTITUCIONAL] A conta OWNER é imune a suspensão, reativação de bloqueios ou exclusão lógica no ciclo de vida.';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vinculando triggers de proteção do OWNER às tabelas
DROP TRIGGER IF EXISTS trg_protect_owner_perfis ON public.perfis;
CREATE TRIGGER trg_protect_owner_perfis
  BEFORE UPDATE OR DELETE ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.fn_protect_owner_account();

DROP TRIGGER IF EXISTS trg_protect_owner_usuarios ON public.usuarios;
CREATE TRIGGER trg_protect_owner_usuarios
  BEFORE UPDATE OR DELETE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_protect_owner_account();

-- ======================================================================
-- 5. POLÍTICAS RLS E SEGURANÇA DA MATRIZ GOVERNAMENTAL
-- ======================================================================

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

-- Política de Consulta: OWNER e ADMIN enxergam todos os perfis e usuários do tenant
DROP POLICY IF EXISTS p_read_perfis_auth ON public.perfis;
CREATE POLICY p_read_perfis_auth ON public.perfis
  FOR SELECT TO authenticated USING (TRUE);

-- Política de Segurança: Apenas OWNER e ADMIN criam ou editam novos papéis ou usuários subordinados
DROP POLICY IF EXISTS p_write_usuarios_admin_owner ON public.usuarios;
CREATE POLICY p_write_usuarios_admin_owner ON public.usuarios
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      JOIN public.perfis p ON p.id = u.perfil_id
      WHERE u.id = auth.uid() AND p.nome IN ('OWNER', 'ADMIN')
    )
  );

-- Garantindo permissões básicas da suíte na tabela roles_permissoes
INSERT INTO public.roles_permissoes (perfil_id, permissao)
SELECT p.id, perm
FROM public.perfis p,
UNNEST(ARRAY['system.manage', 'users.manage', 'rbac.manage', 'audit.view', 'tenant.config']) AS perm
WHERE p.nome = 'OWNER'
ON CONFLICT (perfil_id, permissao) DO NOTHING;
