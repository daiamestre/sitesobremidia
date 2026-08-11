-- ======================================================================
-- BASELINE v1.0.1 - MIGRATION: CUSTOMER PORTAL & MOBILE
-- Esta migration cria os satélites de portal do cliente e app da equipe técnica
-- ======================================================================

-- 1. portal_chamados
CREATE TABLE IF NOT EXISTS public.portal_chamados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  assunto VARCHAR(150) NOT NULL,
  descricao TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ABERTO' CHECK (
    status IN ('ABERTO', 'EM_ANALISE', 'AGUARDANDO_CLIENTE', 'RESOLVIDO', 'FECHADO')
  ),
  prioridade VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (
    prioridade IN ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);
CREATE INDEX IF NOT EXISTS idx_portal_chamados_tenant ON public.portal_chamados(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_portal_chamados_contrato ON public.portal_chamados(contrato_id);

-- 2. portal_aprovacoes
CREATE TABLE IF NOT EXISTS public.portal_aprovacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  producao_id UUID NOT NULL REFERENCES public.producoes(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE' CHECK (
    status IN ('PENDENTE', 'APROVADO', 'REPROVADO_COM_AJUSTES')
  ),
  comentarios TEXT,
  data_decisao TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decidido_por UUID
);
CREATE INDEX IF NOT EXISTS idx_portal_aprov_tenant ON public.portal_aprovacoes(empresa_operadora_id);

-- 3. mobile_checkins
CREATE TABLE IF NOT EXISTS public.mobile_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  screen_id UUID REFERENCES public.screens(id) ON DELETE CASCADE,
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('MANUTENCAO', 'INSTALACAO', 'VISTORIA', 'AUDITORIA')),
  status VARCHAR(30) NOT NULL DEFAULT 'INICIADO' CHECK (status IN ('INICIADO', 'FINALIZADO', 'CANCELADO')),
  data_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mobile_checkin_tenant ON public.mobile_checkins(empresa_operadora_id);

-- 4. mobile_fotos
CREATE TABLE IF NOT EXISTS public.mobile_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id UUID NOT NULL REFERENCES public.mobile_checkins(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES public.medias(id) ON DELETE RESTRICT,
  categoria VARCHAR(30) CHECK (categoria IN ('ANTES', 'DURANTE', 'DEPOIS', 'COMPROVANTE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mobile_fotos_checkin ON public.mobile_fotos(checkin_id);

-- 5. mobile_visitas (agendamento da equipe)
CREATE TABLE IF NOT EXISTS public.mobile_visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  tecnico_id UUID NOT NULL, -- auth.users
  screen_id UUID REFERENCES public.screens(id) ON DELETE CASCADE,
  data_agendada DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'REALIZADA', 'ATRASADA', 'CANCELADA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mobile_visitas_tenant ON public.mobile_visitas(empresa_operadora_id);

-- ======================================================================
-- RLS E POLICIES
-- ======================================================================

ALTER TABLE public.portal_chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_aprovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_visitas ENABLE ROW LEVEL SECURITY;

CREATE POLICY pchamados_tenant_isolation ON public.portal_chamados AS RESTRICTIVE FOR ALL USING (empresa_operadora_id IN (SELECT o.id FROM public.organizations o WHERE o.id = empresa_operadora_id));
CREATE POLICY pchamados_all ON public.portal_chamados FOR ALL USING (true);

CREATE POLICY paprov_tenant_isolation ON public.portal_aprovacoes AS RESTRICTIVE FOR ALL USING (empresa_operadora_id IN (SELECT o.id FROM public.organizations o WHERE o.id = empresa_operadora_id));
CREATE POLICY paprov_all ON public.portal_aprovacoes FOR ALL USING (true);

CREATE POLICY mcheckins_tenant_isolation ON public.mobile_checkins AS RESTRICTIVE FOR ALL USING (empresa_operadora_id IN (SELECT o.id FROM public.organizations o WHERE o.id = empresa_operadora_id));
CREATE POLICY mcheckins_all ON public.mobile_checkins FOR ALL USING (true);

CREATE POLICY mfotos_all ON public.mobile_fotos FOR ALL USING (true);

CREATE POLICY mvisitas_tenant_isolation ON public.mobile_visitas AS RESTRICTIVE FOR ALL USING (empresa_operadora_id IN (SELECT o.id FROM public.organizations o WHERE o.id = empresa_operadora_id));
CREATE POLICY mvisitas_all ON public.mobile_visitas FOR ALL USING (true);
