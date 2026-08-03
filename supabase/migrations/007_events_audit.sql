-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 007: AGENDA, NOTIFICAÇÕES, AUDITORIA & INFRAESTRUTURA
-- ======================================================================

-- 47. Agenda Visitas
CREATE TABLE IF NOT EXISTS public.agenda_visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  representante_id UUID NOT NULL REFERENCES public.representantes(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  titulo VARCHAR(150) NOT NULL,
  descricao TEXT,
  data_agendada TIMESTAMPTZ NOT NULL,
  tipo_visita VARCHAR(30) NOT NULL DEFAULT 'PRESENCIAL' CHECK (tipo_visita IN ('PRESENCIAL', 'ONLINE', 'TELEFONE')),
  status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'CHECKED_IN', 'FINISHED', 'CANCELED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 48. Visita Check-ins (Decisão 1:N)
CREATE TABLE IF NOT EXISTS public.visita_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_visita_id UUID NOT NULL REFERENCES public.agenda_visitas(id) ON DELETE CASCADE,
  checkin_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checkout_timestamp TIMESTAMPTZ,
  checkin_lat NUMERIC(10,8),
  checkin_lng NUMERIC(11,8),
  foto_comprovante_url TEXT,
  resultado_visita TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 49. Notificações Central Multi-Canal
CREATE TABLE IF NOT EXISTS public.notificacoes_central (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo_evento VARCHAR(80) NOT NULL,
  canal VARCHAR(20) NOT NULL CHECK (canal IN ('IN_APP', 'EMAIL', 'WHATSAPP', 'PUSH')),
  destinatario_contato VARCHAR(255) NOT NULL,
  titulo VARCHAR(150) NOT NULL,
  mensagem TEXT NOT NULL,
  status_envio VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status_envio IN ('PENDING', 'SENT', 'FAILED')),
  erro_mensagem TEXT,
  lida BOOLEAN NOT NULL DEFAULT FALSE,
  enviado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 50. Auditoria Logs (Forense Imutável)
CREATE TABLE IF NOT EXISTS public.auditoria_logs (
  id BIGSERIAL PRIMARY KEY,
  empresa_operadora_id UUID REFERENCES public.empresa_operadora(id),
  data_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_id UUID,
  usuario_email VARCHAR(255),
  usuario_role VARCHAR(30),
  entidade_tipo VARCHAR(50) NOT NULL,
  entidade_id UUID NOT NULL,
  acao VARCHAR(30) NOT NULL CHECK (acao IN ('INSERT', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'LOGIN')),
  ip_address VARCHAR(45),
  user_agent TEXT,
  status_anterior VARCHAR(50),
  status_novo VARCHAR(50),
  valor_antigo JSONB,
  valor_novo JSONB,
  observacoes TEXT
);

CREATE INDEX IF NOT EXISTS idx_auditoria_entidade ON public.auditoria_logs(entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON public.auditoria_logs(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_data ON public.auditoria_logs(data_hora DESC);

-- 51. Timeline Operational History
CREATE TABLE IF NOT EXISTS public.timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_id UUID REFERENCES public.usuarios(id),
  usuario_nome VARCHAR(150) NOT NULL,
  usuario_role VARCHAR(30) NOT NULL,
  acao VARCHAR(50) NOT NULL,
  descricao TEXT NOT NULL,
  status_anterior VARCHAR(40),
  status_novo VARCHAR(40),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_timeline_contrato ON public.timeline(contrato_id, timestamp DESC);

-- 52. Eventos do Sistema (Event Bus)
CREATE TABLE IF NOT EXISTS public.eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  tipo_evento VARCHAR(80) NOT NULL,
  entidade_origem VARCHAR(50) NOT NULL,
  entidade_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id)
);

CREATE TABLE IF NOT EXISTS public.eventos_tentativas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  tentativa_numero INT NOT NULL,
  erro_mensagem TEXT,
  executado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 53. Filas / Jobs Assíncronos
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  tipo_job VARCHAR(80) NOT NULL,
  idempotency_key VARCHAR(100) UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  prioridade INT NOT NULL DEFAULT 5,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'RETRY')),
  tentativas INT NOT NULL DEFAULT 0,
  max_tentativas INT NOT NULL DEFAULT 3,
  erro_ultimo TEXT,
  retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_prioridade ON public.jobs(status, prioridade DESC, created_at ASC);

CREATE TABLE IF NOT EXISTS public.job_tentativas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  tentativa_numero INT NOT NULL,
  erro_detalhado TEXT,
  executado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 54. Feature Flags
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave VARCHAR(80) NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  ativo_global BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.feature_flags_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  configuracao_opcional JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(feature_flag_id, empresa_operadora_id)
);
