-- ======================================================================
-- BASELINE v1.0.1 - MIGRATION: DATAWAREHOUSE E ANALYTICS
-- Esta migration cria as tabelas de consolidação para os Dashboards
-- ======================================================================

-- 1. dw_operacao
CREATE TABLE IF NOT EXISTS public.dw_operacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  data_referencia DATE NOT NULL,
  total_telas_ativas INT DEFAULT 0,
  total_players_offline INT DEFAULT 0,
  taxa_uptime NUMERIC(5,2) DEFAULT 100.00,
  incidentes_abertos INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dw_operacao_tenant ON public.dw_operacao(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_dw_operacao_data ON public.dw_operacao(data_referencia);

-- 2. dw_receita
CREATE TABLE IF NOT EXISTS public.dw_receita (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  mes_referencia VARCHAR(7) NOT NULL, -- YYYY-MM
  receita_prevista NUMERIC(15,2) DEFAULT 0.00,
  receita_realizada NUMERIC(15,2) DEFAULT 0.00,
  inadimplencia NUMERIC(5,2) DEFAULT 0.00,
  comissoes_pagas NUMERIC(15,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dw_receita_tenant ON public.dw_receita(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_dw_receita_mes ON public.dw_receita(mes_referencia);

-- 3. bi_snapshots
CREATE TABLE IF NOT EXISTS public.bi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  tipo_relatorio VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  gerado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  gerado_por UUID
);
CREATE INDEX IF NOT EXISTS idx_bi_snapshots_tenant ON public.bi_snapshots(empresa_operadora_id);

-- ======================================================================
-- RLS E POLICIES
-- ======================================================================

ALTER TABLE public.dw_operacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dw_receita ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY dw_op_tenant_isolation ON public.dw_operacao AS RESTRICTIVE FOR ALL USING (empresa_operadora_id IN (SELECT o.id FROM public.organizations o WHERE o.id = empresa_operadora_id));
CREATE POLICY dw_op_all ON public.dw_operacao FOR ALL USING (true);

CREATE POLICY dw_rec_tenant_isolation ON public.dw_receita AS RESTRICTIVE FOR ALL USING (empresa_operadora_id IN (SELECT o.id FROM public.organizations o WHERE o.id = empresa_operadora_id));
CREATE POLICY dw_rec_all ON public.dw_receita FOR ALL USING (true);

CREATE POLICY bi_snap_tenant_isolation ON public.bi_snapshots AS RESTRICTIVE FOR ALL USING (empresa_operadora_id IN (SELECT o.id FROM public.organizations o WHERE o.id = empresa_operadora_id));
CREATE POLICY bi_snap_all ON public.bi_snapshots FOR ALL USING (true);
