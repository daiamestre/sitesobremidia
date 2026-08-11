-- ============================================================
-- MIGRATION: FASE 8.4-C.4 — NOC & TELEMETRIA MASTER
-- Sobre Mídia ERP — Domínio Operacional (Centro de Controle de Rede)
-- Criado em: 2026-08-07
-- Regras:
-- 1. Registro contínuo de Heartbeat dos Players (online/offline)
-- 2. Telemetria e Prova de Exibição (Playback Logs) por Tela/Player/Campanha
-- 3. Motor de Alertas Operacionais (Player Offline > 5 min, Falha Sync)
-- 4. RLS Ativo e isolado por empresa_operadora_id
-- ============================================================

-- ── 1. Evoluir public.players com telemetria ────────────────
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS screen_id         uuid REFERENCES public.screens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ip_address        text,
  ADD COLUMN IF NOT EXISTS cpu_usage         numeric(5,2) DEFAULT 12.5,
  ADD COLUMN IF NOT EXISTS memory_usage      numeric(5,2) DEFAULT 45.0,
  ADD COLUMN IF NOT EXISTS temp_celsius      numeric(4,1) DEFAULT 42.0,
  ADD COLUMN IF NOT EXISTS storage_free_mb   bigint DEFAULT 32768,
  ADD COLUMN IF NOT EXISTS active_playlist_id uuid REFERENCES public.playlists(id) ON DELETE SET NULL;

-- ── 2. Tabela player_heartbeats ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_heartbeats (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  empresa_operadora_id  uuid REFERENCES public.empresa_operadora(id),
  screen_id             uuid REFERENCES public.screens(id) ON DELETE SET NULL,
  ip_address            text,
  cpu_usage             numeric(5,2),
  memory_usage          numeric(5,2),
  temp_celsius          numeric(4,1),
  storage_free_mb       bigint,
  versao_app            text,
  status_ping           text NOT NULL DEFAULT 'ONLINE',
  ping_at               timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_heartbeats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "phb_tenant_isolation" ON public.player_heartbeats;
CREATE POLICY "phb_tenant_isolation" ON public.player_heartbeats
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    OR player_id IN (
      SELECT id FROM public.players WHERE empresa_operadora_id = (
        SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
      )
    )
  );

-- ── 3. Evoluir public.playback_logs ─────────────────────────
ALTER TABLE public.playback_logs
  ADD COLUMN IF NOT EXISTS empresa_operadora_id uuid REFERENCES public.empresa_operadora(id),
  ADD COLUMN IF NOT EXISTS player_id            uuid REFERENCES public.players(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS agendamento_id       uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contrato_id          uuid REFERENCES public.contratos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ended_at             timestamptz,
  ADD COLUMN IF NOT EXISTS duracao_segundos     int DEFAULT 15,
  ADD COLUMN IF NOT EXISTS resultado            text NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN IF NOT EXISTS error_message        text;

-- Check constraint resultado em playback_logs
ALTER TABLE public.playback_logs
  DROP CONSTRAINT IF EXISTS pbl_resultado_check;

ALTER TABLE public.playback_logs
  ADD CONSTRAINT pbl_resultado_check CHECK (resultado IN ('SUCCESS', 'SKIPPED', 'ERROR'));

ALTER TABLE public.playback_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pbl_tenant_isolation" ON public.playback_logs;
CREATE POLICY "pbl_tenant_isolation" ON public.playback_logs
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    OR player_id IN (
      SELECT id FROM public.players WHERE empresa_operadora_id = (
        SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
      )
    )
  );

-- ── 4. Tabela noc_alerts (Motor de Alertas) ────────────────
CREATE TABLE IF NOT EXISTS public.noc_alerts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id  uuid REFERENCES public.empresa_operadora(id),
  player_id             uuid REFERENCES public.players(id) ON DELETE CASCADE,
  screen_id             uuid REFERENCES public.screens(id) ON DELETE CASCADE,
  tipo_alerta           text NOT NULL,
  nivel                 text NOT NULL DEFAULT 'WARNING',
  mensagem              text NOT NULL,
  resolvido             boolean NOT NULL DEFAULT false,
  resolvido_em          timestamptz,
  resolvido_por         uuid REFERENCES public.usuarios(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.noc_alerts
  DROP CONSTRAINT IF EXISTS noc_alerts_tipo_check,
  DROP CONSTRAINT IF EXISTS noc_alerts_nivel_check;

ALTER TABLE public.noc_alerts
  ADD CONSTRAINT noc_alerts_tipo_check CHECK (tipo_alerta IN (
    'PLAYER_OFFLINE', 'SYNC_FAILURE', 'MEDIA_ERROR', 'RESOURCE_EXHAUSTED', 'CLOCK_DRIFT'
  )),
  ADD CONSTRAINT noc_alerts_nivel_check CHECK (nivel IN ('INFO', 'WARNING', 'CRITICAL'));

ALTER TABLE public.noc_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "na_tenant_isolation" ON public.noc_alerts;
CREATE POLICY "na_tenant_isolation" ON public.noc_alerts
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    OR player_id IN (
      SELECT id FROM public.players WHERE empresa_operadora_id = (
        SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
      )
    )
  );

-- ── 5. Tabela player_events (Log operacional do Player) ─────
CREATE TABLE IF NOT EXISTS public.player_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  empresa_operadora_id  uuid REFERENCES public.empresa_operadora(id),
  tipo_evento           text NOT NULL,
  detalhes              jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pe_tenant_isolation" ON public.player_events;
CREATE POLICY "pe_tenant_isolation" ON public.player_events
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  );

-- ── 6. Índices de Alta Performance para NOC ────────────────
CREATE INDEX IF NOT EXISTS idx_phb_player ON public.player_heartbeats(player_id);
CREATE INDEX IF NOT EXISTS idx_phb_ping   ON public.player_heartbeats(ping_at DESC);
CREATE INDEX IF NOT EXISTS idx_pbl_player ON public.playback_logs(player_id);
CREATE INDEX IF NOT EXISTS idx_pbl_agend  ON public.playback_logs(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_pbl_start  ON public.playback_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_na_empresa ON public.noc_alerts(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_na_res     ON public.noc_alerts(resolvido);

-- ── 7. Atualização das 3 Telas & 3 Players com dados NOC ────

-- Atualizar vínculos de screens <-> players
UPDATE public.players SET
  screen_id = '11111111-0000-0000-0001-000000000001'::uuid,
  ip_address = '192.168.1.101',
  cpu_usage = 14.2,
  memory_usage = 42.1,
  temp_celsius = 39.5,
  status_online = true,
  ultima_comunicacao = now()
WHERE id = '00000000-0000-0000-0001-000000000001'::uuid;

UPDATE public.players SET
  screen_id = '11111111-0000-0000-0001-000000000002'::uuid,
  ip_address = '192.168.1.102',
  cpu_usage = 18.7,
  memory_usage = 48.3,
  temp_celsius = 41.2,
  status_online = true,
  ultima_comunicacao = now() - INTERVAL '1 minute'
WHERE id = '00000000-0000-0000-0001-000000000002'::uuid;

UPDATE public.players SET
  screen_id = '11111111-0000-0000-0001-000000000003'::uuid,
  ip_address = '192.168.1.103',
  cpu_usage = 98.0,
  memory_usage = 94.5,
  temp_celsius = 68.0,
  status_online = false,
  ultima_comunicacao = now() - INTERVAL '15 minutes'
WHERE id = '00000000-0000-0000-0001-000000000003'::uuid;

-- Heartbeats de homologação
INSERT INTO public.player_heartbeats (player_id, empresa_operadora_id, screen_id, ip_address, cpu_usage, memory_usage, temp_celsius, versao_app, status_ping, ping_at)
SELECT
  p.id, p.empresa_operadora_id, p.screen_id, p.ip_address, p.cpu_usage, p.memory_usage, p.temp_celsius, p.versao_app,
  CASE WHEN p.status_online THEN 'ONLINE' ELSE 'OFFLINE' END,
  p.ultima_comunicacao
FROM public.players p
WHERE p.id IN (
  '00000000-0000-0000-0001-000000000001'::uuid,
  '00000000-0000-0000-0001-000000000002'::uuid,
  '00000000-0000-0000-0001-000000000003'::uuid
)
ON CONFLICT DO NOTHING;

-- Alerta Crítico para PLAYER-003 (OFFLINE)
INSERT INTO public.noc_alerts (id, empresa_operadora_id, player_id, screen_id, tipo_alerta, nivel, mensagem, resolvido, created_at)
SELECT
  '33333333-0000-0000-0001-000000000001'::uuid,
  p.empresa_operadora_id,
  p.id AS player_id,
  p.screen_id,
  'PLAYER_OFFLINE',
  'CRITICAL',
  'Player KEY-BETA-FIT-003 (LED Academia Beta) sem heartbeat há mais de 15 minutos. Comunicação perdida.',
  false,
  now() - INTERVAL '15 minutes'
FROM public.players p
WHERE p.id = '00000000-0000-0000-0001-000000000003'::uuid
ON CONFLICT (id) DO NOTHING;

-- Playback Logs de homologação (Provas de Exibição / As-Delivered)
INSERT INTO public.playback_logs (
  id, empresa_operadora_id, player_id, screen_id, agendamento_id, contrato_id, started_at, ended_at, duracao_segundos, resultado
)
SELECT
  gen_random_uuid(),
  ag.empresa_operadora_id,
  '00000000-0000-0000-0001-000000000001'::uuid,
  '11111111-0000-0000-0001-000000000001',
  ag.id,
  ag.contrato_id,
  now() - INTERVAL '5 minutes',
  now() - INTERVAL '4 minutes 45 seconds',
  15,
  'SUCCESS'
FROM public.agendamentos ag
WHERE ag.id = '22222222-0000-0000-0001-000000000001'::uuid
ON CONFLICT DO NOTHING;

INSERT INTO public.playback_logs (
  id, empresa_operadora_id, player_id, screen_id, agendamento_id, contrato_id, started_at, ended_at, duracao_segundos, resultado
)
SELECT
  gen_random_uuid(),
  ag.empresa_operadora_id,
  '00000000-0000-0000-0001-000000000002'::uuid,
  '11111111-0000-0000-0001-000000000002',
  ag.id,
  ag.contrato_id,
  now() - INTERVAL '2 minutes',
  now() - INTERVAL '1 minute 45 seconds',
  15,
  'SUCCESS'
FROM public.agendamentos ag
WHERE ag.id = '22222222-0000-0000-0001-000000000001'::uuid
ON CONFLICT DO NOTHING;
