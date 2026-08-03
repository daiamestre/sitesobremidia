-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 002: IDENTITY & RBAC
-- ======================================================================

-- 4. Perfis (Roles do Sistema)
CREATE TABLE IF NOT EXISTS public.perfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(50) NOT NULL UNIQUE CHECK (nome IN ('ADMIN', 'GERENTE', 'FINANCEIRO', 'DESIGNER', 'REPRESENTANTE', 'OPERACIONAL', 'CLIENTE')),
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Usuários (Extensão cadastral vinculada a auth.users)
CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  perfil_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE RESTRICT,
  nome VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  telefone VARCHAR(20),
  avatar_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  version INT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  delete_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_usuarios_tenant ON public.usuarios(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON public.usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON public.usuarios(perfil_id);

-- 6. Roles & Permissões (Matriz RBAC)
CREATE TABLE IF NOT EXISTS public.roles_permissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  permissao VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(perfil_id, permissao)
);

-- 7. Representantes Comerciais
CREATE TABLE IF NOT EXISTS public.representantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL UNIQUE REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  codigo_representante INT,
  cpf_cnpj VARCHAR(18) NOT NULL UNIQUE,
  razao_social VARCHAR(150),
  comissao_porcentagem NUMERIC(5,2) DEFAULT 10.00 CHECK (comissao_porcentagem >= 0),
  chave_pix VARCHAR(100),
  banco_nome VARCHAR(50),
  banco_agencia VARCHAR(20),
  banco_conta VARCHAR(20),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  version INT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  delete_reason TEXT,
  UNIQUE(empresa_operadora_id, codigo_representante)
);

CREATE INDEX IF NOT EXISTS idx_representantes_tenant ON public.representantes(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_representantes_usuario ON public.representantes(usuario_id);
