-- ======================================================================
-- MIGRATION: 20260913 - COMPATIBILIDADE DE SCHEMA (RESTAURACAO DA CADEIA)
-- SOBRE MIDIA PLATFORM | RESTAURACAO FORENSE - FASE DE EXECUCAO
-- ======================================================================
-- Contexto: o banco vivo nunca recebeu a cadeia completa de migrations.
-- A aplicacao de 20260827/20260828/20260910/20260911 falhou porque 5
-- tabelas definidas em migrations oficiais anteriores nao existem no
-- banco (o schema foi trazido parcialmente). Esta migration aditiva cria
-- SOMENTE as tabelas ausentes, com as definicoes oficiais VERBATIM das
-- migrations originais (015, 017, 20260228000002), alem de um overload
-- de fn_player_can_access_screen_text para o tipo uuid (o banco vivo
-- usa monitoring_logs.screen_id como uuid, nao text).
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE.
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. MIDIAS (verbatim de 015_producao_midias.sql)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.midias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES public.producoes(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('Imagem', 'Video', 'HTML5', 'ZIP', 'PDF')),
  nome VARCHAR(150) NOT NULL,
  descricao TEXT,
  mime_type VARCHAR(100) NOT NULL,
  tamanho BIGINT NOT NULL CHECK (tamanho >= 0),
  duracao INT DEFAULT 15 CHECK (duracao >= 0),
  largura INT DEFAULT 1920,
  altura INT DEFAULT 1080,
  object_key TEXT NOT NULL,
  checksum VARCHAR(64),
  versao_atual INT NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'EM_REVISAO' CHECK (status IN ('EM_REVISAO', 'APROVADO', 'REPROVADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_midias_producao ON public.midias(producao_id);

-- ----------------------------------------------------------------------
-- 2. MIDIA_APROVACOES (verbatim de 015_producao_midias.sql)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.midia_aprovacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  midia_id UUID NOT NULL REFERENCES public.midias(id) ON DELETE CASCADE,
  versao_id UUID REFERENCES public.midia_versoes(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL CHECK (status IN ('APROVADO', 'REPROVADO')),
  motivo TEXT,
  observacao TEXT,
  usuario_id UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_midia_aprovacoes_midia ON public.midia_aprovacoes(midia_id);

-- ----------------------------------------------------------------------
-- 3. OPERACOES (verbatim de 017_operacao_rede.sql)
-- ----------------------------------------------------------------------
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

-- ----------------------------------------------------------------------
-- 4. OPERACAO_PLAYERS (verbatim de 017_operacao_rede.sql)
-- ----------------------------------------------------------------------
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

-- ----------------------------------------------------------------------
-- 5. DEVICE_HEALTH (verbatim de 20260228000002_heartbeat_and_realtime.sql,
--    sem a policy permissiva antiga que sera substituida por 20260827)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_health (
  device_id UUID PRIMARY KEY REFERENCES public.devices(id) ON DELETE CASCADE,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  app_version TEXT,
  battery_level INT,
  storage_usage_percent INT,
  current_media_id UUID
);

ALTER TABLE public.device_health ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------
-- 6. OVERLOAD: fn_player_can_access_screen_text(uuid) -> cast para text
--    (banco vivo usa monitoring_logs.screen_id uuid; a cadeia de hardening
--    chama a variante text. Compatibilidade sem alterar o schema vivo.)
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_player_can_access_screen_text(p_screen_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.fn_player_can_access_screen_text(p_screen_id::text);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_player_can_access_screen_text(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_player_can_access_screen_text(uuid) FROM anon;
