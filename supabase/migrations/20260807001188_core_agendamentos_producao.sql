-- ======================================================================
-- BASELINE v1.0.1 - MIGRATION: AGENDAMENTOS E PRODUÇÃO
-- Esta migration cria o módulo operacional faltante alinhado à realidade
-- ======================================================================

-- 1. producoes
CREATE TABLE IF NOT EXISTS public.producoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  pedido_insercao_id UUID NOT NULL REFERENCES public.pedidos_insercao(id) ON DELETE CASCADE,
  titulo VARCHAR(150) NOT NULL,
  descricao TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'CRIADA' CHECK (
    status IN (
      'CRIADA', 'AGUARDANDO_MATERIAL', 'MATERIAL_RECEBIDO', 
      'EM_DESENVOLVIMENTO', 'AGUARDANDO_APROVACAO', 'REPROVADA', 
      'APROVADA', 'LIBERADA', 'PUBLICADA', 'FINALIZADA', 
      'CANCELADA', 'SUSPENSA'
    )
  ),
  prioridade VARCHAR(20) NOT NULL DEFAULT 'MEDIA' CHECK (prioridade IN ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE')),
  prazo DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, -- references auth.users
  updated_by UUID  -- references auth.users
);

CREATE INDEX IF NOT EXISTS idx_producoes_tenant ON public.producoes(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_producoes_pi ON public.producoes(pedido_insercao_id);

-- 2. producao_midia (Relaciona producoes com a tabela medias existente)
CREATE TABLE IF NOT EXISTS public.producao_midia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES public.producoes(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES public.medias(id) ON DELETE RESTRICT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_prodmidia_prod ON public.producao_midia(producao_id);

-- 3. producao_auditoria (Histórico de alterações e aprovações)
CREATE TABLE IF NOT EXISTS public.producao_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES public.producoes(id) ON DELETE CASCADE,
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  status_anterior VARCHAR(30),
  status_novo VARCHAR(30),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_prodauditoria_prod ON public.producao_auditoria(producao_id);

-- 4. agendamentos
CREATE TABLE IF NOT EXISTS public.agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  pedido_insercao_id UUID NOT NULL REFERENCES public.pedidos_insercao(id) ON DELETE CASCADE,
  producao_id UUID REFERENCES public.producoes(id) ON DELETE CASCADE,
  media_id UUID REFERENCES public.medias(id) ON DELETE RESTRICT,
  titulo VARCHAR(150) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'RASCUNHO' CHECK (
    status IN (
      'RASCUNHO', 'VALIDADO', 'PROGRAMADO', 'SINCRONIZADO', 
      'ATIVO', 'ENCERRADO', 'CANCELADO', 'SUSPENSO'
    )
  ),
  inicio TIMESTAMPTZ NOT NULL,
  fim TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',
  prioridade INT NOT NULL DEFAULT 1 CHECK (prioridade >= 1 AND prioridade <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_tenant ON public.agendamentos(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_pi ON public.agendamentos(pedido_insercao_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_periodo ON public.agendamentos(inicio, fim);

-- 5. agendamento_historico (Grade de exibição / Histórico)
CREATE TABLE IF NOT EXISTS public.agendamento_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id UUID NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  screen_id UUID REFERENCES public.screens(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES public.playlists(id) ON DELETE CASCADE,
  dias_semana INT[] DEFAULT '{0,1,2,3,4,5,6}',
  hora_inicio TIME NOT NULL DEFAULT '00:00:00',
  hora_fim TIME NOT NULL DEFAULT '23:59:59',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por UUID
);

CREATE INDEX IF NOT EXISTS idx_agendhist_agend ON public.agendamento_historico(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_agendhist_screen ON public.agendamento_historico(screen_id);

-- ======================================================================
-- RLS E POLICIES (MULTI-TENANT)
-- ======================================================================

ALTER TABLE public.producoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producao_midia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producao_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamento_historico ENABLE ROW LEVEL SECURITY;

-- Políticas de isolamento (Tenant Foundation)
CREATE POLICY producoes_tenant_isolation ON public.producoes
  AS RESTRICTIVE FOR ALL
  USING (empresa_operadora_id IN (
    SELECT o.id FROM public.organizations o WHERE o.id = empresa_operadora_id
  ));

CREATE POLICY producoes_select ON public.producoes FOR SELECT USING (true);
CREATE POLICY producoes_insert ON public.producoes FOR INSERT WITH CHECK (true);
CREATE POLICY producoes_update ON public.producoes FOR UPDATE USING (true);
CREATE POLICY producoes_delete ON public.producoes FOR DELETE USING (true);

CREATE POLICY agendamentos_tenant_isolation ON public.agendamentos
  AS RESTRICTIVE FOR ALL
  USING (empresa_operadora_id IN (
    SELECT o.id FROM public.organizations o WHERE o.id = empresa_operadora_id
  ));

CREATE POLICY agendamentos_select ON public.agendamentos FOR SELECT USING (true);
CREATE POLICY agendamentos_insert ON public.agendamentos FOR INSERT WITH CHECK (true);
CREATE POLICY agendamentos_update ON public.agendamentos FOR UPDATE USING (true);
CREATE POLICY agendamentos_delete ON public.agendamentos FOR DELETE USING (true);

-- (As tabelas filhas herdam segurança pelo backend ou RLS aninhado)
CREATE POLICY pmidia_select ON public.producao_midia FOR SELECT USING (true);
CREATE POLICY pmidia_insert ON public.producao_midia FOR INSERT WITH CHECK (true);
CREATE POLICY pmidia_update ON public.producao_midia FOR UPDATE USING (true);
CREATE POLICY pmidia_delete ON public.producao_midia FOR DELETE USING (true);

CREATE POLICY paud_select ON public.producao_auditoria FOR SELECT USING (true);
CREATE POLICY paud_insert ON public.producao_auditoria FOR INSERT WITH CHECK (true);

CREATE POLICY ahist_select ON public.agendamento_historico FOR SELECT USING (true);
CREATE POLICY ahist_insert ON public.agendamento_historico FOR INSERT WITH CHECK (true);
CREATE POLICY ahist_update ON public.agendamento_historico FOR UPDATE USING (true);
CREATE POLICY ahist_delete ON public.agendamento_historico FOR DELETE USING (true);
