-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 020: FINANCEIRO ENTERPRISE PLUS (FASE 9.1-B)
-- ======================================================================

-- 1. Tabela de Plano de Contas (Estrutura Contábil Hierárquica)
CREATE TABLE IF NOT EXISTS public.plano_contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nome VARCHAR(100) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ATIVO', 'PASSIVO', 'RECEITA', 'DESPESA')),
  nivel INT NOT NULL DEFAULT 1 CHECK (nivel >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plano_contas_codigo ON public.plano_contas(codigo);

-- Inserção do Plano de Contas Padrão do ERP
INSERT INTO public.plano_contas (codigo, nome, tipo, nivel) VALUES
  ('1.1.01', 'Caixa Geral', 'ATIVO', 3),
  ('1.1.02', 'Bancos Conta Movimento', 'ATIVO', 3),
  ('1.2.01', 'Clientes a Receber', 'ATIVO', 3),
  ('2.1.01', 'Fornecedores a Pagar', 'PASSIVO', 3),
  ('3.1.01', 'Receita de Mídia Signage', 'RECEITA', 3),
  ('4.1.01', 'Despesas Operacionais NOC', 'DESPESA', 3)
ON CONFLICT (codigo) DO NOTHING;

-- 2. Tabela de Centros de Custo
CREATE TABLE IF NOT EXISTS public.centros_custo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  codigo VARCHAR(20) NOT NULL,
  nome VARCHAR(100) NOT NULL,
  cidade VARCHAR(100),
  unidade_id UUID REFERENCES public.unidades(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_centros_custo_tenant ON public.centros_custo(empresa_operadora_id);

-- 3. Tabela do Livro-Razão (General Ledger - Partidas Dobradas)
CREATE TABLE IF NOT EXISTS public.financeiro_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  conta_debito_id UUID REFERENCES public.plano_contas(id) ON DELETE RESTRICT,
  conta_credito_id UUID REFERENCES public.plano_contas(id) ON DELETE RESTRICT,
  centro_custo_id UUID REFERENCES public.centros_custo(id) ON DELETE SET NULL,
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  historico TEXT NOT NULL,
  origem VARCHAR(50) NOT NULL DEFAULT 'RECEBIMENTO',
  origem_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_tenant ON public.financeiro_lancamentos(empresa_operadora_id);

-- 4. Tabela do Motor Fiscal (NFS-e / RPS)
CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE CASCADE,
  numero_rps INT,
  numero_nfse VARCHAR(50),
  valor_servicos NUMERIC(12,2) NOT NULL CHECK (valor_servicos >= 0),
  aliquota_iss NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  valor_iss NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  pis NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  cofins NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'EMITIDA' CHECK (status IN ('RASCUNHO', 'EMITIDA', 'CANCELADA')),
  xml_object_key TEXT,
  pdf_object_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notas_fiscais_tenant ON public.notas_fiscais(empresa_operadora_id);

-- 5. Habilitação RLS Multi-Tenant
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centros_custo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;

-- Policies RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plano_contas' AND policyname = 'p_read_plano_contas') THEN
    CREATE POLICY p_read_plano_contas ON public.plano_contas FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'centros_custo' AND policyname = 'p_read_centros_custo') THEN
    CREATE POLICY p_read_centros_custo ON public.centros_custo FOR SELECT TO authenticated
    USING (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR
      public.get_user_empresa_operadora_id(auth.uid()) IS NULL
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'financeiro_lancamentos' AND policyname = 'p_read_financeiro_lancamentos') THEN
    CREATE POLICY p_read_financeiro_lancamentos ON public.financeiro_lancamentos FOR SELECT TO authenticated
    USING (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR
      public.get_user_empresa_operadora_id(auth.uid()) IS NULL
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notas_fiscais' AND policyname = 'p_read_notas_fiscais') THEN
    CREATE POLICY p_read_notas_fiscais ON public.notas_fiscais FOR SELECT TO authenticated
    USING (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR
      public.get_user_empresa_operadora_id(auth.uid()) IS NULL
    );
  END IF;
END $$;
