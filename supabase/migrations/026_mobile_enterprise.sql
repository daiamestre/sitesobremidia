-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 026: MOBILE ENTERPRISE & PWA (FASE 9.6)
-- ======================================================================

-- 1. Tabela de Dispositivos Registrados
CREATE TABLE IF NOT EXISTS public.mobile_dispositivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  dispositivo_id VARCHAR(100) NOT NULL,
  plataforma VARCHAR(20) NOT NULL DEFAULT 'PWA_WEB' CHECK (plataforma IN ('ANDROID', 'IOS', 'PWA_WEB')),
  push_token TEXT,
  ultimo_sync TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'BLOQUEADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_dispositivos_tenant ON public.mobile_dispositivos(empresa_operadora_id);

-- 2. Tabela de Histórico de Sincronizações Offline
CREATE TABLE IF NOT EXISTS public.mobile_sincronizacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  dispositivo_id VARCHAR(100) NOT NULL,
  registros_enviados INT NOT NULL DEFAULT 0,
  registros_recebidos INT NOT NULL DEFAULT 0,
  conflitos INT NOT NULL DEFAULT 0,
  resultado VARCHAR(30) NOT NULL DEFAULT 'SUCESSO' CHECK (resultado IN ('SUCESSO', 'ERRO_PARCIAL', 'FALHA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_sincronizacao_tenant ON public.mobile_sincronizacao(empresa_operadora_id);

-- 3. Tabela de Check-ins Geolocalizados
CREATE TABLE IF NOT EXISTS public.mobile_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  precisao_metros NUMERIC(6, 2) DEFAULT 10.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_checkins_cliente ON public.mobile_checkins(cliente_id);

-- 4. Tabela de Visitas Comerciais e Técnicas
CREATE TABLE IF NOT EXISTS public.mobile_visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  vendedor_id UUID REFERENCES public.usuarios(id),
  cliente_id UUID REFERENCES public.clientes(id),
  tipo VARCHAR(50) NOT NULL DEFAULT 'COMERCIAL' CHECK (tipo IN ('COMERCIAL', 'TECNICA', 'MANUTENCAO', 'INSTALACAO')),
  observacao TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'REALIZADA' CHECK (status IN ('AGENDADA', 'EM_ANDAMENTO', 'REALIZADA', 'CANCELADA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_visitas_vendedor ON public.mobile_visitas(vendedor_id);

-- 5. Tabela de Fotos de Campo (Cloudflare R2)
CREATE TABLE IF NOT EXISTS public.mobile_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  r2_object_key TEXT NOT NULL,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_fotos_tenant ON public.mobile_fotos(empresa_operadora_id);

-- 6. Tabela de Rotas de Campo
CREATE TABLE IF NOT EXISTS public.mobile_rotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  vendedor_id UUID REFERENCES public.usuarios(id),
  distancia_km NUMERIC(8, 2) DEFAULT 0.0,
  tempo_minutos INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_rotas_vendedor ON public.mobile_rotas(vendedor_id);

-- 7. Tabela de Log de Auditoria Imutável Mobile
CREATE TABLE IF NOT EXISTS public.mobile_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  evento VARCHAR(50) NOT NULL CHECK (evento IN ('LOGIN', 'SYNC', 'CHECKIN', 'UPLOAD', 'VISITA', 'CONFLITO')),
  usuario_id UUID REFERENCES public.usuarios(id),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_auditoria_tenant ON public.mobile_auditoria(empresa_operadora_id);

-- 8. Habilitação RLS Multi-Tenant
ALTER TABLE public.mobile_dispositivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_sincronizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_visitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_rotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_auditoria ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mobile_dispositivos' AND policyname = 'p_read_mobile_dispositivos') THEN
    CREATE POLICY p_read_mobile_dispositivos ON public.mobile_dispositivos FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mobile_sincronizacao' AND policyname = 'p_read_mobile_sincronizacao') THEN
    CREATE POLICY p_read_mobile_sincronizacao ON public.mobile_sincronizacao FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mobile_checkins' AND policyname = 'p_read_mobile_checkins') THEN
    CREATE POLICY p_read_mobile_checkins ON public.mobile_checkins FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mobile_visitas' AND policyname = 'p_read_mobile_visitas') THEN
    CREATE POLICY p_read_mobile_visitas ON public.mobile_visitas FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mobile_fotos' AND policyname = 'p_read_mobile_fotos') THEN
    CREATE POLICY p_read_mobile_fotos ON public.mobile_fotos FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mobile_rotas' AND policyname = 'p_read_mobile_rotas') THEN
    CREATE POLICY p_read_mobile_rotas ON public.mobile_rotas FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mobile_auditoria' AND policyname = 'p_read_mobile_auditoria') THEN
    CREATE POLICY p_read_mobile_auditoria ON public.mobile_auditoria FOR SELECT TO authenticated USING (TRUE);
  END IF;
END $$;
