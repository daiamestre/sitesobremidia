-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 019: ARQUITETURA FINANCEIRA ENTERPRISE (FASE 9.1-A)
-- ======================================================================

-- 1. Função PL/pgSQL de Numeração Atômica de Recebíveis com Advisory Lock
CREATE OR REPLACE FUNCTION public.fn_gerar_numero_recebivel_atomo(p_empresa_operadora_id UUID)
RETURNS VARCHAR(40)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ano VARCHAR(4);
  v_proximo_num INT;
  v_numero_final VARCHAR(40);
BEGIN
  -- Lock transacional por tenant para impedir colisão concorrente
  PERFORM pg_advisory_xact_lock(hashtext('receivable_code_' || p_empresa_operadora_id::text));

  v_ano := TO_CHAR(NOW(), 'YYYY');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(numero_documento FROM 'REC-[0-9]{4}-([0-9]{6})') AS INT)
  ), 0) + 1
  INTO v_proximo_num
  FROM public.contas_receber
  WHERE empresa_operadora_id = p_empresa_operadora_id
    AND numero_documento LIKE 'REC-' || v_ano || '-%';

  v_numero_final := 'REC-' || v_ano || '-' || LPAD(v_proximo_num::text, 6, '0');
  RETURN v_numero_final;
END;
$$;

-- 2. Tabela Principal de Contas a Receber
CREATE TABLE IF NOT EXISTS public.contas_receber (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  numero_documento VARCHAR(40) NOT NULL,
  competencia VARCHAR(7) NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM'),
  vencimento DATE NOT NULL,
  valor_original NUMERIC(12,2) NOT NULL CHECK (valor_original >= 0),
  desconto NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (desconto >= 0),
  juros NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (juros >= 0),
  multa NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (multa >= 0),
  valor_recebido NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (valor_recebido >= 0),
  saldo NUMERIC(12,2) NOT NULL CHECK (saldo >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' CHECK (
    status IN ('PENDENTE', 'PARCIAL', 'PAGO', 'VENCIDO', 'CANCELADO')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contas_receber_tenant ON public.contas_receber(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_contrato ON public.contas_receber(contrato_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_cliente ON public.contas_receber(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_vencimento ON public.contas_receber(vencimento);

-- 3. Tabela de Parcelamento
CREATE TABLE IF NOT EXISTS public.parcelas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_receber_id UUID NOT NULL REFERENCES public.contas_receber(id) ON DELETE CASCADE,
  numero_parcela INT NOT NULL CHECK (numero_parcela >= 1),
  vencimento DATE NOT NULL,
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' CHECK (
    status IN ('PENDENTE', 'PARCIAL', 'PAGO', 'VENCIDO', 'CANCELADO')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parcelas_conta ON public.parcelas(conta_receber_id);

-- 4. Tabela de Pagamentos Registrados
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_receber_id UUID NOT NULL REFERENCES public.contas_receber(id) ON DELETE CASCADE,
  parcela_id UUID REFERENCES public.parcelas(id) ON DELETE SET NULL,
  tipo VARCHAR(30) NOT NULL CHECK (
    tipo IN ('PIX', 'BOLETO', 'CARTÃO', 'TED', 'DOC', 'TRANSFERÊNCIA', 'DINHEIRO')
  ),
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  data_pagamento TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comprovante_object_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_conta ON public.pagamentos(conta_receber_id);

-- 5. Tabela de Conciliações Bancárias
CREATE TABLE IF NOT EXISTS public.conciliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pagamento_id UUID NOT NULL REFERENCES public.pagamentos(id) ON DELETE CASCADE,
  gateway VARCHAR(50) NOT NULL DEFAULT 'INTERNO',
  txid VARCHAR(100),
  nsu VARCHAR(100),
  codigo_bancario VARCHAR(50),
  comprovante_key TEXT,
  data_liquidacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_conciliador_id UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conciliacoes_pagamento ON public.conciliacoes(pagamento_id);

-- 6. Tabela de Gestão de Comissões por Perfil
CREATE TABLE IF NOT EXISTS public.comissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE CASCADE,
  conta_receber_id UUID REFERENCES public.contas_receber(id) ON DELETE CASCADE,
  representante_id UUID REFERENCES public.usuarios(id),
  supervisor_id UUID REFERENCES public.usuarios(id),
  gerente_id UUID REFERENCES public.usuarios(id),
  percentual NUMERIC(5,2) NOT NULL CHECK (percentual >= 0 AND percentual <= 100),
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  competencia VARCHAR(7) NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM'),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' CHECK (
    status IN ('PENDENTE', 'LIBERADA', 'PAGA', 'CANCELADA')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comissoes_tenant ON public.comissoes(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_rep ON public.comissoes(representante_id);

-- 7. Tabela de Projeção de Fluxo de Caixa
CREATE TABLE IF NOT EXISTS public.fluxo_caixa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
  categoria VARCHAR(50) NOT NULL DEFAULT 'OPERACIONAL',
  descricao TEXT NOT NULL,
  saldo_diario NUMERIC(12,2) DEFAULT 0.00,
  saldo_mensal NUMERIC(12,2) DEFAULT 0.00,
  saldo_anual NUMERIC(12,2) DEFAULT 0.00,
  valor_previsto NUMERIC(12,2) NOT NULL CHECK (valor_previsto >= 0),
  valor_realizado NUMERIC(12,2) DEFAULT 0.00 CHECK (valor_realizado >= 0),
  data_prevista DATE NOT NULL,
  data_realizada DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_tenant ON public.fluxo_caixa(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_data ON public.fluxo_caixa(data_prevista);

-- 8. Tabela de Log de Auditoria Imutável do Módulo Financeiro
CREATE TABLE IF NOT EXISTS public.financeiro_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  evento VARCHAR(40) NOT NULL CHECK (
    evento IN ('CONTA_CRIADA', 'PARCELA_GERADA', 'PAGAMENTO', 'ESTORNO', 'CONCILIACAO', 'COMISSAO', 'BAIXA', 'CANCELAMENTO')
  ),
  usuario_id UUID REFERENCES public.usuarios(id),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financeiro_auditoria_tenant ON public.financeiro_auditoria(empresa_operadora_id);

-- 9. Habilitação de RLS Multi-Tenant
ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conciliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxo_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_auditoria ENABLE ROW LEVEL SECURITY;

-- Policies RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contas_receber' AND policyname = 'p_read_contas_receber') THEN
    CREATE POLICY p_read_contas_receber ON public.contas_receber FOR SELECT TO authenticated
    USING (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR
      public.get_user_empresa_operadora_id(auth.uid()) IS NULL
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parcelas' AND policyname = 'p_read_parcelas') THEN
    CREATE POLICY p_read_parcelas ON public.parcelas FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pagamentos' AND policyname = 'p_read_pagamentos') THEN
    CREATE POLICY p_read_pagamentos ON public.pagamentos FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conciliacoes' AND policyname = 'p_read_conciliacoes') THEN
    CREATE POLICY p_read_conciliacoes ON public.conciliacoes FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comissoes' AND policyname = 'p_read_comissoes') THEN
    CREATE POLICY p_read_comissoes ON public.comissoes FOR SELECT TO authenticated
    USING (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR
      public.get_user_empresa_operadora_id(auth.uid()) IS NULL
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fluxo_caixa' AND policyname = 'p_read_fluxo_caixa') THEN
    CREATE POLICY p_read_fluxo_caixa ON public.fluxo_caixa FOR SELECT TO authenticated
    USING (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR
      public.get_user_empresa_operadora_id(auth.uid()) IS NULL
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'financeiro_auditoria' AND policyname = 'p_read_financeiro_auditoria') THEN
    CREATE POLICY p_read_financeiro_auditoria ON public.financeiro_auditoria FOR SELECT TO authenticated USING (TRUE);
  END IF;
END $$;
