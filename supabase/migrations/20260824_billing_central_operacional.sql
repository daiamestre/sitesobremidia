-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20260824: BILLING CENTRAL OPERACIONAL (END-TO-END)
-- Consolidado idempotente adaptado ao SCHEMA REAL (auditado ao vivo).
-- Reutiliza: contas_receber, pagamentos, contratos, itens_contrato,
--            catalogo_servicos, clientes, contatos, financeiro_auditoria,
--            jobs, empresa_operadora.
-- NÃO destrói dados. RLS das tabelas novas habilitado com isolamento por tenant.
-- ======================================================================

-- ======================================================================
-- ETAPA 1 — MÁQUINA DE ESTADOS DE contas_receber (legados preservados)
-- ======================================================================

ALTER TABLE public.contas_receber DROP CONSTRAINT IF EXISTS cr_status_check;

ALTER TABLE public.contas_receber ADD CONSTRAINT cr_status_check
CHECK (status = ANY (ARRAY[
  'PENDENTE', 'PAGO', 'ATRASADO', 'CANCELADO', 'PARCIAL', 'VENCIDO',
  'ABERTA', 'AGENDADA', 'VENCENDO_HOJE', 'ATRASADA', 'PARCIAL_PAGA',
  'PAGA', 'CANCELADA', 'EM_DISPUTA', 'CONCILIADA'
]));

-- ======================================================================
-- ETAPA 2 — COLUNAS ADITIVAS em contas_receber
-- ======================================================================

ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS competencia_date DATE;
ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS issue_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ;
ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'BRL';
ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS numero_documento TEXT;
ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS metodo_cobranca VARCHAR(20);
ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS recorrencia VARCHAR(20)
  DEFAULT 'AVULSA'
  CHECK (recorrencia IS NULL OR recorrencia IN ('AVULSA','MENSAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL'));
ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS gerada_automaticamente BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS situacao_cobranca VARCHAR(20)
  NOT NULL DEFAULT 'NENHUMA'
  CHECK (situacao_cobranca IN ('NENHUMA','EM_COBRANCA','CONTATO_1','CONTATO_2','CONTATO_3','INADIMPLENTE','BLOQUEADO'));
ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS valor_pago NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS saldo NUMERIC(14,2);

COMMENT ON COLUMN public.contas_receber.situacao_cobranca IS
  'Inadimplência: NENHUMA→EM_COBRANCA→CONTATO_1→CONTATO_2→CONTATO_3→INADIMPLENTE→(BLOQUEADO no cliente)';

-- Backfill de conciliação a partir dos pagamentos reais existentes
UPDATE public.contas_receber c
SET valor_pago = COALESCE(p.total, 0),
    saldo = c.valor - COALESCE(p.total, 0),
    data_recebimento = COALESCE(c.data_recebimento, CASE WHEN c.valor - COALESCE(p.total,0) <= 0 THEN CURRENT_DATE END),
    status = CASE
      WHEN COALESCE(p.total,0) >= c.valor THEN 'PAGO'
      ELSE c.status
    END
FROM (SELECT conta_receber_id, SUM(valor_pago) AS total FROM public.pagamentos GROUP BY 1) p
WHERE p.conta_receber_id = c.id;

UPDATE public.contas_receber SET saldo = valor WHERE saldo IS NULL;

-- Idempotência da recorrência: uma cobrança por contrato por competência
CREATE UNIQUE INDEX IF NOT EXISTS uk_contas_recorrencia_contrato_competencia
  ON public.contas_receber (contrato_id, competencia_date)
  WHERE recorrencia IS NOT NULL AND recorrencia <> 'AVULSA' AND competencia_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contas_tenant_vencimento ON public.contas_receber (empresa_operadora_id, data_vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_cliente ON public.contas_receber (cliente_id);
CREATE INDEX IF NOT EXISTS idx_contas_situacao ON public.contas_receber (empresa_operadora_id, situacao_cobranca);

-- Transação externa única para idempotência de webhook
CREATE UNIQUE INDEX IF NOT EXISTS uk_pagamentos_transacao_externa
  ON public.pagamentos (transacao_id_externo)
  WHERE transacao_id_externo IS NOT NULL;

-- ======================================================================
-- ETAPA 3 — BLOQUEIO FINANCEIRO DO CLIENTE (não-destrutivo, auditável)
-- ======================================================================

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS bloqueio_financeiro BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS bloqueio_motivo TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS bloqueado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clientes_bloqueio ON public.clientes (empresa_operadora_id, bloqueio_financeiro);

-- ======================================================================
-- ETAPA 4 — REGRAS DE COBRANÇA CONFIGURÁVEIS POR TENANT
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.regras_cobranca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  trigger_dias INT NOT NULL,
  evento_situacao VARCHAR(30) NOT NULL DEFAULT 'LEMBRETE'
    CHECK (evento_situacao IN ('LEMBRETE','VENCIMENTO','CONTATO_1','CONTATO_2','CONTATO_3_INADIMPLENCIA')),
  canais_habilitados TEXT[] NOT NULL DEFAULT ARRAY['email']::text[],
  prioridade VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (prioridade IN ('CRITICO','ALTO','NORMAL','BAIXO')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por UUID REFERENCES public.usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_operadora_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_regras_cobranca_tenant ON public.regras_cobranca(empresa_operadora_id);

ALTER TABLE public.regras_cobranca ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='regras_cobranca' AND policyname='p_read_regras_cobranca') THEN
    CREATE POLICY p_read_regras_cobranca ON public.regras_cobranca FOR SELECT TO authenticated
      USING (public.get_user_empresa_operadora_id(auth.uid()) IS NULL
             OR empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='regras_cobranca' AND policyname='p_write_regras_cobranca') THEN
    CREATE POLICY p_write_regras_cobranca ON public.regras_cobranca FOR ALL TO authenticated
      USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()))
      WITH CHECK (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()));
  END IF;
END $$;

-- Política padrão configurável (whatsapp desabilitado até haver provider real)
INSERT INTO public.regras_cobranca (empresa_operadora_id, nome, trigger_dias, evento_situacao, canais_habilitados, prioridade)
SELECT em.id, r.nome, r.trigger_dias, r.evento_situacao, ARRAY[r.canal]::text[], r.prioridade
FROM public.empresa_operadora em
CROSS JOIN (VALUES
  ('Lembrete D-10', -10, 'LEMBRETE', 'email', 'NORMAL'),
  ('Lembrete D-7',   -7, 'LEMBRETE', 'email', 'NORMAL'),
  ('Lembrete D-5',   -5, 'LEMBRETE', 'email', 'ALTO'),
  ('Lembrete D-1',   -1, 'LEMBRETE', 'email', 'ALTO'),
  ('Vencimento D0',   0, 'VENCIMENTO', 'email', 'CRITICO'),
  ('Contato 1 (D+1)', 1, 'CONTATO_1', 'email', 'CRITICO'),
  ('Contato 2 (D+3)', 3, 'CONTATO_2', 'email', 'ALTO'),
  ('Contato 3 + Inadimplencia (D+5)', 5, 'CONTATO_3_INADIMPLENCIA', 'email', 'CRITICO')
) AS r(nome, trigger_dias, evento_situacao, canal, prioridade)
ON CONFLICT (empresa_operadora_id, nome) DO NOTHING;

-- Novos tenants recebem automaticamente a política padrão
CREATE OR REPLACE FUNCTION public.trg_seed_regras_cobranca()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.regras_cobranca (empresa_operadora_id, nome, trigger_dias, evento_situacao, canais_habilitados, prioridade)
  VALUES
    (NEW.id, 'Lembrete D-10', -10, 'LEMBRETE', ARRAY['email']::text[], 'NORMAL'),
    (NEW.id, 'Lembrete D-7',   -7, 'LEMBRETE', ARRAY['email']::text[], 'NORMAL'),
    (NEW.id, 'Lembrete D-5',   -5, 'LEMBRETE', ARRAY['email']::text[], 'ALTO'),
    (NEW.id, 'Lembrete D-1',   -1, 'LEMBRETE', ARRAY['email']::text[], 'ALTO'),
    (NEW.id, 'Vencimento D0',   0, 'VENCIMENTO', ARRAY['email']::text[], 'CRITICO'),
    (NEW.id, 'Contato 1 (D+1)', 1, 'CONTATO_1', ARRAY['email']::text[], 'CRITICO'),
    (NEW.id, 'Contato 2 (D+3)', 3, 'CONTATO_2', ARRAY['email']::text[], 'ALTO'),
    (NEW.id, 'Contato 3 + Inadimplencia (D+5)', 5, 'CONTATO_3_INADIMPLENCIA', ARRAY['email']::text[], 'CRITICO')
  ON CONFLICT (empresa_operadora_id, nome) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seed regras falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_regras_ins ON public.empresa_operadora;
CREATE TRIGGER trg_seed_regras_ins
  AFTER INSERT ON public.empresa_operadora
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_regras_cobranca();

-- ======================================================================
-- ETAPA 5 — COMUNICAÇÃO CORE (estruturas globais consumidas pelo worker)
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.comunicacao_eventos_catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name VARCHAR(60) NOT NULL UNIQUE,
  domain VARCHAR(30) NOT NULL CHECK (domain IN ('auth','operations','financial','contracts','campaigns','crm','portal','system')),
  descricao TEXT,
  payload_schema JSONB NOT NULL DEFAULT '{}',
  canais_habilitados TEXT[] NOT NULL DEFAULT '{}',
  template_key_padrao VARCHAR(60),
  prioridade VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (prioridade IN ('CRITICO','ALTO','NORMAL','BAIXO')),
  max_tentativas INT NOT NULL DEFAULT 3,
  backoff_segundos INT NOT NULL DEFAULT 60,
  tenant_scope VARCHAR(20) NOT NULL DEFAULT 'TENANT' CHECK (tenant_scope IN ('SYSTEM','TENANT','USER')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.comunicacao_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  template_key VARCHAR(60) NOT NULL,
  event_name VARCHAR(60),
  canal VARCHAR(20) NOT NULL CHECK (canal IN ('in_app','email','whatsapp')),
  assunto TEXT NOT NULL DEFAULT '',
  corpo TEXT NOT NULL,
  variaveis TEXT[] NOT NULL DEFAULT '{}'::text[],
  versao INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  criado_por UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_key, canal, versao)
);

CREATE TABLE IF NOT EXISTS public.comunicacao_preferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL,
  empresa_operadora_id UUID REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  canal VARCHAR(20) NOT NULL CHECK (canal IN ('in_app','email','whatsapp')),
  event_name VARCHAR(60) NOT NULL,
  habilitado BOOLEAN NOT NULL DEFAULT TRUE,
  pode_desabilitar BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, canal, event_name)
);

ALTER TABLE public.comunicacao_eventos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_preferencias ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comunicacao_eventos_catalogo') THEN
    CREATE POLICY p_cat_read ON public.comunicacao_eventos_catalogo FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comunicacao_templates' AND policyname='p_tpl_read') THEN
    CREATE POLICY p_tpl_read ON public.comunicacao_templates FOR SELECT TO authenticated
      USING (empresa_operadora_id IS NULL OR empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comunicacao_templates' AND policyname='p_tpl_write') THEN
    CREATE POLICY p_tpl_write ON public.comunicacao_templates FOR ALL TO authenticated
      USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()))
      WITH CHECK (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comunicacao_preferencias') THEN
    CREATE POLICY p_pref_owner ON public.comunicacao_preferencias FOR ALL TO authenticated
      USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());
  END IF;
END $$;

-- Catálogo de eventos financeiros (globais)
INSERT INTO public.comunicacao_eventos_catalogo (event_name, domain, descricao, canais_habilitados, template_key_padrao, prioridade, max_tentativas, backoff_segundos, tenant_scope)
VALUES
  ('COLECTION_REMINDER_D10',      'financial', 'Lembrete de cobrança D-10',        ARRAY['in_app','email'], 'collection_reminder',  'NORMAL', 3, 300,  'TENANT'),
  ('COLECTION_REMINDER_D7',       'financial', 'Lembrete de cobrança D-7',         ARRAY['in_app','email'], 'collection_reminder',  'NORMAL', 3, 300,  'TENANT'),
  ('COLECTION_REMINDER_D5',       'financial', 'Lembrete de cobrança D-5',         ARRAY['in_app','email'], 'collection_reminder',  'ALTO',   3, 300,  'TENANT'),
  ('COLECTION_REMINDER_D1',       'financial', 'Lembrete de cobrança D-1',         ARRAY['in_app','email'], 'collection_reminder',  'ALTO',   3, 300,  'TENANT'),
  ('COLECTION_DUE_TODAY',         'financial', 'Cobrança vence hoje',              ARRAY['in_app','email'], 'collection_due_today', 'CRITICO',3, 3600, 'TENANT'),
  ('COLECTION_OVERDUE_C1',        'financial', '1º contato de cobrança',           ARRAY['in_app','email'], 'collection_overdue',   'CRITICO',3, 86400,'TENANT'),
  ('COLECTION_OVERDUE_C2',        'financial', '2º contato de cobrança',           ARRAY['in_app','email'], 'collection_overdue2',  'CRITICO',3, 86400,'TENANT'),
  ('COLECTION_OVERDUE_C3',        'financial', '3º contato / aviso de inadimplência', ARRAY['in_app','email'], 'collection_overdue3','CRITICO',3, 86400,'TENANT'),
  ('COLECTION_PAID',              'financial', 'Cobrança paga com sucesso',        ARRAY['in_app','email'], 'collection_paid',      'ALTO',   2, 300,  'TENANT')
ON CONFLICT (event_name) DO NOTHING;

-- Templates globais (worker resolve sem filtro de tenant; tenant pode sobrepor com própria linha)
INSERT INTO public.comunicacao_templates (template_key, event_name, canal, assunto, corpo, variaveis, versao, status)
VALUES
  ('collection_reminder','COLECTION_REMINDER_D10','email',
   'Lembrete: fatura {{numero_documento}} vence em {{dias_para_vencimento}} dias',
   '<p>Olá {{cliente_nome}},</p><p>A fatura <strong>{{numero_documento}}</strong> no valor de <strong>{{valor}}</strong> vence em <strong>{{vencimento}}</strong> (faltam {{dias_para_vencimento}} dias).</p><p>Atenciosamente,<br/>{{empresa_nome}}</p>',
   ARRAY['cliente_nome','empresa_nome','valor','vencimento','dias_para_vencimento','dias_em_atraso','numero_documento'], 1, 'ACTIVE'),
  ('collection_reminder','COLECTION_REMINDER_D7','email',
   'Lembrete: fatura {{numero_documento}} vence em {{dias_para_vencimento}} dias',
   '<p>Olá {{cliente_nome}},</p><p>A fatura <strong>{{numero_documento}}</strong> no valor de <strong>{{valor}}</strong> vence em <strong>{{vencimento}}</strong>.</p><p>Atenciosamente,<br/>{{empresa_nome}}</p>',
   ARRAY['cliente_nome','empresa_nome','valor','vencimento','dias_para_vencimento','dias_em_atraso','numero_documento'], 1, 'ACTIVE'),
  ('collection_reminder','COLECTION_REMINDER_D5','email',
   'Sua fatura {{numero_documento}} vence em breve',
   '<p>Olá {{cliente_nome}},</p><p>A fatura <strong>{{numero_documento}}</strong> no valor de <strong>{{valor}}</strong> vence em <strong>{{vencimento}}</strong> (faltam {{dias_para_vencimento}} dias).</p><p>Atenciosamente,<br/>{{empresa_nome}}</p>',
   ARRAY['cliente_nome','empresa_nome','valor','vencimento','dias_para_vencimento','dias_em_atraso','numero_documento'], 1, 'ACTIVE'),
  ('collection_reminder','COLECTION_REMINDER_D1','email',
   'Fatura {{numero_documento}} vence amanhã',
   '<p>Olá {{cliente_nome}},</p><p>A fatura <strong>{{numero_documento}}</strong> no valor de <strong>{{valor}}</strong> vence <strong>amanhã, {{vencimento}}</strong>.</p><p>{{empresa_nome}}</p>',
   ARRAY['cliente_nome','empresa_nome','valor','vencimento','dias_para_vencimento','dias_em_atraso','numero_documento'], 1, 'ACTIVE'),
  ('collection_due_today','COLECTION_DUE_TODAY','email',
   'Fatura {{numero_documento}} vence HOJE',
   '<p>Olá {{cliente_nome}},</p><p>A fatura <strong>{{numero_documento}}</strong> no valor de <strong>{{valor}}</strong> vence <strong>hoje</strong>.</p><p>{{empresa_nome}}</p>',
   ARRAY['cliente_nome','empresa_nome','valor','vencimento','dias_em_atraso','numero_documento'], 1, 'ACTIVE'),
  ('collection_overdue','COLECTION_OVERDUE_C1','email',
   'Fatura {{numero_documento}} em atraso',
   '<p>Olá {{cliente_nome}},</p><p>A fatura <strong>{{numero_documento}}</strong> no valor de <strong>{{valor}}</strong> venceu em <strong>{{vencimento}}</strong> e está em atraso há {{dias_em_atraso}} dias.</p><p>Por favor, regularize o pagamento.</p><p>{{empresa_nome}}</p>',
   ARRAY['cliente_nome','empresa_nome','valor','vencimento','dias_em_atraso','numero_documento'], 1, 'ACTIVE'),
  ('collection_overdue2','COLECTION_OVERDUE_C2','email',
   '2º aviso: fatura {{numero_documento}} em atraso há {{dias_em_atraso}} dias',
   '<p>Olá {{cliente_nome}},</p><p>Este é o <strong>2º contato</strong> sobre a fatura <strong>{{numero_documento}}</strong> ({{valor}}), vencida em <strong>{{vencimento}}</strong> — {{dias_em_atraso}} dias de atraso.</p><p>{{empresa_nome}}</p>',
   ARRAY['cliente_nome','empresa_nome','valor','vencimento','dias_em_atraso','numero_documento'], 1, 'ACTIVE'),
  ('collection_overdue3','COLECTION_OVERDUE_C3','email',
   'AVISO FINAL: fatura {{numero_documento}} — risco de bloqueio',
   '<p>Olá {{cliente_nome}},</p><p>Este é o <strong>aviso final</strong> sobre a fatura <strong>{{numero_documento}}</strong> ({{valor}}), com <strong>{{dias_em_atraso}} dias de atraso</strong>. Sem regularização, os serviços poderão ser suspensos.</p><p>{{empresa_nome}}</p>',
   ARRAY['cliente_nome','empresa_nome','valor','vencimento','dias_em_atraso','numero_documento'], 1, 'ACTIVE'),
  ('collection_paid','COLECTION_PAID','email',
   'Pagamento confirmado — fatura {{numero_documento}}',
   '<p>Olá {{cliente_nome}},</p><p>Confirmamos o recebimento de <strong>{{valor}}</strong> referente à fatura <strong>{{numero_documento}}</strong>. Obrigado!</p><p>{{empresa_nome}}</p>',
   ARRAY['cliente_nome','empresa_nome','valor','numero_documento'], 1, 'ACTIVE')
ON CONFLICT (template_key, canal, versao) DO NOTHING;

-- ======================================================================
-- ETAPA 6 — RPCs DA FILA (contratos compatíveis com BillingService)
-- jobs real: tipo_job varchar, idempotency_key UNIQUE, prioridade INT
-- ======================================================================

CREATE OR REPLACE FUNCTION public.enfileirar_job(
  p_empresa_operadora_id UUID,
  p_event_name TEXT,
  p_payload JSONB DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'NORMAL',
  p_available_at TIMESTAMPTZ DEFAULT NULL,
  p_max_tentativas INT DEFAULT 3
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_prio INT := CASE upper(coalesce(p_priority,'NORMAL'))
                  WHEN 'CRITICO' THEN 100 WHEN 'ALTO' THEN 75
                  WHEN 'BAIXO' THEN 25 ELSE 50 END;
BEGIN
  INSERT INTO public.jobs (empresa_operadora_id, tipo_job, idempotency_key, payload, prioridade, status, tentativas, max_tentativas, retry_at)
  VALUES (
    p_empresa_operadora_id, left(p_event_name, 80), p_idempotency_key,
    COALESCE(p_payload, jsonb_build_object('empresa_operadora_id', p_empresa_operadora_id, 'event_type', p_event_name)),
    v_prio, 'PENDING', 0, greatest(coalesce(p_max_tentativas,3), 1), COALESCE(p_available_at, NOW())
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.jobs WHERE idempotency_key = p_idempotency_key LIMIT 1;
    RETURN json_build_object('job_id', v_id, 'already_exists', true);
  END IF;
  RETURN json_build_object('job_id', v_id, 'already_exists', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_tentativa_job(
  p_job_id UUID,
  p_ok BOOLEAN,
  p_erro TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_backoff INT;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'erro', 'job_nao_encontrado'); END IF;

  UPDATE public.jobs SET tentativas = tentativas + 1 WHERE id = p_job_id;

  IF p_ok THEN
    UPDATE public.jobs SET status = 'COMPLETED', processed_at = NOW(), erro_ultimo = NULL WHERE id = p_job_id;
    RETURN json_build_object('ok', true, 'status', 'COMPLETED');
  END IF;

  UPDATE public.jobs SET erro_ultimo = left(coalesce(p_erro,'desconhecido'), 500) WHERE id = p_job_id;

  IF v_job.tentativas + 1 >= greatest(v_job.max_tentativas, 1) THEN
    UPDATE public.jobs SET status = 'FAILED', processed_at = NOW() WHERE id = p_job_id;
    RETURN json_build_object('ok', true, 'status', 'FAILED');
  END IF;

  v_backoff := least(60 * power(2, v_job.tentativas)::int, 86400);
  UPDATE public.jobs SET status = 'PENDING', retry_at = NOW() + make_interval(secs => v_backoff) WHERE id = p_job_id;
  RETURN json_build_object('ok', true, 'status', 'RETRY', 'retry_em_segundos', v_backoff);
END;
$$;

GRANT EXECUTE ON FUNCTION public.enfileirar_job(UUID,TEXT,JSONB,TEXT,TEXT,TIMESTAMPTZ,INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_tentativa_job(UUID,BOOLEAN,TEXT) TO service_role, authenticated;

-- ======================================================================
-- ETAPA 7 — CONCILIAÇÃO: pagamentos → contas_receber → cliente
-- ======================================================================

CREATE OR REPLACE FUNCTION public.trg_concilia_pagamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta_receber_id UUID;
  v_total NUMERIC(14,2);
  v_valor NUMERIC(14,2);
  v_cliente_id UUID;
  v_documento TEXT;
  v_restam_abertas INT;
  v_liq TIMESTAMPTZ;
  v_usuario UUID;
  v_tenant UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_conta_receber_id := OLD.conta_receber_id;
    v_liq := NULL; v_usuario := NULL; v_tenant := OLD.empresa_operadora_id;
  ELSE
    v_conta_receber_id := NEW.conta_receber_id;
    v_liq := NEW.data_liquidacao;
    v_usuario := NEW.created_by;
    v_tenant := NEW.empresa_operadora_id;
  END IF;

  IF v_conta_receber_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT valor, cliente_id INTO v_valor, v_cliente_id
  FROM public.contas_receber WHERE id = v_conta_receber_id;
  IF v_valor IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT COALESCE(SUM(valor_pago),0) INTO v_total
  FROM public.pagamentos WHERE conta_receber_id = v_conta_receber_id;

  UPDATE public.contas_receber
  SET valor_pago = v_total,
      saldo = v_valor - v_total,
      payment_date = CASE WHEN v_valor - v_total <= 0 THEN COALESCE(v_liq, NOW()) ELSE payment_date END,
      data_recebimento = CASE WHEN v_valor - v_total <= 0 THEN COALESCE(v_liq::date, CURRENT_DATE) ELSE NULL END,
      situacao_cobranca = CASE WHEN v_valor - v_total <= 0 THEN 'NENHUMA' ELSE situacao_cobranca END,
      status = CASE
        WHEN v_total <= 0 AND status IN ('PAGA','PARCIAL_PAGA')
          THEN CASE WHEN data_vencimento < CURRENT_DATE THEN 'ATRASADO' ELSE 'PENDENTE' END
        WHEN v_valor - v_total <= 0 THEN 'PAGA'
        WHEN v_total > 0 THEN 'PARCIAL_PAGA'
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = v_conta_receber_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
    VALUES (
      v_tenant, 'PAGAMENTO_CONFIRMADO', v_usuario,
      jsonb_build_object('conta_receber_id', v_conta_receber_id, 'valor_pago', NEW.valor_pago,
                         'meio', NEW.meio_pagamento, 'transacao_id_externo', NEW.transacao_id_externo)
    );

    -- Cancelar jobs de cobrança pendentes desta conta (para o fluxo de inadimplência)
    UPDATE public.jobs SET status = 'CANCELLED', processed_at = NOW()
    WHERE empresa_operadora_id = v_tenant
      AND status IN ('PENDING','PROCESSING')
      AND payload->>'conta_receber_id' = v_conta_receber_id::text
      AND tipo_job LIKE 'COLECTION%';

    -- Confirmação ao cliente (idempotente), com dados completos para o template
    SELECT c.cliente_id, c.numero_documento, c.valor INTO v_cliente_id, v_documento, v_valor FROM contas_receber c WHERE c.id = v_conta_receber_id;
    PERFORM public.enfileirar_job(
      v_tenant, 'COLECTION_PAID',
      jsonb_build_object('conta_receber_id', v_conta_receber_id, 'cliente_id', v_cliente_id,
                         'numero_documento', v_documento, 'valor', v_valor, 'valor_pago', NEW.valor_pago, 'origem', 'conciliacao'),
      v_tenant::text || ':' || v_conta_receber_id::text || ':COLECTION_PAID:' || coalesce(NEW.transacao_id_externo, NEW.id::text),
      'ALTO', NULL, 2
    );
  END IF;

  -- REATIVAÇÃO: sem dívida aberta → remove bloqueio
  IF v_cliente_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_restam_abertas
    FROM public.contas_receber
    WHERE cliente_id = v_cliente_id
      AND status IN ('PENDENTE','ABERTA','AGENDADA','VENCENDO_HOJE','ATRASADA','ATRASADO','PARCIAL_PAGA','PARCIAL');

    IF v_restam_abertas = 0 THEN
      UPDATE public.clientes
      SET bloqueio_financeiro = FALSE, bloqueio_motivo = NULL, bloqueado_em = NULL
      WHERE id = v_cliente_id AND bloqueio_financeiro = TRUE;

      IF FOUND AND TG_OP = 'INSERT' THEN
        INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
        VALUES (v_tenant, 'CLIENTE_REATIVADO', v_usuario,
                jsonb_build_object('cliente_id', v_cliente_id, 'motivo', 'todas_cobrancas_liquidadas'));
      END IF;
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_concilia_pagamento falhou: %', SQLERRM;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_concilia_pgto_ins ON public.pagamentos;
CREATE TRIGGER trg_concilia_pgto_ins
  AFTER INSERT ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_concilia_pagamento();

DROP TRIGGER IF EXISTS trg_concilia_pgto_del ON public.pagamentos;
CREATE TRIGGER trg_concilia_pgto_del
  AFTER DELETE ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_concilia_pagamento();

-- Auditoria de criação de cobrança (manual x automática)
CREATE OR REPLACE FUNCTION public.trg_audita_conta_criada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
  VALUES (
    NEW.empresa_operadora_id,
    CASE WHEN NEW.gerada_automaticamente THEN 'COBRANCA_GERADA_AUTOMATICA' ELSE 'COBRANCA_CRIADA' END,
    auth.uid(),
    jsonb_build_object('conta_receber_id', NEW.id, 'valor', NEW.valor,
                       'vencimento', NEW.data_vencimento, 'competencia', NEW.competencia_date,
                       'recorrencia', NEW.recorrencia, 'metodo', NEW.metodo_cobranca)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_audita_conta_criada falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conta_criada ON public.contas_receber;
CREATE TRIGGER trg_conta_criada
  AFTER INSERT ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.trg_audita_conta_criada();

-- ======================================================================
-- ETAPA 8 — GERAÇÃO AUTOMÁTICA POR RECORRÊNCIA (idempotente)
-- ======================================================================

CREATE OR REPLACE FUNCTION public.gerar_cobrancas_recorrentes(
  p_empresa_operadora_id UUID DEFAULT NULL,
  p_meses_frente INT DEFAULT 2
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrato RECORD;
  v_tenant UUID;
  v_meses INT := least(greatest(coalesce(p_meses_frente,2), 1), 12);
  v_dia_venc INT;
  v_competencia DATE;
  v_vencimento DATE;
  v_k INT;
  v_limite DATE := CURRENT_DATE + make_interval(months => least(greatest(coalesce(p_meses_frente,2),1),12));
  v_criadas INT := 0;
  v_tenants UUID[];
BEGIN
  IF p_empresa_operadora_id IS NULL THEN
    SELECT coalesce(array_agg(id), ARRAY[]::UUID[]) INTO v_tenants FROM public.empresa_operadora;
  ELSE
    v_tenants := ARRAY[p_empresa_operadora_id];
  END IF;

  FOREACH v_tenant IN ARRAY v_tenants LOOP
    FOR v_contrato IN
      SELECT id, empresa_operadora_id, valor_mensal, data_inicio, data_fim, forma_pagamento, numero_contrato
      FROM public.contratos
      WHERE empresa_operadora_id = v_tenant
        AND deleted_at IS NULL
        AND valor_mensal > 0
        AND data_inicio <= v_limite
        AND (data_fim IS NULL OR data_fim >= date_trunc('month', CURRENT_DATE)::date)
    LOOP
      v_dia_venc := LEAST(EXTRACT(DAY FROM v_contrato.data_inicio)::INT, 28);
      v_k := GREATEST(0,
        (EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM v_contrato.data_inicio))::INT * 12
        + (EXTRACT(MONTH FROM CURRENT_DATE) - EXTRACT(MONTH FROM v_contrato.data_inicio))::INT);

      WHILE v_k <= v_meses LOOP
        v_competencia := (date_trunc('month', v_contrato.data_inicio)::date + make_interval(months => v_k))::date;
        EXIT WHEN v_competencia > v_limite;
        EXIT WHEN v_contrato.data_fim IS NOT NULL AND v_competencia > v_contrato.data_fim;
        EXIT WHEN date_trunc('month', v_competencia)::date < date_trunc('month', v_contrato.data_inicio)::date;
        v_vencimento := (v_competencia + make_interval(days => v_dia_venc - 1))::date;

        BEGIN
          INSERT INTO public.contas_receber (
            empresa_operadora_id, contrato_id, cliente_id, valor,
            data_vencimento, competencia_date, issue_date, numero_parcela, total_parcelas,
            status, recorrencia, metodo_cobranca, gerada_automaticamente,
            numero_documento, situacao_cobranca
          )
          SELECT
            v_contrato.empresa_operadora_id, v_contrato.id, ct.cliente_id, v_contrato.valor_mensal,
            v_vencimento, v_competencia, CURRENT_DATE, 1, 1,
            'PENDENTE', 'MENSAL', COALESCE(v_contrato.forma_pagamento, 'BOLETO'), TRUE,
            v_contrato.numero_contrato || '/' || to_char(v_competencia, 'MM/YYYY'), 'NENHUMA'
          FROM public.contratos ct
          WHERE ct.id = v_contrato.id
          ON CONFLICT (contrato_id, competencia_date)
             WHERE recorrencia IS NOT NULL AND recorrencia <> 'AVULSA' AND competencia_date IS NOT NULL
          DO NOTHING;
          IF FOUND THEN v_criadas := v_criadas + 1; END IF;
        EXCEPTION WHEN others THEN
          RAISE WARNING 'recorrencia contrato % competencia % falhou: %', v_contrato.id, v_competencia, SQLERRM;
        END;

        v_k := v_k + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN json_build_object('cobrancas_geradas', v_criadas, 'meses_janela', v_meses);
END;
$$;

-- ======================================================================
-- ETAPA 9 — RÉGUA DE COBRANÇA / INADIMPLÊNCIA
-- NENHUMA→EM_COBRANCA→CONTATO_1→CONTATO_2→CONTATO_3→INADIMPLENTE→BLOQUEIO
-- ======================================================================

CREATE OR REPLACE FUNCTION public.processar_regua_cobranca(
  p_empresa_operadora_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec JSON;
  v_avancos INT := 0;
  v_inadimplentes INT := 0;
  v_bloqueios INT := 0;
  v_tenant UUID;
  v_conta RECORD;
  v_regra RECORD;
  v_dias INT;
  v_nova_situacao VARCHAR(20);
  v_evento TEXT;
  v_ordem CONSTANT TEXT[] := ARRAY['NENHUMA','EM_COBRANCA','CONTATO_1','CONTATO_2','CONTATO_3','INADIMPLENTE','BLOQUEADO'];
  v_tenants UUID[];
BEGIN
  v_rec := public.gerar_cobrancas_recorrentes(p_empresa_operadora_id, 2);

  IF p_empresa_operadora_id IS NULL THEN
    SELECT coalesce(array_agg(DISTINCT empresa_operadora_id), ARRAY[]::UUID[]) INTO v_tenants
    FROM public.contas_receber
    WHERE status IN ('PENDENTE','ABERTA','AGENDADA','VENCENDO_HOJE','ATRASADA');
  ELSE
    v_tenants := ARRAY[p_empresa_operadora_id];
  END IF;

  FOREACH v_tenant IN ARRAY v_tenants LOOP
    FOR v_conta IN
      SELECT c.id, c.cliente_id, c.numero_documento, c.valor, c.saldo, c.situacao_cobranca,
             c.data_vencimento,
             (CURRENT_DATE - c.data_vencimento)::INT AS dias_atraso,
             emp.nome_fantasia AS cliente_nome
      FROM public.contas_receber c
      LEFT JOIN LATERAL (
        SELECT e.nome_fantasia FROM public.empresas e
        WHERE e.cliente_id = c.cliente_id AND e.deleted_at IS NULL
        ORDER BY e.created_at LIMIT 1
      ) emp ON TRUE
      WHERE c.empresa_operadora_id = v_tenant
        AND c.status IN ('PENDENTE','ABERTA','AGENDADA','VENCENDO_HOJE','ATRASADA','PARCIAL_PAGA')
      ORDER BY c.data_vencimento
    LOOP
      v_dias := (CURRENT_DATE - v_conta.data_vencimento)::INT;

      SELECT r.* INTO v_regra
      FROM public.regras_cobranca r
      WHERE r.empresa_operadora_id = v_tenant AND r.ativo
        AND r.trigger_dias = v_dias
      ORDER BY r.prioridade
      LIMIT 1;

      CONTINUE WHEN v_regra.id IS NULL;

      v_evento := CASE v_regra.evento_situacao
        WHEN 'LEMBRETE' THEN 'COLECTION_REMINDER_D' || ABS(v_dias)
        WHEN 'VENCIMENTO' THEN 'COLECTION_DUE_TODAY'
        WHEN 'CONTATO_1' THEN 'COLECTION_OVERDUE_C1'
        WHEN 'CONTATO_2' THEN 'COLECTION_OVERDUE_C2'
        WHEN 'CONTATO_3_INADIMPLENCIA' THEN 'COLECTION_OVERDUE_C3'
        ELSE 'COLECTION_OVERDUE_C1'
      END;

      v_nova_situacao := CASE v_regra.evento_situacao
        WHEN 'LEMBRETE' THEN 'EM_COBRANCA'
        WHEN 'VENCIMENTO' THEN 'EM_COBRANCA'
        WHEN 'CONTATO_1' THEN 'CONTATO_1'
        WHEN 'CONTATO_2' THEN 'CONTATO_2'
        WHEN 'CONTATO_3_INADIMPLENCIA' THEN 'CONTATO_3'
        ELSE NULL
      END;

      -- Enfileira evento idempotente (nunca repete o mesmo contato para a mesma conta)
      PERFORM public.enfileirar_job(
        v_tenant, v_evento,
        jsonb_build_object(
          'conta_receber_id', v_conta.id,
          'empresa_operadora_id', v_tenant,
          'cliente_id', v_conta.cliente_id,
          'cliente_nome', v_conta.cliente_nome,
          'numero_documento', v_conta.numero_documento,
          'valor', v_conta.valor,
          'saldo', v_conta.saldo,
          'vencimento', v_conta.data_vencimento,
          'dias_para_vencimento', GREATEST(-v_dias, 0),
          'dias_em_atraso', GREATEST(v_dias, 0),
          'regra_id', v_regra.id,
          'evento_situacao', v_regra.evento_situacao
        ),
        v_tenant::text || ':' || v_conta.id::text || ':' || v_evento,
        v_regra.prioridade, NULL, 3
      );

      -- Avanço de estado somente para frente
      IF v_nova_situacao IS NOT NULL
         AND array_position(v_ordem, v_nova_situacao) > array_position(v_ordem, v_conta.situacao_cobranca) THEN
        UPDATE public.contas_receber
        SET situacao_cobranca = v_nova_situacao, updated_at = NOW()
        WHERE id = v_conta.id;
        v_avancos := v_avancos + 1;

        INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, detalhes)
        VALUES (v_tenant, 'SITUACAO_' || v_nova_situacao,
                jsonb_build_object('conta_receber_id', v_conta.id, 'regra', v_regra.nome));
      END IF;

      -- 3º contato → INADIMPLENTE + BLOQUEIO não-destrutivo do cliente
      IF v_regra.evento_situacao = 'CONTATO_3_INADIMPLENCIA'
         AND v_conta.situacao_cobranca <> 'INADIMPLENTE' THEN
        UPDATE public.contas_receber
        SET situacao_cobranca = 'INADIMPLENTE',
            status = CASE WHEN status IN ('PENDENTE','ABERTA','AGENDADA','VENCENDO_HOJE') THEN 'ATRASADO' ELSE status END,
            updated_at = NOW()
        WHERE id = v_conta.id;
        v_inadimplentes := v_inadimplentes + 1;

        INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, detalhes)
        VALUES (v_tenant, 'INADIMPLENCIA_REGISTRADA',
                jsonb_build_object('conta_receber_id', v_conta.id, 'dias_atraso', v_dias));

        IF v_conta.cliente_id IS NOT NULL THEN
          UPDATE public.clientes
          SET bloqueio_financeiro = TRUE,
              bloqueio_motivo = 'Inadimplencia: fatura ' || COALESCE(v_conta.numero_documento, v_conta.id::text) || ' com ' || v_dias || ' dias de atraso',
              bloqueado_em = NOW()
          WHERE id = v_conta.cliente_id AND bloqueio_financeiro = FALSE;
          IF FOUND THEN
            v_bloqueios := v_bloqueios + 1;
            INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, detalhes)
            VALUES (v_tenant, 'CLIENTE_BLOQUEADO',
                    jsonb_build_object('cliente_id', v_conta.cliente_id, 'conta_receber_id', v_conta.id));
          END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'recorrencia', v_rec,
    'estagios_avancados', v_avancos,
    'inadimplencias_registradas', v_inadimplentes,
    'clientes_bloqueados', v_bloqueios
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_cobrancas_recorrentes(UUID,INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.processar_regua_cobranca(UUID) TO authenticated;

-- Desbloqueio manual auditável (OWNER/ADMIN via Central)
CREATE OR REPLACE FUNCTION public.desbloquear_cliente(
  p_cliente_id UUID,
  p_motivo TEXT DEFAULT 'desbloqueio manual'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT empresa_operadora_id INTO v_tenant FROM public.clientes WHERE id = p_cliente_id;
  IF v_tenant IS NULL THEN RETURN json_build_object('ok', false, 'erro', 'cliente_nao_encontrado'); END IF;

  UPDATE public.clientes
  SET bloqueio_financeiro = FALSE, bloqueio_motivo = NULL, bloqueado_em = NULL
  WHERE id = p_cliente_id AND bloqueio_financeiro = TRUE;

  IF FOUND THEN
    INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
    VALUES (v_tenant, 'CLIENTE_DESBLOQUEADO', auth.uid(),
            jsonb_build_object('cliente_id', p_cliente_id, 'motivo', p_motivo));
    RETURN json_build_object('ok', true);
  END IF;
  RETURN json_build_object('ok', false, 'erro', 'cliente_nao_estava_bloqueado');
END;
$$;

GRANT EXECUTE ON FUNCTION public.desbloquear_cliente(UUID,TEXT) TO authenticated;

-- ======================================================================
-- ETAPA 10 — VIEW DA CENTRAL (colunas reais)
-- ======================================================================

CREATE OR REPLACE VIEW public.vw_cobranca_completa AS
SELECT
  c.id,
  c.empresa_operadora_id,
  c.cliente_id,
  c.contrato_id,
  c.numero_documento,
  c.data_vencimento AS vencimento,
  c.competencia_date,
  c.issue_date,
  c.valor AS valor_original,
  c.valor_pago,
  c.saldo,
  c.currency,
  c.notes,
  c.status AS status_conta_receber,
  c.situacao_cobranca,
  c.metodo_cobranca,
  c.recorrencia,
  c.gerada_automaticamente,
  (c.data_vencimento - CURRENT_DATE) AS dias_para_vencimento,
  (CURRENT_DATE - c.data_vencimento) AS dias_em_atraso,
  emp.nome_fantasia AS cliente_nome,
  con.numero_contrato,
  con.tipo_contrato,
  (SELECT COUNT(*)::INT FROM public.pagamentos p WHERE p.conta_receber_id = c.id) AS qtd_pagamentos,
  c.updated_at AS ultima_atualizacao
FROM public.contas_receber c
LEFT JOIN LATERAL (
  SELECT e.nome_fantasia FROM public.empresas e
  WHERE e.cliente_id = c.cliente_id AND e.deleted_at IS NULL
  ORDER BY e.created_at LIMIT 1
) emp ON TRUE
LEFT JOIN public.contratos con ON con.id = c.contrato_id;

-- ======================================================================
-- ETAPA 11 — CRON DIÁRIO DA RÉGUA (06:05 UTC = 03:05 BRT)
-- ======================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-regua-diaria') THEN
    PERFORM cron.schedule(
      'billing-regua-diaria',
      '5 6 * * *',
      $cron$ SELECT public.processar_regua_cobranca(NULL); $cron$
    );
  END IF;
END $$;

SELECT 'Migration 20260824_billing_central_operacional aplicada com sucesso' AS status;
