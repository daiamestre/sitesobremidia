-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 001: CORE & MULTI-TENANCY
-- ======================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Empresa Operadora (Multi-Tenant Master)
CREATE TABLE IF NOT EXISTS public.empresa_operadora (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(150) NOT NULL,
  nome_fantasia VARCHAR(150) NOT NULL,
  cnpj VARCHAR(18) NOT NULL UNIQUE,
  logo_url TEXT,
  dominio_customizado VARCHAR(100),
  email VARCHAR(255) NOT NULL,
  telefone VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  configuracoes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  version INT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  delete_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_empresa_operadora_cnpj ON public.empresa_operadora(cnpj);
CREATE INDEX IF NOT EXISTS idx_empresa_operadora_status ON public.empresa_operadora(status);

-- 2. Configurações da Empresa Operadora
CREATE TABLE IF NOT EXISTS public.configuracoes_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  logo_pdf_url TEXT,
  dados_bancarios_pix JSONB DEFAULT '{}'::jsonb,
  rodape_pdf_contratos TEXT,
  dias_validade_proposta_padrao INT DEFAULT 15 CHECK (dias_validade_proposta_padrao > 0),
  aliquota_imposto_padrao NUMERIC(5,2) DEFAULT 0.00 CHECK (aliquota_imposto_padrao >= 0),
  termos_contratuais_padrao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  version INT NOT NULL DEFAULT 1,
  UNIQUE(empresa_operadora_id)
);

-- 3. Sequências de Numeração Centralizada (Atomic Generator)
CREATE TABLE IF NOT EXISTS public.sequencias_numeracao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  tipo_documento VARCHAR(30) NOT NULL CHECK (tipo_documento IN ('CTR', 'PRP', 'PI', 'CMP', 'OP')),
  ano INT NOT NULL CHECK (ano >= 2024),
  ultimo_valor INT NOT NULL DEFAULT 0 CHECK (ultimo_valor >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_operadora_id, tipo_documento, ano)
);

CREATE INDEX IF NOT EXISTS idx_sequencias_tenant_tipo_ano ON public.sequencias_numeracao(empresa_operadora_id, tipo_documento, ano);

-- Função atômica para geração de números comerciais (ex: SM-CTR-2026-000001)
CREATE OR REPLACE FUNCTION public.gerar_numero_documento(
  p_tenant_id UUID,
  p_tipo VARCHAR(30),
  p_ano INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT
)
RETURNS VARCHAR AS $$
DECLARE
  v_seq INT;
  v_num_formatado VARCHAR(40);
BEGIN
  -- Bloqueio FOR UPDATE para evitar concorrência/colisão
  INSERT INTO public.sequencias_numeracao (empresa_operadora_id, tipo_documento, ano, ultimo_valor)
  VALUES (p_tenant_id, p_tipo, p_ano, 1)
  ON CONFLICT (empresa_operadora_id, tipo_documento, ano)
  DO UPDATE SET ultimo_valor = public.sequencias_numeracao.ultimo_valor + 1, updated_at = NOW()
  RETURNING ultimo_valor INTO v_seq;

  v_num_formatado := 'SM-' || p_tipo || '-' || p_ano::TEXT || '-' || LPAD(v_seq::TEXT, 6, '0');
  RETURN v_num_formatado;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
