-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 003: CRM, CLIENTES & EMPRESAS
-- ======================================================================

-- 8. Clientes
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  representante_id UUID NOT NULL REFERENCES public.representantes(id) ON DELETE RESTRICT,
  codigo_cliente INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PROSPECT' CHECK (status IN ('PROSPECT', 'CONTACTED', 'PROPOSAL_SENT', 'ACTIVE', 'INACTIVE', 'CANCELED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id),
  version INT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  delete_reason TEXT,
  UNIQUE(empresa_operadora_id, codigo_cliente)
);

CREATE INDEX IF NOT EXISTS idx_clientes_tenant ON public.clientes(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_clientes_representante ON public.clientes(representante_id);
CREATE INDEX IF NOT EXISTS idx_clientes_status ON public.clientes(status);

-- 9. Empresas (Pessoas Jurídicas / Filiais)
CREATE TABLE IF NOT EXISTS public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  razao_social VARCHAR(150) NOT NULL,
  nome_fantasia VARCHAR(150) NOT NULL,
  cnpj VARCHAR(18) NOT NULL UNIQUE,
  segmento VARCHAR(80),
  telefone VARCHAR(20),
  whatsapp VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  cep VARCHAR(9),
  logradouro VARCHAR(150),
  numero VARCHAR(20),
  complemento VARCHAR(50),
  bairro VARCHAR(100),
  cidade VARCHAR(100),
  estado VARCHAR(2),
  representante_legal VARCHAR(150),
  cargo_representante VARCHAR(80),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id),
  version INT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  delete_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_empresas_cliente ON public.empresas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON public.empresas(cnpj);
CREATE INDEX IF NOT EXISTS idx_empresas_cidade_estado ON public.empresas(cidade, estado);

-- 10. Contatos
CREATE TABLE IF NOT EXISTS public.contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  cargo VARCHAR(80) NOT NULL,
  email VARCHAR(255) NOT NULL,
  telefone VARCHAR(20) NOT NULL,
  is_principal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_contatos_empresa ON public.contatos(empresa_id);
