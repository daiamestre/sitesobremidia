-- ============================================================
-- MIGRATION: FASE 8.4-C.3 — AGENDAMENTO DE REDE MASTER
-- Sobre Mídia ERP — Domínio Operacional (Grade de Exibição & Telas)
-- Criado em: 2026-08-07
-- Regras:
-- 1. Agendamento vinculado OBRIGATORIAMENTE a PI (Pedido de Inserção) / Contrato
-- 2. Relação Grade -> Playlists -> Telas / Players
-- 3. Detecção e registro de Conflitos de Grade
-- 4. RLS Ativo e isolado por empresa_operadora_id
-- ============================================================

-- ── 1. Evoluir public.screens ────────────────────────────────
ALTER TABLE public.screens
  ADD COLUMN IF NOT EXISTS empresa_operadora_id uuid REFERENCES public.empresa_operadora(id),
  ADD COLUMN IF NOT EXISTS player_id            uuid REFERENCES public.players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS endereco_instalacao  text,
  ADD COLUMN IF NOT EXISTS cidade               text DEFAULT 'São Paulo',
  ADD COLUMN IF NOT EXISTS estado               text DEFAULT 'SP';

ALTER TABLE public.screens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "screens_tenant_isolation" ON public.screens;
CREATE POLICY "screens_tenant_isolation" ON public.screens
  USING (
    empresa_operadora_id IS NULL OR empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  );

-- ── 2. Evoluir public.agendamentos ───────────────────────────
-- Corrigir FK de producao_id para ordens_producao
ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_producao_id_fkey;

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS contrato_id        uuid REFERENCES public.contratos(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS cliente_id         uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS playlist_id        uuid REFERENCES public.playlists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dias_semana        text[] DEFAULT ARRAY['SEG','TER','QUA','QUI','SEX','SAB','DOM'],
  ADD COLUMN IF NOT EXISTS hora_inicio        time DEFAULT '08:00:00',
  ADD COLUMN IF NOT EXISTS hora_fim           time DEFAULT '22:00:00',
  ADD COLUMN IF NOT EXISTS insercoes_por_hora int DEFAULT 30,
  ADD COLUMN IF NOT EXISTS total_telas        int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by         uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS updated_by         uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS deleted_at         timestamptz;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_producao_id_fkey
  FOREIGN KEY (producao_id) REFERENCES public.ordens_producao(id) ON DELETE SET NULL;

-- Check constraint status em agendamentos
ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_status_check;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_status_check CHECK (status IN (
    'PROGRAMADO','EM_EXIBICAO','PAUSADO','FINALIZADO','CANCELADO','CONFLITO'
  ));

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agendamentos_tenant_isolation" ON public.agendamentos;
CREATE POLICY "agendamentos_tenant_isolation" ON public.agendamentos
  USING (empresa_operadora_id = (
    SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
  ));

-- ── 3. Tabela agendamento_telas (Vínculo Agendamento ↔ Telas) ─
CREATE TABLE IF NOT EXISTS public.agendamento_telas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id  uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  screen_id       uuid NOT NULL REFERENCES public.screens(id) ON DELETE CASCADE,
  status_sync     text NOT NULL DEFAULT 'PENDING',
  last_synced_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agendamento_id, screen_id)
);

ALTER TABLE public.agendamento_telas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "at_tenant_isolation" ON public.agendamento_telas;
CREATE POLICY "at_tenant_isolation" ON public.agendamento_telas
  USING (agendamento_id IN (
    SELECT id FROM public.agendamentos
    WHERE empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  ));

-- ── 4. Tabela agendamento_conflitos ──────────────────────────
CREATE TABLE IF NOT EXISTS public.agendamento_conflitos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_novo_id   uuid REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  agendamento_exist_id  uuid REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  screen_id             uuid REFERENCES public.screens(id) ON DELETE CASCADE,
  motivo                text NOT NULL,
  resolvido             boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agendamento_conflitos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ac_tenant_isolation" ON public.agendamento_conflitos;
CREATE POLICY "ac_tenant_isolation" ON public.agendamento_conflitos
  USING (agendamento_novo_id IN (
    SELECT id FROM public.agendamentos
    WHERE empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  ));

-- ── 5. Tabela agendamento_auditoria ──────────────────────────
CREATE TABLE IF NOT EXISTS public.agendamento_auditoria (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id  uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  evento          text NOT NULL,
  usuario_id      uuid REFERENCES public.usuarios(id),
  detalhes        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agendamento_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aa_tenant_isolation" ON public.agendamento_auditoria;
CREATE POLICY "aa_tenant_isolation" ON public.agendamento_auditoria
  USING (agendamento_id IN (
    SELECT id FROM public.agendamentos
    WHERE empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  ));

-- ── 6. Índices de alta performance ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_ag_empresa  ON public.agendamentos(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_ag_pi       ON public.agendamentos(pedido_insercao_id);
CREATE INDEX IF NOT EXISTS idx_ag_op       ON public.agendamentos(producao_id);
CREATE INDEX IF NOT EXISTS idx_ag_status   ON public.agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_ag_datas    ON public.agendamentos(inicio, fim);
CREATE INDEX IF NOT EXISTS idx_at_agend    ON public.agendamento_telas(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_at_screen   ON public.agendamento_telas(screen_id);
CREATE INDEX IF NOT EXISTS idx_sc_empresa  ON public.screens(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_pl_empresa  ON public.players(empresa_operadora_id);

-- ── 7. Dados Semente de Homologação (3 Telas + Players) ──────

-- 3 Players semente
INSERT INTO public.players (id, empresa_operadora_id, player_key, versao_app, status_online, ultima_comunicacao, created_at, updated_at)
SELECT
  '00000000-0000-0000-0001-000000000001'::uuid,
  empresa_operadora_id,
  'KEY-SHOPPING-001',
  '2.4.0',
  true,
  now(),
  now(),
  now()
FROM public.pedidos_insercao
WHERE numero_pi = 'PI-2026-0001' LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.players (id, empresa_operadora_id, player_key, versao_app, status_online, ultima_comunicacao, created_at, updated_at)
SELECT
  '00000000-0000-0000-0001-000000000002'::uuid,
  empresa_operadora_id,
  'KEY-ALPHA-REST-002',
  '2.4.0',
  true,
  now(),
  now(),
  now()
FROM public.pedidos_insercao
WHERE numero_pi = 'PI-2026-0001' LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.players (id, empresa_operadora_id, player_key, versao_app, status_online, ultima_comunicacao, created_at, updated_at)
SELECT
  '00000000-0000-0000-0001-000000000003'::uuid,
  empresa_operadora_id,
  'KEY-BETA-FIT-003',
  '2.4.0',
  true,
  now(),
  now(),
  now()
FROM public.pedidos_insercao
WHERE numero_pi = 'PI-2026-0001' LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- 3 Telas semente de homologação
INSERT INTO public.screens (id, empresa_operadora_id, player_id, name, location, resolution, orientation, status, is_active, last_ping_at, created_at, updated_at)
SELECT
  '11111111-0000-0000-0001-000000000001'::uuid,
  empresa_operadora_id,
  '00000000-0000-0000-0001-000000000001'::uuid,
  'LED Shopping Avenida',
  'Shopping Avenida SP - Praça de Alimentação',
  '1920x1080',
  'LANDSCAPE',
  'ONLINE',
  true,
  now(),
  now(),
  now()
FROM public.pedidos_insercao
WHERE numero_pi = 'PI-2026-0001' LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.screens (id, empresa_operadora_id, player_id, name, location, resolution, orientation, status, is_active, last_ping_at, created_at, updated_at)
SELECT
  '11111111-0000-0000-0001-000000000002'::uuid,
  empresa_operadora_id,
  '00000000-0000-0000-0001-000000000002'::uuid,
  'LED Restaurante Alpha',
  'Restaurante Alpha - Entrada Principal',
  '1920x1080',
  'LANDSCAPE',
  'ONLINE',
  true,
  now(),
  now(),
  now()
FROM public.pedidos_insercao
WHERE numero_pi = 'PI-2026-0001' LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.screens (id, empresa_operadora_id, player_id, name, location, resolution, orientation, status, is_active, last_ping_at, created_at, updated_at)
SELECT
  '11111111-0000-0000-0001-000000000003'::uuid,
  empresa_operadora_id,
  '00000000-0000-0000-0001-000000000003'::uuid,
  'LED Academia Beta',
  'Academia Beta Fit - Recepção VIP',
  '1080x1920',
  'PORTRAIT',
  'ONLINE',
  true,
  now(),
  now(),
  now()
FROM public.pedidos_insercao
WHERE numero_pi = 'PI-2026-0001' LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- 8. Agendamento Semente vinculando PI-2026-0001 e OP-2026-0001
INSERT INTO public.agendamentos (
  id, empresa_operadora_id, contrato_id, pedido_insercao_id, producao_id, cliente_id,
  titulo, status, inicio, fim, hora_inicio, hora_fim, insercoes_por_hora, total_telas, prioridade, created_at, updated_at
)
SELECT
  '22222222-0000-0000-0001-000000000001'::uuid,
  pi.empresa_operadora_id,
  pi.contrato_id,
  pi.id AS pedido_insercao_id,
  op.id AS producao_id,
  pi.cliente_id,
  'Campanha Alpha Restaurant — Lançamento Q3',
  'EM_EXIBICAO',
  now(),
  now() + INTERVAL '30 days',
  '08:00:00'::time,
  '22:00:00'::time,
  30,
  3,
  1,
  now(),
  now()
FROM public.pedidos_insercao pi
JOIN public.ordens_producao op ON op.pedido_insercao_id = pi.id
WHERE pi.numero_pi = 'PI-2026-0001' LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- Vínculo das 3 telas ao agendamento semente
INSERT INTO public.agendamento_telas (agendamento_id, screen_id, status_sync, created_at)
VALUES
  ('22222222-0000-0000-0001-000000000001'::uuid, '11111111-0000-0000-0001-000000000001'::uuid, 'SYNCED', now()),
  ('22222222-0000-0000-0001-000000000001'::uuid, '11111111-0000-0000-0001-000000000002'::uuid, 'SYNCED', now()),
  ('22222222-0000-0000-0001-000000000001'::uuid, '11111111-0000-0000-0001-000000000003'::uuid, 'SYNCED', now())
ON CONFLICT DO NOTHING;

-- Histórico do agendamento semente
INSERT INTO public.agendamento_auditoria (agendamento_id, evento, detalhes, created_at)
VALUES (
  '22222222-0000-0000-0001-000000000001'::uuid,
  'AGENDAMENTO_PUBLICADO',
  '{"status": "EM_EXIBICAO", "telas": 3, "frequencia": 30}'::jsonb,
  now()
) ON CONFLICT DO NOTHING;
