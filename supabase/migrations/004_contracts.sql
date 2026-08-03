-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 004: PROPOSTAS, CONTRATOS & VERSIONAMENTO
-- ======================================================================

-- 11. Catálogo de Serviços
CREATE TABLE IF NOT EXISTS public.catalogo_servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  codigo_servico VARCHAR(30) NOT NULL,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  valor_tabela NUMERIC(12,2) NOT NULL CHECK (valor_tabela >= 0),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_operadora_id, codigo_servico)
);

-- 12. Planos
CREATE TABLE IF NOT EXISTS public.planos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'CUSTOM')),
  nome VARCHAR(50) NOT NULL,
  duracao_meses INT NOT NULL CHECK (duracao_meses >= 0),
  desconto_porcentagem NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (desconto_porcentagem >= 0),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_operadora_id, tipo)
);

-- 13. Propostas
CREATE TABLE IF NOT EXISTS public.propostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  numero_proposta VARCHAR(40) NOT NULL,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  representante_id UUID NOT NULL REFERENCES public.representantes(id) ON DELETE RESTRICT,
  versao_atual INT NOT NULL DEFAULT 1,
  valor_total NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
  desconto NUMERIC(12,2) DEFAULT 0 CHECK (desconto >= 0),
  valor_final NUMERIC(12,2) NOT NULL CHECK (valor_final >= 0),
  forma_pagamento VARCHAR(30) NOT NULL,
  validade_dias INT NOT NULL DEFAULT 15 CHECK (validade_dias > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED')),
  pdf_url TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id),
  version INT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  delete_reason TEXT,
  UNIQUE(empresa_operadora_id, numero_proposta)
);

CREATE INDEX IF NOT EXISTS idx_propostas_tenant ON public.propostas(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_propostas_cliente ON public.propostas(cliente_id);

-- 14. Proposta Versões
CREATE TABLE IF NOT EXISTS public.proposta_versoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id UUID NOT NULL REFERENCES public.propostas(id) ON DELETE CASCADE,
  numero_versao INT NOT NULL,
  snapshot_dados JSONB NOT NULL,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  UNIQUE(proposta_id, numero_versao)
);

-- 15. Itens da Proposta
CREATE TABLE IF NOT EXISTS public.itens_proposta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id UUID NOT NULL REFERENCES public.propostas(id) ON DELETE CASCADE,
  servico_id UUID NOT NULL REFERENCES public.catalogo_servicos(id) ON DELETE RESTRICT,
  quantidade INT NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario NUMERIC(12,2) NOT NULL CHECK (valor_unitario >= 0),
  desconto NUMERIC(12,2) DEFAULT 0 CHECK (desconto >= 0),
  valor_total NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Contratos (Master Entity of Workflow)
CREATE TABLE IF NOT EXISTS public.contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  numero_contrato VARCHAR(40) NOT NULL,
  numero_contrato_legivel VARCHAR(50),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  representante_id UUID NOT NULL REFERENCES public.representantes(id) ON DELETE RESTRICT,
  proposta_id UUID REFERENCES public.propostas(id) ON DELETE SET NULL,
  plano_id UUID REFERENCES public.planos(id) ON DELETE SET NULL,
  versao_atual INT NOT NULL DEFAULT 1,
  status_workflow VARCHAR(40) NOT NULL DEFAULT 'PROSPECT' CHECK (status_workflow IN ('PROSPECT', 'PROPOSTA_GERADA', 'AGUARDANDO_ASSINATURA', 'AGUARDANDO_PAGAMENTO', 'PAGAMENTO_CONFIRMADO', 'EM_PRODUCAO', 'AGUARDANDO_APROVACAO', 'CAMPANHA_APROVADA', 'CAMPANHA_ATIVA', 'CAMPANHA_FINALIZADA', 'CANCELADO')),
  valor_mensal NUMERIC(12,2) NOT NULL CHECK (valor_mensal >= 0),
  forma_pagamento VARCHAR(30) NOT NULL CHECK (forma_pagamento IN ('PIX', 'BOLETO', 'CREDIT_CARD', 'BANK_TRANSFER')),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id),
  version INT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  delete_reason TEXT,
  UNIQUE(empresa_operadora_id, numero_contrato)
);

CREATE INDEX IF NOT EXISTS idx_contratos_tenant ON public.contratos(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_contratos_cliente ON public.contratos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contratos_status ON public.contratos(status_workflow);

-- 17. Contrato Versões (Imutável)
CREATE TABLE IF NOT EXISTS public.contrato_versoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  numero_versao INT NOT NULL,
  snapshot_dados JSONB NOT NULL,
  motivo_alteracao TEXT NOT NULL,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES public.usuarios(id),
  UNIQUE(contrato_id, numero_versao)
);

-- 18. Itens do Contrato
CREATE TABLE IF NOT EXISTS public.itens_contrato (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  servico_id UUID NOT NULL REFERENCES public.catalogo_servicos(id) ON DELETE RESTRICT,
  quantidade INT NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario NUMERIC(12,2) NOT NULL CHECK (valor_unitario >= 0),
  desconto NUMERIC(12,2) DEFAULT 0 CHECK (desconto >= 0),
  valor_total NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. Pedidos de Inserção (PI)
CREATE TABLE IF NOT EXISTS public.pedidos_insercao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  numero_pi VARCHAR(40) NOT NULL,
  data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_operadora_id, numero_pi)
);

-- 20. Pedidos de Inserção Versões
CREATE TABLE IF NOT EXISTS public.pedidos_insercao_versoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedidos_insercao_id UUID NOT NULL REFERENCES public.pedidos_insercao(id) ON DELETE CASCADE,
  numero_versao INT NOT NULL,
  snapshot_dados JSONB NOT NULL,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  UNIQUE(pedidos_insercao_id, numero_versao)
);

-- 21. Assinaturas Digitais (Opção A - Fase 6.1)
CREATE TABLE IF NOT EXISTS public.assinaturas_digitais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_versao_id UUID NOT NULL REFERENCES public.contrato_versoes(id) ON DELETE CASCADE,
  signatario_nome VARCHAR(150) NOT NULL,
  signatario_email VARCHAR(255) NOT NULL,
  signatario_cpf VARCHAR(14) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SIGNED', 'REJECTED', 'EXPIRED')),
  token_assinatura VARCHAR(100),
  assinado_em TIMESTAMPTZ,
  ip_assinatura VARCHAR(45),
  user_agent_assinatura TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_versao ON public.assinaturas_digitais(contrato_versao_id);
