-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 024: ASSINATURA DIGITAL ENTERPRISE (FASE 9.4)
-- ======================================================================

-- 1. Tabela de Envelopes de Assinatura Digital
CREATE TABLE IF NOT EXISTS public.assinaturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  provedor VARCHAR(50) NOT NULL DEFAULT 'CLICKSIGN' CHECK (
    provedor IN ('CLICKSIGN', 'DOCUSIGN', 'ADOBESIGN', 'ASSINAFY', 'ZAPSIGN', 'ASSINADOR_INTERNO')
  ),
  status VARCHAR(30) NOT NULL DEFAULT 'ENVIADO' CHECK (
    status IN ('RASCUNHO', 'ENVIADO', 'VISUALIZADO', 'ASSINADO', 'RECUSADO', 'EXPIRADO', 'CANCELADO')
  ),
  envelope_id VARCHAR(100) NOT NULL,
  document_hash VARCHAR(100),
  assinado_em TIMESTAMPTZ,
  expira_em TIMESTAMPTZ,
  cancelado_em TIMESTAMPTZ,
  pdf_original_key TEXT,
  pdf_assinado_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_tenant ON public.assinaturas(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_contrato ON public.assinaturas(contrato_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_envelope ON public.assinaturas(envelope_id);

-- 2. Tabela de Eventos de Assinatura
CREATE TABLE IF NOT EXISTS public.assinatura_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assinatura_id UUID NOT NULL REFERENCES public.assinaturas(id) ON DELETE CASCADE,
  evento VARCHAR(30) NOT NULL CHECK (
    evento IN ('ENVIADO', 'VISUALIZADO', 'ASSINADO', 'RECUSADO', 'EXPIRADO', 'CANCELADO', 'WEBHOOK_RECEBIDO', 'VALIDADO')
  ),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assinatura_eventos_assinatura ON public.assinatura_eventos(assinatura_id);

-- 3. Tabela de Log de Auditoria Imutável de Assinatura Digital
CREATE TABLE IF NOT EXISTS public.assinatura_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  evento VARCHAR(50) NOT NULL,
  usuario_id UUID REFERENCES public.usuarios(id),
  ip VARCHAR(45),
  user_agent TEXT,
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assinatura_auditoria_tenant ON public.assinatura_auditoria(empresa_operadora_id);

-- 4. Habilitação RLS Multi-Tenant
ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_auditoria ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assinaturas' AND policyname = 'p_read_assinaturas') THEN
    CREATE POLICY p_read_assinaturas ON public.assinaturas FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assinatura_eventos' AND policyname = 'p_read_assinatura_eventos') THEN
    CREATE POLICY p_read_assinatura_eventos ON public.assinatura_eventos FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assinatura_auditoria' AND policyname = 'p_read_assinatura_auditoria') THEN
    CREATE POLICY p_read_assinatura_auditoria ON public.assinatura_auditoria FOR SELECT TO authenticated USING (TRUE);
  END IF;
END $$;
