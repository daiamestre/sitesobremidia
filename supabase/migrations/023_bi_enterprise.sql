-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 023: BUSINESS INTELLIGENCE ENTERPRISE (FASE 9.3)
-- ======================================================================

-- 1. Tabela de Histórico de Consultas BI
CREATE TABLE IF NOT EXISTS public.bi_consultas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  consulta TEXT NOT NULL,
  tempo_execucao INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bi_consultas_tenant ON public.bi_consultas(empresa_operadora_id);

-- 2. Tabela de Log de Exportações (PDF, Excel, CSV, Power BI)
CREATE TABLE IF NOT EXISTS public.bi_exportacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  formato VARCHAR(20) NOT NULL CHECK (formato IN ('PDF', 'EXCEL', 'CSV', 'POWER_BI')),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bi_exportacoes_tenant ON public.bi_exportacoes(empresa_operadora_id);

-- 3. Tabela de Agendamentos de Relatórios Automáticos
CREATE TABLE IF NOT EXISTS public.bi_agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  frequencia VARCHAR(20) NOT NULL CHECK (frequencia IN ('DIARIO', 'SEMANAL', 'MENSAL', 'QUARTAL', 'ANUAL')),
  destinatarios JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'PAUSADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bi_agendamentos_tenant ON public.bi_agendamentos(empresa_operadora_id);

-- 4. Tabela de Alertas Inteligentes
CREATE TABLE IF NOT EXISTS public.bi_alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  tipo VARCHAR(50) NOT NULL,
  mensagem TEXT NOT NULL,
  severidade VARCHAR(20) NOT NULL DEFAULT 'MEDIA' CHECK (severidade IN ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA')),
  status VARCHAR(20) NOT NULL DEFAULT 'NOVO' CHECK (status IN ('NOVO', 'LIDO', 'RESOLVIDO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bi_alertas_tenant ON public.bi_alertas(empresa_operadora_id);

-- 5. Tabela de Snapshots Históricos
CREATE TABLE IF NOT EXISTS public.bi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  granularidade VARCHAR(20) NOT NULL CHECK (granularidade IN ('DIARIA', 'MENSAL', 'ANUAL')),
  snapshot_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bi_snapshots_tenant ON public.bi_snapshots(empresa_operadora_id);

-- 6. Tabela de Log de Auditoria Imutável de BI
CREATE TABLE IF NOT EXISTS public.bi_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  evento VARCHAR(40) NOT NULL CHECK (evento IN ('CONSULTA', 'EXPORTACAO', 'DRILLDOWN', 'LOGIN_BI', 'ALERTA')),
  usuario_id UUID REFERENCES public.usuarios(id),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bi_auditoria_tenant ON public.bi_auditoria(empresa_operadora_id);

-- 7. Habilitação RLS Multi-Tenant
ALTER TABLE public.bi_consultas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_exportacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_auditoria ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bi_consultas' AND policyname = 'p_read_bi_consultas') THEN
    CREATE POLICY p_read_bi_consultas ON public.bi_consultas FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bi_exportacoes' AND policyname = 'p_read_bi_exportacoes') THEN
    CREATE POLICY p_read_bi_exportacoes ON public.bi_exportacoes FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bi_agendamentos' AND policyname = 'p_read_bi_agendamentos') THEN
    CREATE POLICY p_read_bi_agendamentos ON public.bi_agendamentos FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bi_alertas' AND policyname = 'p_read_bi_alertas') THEN
    CREATE POLICY p_read_bi_alertas ON public.bi_alertas FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bi_snapshots' AND policyname = 'p_read_bi_snapshots') THEN
    CREATE POLICY p_read_bi_snapshots ON public.bi_snapshots FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bi_auditoria' AND policyname = 'p_read_bi_auditoria') THEN
    CREATE POLICY p_read_bi_auditoria ON public.bi_auditoria FOR SELECT TO authenticated USING (TRUE);
  END IF;
END $$;
