-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 021: COBRANÇA, GATEWAYS, DRE E REGRAS FINANCEIRAS
-- ======================================================================

-- 1. Tabela de Boletos Bancários
CREATE TABLE IF NOT EXISTS public.boletos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  conta_receber_id UUID NOT NULL REFERENCES public.contas_receber(id) ON DELETE CASCADE,
  linha_digitavel VARCHAR(100),
  codigo_barras VARCHAR(100),
  nosso_numero VARCHAR(50),
  pdf_r2 TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'GERADO' CHECK (status IN ('GERADO', 'PAGO', 'VENCIDO', 'CANCELADO')),
  vencimento DATE NOT NULL,
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  gateway VARCHAR(50) NOT NULL DEFAULT 'BANCO_DO_BRASIL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_boletos_tenant ON public.boletos(empresa_operadora_id);

-- 2. Tabela de Cobranças PIX
CREATE TABLE IF NOT EXISTS public.pix_cobrancas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  conta_receber_id UUID NOT NULL REFERENCES public.contas_receber(id) ON DELETE CASCADE,
  txid VARCHAR(100) NOT NULL,
  payload TEXT,
  qrcode TEXT,
  imagem_qrcode TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'CONCLUIDA', 'EXPIRADA', 'REMOVIDA')),
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  expiracao INT NOT NULL DEFAULT 3600,
  gateway VARCHAR(50) NOT NULL DEFAULT 'GERENCISNET',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pix_tenant ON public.pix_cobrancas(empresa_operadora_id);

-- 3. Tabela de Configuração de Gateways de Pagamento
CREATE TABLE IF NOT EXISTS public.gateways_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  nome VARCHAR(100) NOT NULL,
  provedor VARCHAR(50) NOT NULL CHECK (
    provedor IN ('BANCO_DO_BRASIL', 'BRADESCO', 'SANTANDER', 'ITAU', 'SICOOB', 'ASAAS', 'MERCADO_PAGO', 'GERENCIANET', 'STRIPE', 'PAGSEGURO', 'PAGARME')
  ),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  credenciais JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateways_tenant ON public.gateways_pagamento(empresa_operadora_id);

-- 4. Tabela de Log de Webhooks Recebidos
CREATE TABLE IF NOT EXISTS public.webhook_pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  gateway VARCHAR(50) NOT NULL,
  headers JSONB DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  assinatura TEXT,
  processado BOOLEAN NOT NULL DEFAULT FALSE,
  erro TEXT,
  tentativas INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_gateway ON public.webhook_pagamentos(gateway);

-- 5. Tabela de Notificações da Régua de Cobrança
CREATE TABLE IF NOT EXISTS public.financeiro_notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH')),
  status VARCHAR(20) NOT NULL DEFAULT 'ENVIADO' CHECK (status IN ('PENDENTE', 'ENVIADO', 'FALHA')),
  destinatario VARCHAR(150) NOT NULL,
  mensagem TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_tenant ON public.financeiro_notificacoes(empresa_operadora_id);

-- 6. Tabela de Configurações da Régua de Cobrança
CREATE TABLE IF NOT EXISTS public.financeiro_configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL UNIQUE REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  dias_aviso INT NOT NULL DEFAULT 5,
  dias_bloqueio INT NOT NULL DEFAULT 30,
  percentual_multa NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  percentual_juros NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  percentual_desconto NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  percentuais_comissao JSONB DEFAULT '{"representante": 5, "supervisor": 2, "gerente": 1}'::jsonb,
  gateways_ativos JSONB DEFAULT '["ASAAS", "GERENCIANET"]'::jsonb,
  templates_cobranca JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Tabela de Regras Dinâmicas de Comissão
CREATE TABLE IF NOT EXISTS public.regras_comissao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  nome VARCHAR(100) NOT NULL,
  cargo VARCHAR(30) NOT NULL CHECK (cargo IN ('REPRESENTANTE', 'SUPERVISOR', 'GERENTE')),
  tipo VARCHAR(20) NOT NULL DEFAULT 'PERCENTUAL' CHECK (tipo IN ('PERCENTUAL', 'VALOR_FIXO', 'FAIXA')),
  percentual NUMERIC(5,2) DEFAULT 0.00,
  valor_fixo NUMERIC(12,2) DEFAULT 0.00,
  faixa_minima NUMERIC(12,2) DEFAULT 0.00,
  faixa_maxima NUMERIC(12,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regras_comissao_tenant ON public.regras_comissao(empresa_operadora_id);

-- 8. Habilitação RLS Multi-Tenant
ALTER TABLE public.boletos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pix_cobrancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gateways_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regras_comissao ENABLE ROW LEVEL SECURITY;

-- Policies RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'boletos' AND policyname = 'p_read_boletos') THEN
    CREATE POLICY p_read_boletos ON public.boletos FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pix_cobrancas' AND policyname = 'p_read_pix_cobrancas') THEN
    CREATE POLICY p_read_pix_cobrancas ON public.pix_cobrancas FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gateways_pagamento' AND policyname = 'p_read_gateways_pagamento') THEN
    CREATE POLICY p_read_gateways_pagamento ON public.gateways_pagamento FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'webhook_pagamentos' AND policyname = 'p_read_webhook_pagamentos') THEN
    CREATE POLICY p_read_webhook_pagamentos ON public.webhook_pagamentos FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'financeiro_notificacoes' AND policyname = 'p_read_financeiro_notificacoes') THEN
    CREATE POLICY p_read_financeiro_notificacoes ON public.financeiro_notificacoes FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'financeiro_configuracoes' AND policyname = 'p_read_financeiro_configuracoes') THEN
    CREATE POLICY p_read_financeiro_configuracoes ON public.financeiro_configuracoes FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'regras_comissao' AND policyname = 'p_read_regras_comissao') THEN
    CREATE POLICY p_read_regras_comissao ON public.regras_comissao FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;
END $$;
