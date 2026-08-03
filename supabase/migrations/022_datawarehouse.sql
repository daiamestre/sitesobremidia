-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 022: DATA WAREHOUSE OPERACIONAL & ANALYTICS (FASE 9.2)
-- ======================================================================

-- 1. Tabela DW Receita (Consolidação Diária)
CREATE TABLE IF NOT EXISTS public.dw_receita (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  cidade VARCHAR(100),
  estado VARCHAR(50),
  unidade VARCHAR(100),
  painel VARCHAR(100),
  cliente VARCHAR(150),
  receita_prevista NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  receita_realizada NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  ticket_medio NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  qtd_contratos INT NOT NULL DEFAULT 0,
  qtd_clientes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dw_receita_tenant ON public.dw_receita(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_dw_receita_data ON public.dw_receita(data);

-- 2. Tabela DW Operação (Indicadores Operacionais)
CREATE TABLE IF NOT EXISTS public.dw_operacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  campanhas_ativas INT NOT NULL DEFAULT 0,
  campanhas_finalizadas INT NOT NULL DEFAULT 0,
  tempo_total_exibicao BIGINT NOT NULL DEFAULT 0,
  proof_of_play BIGINT NOT NULL DEFAULT 0,
  uptime NUMERIC(5,2) NOT NULL DEFAULT 99.90,
  sla NUMERIC(5,2) NOT NULL DEFAULT 99.50,
  players_online INT NOT NULL DEFAULT 0,
  players_offline INT NOT NULL DEFAULT 0,
  alertas INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dw_operacao_tenant ON public.dw_operacao(empresa_operadora_id);

-- 3. Tabela DW Financeiro
CREATE TABLE IF NOT EXISTS public.dw_financeiro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  receita_bruta NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  receita_liquida NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  inadimplencia NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  recebimentos NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  pagamentos NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  saldo NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  fluxo_previsto NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  fluxo_realizado NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  comissoes NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dw_financeiro_tenant ON public.dw_financeiro(empresa_operadora_id);

-- 4. Tabela DW Ocupação da Rede
CREATE TABLE IF NOT EXISTS public.dw_ocupacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  cidade VARCHAR(100),
  unidade VARCHAR(100),
  tela VARCHAR(100),
  painel VARCHAR(100),
  ocupacao_percentual NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  tempo_disponivel BIGINT NOT NULL DEFAULT 86400,
  tempo_ocupado BIGINT NOT NULL DEFAULT 0,
  tempo_livre BIGINT NOT NULL DEFAULT 86400,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dw_ocupacao_tenant ON public.dw_ocupacao(empresa_operadora_id);

-- 5. Tabela DW Comercial (KPIs de Vendas & SaaS)
CREATE TABLE IF NOT EXISTS public.dw_comercial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  novos_clientes INT NOT NULL DEFAULT 0,
  propostas INT NOT NULL DEFAULT 0,
  contratos INT NOT NULL DEFAULT 0,
  conversao NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  ticket NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  cac NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  ltv NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  churn NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  retencao NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dw_comercial_tenant ON public.dw_comercial(empresa_operadora_id);

-- 6. Tabela de Log de Auditoria Analítica Imutável
CREATE TABLE IF NOT EXISTS public.analytics_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  evento VARCHAR(40) NOT NULL CHECK (evento IN ('VIEW_REFRESH', 'EXPORT', 'CONSULTA', 'ERRO')),
  usuario_id UUID REFERENCES public.usuarios(id),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_auditoria_tenant ON public.analytics_auditoria(empresa_operadora_id);

-- 7. Views Analíticas em Tempo Real
CREATE OR REPLACE VIEW public.mv_receita_mensal AS
SELECT
  empresa_operadora_id,
  competencia,
  SUM(valor_original) AS receita_bruta,
  SUM(valor_recebido) AS receita_recebida,
  SUM(saldo) AS saldo_pendente
FROM public.contas_receber
GROUP BY empresa_operadora_id, competencia;

CREATE OR REPLACE VIEW public.mv_player_health AS
SELECT
  p.empresa_operadora_id,
  COUNT(p.id) AS total_players,
  COUNT(CASE WHEN p.status = 'ONLINE' THEN 1 END) AS players_online,
  COUNT(CASE WHEN p.status = 'OFFLINE' THEN 1 END) AS players_offline
FROM public.players p
GROUP BY p.empresa_operadora_id;

-- 8. Habilitação de RLS Multi-Tenant
ALTER TABLE public.dw_receita ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dw_operacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dw_financeiro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dw_ocupacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dw_comercial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_auditoria ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dw_receita' AND policyname = 'p_read_dw_receita') THEN
    CREATE POLICY p_read_dw_receita ON public.dw_receita FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dw_operacao' AND policyname = 'p_read_dw_operacao') THEN
    CREATE POLICY p_read_dw_operacao ON public.dw_operacao FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dw_financeiro' AND policyname = 'p_read_dw_financeiro') THEN
    CREATE POLICY p_read_dw_financeiro ON public.dw_financeiro FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dw_ocupacao' AND policyname = 'p_read_dw_ocupacao') THEN
    CREATE POLICY p_read_dw_ocupacao ON public.dw_ocupacao FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dw_comercial' AND policyname = 'p_read_dw_comercial') THEN
    CREATE POLICY p_read_dw_comercial ON public.dw_comercial FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'analytics_auditoria' AND policyname = 'p_read_analytics_auditoria') THEN
    CREATE POLICY p_read_analytics_auditoria ON public.analytics_auditoria FOR SELECT TO authenticated USING (TRUE);
  END IF;
END $$;
