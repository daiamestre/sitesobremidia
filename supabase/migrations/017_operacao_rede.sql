-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 017: CENTRO OPERACIONAL DA REDE (FASE 7.5-D)
-- ======================================================================

-- 1. Tabela Principal de Operações de Rede
CREATE TABLE IF NOT EXISTS public.operacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  agendamento_id UUID NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  pedido_insercao_id UUID REFERENCES public.pedidos_insercao(id) ON DELETE SET NULL,
  producao_id UUID REFERENCES public.producoes(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'INICIADA' CHECK (
    status IN ('INICIADA', 'EM_EXECUCAO', 'FALHA_DETECTADA', 'RECUPERANDO', 'ENCERRADA')
  ),
  inicio_execucao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fim_execucao TIMESTAMPTZ,
  ultima_sincronizacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima_exibicao TIMESTAMPTZ,
  health_status VARCHAR(20) NOT NULL DEFAULT 'HEALTHY' CHECK (health_status IN ('HEALTHY', 'WARNING', 'CRITICAL')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operacoes_tenant ON public.operacoes(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_operacoes_agendamento ON public.operacoes(agendamento_id);

-- 2. Tabela de Status do Player na Operação
CREATE TABLE IF NOT EXISTS public.operacao_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id UUID NOT NULL REFERENCES public.operacoes(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  versao_app VARCHAR(30) DEFAULT 'v3.0.4',
  ultimo_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima_sincronizacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_online BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operacao_players_operacao ON public.operacao_players(operacao_id);

-- 3. Tabela de Logs de Operação
CREATE TABLE IF NOT EXISTS public.operacao_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id UUID NOT NULL REFERENCES public.operacoes(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  tipo VARCHAR(30) NOT NULL CHECK (
    tipo IN ('SINCRONIZACAO', 'DOWNLOAD', 'ATUALIZACAO', 'EXECUCAO', 'FALHA', 'ERRO', 'RECONEXAO')
  ),
  mensagem TEXT NOT NULL,
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operacao_logs_operacao ON public.operacao_logs(operacao_id);

-- 4. Tabela de Métricas e KPIs Operacionais
CREATE TABLE IF NOT EXISTS public.operacao_metricas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id UUID NOT NULL REFERENCES public.operacoes(id) ON DELETE CASCADE,
  quantidade_exibicoes INT NOT NULL DEFAULT 0,
  tempo_total_exibido_segundos INT NOT NULL DEFAULT 0,
  disponibilidade_porcentagem NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  taxa_falhas NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  uptime_segundos INT NOT NULL DEFAULT 0,
  downtime_segundos INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operacao_metricas_operacao ON public.operacao_metricas(operacao_id);

-- 5. Tabela de Alertas de Operação
CREATE TABLE IF NOT EXISTS public.operacao_alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id UUID NOT NULL REFERENCES public.operacoes(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  tipo VARCHAR(30) NOT NULL CHECK (
    tipo IN (
      'PLAYER_OFFLINE',
      'SINCRONIZACAO_ATRASADA',
      'CAMPANHA_INTERROMPIDA',
      'ARQUIVO_AUSENTE',
      'ERRO_REPRODUCAO',
      'ESPACO_INSUFICIENTE',
      'FALHA_COMUNICACAO'
    )
  ),
  nivel VARCHAR(20) NOT NULL DEFAULT 'WARNING' CHECK (nivel IN ('INFO', 'WARNING', 'CRITICAL')),
  mensagem TEXT NOT NULL,
  resolvido BOOLEAN NOT NULL DEFAULT FALSE,
  resolvido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operacao_alertas_operacao ON public.operacao_alertas(operacao_id);

-- 6. Tabela de Log de Auditoria do Centro Operacional
CREATE TABLE IF NOT EXISTS public.operacao_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id UUID NOT NULL REFERENCES public.operacoes(id) ON DELETE CASCADE,
  evento VARCHAR(50) NOT NULL CHECK (
    evento IN (
      'OPERACAO_INICIADA',
      'OPERACAO_ENCERRADA',
      'PLAYER_ONLINE',
      'PLAYER_OFFLINE',
      'HEARTBEAT',
      'SINCRONIZACAO',
      'ALERTA_CRIADO',
      'ALERTA_RESOLVIDO'
    )
  ),
  usuario_id UUID REFERENCES public.usuarios(id),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operacao_auditoria_operacao ON public.operacao_auditoria(operacao_id);

-- 7. Habilitação de RLS Multi-Tenant
ALTER TABLE public.operacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacao_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacao_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacao_metricas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacao_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacao_auditoria ENABLE ROW LEVEL SECURITY;

-- Policies RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operacoes' AND policyname = 'p_read_operacoes') THEN
    CREATE POLICY p_read_operacoes ON public.operacoes FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operacoes' AND policyname = 'p_insert_operacoes') THEN
    CREATE POLICY p_insert_operacoes ON public.operacoes FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operacao_players' AND policyname = 'p_read_operacao_players') THEN
    CREATE POLICY p_read_operacao_players ON public.operacao_players FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operacao_logs' AND policyname = 'p_read_operacao_logs') THEN
    CREATE POLICY p_read_operacao_logs ON public.operacao_logs FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operacao_metricas' AND policyname = 'p_read_operacao_metricas') THEN
    CREATE POLICY p_read_operacao_metricas ON public.operacao_metricas FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operacao_alertas' AND policyname = 'p_read_operacao_alertas') THEN
    CREATE POLICY p_read_operacao_alertas ON public.operacao_alertas FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operacao_auditoria' AND policyname = 'p_read_operacao_auditoria') THEN
    CREATE POLICY p_read_operacao_auditoria ON public.operacao_auditoria FOR SELECT TO authenticated USING (TRUE);
  END IF;
END $$;
