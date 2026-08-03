-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 005: FINANCEIRO & COMISSÕES
-- ======================================================================

-- 22. Financeiro Lançamentos
CREATE TABLE IF NOT EXISTS public.financeiro_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  valor_total_contrato NUMERIC(12,2) NOT NULL CHECK (valor_total_contrato >= 0),
  numero_parcelas INT NOT NULL DEFAULT 12 CHECK (numero_parcelas > 0),
  status_geral VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status_geral IN ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id)
);

-- 23. Cobranças (Parcelas Faturas)
CREATE TABLE IF NOT EXISTS public.cobrancas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  financeiro_lancamento_id UUID NOT NULL REFERENCES public.financeiro_lancamentos(id) ON DELETE CASCADE,
  numero_parcela INT NOT NULL CHECK (numero_parcela > 0),
  total_parcelas INT NOT NULL CHECK (total_parcelas > 0),
  valor_parcela NUMERIC(12,2) NOT NULL CHECK (valor_parcela >= 0),
  data_vencimento DATE NOT NULL,
  data_pagamento TIMESTAMPTZ,
  status_pagamento VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status_pagamento IN ('PENDING', 'PAID', 'OVERDUE', 'CANCELED')),
  forma_pagamento VARCHAR(30) NOT NULL CHECK (forma_pagamento IN ('PIX', 'BOLETO', 'CREDIT_CARD', 'BANK_TRANSFER', 'MANUAL')),
  link_boleto_pix TEXT,
  comprovante_url TEXT,
  juros_multa NUMERIC(12,2) DEFAULT 0 CHECK (juros_multa >= 0),
  desconto_aplicado NUMERIC(12,2) DEFAULT 0 CHECK (desconto_aplicado >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_cobrancas_vencimento ON public.cobrancas(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_cobrancas_status ON public.cobrancas(status_pagamento);

-- 24. Pagamentos
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cobranca_id UUID NOT NULL REFERENCES public.cobrancas(id) ON DELETE CASCADE,
  valor_pago NUMERIC(12,2) NOT NULL CHECK (valor_pago >= 0),
  data_liquidacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meio_pagamento VARCHAR(50) NOT NULL,
  transacao_id_externo VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id)
);

-- 25. Conciliações
CREATE TABLE IF NOT EXISTS public.conciliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  cobranca_id UUID REFERENCES public.cobrancas(id) ON DELETE SET NULL,
  valor_extrato NUMERIC(12,2) NOT NULL,
  data_extrato DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'CONCILIATED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 26. Histórico Financeiro (Imutável)
CREATE TABLE IF NOT EXISTS public.historico_financeiro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  valor_anterior NUMERIC(12,2) NOT NULL,
  valor_novo NUMERIC(12,2) NOT NULL,
  motivo_alteracao TEXT NOT NULL,
  usuario_responsavel_id UUID NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 27. Comissões dos Representantes
CREATE TABLE IF NOT EXISTS public.comissoes_representantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  representante_id UUID NOT NULL REFERENCES public.representantes(id) ON DELETE RESTRICT,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE RESTRICT,
  cobranca_id UUID REFERENCES public.cobrancas(id) ON DELETE SET NULL,
  valor_base NUMERIC(12,2) NOT NULL CHECK (valor_base >= 0),
  porcentagem_aplicada NUMERIC(5,2) NOT NULL CHECK (porcentagem_aplicada >= 0),
  valor_comissao NUMERIC(12,2) NOT NULL CHECK (valor_comissao >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'PREVISTA' CHECK (status IN ('PREVISTA', 'LIBERADA', 'PAGA', 'CANCELADA')),
  data_pagamento DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_comissoes_rep ON public.comissoes_representantes(representante_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_status ON public.comissoes_representantes(status);
