-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 019: MÓDULO FINANCEIRO ENTERPRISE (FASE 9.1)
-- ======================================================================

-- 1. Tabela de Contas a Receber
CREATE TABLE IF NOT EXISTS public.contas_receber (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  numero_documento VARCHAR(40) NOT NULL,
  vencimento DATE NOT NULL,
  valor_original NUMERIC(12,2) NOT NULL CHECK (valor_original >= 0),
  desconto NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (desconto >= 0),
  juros NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (juros >= 0),
  multa NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (multa >= 0),
  valor_pago NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (valor_pago >= 0),
  saldo NUMERIC(12,2) NOT NULL CHECK (saldo >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' CHECK (
    status IN ('PENDENTE', 'PAGO', 'PARCIAL', 'VENCIDO', 'CANCELADO')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contas_receber_tenant ON public.contas_receber(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_contrato ON public.contas_receber(contrato_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_cliente ON public.contas_receber(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_vencimento ON public.contas_receber(vencimento);

-- 2. Tabela de Registros de Pagamentos
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_receber_id UUID NOT NULL REFERENCES public.contas_receber(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL CHECK (
    tipo IN ('PIX', 'BOLETO', 'CARTÃO', 'TRANSFERÊNCIA', 'DINHEIRO')
  ),
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  data_pagamento TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comprovante_object_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_conta ON public.pagamentos(conta_receber_id);

-- 3. Tabela de Recebimentos e Conciliação Bancária
CREATE TABLE IF NOT EXISTS public.recebimentos_conciliacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pagamento_id UUID NOT NULL REFERENCES public.pagamentos(id) ON DELETE CASCADE,
  gateway VARCHAR(50) NOT NULL DEFAULT 'INTERNO',
  nsu VARCHAR(100),
  txid VARCHAR(100),
  autenticacao TEXT,
  data_conciliacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recebimentos_conciliacao_pagamento ON public.recebimentos_conciliacao(pagamento_id);

-- 4. Tabela de Gestão de Comissões por Perfil
CREATE TABLE IF NOT EXISTS public.comissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE CASCADE,
  conta_receber_id UUID REFERENCES public.contas_receber(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  cargo VARCHAR(30) NOT NULL CHECK (cargo IN ('REPRESENTANTE', 'SUPERVISOR', 'GERENTE')),
  percentual NUMERIC(5,2) NOT NULL CHECK (percentual >= 0 AND percentual <= 100),
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'A_LIBERAR' CHECK (
    status IN ('A_LIBERAR', 'LIBERADO', 'PAGO', 'CANCELADO')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comissoes_tenant ON public.comissoes(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_usuario ON public.comissoes(usuario_id);

-- 5. Tabela de Projeção de Fluxo de Caixa
CREATE TABLE IF NOT EXISTS public.fluxo_caixa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
  categoria VARCHAR(50) NOT NULL DEFAULT 'OPERACIONAL',
  descricao TEXT NOT NULL,
  valor_previsto NUMERIC(12,2) NOT NULL CHECK (valor_previsto >= 0),
  valor_realizado NUMERIC(12,2) DEFAULT 0.00 CHECK (valor_realizado >= 0),
  data_prevista DATE NOT NULL,
  data_realizada DATE,
  saldo_resultante NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_tenant ON public.fluxo_caixa(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_data ON public.fluxo_caixa(data_prevista);

-- 6. Tabela de Log de Auditoria Imutável do Módulo Financeiro
CREATE TABLE IF NOT EXISTS public.financeiro_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  evento VARCHAR(40) NOT NULL CHECK (
    evento IN ('CONTA_CRIADA', 'PAGAMENTO', 'BAIXA', 'ESTORNO', 'COMISSAO', 'CONCILIACAO')
  ),
  usuario_id UUID REFERENCES public.usuarios(id),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financeiro_auditoria_tenant ON public.financeiro_auditoria(empresa_operadora_id);

-- 7. Habilitação RLS Multi-Tenant
ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimentos_conciliacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxo_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_auditoria ENABLE ROW LEVEL SECURITY;

-- Policies RLS
DO $$
BEGIN
  -- contas_receber
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contas_receber' AND policyname = 'p_read_contas_receber') THEN
    CREATE POLICY p_read_contas_receber ON public.contas_receber FOR SELECT TO authenticated
    USING (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR
      public.get_user_empresa_operadora_id(auth.uid()) IS NULL
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contas_receber' AND policyname = 'p_insert_contas_receber') THEN
    CREATE POLICY p_insert_contas_receber ON public.contas_receber FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;

  -- pagamentos
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pagamentos' AND policyname = 'p_read_pagamentos') THEN
    CREATE POLICY p_read_pagamentos ON public.pagamentos FOR SELECT TO authenticated USING (TRUE);
  END IF;

  -- recebimentos_conciliacao
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recebimentos_conciliacao' AND policyname = 'p_read_recebimentos_conciliacao') THEN
    CREATE POLICY p_read_recebimentos_conciliacao ON public.recebimentos_conciliacao FOR SELECT TO authenticated USING (TRUE);
  END IF;

  -- comissoes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comissoes' AND policyname = 'p_read_comissoes') THEN
    CREATE POLICY p_read_comissoes ON public.comissoes FOR SELECT TO authenticated
    USING (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR
      public.get_user_empresa_operadora_id(auth.uid()) IS NULL
    );
  END IF;

  -- fluxo_caixa
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fluxo_caixa' AND policyname = 'p_read_fluxo_caixa') THEN
    CREATE POLICY p_read_fluxo_caixa ON public.fluxo_caixa FOR SELECT TO authenticated
    USING (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR
      public.get_user_empresa_operadora_id(auth.uid()) IS NULL
    );
  END IF;

  -- financeiro_auditoria
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'financeiro_auditoria' AND policyname = 'p_read_financeiro_auditoria') THEN
    CREATE POLICY p_read_financeiro_auditoria ON public.financeiro_auditoria FOR SELECT TO authenticated USING (TRUE);
  END IF;
END $$;
