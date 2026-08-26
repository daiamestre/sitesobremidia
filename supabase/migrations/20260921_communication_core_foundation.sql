-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20260921
-- ETAPAS 10-14: COMMUNICATION CORE
-- Event Catalog + Template Engine + Preferências + Jobs Evolution + Retry + Idempotência
-- ======================================================================

-- ======================================================================
-- ETAPA 10 — EVENT CATALOG
-- Catálogo centralizado de todos os eventos do sistema.
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.comunicacao_eventos_catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name VARCHAR(60) NOT NULL UNIQUE,  -- Ex: USER_APPROVED, PLAYER_OFFLINE
  domain VARCHAR(30) NOT NULL CHECK (
    domain IN ('auth','operations','financial','contracts','campaigns','crm','portal','system')
  ),
  descricao TEXT,
  payload_schema JSONB NOT NULL DEFAULT '{}',   -- JSON Schema dos dados do evento
  canais_habilitados TEXT[] NOT NULL DEFAULT '{}', -- ['in_app','email','whatsapp']
  template_key_padrao VARCHAR(60),              -- FK para comunicacao_templates.template_key
  prioridade VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (
    prioridade IN ('CRITICO','ALTO','NORMAL','BAIXO')
  ),
  max_tentativas INT NOT NULL DEFAULT 3,
  backoff_segundos INT NOT NULL DEFAULT 60,     -- intervalo inicial de retry
  tenant_scope VARCHAR(20) NOT NULL DEFAULT 'TENANT' CHECK (
    tenant_scope IN ('SYSTEM','TENANT','USER')
  ),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eventos_cat_name ON public.comunicacao_eventos_catalogo(event_name);
CREATE INDEX IF NOT EXISTS idx_eventos_cat_domain ON public.comunicacao_eventos_catalogo(domain);

-- Seed do catálogo — todos os eventos da plataforma
INSERT INTO public.comunicacao_eventos_catalogo (event_name, domain, descricao, canais_habilitados, template_key_padrao, prioridade, max_tentativas, backoff_segundos, tenant_scope)
VALUES
  -- AUTH
  ('USER_REGISTERED',      'auth',       'Usuário se cadastrou e aguarda aprovação',        ARRAY['in_app','email'], 'user_registered',      'NORMAL', 3, 60,  'TENANT'),
  ('USER_APPROVED',        'auth',       'Usuário aprovado pelo admin',                      ARRAY['in_app','email'], 'user_approved',        'ALTO',   3, 60,  'TENANT'),
  ('USER_REJECTED',        'auth',       'Usuário rejeitado pelo admin',                     ARRAY['in_app','email'], 'user_rejected',        'NORMAL', 2, 60,  'TENANT'),
  ('USER_CONFIRMED',       'auth',       'Confirmação de cadastro enviada ao usuário',       ARRAY['in_app','email'], 'user_confirmed',       'NORMAL', 3, 60,  'TENANT'),
  ('USER_INVITED',         'auth',       'Convite de acesso enviado a um usuário',           ARRAY['in_app','email'], 'user_invited',         'NORMAL', 3, 60,  'TENANT'),
  ('PASSWORD_RESET',       'auth',       'Solicitação de recuperação de senha',             ARRAY['in_app','email'], 'password_reset',       'NORMAL', 3, 60,  'TENANT'),
  ('USER_SUSPENDED',       'auth',       'Usuário suspenso por violação ou inatividade',     ARRAY['in_app','email'], 'user_suspended',       'ALTO',   2, 60,  'TENANT'),
  -- OPERATIONS
  ('PLAYER_OFFLINE',       'operations', 'Player ficou offline além do threshold',           ARRAY['in_app','email'], 'player_offline',       'CRITICO',5, 300, 'TENANT'),
  ('PLAYER_ONLINE',        'operations', 'Player voltou online após ficar offline',          ARRAY['in_app'],         'player_online',        'NORMAL', 1, 60,  'TENANT'),
  ('CAMPAIGN_APPROVED',    'operations', 'Campanha aprovada para veiculação',                ARRAY['in_app','email'], 'campaign_approved',    'ALTO',   3, 60,  'TENANT'),
  ('CAMPAIGN_REJECTED',    'operations', 'Campanha rejeitada com motivo',                    ARRAY['in_app','email'], 'campaign_rejected',    'NORMAL', 2, 60,  'TENANT'),
  -- FINANCIAL
  ('PAYMENT_OVERDUE',      'financial',  'Pagamento vencido sem liquidação',                 ARRAY['in_app','email'], 'payment_overdue',      'CRITICO',3, 86400,'TENANT'),
  ('PAYMENT_RECEIVED',     'financial',  'Pagamento recebido e confirmado',                  ARRAY['in_app'],         'payment_received',     'NORMAL', 2, 60,  'TENANT'),
  ('CONTRACT_EXPIRING',    'financial',  'Contrato próximo do vencimento (30 dias)',         ARRAY['in_app','email'], 'contract_expiring',    'ALTO',   3, 86400,'TENANT'),
  -- CONTRACTS
  ('CONTRACT_CREATED',     'contracts',  'Novo contrato criado',                             ARRAY['in_app'],         'contract_created',     'NORMAL', 2, 60,  'TENANT'),
  ('CONTRACT_APPROVED',    'contracts',  'Contrato aprovado/assinado',                       ARRAY['in_app','email'], 'contract_approved',    'ALTO',   3, 60,  'TENANT'),
  ('CONTRACT_CANCELLED',   'contracts',  'Contrato cancelado',                               ARRAY['in_app','email'], 'contract_cancelled',   'ALTO',   2, 60,  'TENANT'),
  -- PORTAL
  ('ONBOARDING_COMPLETED', 'portal',     'Onboarding self-service finalizado',               ARRAY['in_app','email'], 'onboarding_completed', 'NORMAL', 2, 60,  'TENANT'),
  ('EXPANSION_APPROVED',   'portal',     'Expansão de estabelecimentos aprovada',            ARRAY['in_app','email'], 'expansion_approved',   'ALTO',   3, 60,  'TENANT'),
  ('EXPANSION_REJECTED',   'portal',     'Expansão de estabelecimentos rejeitada',           ARRAY['in_app'],         'expansion_rejected',   'NORMAL', 2, 60,  'TENANT'),
  -- SYSTEM
  ('SYSTEM_ERROR',         'system',     'Erro crítico de sistema (ops)',                    ARRAY['email'],          'system_error',         'CRITICO',2, 300, 'SYSTEM')
ON CONFLICT (event_name) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  canais_habilitados = EXCLUDED.canais_habilitados,
  prioridade = EXCLUDED.prioridade,
  updated_at = NOW();

-- ======================================================================
-- ETAPA 11 — TEMPLATE ENGINE
-- Templates de comunicação por canal, suportando variáveis {{var}}
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.comunicacao_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  -- NULL = template de sistema (todos os tenants); preenchido = override do tenant
  template_key VARCHAR(60) NOT NULL,
  event_name VARCHAR(60),               -- FK para catalogo (informativo)
  canal VARCHAR(20) NOT NULL CHECK (canal IN ('email','in_app','whatsapp','sms','push')),
  assunto VARCHAR(200),                 -- Para e-mail
  corpo TEXT NOT NULL,                  -- HTML (email) ou texto (push/sms/in_app)
  variaveis TEXT[] NOT NULL DEFAULT '{}', -- ['nome','empresa','valor'] — documentação
  versao INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DRAFT','DEPRECATED')),
  criado_por UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_operadora_id, template_key, canal, versao),
  UNIQUE (template_key, canal, versao) -- para templates de sistema (empresa_operadora_id IS NULL)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_comm_tmpl_key ON public.comunicacao_templates(template_key, canal, status);
CREATE INDEX IF NOT EXISTS idx_comm_tmpl_tenant ON public.comunicacao_templates(empresa_operadora_id, template_key);

-- RLS: tenants veem templates de sistema + seus próprios overrides
ALTER TABLE public.comunicacao_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'comunicacao_templates' AND policyname = 'ct_select'
  ) THEN
    CREATE POLICY ct_select ON public.comunicacao_templates
    FOR SELECT TO authenticated
    USING (
      empresa_operadora_id IS NULL  -- template de sistema
      OR empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'comunicacao_templates' AND policyname = 'ct_insert_admin'
  ) THEN
    CREATE POLICY ct_insert_admin ON public.comunicacao_templates
    FOR INSERT TO authenticated
    WITH CHECK (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      AND public.get_user_role() IN ('OWNER','ADMIN')
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'comunicacao_templates' AND policyname = 'ct_update_admin'
  ) THEN
    CREATE POLICY ct_update_admin ON public.comunicacao_templates
    FOR UPDATE TO authenticated
    USING (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      AND public.get_user_role() IN ('OWNER','ADMIN')
    );
  END IF;
END $$;

-- ======================================================================
-- ETAPA 12 — PREFERÊNCIAS DE COMUNICAÇÃO POR USUÁRIO
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.comunicacao_preferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  canal VARCHAR(20) NOT NULL CHECK (canal IN ('email','in_app','whatsapp','sms','push')),
  event_name VARCHAR(60),      -- NULL = preferência global para o canal
  habilitado BOOLEAN NOT NULL DEFAULT TRUE,
  -- Eventos obrigatórios (CRITICO) ignoram habilitado = FALSE
  pode_desabilitar BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, canal, event_name)
);

CREATE INDEX IF NOT EXISTS idx_cpref_usuario ON public.comunicacao_preferencias(usuario_id, canal);
CREATE INDEX IF NOT EXISTS idx_cpref_tenant ON public.comunicacao_preferencias(empresa_operadora_id);

ALTER TABLE public.comunicacao_preferencias ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Usuário vê e edita apenas suas próprias preferências
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'comunicacao_preferencias' AND policyname = 'cpref_own'
  ) THEN
    CREATE POLICY cpref_own ON public.comunicacao_preferencias
    FOR ALL TO authenticated
    USING (usuario_id = auth.uid())
    WITH CHECK (usuario_id = auth.uid());
  END IF;

  -- Admin vê todas do tenant
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'comunicacao_preferencias' AND policyname = 'cpref_admin_select'
  ) THEN
    CREATE POLICY cpref_admin_select ON public.comunicacao_preferencias
    FOR SELECT TO authenticated
    USING (
      empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      AND public.get_user_role() IN ('OWNER','ADMIN')
    );
  END IF;
END $$;

-- ======================================================================
-- ETAPA 13 — EVOLUÇÃO DA FILA PERSISTENTE (jobs)
-- Adicionar colunas que faltam para o modelo completo.
-- Idempotente: ADD COLUMN IF NOT EXISTS
-- ======================================================================

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS event_name VARCHAR(60),
  ADD COLUMN IF NOT EXISTS correlation_id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (
    priority IN ('CRITICO','ALTO','NORMAL','BAIXO')
  );

-- Unique constraint na idempotency_key (idempotência)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'jobs' AND indexname = 'idx_jobs_idempotency'
  ) THEN
    CREATE UNIQUE INDEX idx_jobs_idempotency ON public.jobs(idempotency_key)
    WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_event_name ON public.jobs(event_name);
CREATE INDEX IF NOT EXISTS idx_jobs_correlation ON public.jobs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_jobs_available ON public.jobs(available_at, status) WHERE status = 'PENDING';

-- Atualizar status CHECK para incluir DEAD e CANCELLED (se não tiver)
-- Não é possível usar ALTER TABLE para modificar CHECK restritivo sem
-- recriar; adicionamos via tentativa de criar novo constraint somente se
-- o antigo não incluir os novos valores.
DO $$
BEGIN
  -- Verificar se DEAD existe nos valores de status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%jobs%status%'
      AND check_clause LIKE '%DEAD%'
  ) THEN
    -- Remover constraint antiga e criar nova
    ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
      CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED','DEAD','CANCELLED'));
  END IF;
END $$;

-- ======================================================================
-- ETAPA 13 — EVOLUÇÃO DE job_tentativas
-- Adicionar colunas de rastreamento de provider
-- ======================================================================

ALTER TABLE public.job_tentativas
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS provider VARCHAR(30) DEFAULT 'RESEND',
  ADD COLUMN IF NOT EXISTS provider_response_code INT,
  ADD COLUMN IF NOT EXISTS provider_reference TEXT,  -- ID do e-mail no Resend/Brevo
  ADD COLUMN IF NOT EXISTS canal VARCHAR(20) DEFAULT 'EMAIL';

-- ======================================================================
-- ETAPA 14 — RPC: enfileirar_job (com idempotência)
-- Ponto único de entrada para criar jobs no Communication Core.
-- ======================================================================

CREATE OR REPLACE FUNCTION public.enfileirar_job(
  p_empresa_operadora_id UUID,
  p_event_name VARCHAR,
  p_payload JSONB DEFAULT '{}',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL,
  p_priority VARCHAR DEFAULT 'NORMAL',
  p_available_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id UUID;
  v_idem_key TEXT;
  v_corr_id UUID;
  v_max_attempts INT := 3;
  v_catalog RECORD;
BEGIN
  -- Buscar configurações do catálogo de eventos
  SELECT max_tentativas, prioridade INTO v_catalog
  FROM public.comunicacao_eventos_catalogo
  WHERE event_name = p_event_name AND ativo = TRUE
  LIMIT 1;

  -- Usar configurações do catálogo se disponíveis
  IF FOUND THEN
    v_max_attempts := COALESCE(v_catalog.max_tentativas, 3);
  END IF;

  -- Gerar chave de idempotência padrão se não fornecida
  v_idem_key := COALESCE(p_idempotency_key, p_event_name || ':' || p_empresa_operadora_id::TEXT || ':' || extract(epoch from date_trunc('hour', NOW()))::TEXT);
  v_corr_id  := COALESCE(p_correlation_id, gen_random_uuid());

  -- Inserir com ON CONFLICT para garantir idempotência
  INSERT INTO public.jobs (
    empresa_operadora_id,
    event_name,
    tipo_job,
    payload,
    status,
    tentativas,
    max_tentativas,
    prioridade,
    idempotency_key,
    correlation_id,
    available_at,
    created_at
  ) VALUES (
    p_empresa_operadora_id,
    p_event_name,
    p_event_name,  -- 'tipo_job' mantido para compatibilidade
    p_payload,
    'PENDING',
    0,
    v_max_attempts,
    5, -- prioridade
    v_idem_key,
    v_corr_id,
    p_available_at,
    NOW()
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    -- Job já existia (idempotência): retornar o existente
    SELECT id INTO v_job_id FROM public.jobs WHERE idempotency_key = v_idem_key LIMIT 1;
    RETURN jsonb_build_object(
      'ok', TRUE,
      'job_id', v_job_id,
      'status', 'already_exists',
      'idempotency_key', v_idem_key,
      'correlation_id', v_corr_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'job_id', v_job_id,
    'status', 'created',
    'idempotency_key', v_idem_key,
    'correlation_id', v_corr_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.enfileirar_job(UUID, VARCHAR, JSONB, TEXT, UUID, VARCHAR, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enfileirar_job(UUID, VARCHAR, JSONB, TEXT, UUID, VARCHAR, TIMESTAMPTZ) TO service_role;

-- ======================================================================
-- ETAPA 14 — RPC: registrar_tentativa_job (retry com backoff)
-- ======================================================================

CREATE OR REPLACE FUNCTION public.registrar_tentativa_job(
  p_job_id UUID,
  p_status VARCHAR,   -- COMPLETED | FAILED | DEAD
  p_error TEXT DEFAULT NULL,
  p_provider VARCHAR DEFAULT 'RESEND',
  p_provider_response_code INT DEFAULT NULL,
  p_provider_reference TEXT DEFAULT NULL,
  p_canal VARCHAR DEFAULT 'EMAIL'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_tentativa_num INT;
  v_next_available TIMESTAMPTZ;
  v_new_status VARCHAR;
  v_catalog RECORD;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Job não encontrado');
  END IF;

  v_tentativa_num := COALESCE(v_job.tentativas, 0) + 1;

  -- Registrar tentativa
  INSERT INTO public.job_tentativas (
    job_id,
    tentativa,
    status,
    erro,
    correlation_id,
    provider,
    provider_response_code,
    provider_reference,
    canal,
    created_at
  ) VALUES (
    p_job_id,
    v_tentativa_num,
    p_status,
    p_error,
    v_job.correlation_id,
    p_provider,
    p_provider_response_code,
    p_provider_reference,
    p_canal,
    NOW()
  );

  -- Determinar próximo status do job
  IF p_status = 'COMPLETED' THEN
    v_new_status := 'COMPLETED';
    UPDATE public.jobs SET
      status = v_new_status,
      tentativas = v_tentativa_num,
      completed_at = NOW(),
      last_error = NULL,
      updated_at = NOW()
    WHERE id = p_job_id;

  ELSIF p_status = 'FAILED' THEN
    IF v_tentativa_num >= COALESCE(v_job.max_attempts, 3) THEN
      v_new_status := 'DEAD';
      UPDATE public.jobs SET
        status = v_new_status,
        tentativas = v_tentativa_num,
        failed_at = NOW(),
        last_error = p_error,
        updated_at = NOW()
      WHERE id = p_job_id;
    ELSE
      -- Backoff exponencial
      SELECT backoff_segundos INTO v_catalog
      FROM public.comunicacao_eventos_catalogo
      WHERE event_name = v_job.event_name LIMIT 1;

      v_next_available := NOW() + make_interval(secs =>
        POWER(2, v_tentativa_num - 1) * COALESCE(v_catalog.backoff_segundos, 60)
      );

      v_new_status := 'PENDING';
      UPDATE public.jobs SET
        status = v_new_status,
        tentativas = v_tentativa_num,
        last_error = p_error,
        available_at = v_next_available,
        updated_at = NOW()
      WHERE id = p_job_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'job_id', p_job_id,
    'status', v_new_status,
    'tentativas', v_tentativa_num,
    'next_available', v_next_available
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_tentativa_job(UUID, VARCHAR, TEXT, VARCHAR, INT, TEXT, VARCHAR) TO service_role;

-- ======================================================================
-- COMENTÁRIO FINAL
-- As ETAPAs 15-16 (Provider Layer + Resend via Provider) são implementadas
-- no código TypeScript/Deno das Edge Functions (não em SQL).
-- Ver: supabase/functions/communication-core/index.ts (a ser criado na ETAPA 15)
-- ======================================================================
