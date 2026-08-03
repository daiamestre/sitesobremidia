-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 027: CORPORATE AI & SIGNAGE INTELLIGENCE (FASE 9.7)
-- ======================================================================

-- 1. Tabela de Registro de Modelos de IA
CREATE TABLE IF NOT EXISTS public.ai_modelos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  modelo VARCHAR(100) NOT NULL,
  versao VARCHAR(20) NOT NULL DEFAULT 'v2.0',
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'TREINANDO', 'DEPRECADO')),
  fornecedor VARCHAR(50) NOT NULL DEFAULT 'GEMINI',
  acuracia NUMERIC(5, 2) DEFAULT 98.50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_modelos_tenant ON public.ai_modelos(empresa_operadora_id);

-- 2. Tabela de Predições Geradas pela IA
CREATE TABLE IF NOT EXISTS public.ai_predicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  previsao JSONB NOT NULL DEFAULT '{}'::jsonb,
  confianca NUMERIC(5, 2) DEFAULT 95.00,
  origem VARCHAR(50) NOT NULL DEFAULT 'DATA_WAREHOUSE',
  modelo VARCHAR(100) NOT NULL DEFAULT 'Gemini-1.5-Pro',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_predicoes_tenant ON public.ai_predicoes(empresa_operadora_id);

-- 3. Tabela de Recomendações Inteligentes
CREATE TABLE IF NOT EXISTS public.ai_recomendacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  recomendacao TEXT NOT NULL,
  prioridade VARCHAR(20) NOT NULL DEFAULT 'ALTA' CHECK (prioridade IN ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE')),
  impacto VARCHAR(50) DEFAULT 'AUMENTO_RECEITA',
  justificativa TEXT,
  aceita BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_recomendacoes_tenant ON public.ai_recomendacoes(empresa_operadora_id);

-- 4. Tabela de Detecção Automática de Anomalias Operacionais/Financeiras
CREATE TABLE IF NOT EXISTS public.ai_anomalias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  tipo VARCHAR(50) NOT NULL,
  gravidade VARCHAR(20) NOT NULL DEFAULT 'MEDIA' CHECK (gravidade IN ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA')),
  origem VARCHAR(50) NOT NULL DEFAULT 'NOC_PLAYER_ENGINE',
  confianca NUMERIC(5, 2) DEFAULT 99.00,
  status VARCHAR(20) NOT NULL DEFAULT 'NOVA' CHECK (status IN ('NOVA', 'ANALISADA', 'RESOLVIDA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_anomalias_tenant ON public.ai_anomalias(empresa_operadora_id);

-- 5. Tabela de Feedback do Usuário Executivo
CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  avaliacao INT CHECK (avaliacao BETWEEN 1 AND 5),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_tenant ON public.ai_feedback(empresa_operadora_id);

-- 6. Tabela de Log de Auditoria Imutável da IA
CREATE TABLE IF NOT EXISTS public.ai_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id),
  prompt TEXT NOT NULL,
  resposta TEXT NOT NULL,
  tempo_ms INT NOT NULL DEFAULT 0,
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_auditoria_tenant ON public.ai_auditoria(empresa_operadora_id);

-- 7. Habilitação RLS Multi-Tenant
ALTER TABLE public.ai_modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_predicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recomendacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_anomalias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_auditoria ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_modelos' AND policyname = 'p_read_ai_modelos') THEN
    CREATE POLICY p_read_ai_modelos ON public.ai_modelos FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_predicoes' AND policyname = 'p_read_ai_predicoes') THEN
    CREATE POLICY p_read_ai_predicoes ON public.ai_predicoes FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_recomendacoes' AND policyname = 'p_read_ai_recomendacoes') THEN
    CREATE POLICY p_read_ai_recomendacoes ON public.ai_recomendacoes FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_anomalias' AND policyname = 'p_read_ai_anomalias') THEN
    CREATE POLICY p_read_ai_anomalias ON public.ai_anomalias FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_feedback' AND policyname = 'p_read_ai_feedback') THEN
    CREATE POLICY p_read_ai_feedback ON public.ai_feedback FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_auditoria' AND policyname = 'p_read_ai_auditoria') THEN
    CREATE POLICY p_read_ai_auditoria ON public.ai_auditoria FOR SELECT TO authenticated USING (TRUE);
  END IF;
END $$;
