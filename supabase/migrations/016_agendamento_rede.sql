-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 016: MÓDULO DE AGENDAMENTO DA REDE (FASE 7.5-C)
-- ======================================================================

-- 1. Tabela Principal de Agendamentos
CREATE TABLE IF NOT EXISTS public.agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  pedido_insercao_id UUID NOT NULL REFERENCES public.pedidos_insercao(id) ON DELETE CASCADE,
  producao_id UUID REFERENCES public.producoes(id) ON DELETE CASCADE,
  midia_id UUID REFERENCES public.midias(id) ON DELETE CASCADE,
  titulo VARCHAR(150) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'RASCUNHO' CHECK (
    status IN (
      'RASCUNHO',
      'VALIDADO',
      'PROGRAMADO',
      'SINCRONIZADO',
      'ATIVO',
      'ENCERRADO',
      'CANCELADO',
      'SUSPENSO'
    )
  ),
  inicio TIMESTAMPTZ NOT NULL,
  fim TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',
  prioridade INT NOT NULL DEFAULT 1 CHECK (prioridade >= 1 AND prioridade <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_tenant ON public.agendamentos(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_pi ON public.agendamentos(pedido_insercao_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON public.agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_periodo ON public.agendamentos(inicio, fim);

-- 2. Tabela de Grade de Exibição (Detalhes de Exibição por Tela/Player/Playlist)
CREATE TABLE IF NOT EXISTS public.grade_exibicao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id UUID NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES public.unidades(id) ON DELETE SET NULL,
  tela_id UUID REFERENCES public.telas(id) ON DELETE SET NULL,
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  playlist_id UUID REFERENCES public.playlists(id) ON DELETE SET NULL,
  dias_semana INT[] DEFAULT '{0,1,2,3,4,5,6}',
  hora_inicio TIME NOT NULL DEFAULT '06:00:00',
  hora_fim TIME NOT NULL DEFAULT '22:00:00',
  intervalo_segundos INT NOT NULL DEFAULT 60 CHECK (intervalo_segundos >= 0),
  tempo_exibicao_segundos INT NOT NULL DEFAULT 15 CHECK (tempo_exibicao_segundos > 0),
  quantidade_insercoes INT NOT NULL DEFAULT 100 CHECK (quantidade_insercoes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grade_exibicao_agendamento ON public.grade_exibicao(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_grade_exibicao_tela ON public.grade_exibicao(tela_id);
CREATE INDEX IF NOT EXISTS idx_grade_exibicao_player ON public.grade_exibicao(player_id);

-- 3. Tabela de Itens de Agendamento
CREATE TABLE IF NOT EXISTS public.agendamento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id UUID NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  grade_id UUID REFERENCES public.grade_exibicao(id) ON DELETE CASCADE,
  midia_id UUID NOT NULL REFERENCES public.midias(id) ON DELETE CASCADE,
  ordem INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamento_itens_agendamento ON public.agendamento_itens(agendamento_id);

-- 4. Tabela de Histórico de Agendamento
CREATE TABLE IF NOT EXISTS public.agendamento_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id UUID NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  status_anterior VARCHAR(30),
  status_novo VARCHAR(30) NOT NULL,
  descricao TEXT NOT NULL,
  usuario_id UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamento_historico_agendamento ON public.agendamento_historico(agendamento_id);

-- 5. Tabela de Log de Auditoria Exclusiva de Agendamento
CREATE TABLE IF NOT EXISTS public.agendamento_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id UUID NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  evento VARCHAR(50) NOT NULL CHECK (
    evento IN (
      'AGENDAMENTO_CRIADO',
      'AGENDAMENTO_VALIDADO',
      'CONFLITO_DETECTADO',
      'SINCRONIZACAO_REALIZADA',
      'AGENDAMENTO_CANCELADO',
      'AGENDAMENTO_ENCERRADO'
    )
  ),
  usuario_id UUID REFERENCES public.usuarios(id),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamento_auditoria_agendamento ON public.agendamento_auditoria(agendamento_id);

-- 6. Função PL/pgSQL para Validação Automática de Conflitos de Exibição
CREATE OR REPLACE FUNCTION public.fn_validar_conflitos_agendamento(
  p_agendamento_id UUID,
  p_tela_id UUID,
  p_player_id UUID,
  p_hora_inicio TIME,
  p_hora_fim TIME,
  p_inicio TIMESTAMPTZ,
  p_fim TIMESTAMPTZ
)
RETURNS TABLE (
  conflito_id UUID,
  titulo_conflito VARCHAR(150),
  hora_inicio_conflito TIME,
  hora_fim_conflito TIME
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id AS conflito_id,
    a.titulo AS titulo_conflito,
    g.hora_inicio AS hora_inicio_conflito,
    g.hora_fim AS hora_fim_conflito
  FROM public.agendamentos a
  JOIN public.grade_exibicao g ON g.agendamento_id = a.id
  WHERE a.status IN ('PROGRAMADO', 'SINCRONIZADO', 'ATIVO')
    AND (p_agendamento_id IS NULL OR a.id <> p_agendamento_id)
    AND (
      (p_tela_id IS NOT NULL AND g.tela_id = p_tela_id) OR
      (p_player_id IS NOT NULL AND g.player_id = p_player_id)
    )
    AND (a.inicio, a.fim) OVERLAPS (p_inicio, p_fim)
    AND (g.hora_inicio, g.hora_fim) OVERLAPS (p_hora_inicio, p_hora_fim);
END;
$$;

-- 7. Habilitação RLS Multi-Tenant
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_exibicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamento_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamento_auditoria ENABLE ROW LEVEL SECURITY;

-- Policies RLS
DO $$
BEGIN
  -- agendamentos
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agendamentos' AND policyname = 'p_read_agendamentos') THEN
    CREATE POLICY p_read_agendamentos ON public.agendamentos FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agendamentos' AND policyname = 'p_insert_agendamentos') THEN
    CREATE POLICY p_insert_agendamentos ON public.agendamentos FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agendamentos' AND policyname = 'p_update_agendamentos') THEN
    CREATE POLICY p_update_agendamentos ON public.agendamentos FOR UPDATE TO authenticated USING (TRUE);
  END IF;

  -- grade_exibicao
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'grade_exibicao' AND policyname = 'p_read_grade_exibicao') THEN
    CREATE POLICY p_read_grade_exibicao ON public.grade_exibicao FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'grade_exibicao' AND policyname = 'p_insert_grade_exibicao') THEN
    CREATE POLICY p_insert_grade_exibicao ON public.grade_exibicao FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;

  -- agendamento_itens
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agendamento_itens' AND policyname = 'p_read_agendamento_itens') THEN
    CREATE POLICY p_read_agendamento_itens ON public.agendamento_itens FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agendamento_itens' AND policyname = 'p_insert_agendamento_itens') THEN
    CREATE POLICY p_insert_agendamento_itens ON public.agendamento_itens FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;

  -- agendamento_historico
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agendamento_historico' AND policyname = 'p_read_agendamento_historico') THEN
    CREATE POLICY p_read_agendamento_historico ON public.agendamento_historico FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agendamento_historico' AND policyname = 'p_insert_agendamento_historico') THEN
    CREATE POLICY p_insert_agendamento_historico ON public.agendamento_historico FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;

  -- agendamento_auditoria
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agendamento_auditoria' AND policyname = 'p_read_agendamento_auditoria') THEN
    CREATE POLICY p_read_agendamento_auditoria ON public.agendamento_auditoria FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agendamento_auditoria' AND policyname = 'p_insert_agendamento_auditoria') THEN
    CREATE POLICY p_insert_agendamento_auditoria ON public.agendamento_auditoria FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;
END $$;
