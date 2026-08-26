-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20261018: COBRANÇA CENTRAL - REGRAS E EVENTOS
-- (Atualizada com triggers de dispatch para billing-worker)
-- ======================================================================

-- ======================================================================
-- ETAPA 1 — Tabela de Regras Dinâmicas de Cobrança
-- Regras configuráveis: D-10, D-7, D-5, D-3, D-1, D+0, D+1, D+3, D+7, D+15
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.regras_cobranca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  nome VARCHAR(100) NOT NULL,
  trigger_dias INT NOT NULL, -- Dias relativos ao vencimento (negativo = antes, positivo = depois)
  canais_habilitados TEXT[] NOT NULL DEFAULT '{}'::text[],
  prioridade VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (prioridade IN ('CRITICO','ALTO','NORMAL','BAIXO')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por UUID REFERENCES public.usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_operadora_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_regras_cobranca_tenant ON public.regras_cobranca(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_regras_cobranca_trigger ON public.regras_cobranca(trigger_dias);

-- Habilitação RLS Multi-Tenant
ALTER TABLE public.regras_cobranca ENABLE ROW LEVEL SECURITY;

-- Policies RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'regras_cobranca' AND policyname = 'p_read_regras_cobranca') THEN
    CREATE POLICY p_read_regras_cobranca ON public.regras_cobranca FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'regras_cobranca' AND policyname = 'p_write_regras_cobranca') THEN
    CREATE POLICY p_write_regras_cobranca ON public.regras_cobranca FOR ALL TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()))
    WITH CHECK (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()));
  END IF;
END $$;

-- ======================================================================
-- ETAPA 2 — Seed de Regras Padrão de Cobrança
-- ======================================================================

INSERT INTO public.regras_cobranca (empresa_operadora_id, nome, trigger_dias, canais_habilitados, prioridade)
SELECT
  em.id,
  'Lembrete D-10',
  -10,
  ARRAY['email', 'whatsapp'],
  'NORMAL'
FROM public.empresa_operadora em
ON CONFLICT (empresa_operadora_id, nome) DO NOTHING;

INSERT INTO public.regras_cobranca (empresa_operadora_id, nome, trigger_dias, canais_habilitados, prioridade)
SELECT
  em.id,
  'Lembrete D-7',
  -7,
  ARRAY['email', 'whatsapp'],
  'NORMAL'
FROM public.empresa_operadora em
ON CONFLICT (empresa_operadora_id, nome) DO NOTHING;

INSERT INTO public.regras_cobranca (empresa_operadora_id, nome, trigger_dias, canais_habilitados, prioridade)
SELECT
  em.id,
  'Lembrete D-5 (padrão)',
  -5,
  ARRAY['email', 'whatsapp'],
  'ALTO'
FROM public.empresa_operadora em
ON CONFLICT (empresa_operadora_id, nome) DO NOTHING;

INSERT INTO public.regras_cobranca (empresa_operadora_id, nome, trigger_dias, canais_habilitados, prioridade)
SELECT
  em.id,
  'Lembrete D-3',
  -3,
  ARRAY['email', 'whatsapp'],
  'NORMAL'
FROM public.empresa_operadora em
ON CONFLICT (empresa_operadora_id, nome) DO NOTHING;

INSERT INTO public.regras_cobranca (empresa_operadora_id, nome, trigger_dias, canais_habilitados, prioridade)
SELECT
  em.id,
  'Lembrete D-1',
  -1,
  ARRAY['email', 'whatsapp'],
  'ALTO'
FROM public.empresa_operadora em
ON CONFLICT (empresa_operadora_id, nome) DO NOTHING;

INSERT INTO public.regras_cobranca (empresa_operadora_id, nome, trigger_dias, canais_habilitados, prioridade)
SELECT
  em.id,
  'Vencimento Hoje',
  0,
  ARRAY['email', 'whatsapp'],
  'CRITICO'
FROM public.empresa_operadora em
ON CONFLICT (empresa_operadora_id, nome) DO NOTHING;

INSERT INTO public.regras_cobranca (empresa_operadora_id, nome, trigger_dias, canais_habilitados, prioridade)
SELECT
  em.id,
  'Lembrete D+1',
  1,
  ARRAY['email', 'whatsapp'],
  'CRITICO'
FROM public.empresa_operadora em
ON CONFLICT (empresa_operadora_id, nome) DO NOTHING;

INSERT INTO public.regras_cobranca (empresa_operadora_id, nome, trigger_dias, canais_habilitados, prioridade)
SELECT
  em.id,
  'Lembrete D+3',
  3,
  ARRAY['email', 'whatsapp'],
  'NORMAL'
FROM public.empresa_operadora em
ON CONFLICT (empresa_operadora_id, nome) DO NOTHING;

INSERT INTO public.regras_cobranca (empresa_operadora_id, nome, trigger_dias, canais_habilitados, prioridade)
SELECT
  em.id,
  'Lembrete D+7',
  7,
  ARRAY['email', 'whatsapp'],
  'NORMAL'
FROM public.empresa_operadora em
ON CONFLICT (empresa_operadora_id, nome) DO NOTHING;

INSERT INTO public.regras_cobranca (empresa_operadora_id, nome, trigger_dias, canais_habilitados, prioridade)
SELECT
  em.id,
  'Lembrete D+15',
  15,
  ARRAY['email', 'whatsapp'],
  'BAIXO'
FROM public.empresa_operadora em
ON CONFLICT (empresa_operadora_id, nome) DO NOTHING;

-- ======================================================================
-- ETAPA 3 — Eventos de Cobrança no Catálogo de Comunicação
-- ======================================================================

INSERT INTO public.comunicacao_eventos_catalogo (event_name, domain, descricao, canais_habilitados, template_key_padrao, prioridade, max_tentativas, backoff_segundos, tenant_scope)
VALUES
  ('COLECTION_REMINDER_D15',     'financial', 'Lembrete de cobrança D-15',         ARRAY['in_app','email','whatsapp'], 'collection_reminder',     'NORMAL', 3, 60,  'TENANT'),
  ('COLECTION_REMINDER_D10',     'financial', 'Lembrete de cobrança D-10',         ARRAY['in_app','email','whatsapp'], 'collection_reminder',     'NORMAL', 3, 60,  'TENANT'),
  ('COLECTION_REMINDER_D7',      'financial', 'Lembrete de cobrança D-7',          ARRAY['in_app','email','whatsapp'], 'collection_reminder',     'NORMAL', 3, 60,  'TENANT'),
  ('COLECTION_REMINDER_D5',      'financial', 'Lembrete de cobrança D-5 (padrão)',  ARRAY['in_app','email','whatsapp'], 'collection_reminder',     'ALTO',   3, 60,  'TENANT'),
  ('COLECTION_REMINDER_D3',      'financial', 'Lembrete de cobrança D-3',           ARRAY['in_app','email','whatsapp'], 'collection_reminder',     'NORMAL', 3, 60,  'TENANT'),
  ('COLECTION_REMINDER_D1',      'financial', 'Lembrete de cobrança D-1',            ARRAY['in_app','email','whatsapp'], 'collection_reminder',     'ALTO',   3, 60,  'TENANT'),
  ('COLECTION_OVERDUE',          'financial', 'Cobrança de título vencido',          ARRAY['in_app','email','whatsapp'], 'collection_overdue',      'CRITICO',3, 86400, 'TENANT'),
  ('COLECTION_PAID',             'financial', 'Cobrança paga com sucesso',           ARRAY['in_app','email','whatsapp'], 'collection_paid',         'ALTO',   2, 60,  'TENANT')
ON CONFLICT (event_name) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  canais_habilitados = EXCLUDED.canais_habilitados,
  template_key_padrao = EXCLUDED.template_key_padrao,
  prioridade = EXCLUDED.prioridade,
  max_tentativas = EXCLUDED.max_tentativas,
  backoff_segundos = EXCLUDED.backoff_segundos,
  updated_at = NOW();

-- ======================================================================
-- ETAPA 4 — Templates Padrão para Eventos de Cobrança
-- ======================================================================

-- E-mail templates
INSERT INTO public.comunicacao_templates (empresa_operadora_id, template_key, event_name, canal, assunto, corpo, variaveis, versao, status, criado_por)
SELECT
  em.id,
  'collection_reminder_d5',
  'COLECTION_REMINDER_D5',
  'email',
  'Lembrete: Cobrança Vencendo em {{dias_para_vencimento}} dias',
  '<p>Olá {{cliente_nome}},</p>
<p>Este é um lembrete de que sua cobrança de <strong>{{valor}}</strong> vence em {{vencimento}} ({{dias_para_vencimento}} dias restantes).</p>
<p>Por favor, realize o pagamento para evitar multas e juros.</p>
<p><a href="{{link_pagamento}}" style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5;">Pagar Agora</a></p>
<p>Atenciosamente,<br/>Equipe SOBRE MÍDIA</p>',
  ARRAY['cliente_nome', 'empresa_nome', 'valor', 'vencimento', 'dias_para_vencimento', 'dias_em_atraso', 'link_pagamento', 'numero_cobranca'],
  1,
  'ACTIVE',
  (SELECT id FROM public.usuarios LIMIT 1)
FROM public.empresa_operadora em
ON CONFLICT (template_key, canal, versao) DO NOTHING;

INSERT INTO public.comunicacao_templates (empresa_operadora_id, template_key, event_name, canal, assunto, corpo, variaveis, versao, status, criado_por)
SELECT
  em.id,
  'collection_reminder_d1',
  'COLECTION_REMINDER_D1',
  'email',
  '⚠️ Cobrança Vencendo Hoje - {{dias_para_vencimento}} dias restantes',
  '<p>Olá {{cliente_nome}},</p>
<p><strong>Atenção:</strong> Sua cobrança de <strong>{{valor}}</strong> vence hoje ({{dias_para_vencimento}} dias restantes).</p>
<p>Por favor, realize o pagamento imediatamente.</p>
<p><a href="{{link_pagamento}}" style="background-color: #ef4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5;">Pagar Agora</a></p>
<p>Atenciosamente,<br/>Equipe SOBRE MÍDIA</p>',
  ARRAY['cliente_nome', 'empresa_nome', 'valor', 'vencimento', 'dias_para_vencimento', 'dias_em_atraso', 'link_pagamento', 'numero_cobranca'],
  1,
  'ACTIVE',
  (SELECT id FROM public.usuarios LIMIT 1)
FROM public.empresa_operadora em
ON CONFLICT (template_key, canal, versao) DO NOTHING;

INSERT INTO public.comunicacao_templates (empresa_operadora_id, template_key, event_name, canal, assunto, corpo, variaveis, versao, status, criado_por)
SELECT
  em.id,
  'collection_overdue',
  'COLECTION_OVERDUE',
  'email',
  'Cobrança em Atraso - {{dias_em_atraso}} dias em atraso',
  '<p>Olá {{cliente_nome}},</p>
<p>Sua cobrança de <strong>{{valor}}</strong> está em atraso há {{dias_em_atraso}} dias.</p>
<p>Por favor, realize o pagamento o mais breve possível para evitar complicações.</p>
<p><a href="{{link_pagamento}}" style="background-color: #f87171; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5;">Pagar Agora</a></p>
<p>Atenciosamente,<br/>Equipe SOBRE MÍDIA</p>',
  ARRAY['cliente_nome', 'empresa_nome', 'valor', 'vencimento', 'dias_para_vencimento', 'dias_em_atraso', 'link_pagamento', 'numero_cobranca'],
  1,
  'ACTIVE',
  (SELECT id FROM public.usuarios LIMIT 1)
FROM public.empresa_operadora em
ON CONFLICT (template_key, canal, versao) DO NOTHING;

-- WhatsApp templates
INSERT INTO public.comunicacao_templates (empresa_operadora_id, template_key, event_name, canal, assunto, corpo, variaveis, versao, status, criado_por)
SELECT
  em.id,
  'collection_reminder_d5_whatsapp',
  'COLECTION_REMINDER_D5',
  'whatsapp',
  '',
  'Olá {{cliente_nome}}! Lembrete: sua cobrança de {{valor}} vence em {{vencimento}} ({{dias_para_vencimento}} dias). Para pagar: {{link_pagamento}}',
  ARRAY['cliente_nome', 'valor', 'vencimento', 'dias_para_vencimento', 'link_pagamento', 'numero_cobranca'],
  1,
  'ACTIVE',
  (SELECT id FROM public.usuarios LIMIT 1)
FROM public.empresa_operadora em
ON CONFLICT (template_key, canal, versao) DO NOTHING;

INSERT INTO public.comunicacao_templates (empresa_operadora_id, template_key, event_name, canal, assunto, corpo, variaveis, versao, status, criado_por)
SELECT
  em.id,
  'collection_overdue_whatsapp',
  'COLECTION_OVERDUE',
  'whatsapp',
  '',
  'Olá {{cliente_nome}}! Sua cobrança de {{valor}} está em atraso há {{dias_em_atraso}} dias. Por favor, acesse {{link_pagamento}} para quitar.',
  ARRAY['cliente_nome', 'valor', 'vencimento', 'dias_para_vencimento', 'dias_em_atraso', 'link_pagamento', 'numero_cobranca'],
  1,
  'ACTIVE',
  (SELECT id FROM public.usuarios LIMIT 1)
FROM public.empresa_operadora em
ON CONFLICT (template_key, canal, versao) DO NOTHING;

-- ======================================================================
-- ETAPA 5 — View: Cobrança Completa (para a Central de Cobranças)
-- ======================================================================

CREATE OR REPLACE VIEW public.vw_cobranca_completa AS
SELECT
  c.id,
  c.empresa_operadora_id,
  c.cliente_id,
  c.contrato_id,
  c.numero_documento,
  c.vencimento,
  c.valor_original,
  c.desconto,
  c.juros,
  c.multa,
  c.valor_pago,
  c.saldo,
  c.status AS status_conta_receber,
  CASE
    WHEN c.vencimento IS NOT NULL THEN
      (SELECT EXTRACT(DAY FROM (c.vencimento AT TIME ZONE tz.timezone - INTERVAL '1 day'))::INT
       FROM (SELECT timezone FROM public.empresa_operadora WHERE id = c.empresa_operadora_id) AS tz(timezone)
      )
    ELSE NULL
  END AS dias_para_vencimento,
  rc.trigger_dias AS regra_trigger_dias,
  rc.canais_habilitados AS regra_canais,
  rc.prioridade AS regra_prioridade,
  fa.evento,
  fa.created_at AS ultima_atualizacao
FROM public.contas_receber c
LEFT JOIN public.regras_cobranca rc ON rc.empresa_operadora_id = c.empresa_operadora_id AND rc.ativo = TRUE
LEFT JOIN public.financeiro_auditoria fa ON fa.empresa_operadora_id = c.empresa_operadora_id AND fa.evento IN ('CONTA_CRIADA', 'PARCELA_GERADA', 'PAGAMENTO')
ORDER BY c.vencimento ASC;

CREATE INDEX IF NOT EXISTS idx_vw_cobranca_tenant ON public.vw_cobranca_completa(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_vw_cobranca_vencimento ON public.vw_cobranca_completa(vencimento);

-- ======================================================================
-- ETAPA 6 — Triggers de Dispatch para Billing Worker
-- O trigger dispata jobs de cobrança (eventos COLECTION_*) para o billing-worker
-- e jobs demais para o communication-core existente
-- ======================================================================

CREATE OR REPLACE FUNCTION public.trg_dispatch_billing_job()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_payload JSONB;
  v_is_billing BOOLEAN;
  v_event_name TEXT;
BEGIN
  -- Apenas disparar se o status for PENDING
  IF NEW.status = 'PENDING' THEN
    v_event_name := COALESCE(NEW.event_name, NEW.tipo);

    -- Verificar se é evento de cobrança (começa com COLECTION_)
    v_is_billing := v_event_name LIKE 'COLECTION_%';

    -- Obter URL e secret
    SELECT value INTO v_url FROM vault.secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT value INTO v_secret FROM vault.secrets WHERE name = 'BILLING_WORKER_SECRET' LIMIT 1;

    -- Fallback se BILLING_WORKER_SECRET não estiver presente
    IF v_secret IS NULL THEN
      SELECT value INTO v_secret FROM vault.secrets WHERE name = 'CRON_SECRET' LIMIT 1;
    END IF;

    IF v_url IS NOT NULL AND v_secret IS NOT NULL THEN
      v_payload := jsonb_build_object(
        'job_id', NEW.id,
        'event_name', v_event_name,
        'channel', COALESCE(NEW.canal, 'EMAIL'),
        'payload', NEW.payload
      );

      IF v_is_billing THEN
        -- Dispatch para billing-worker
        PERFORM net.http_post(
          url := v_url || '/functions/v1/billing-worker',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_secret
          ),
          body := v_payload
        );
      ELSE
        -- Dispatch para communication-core (comportamento existente)
        PERFORM net.http_post(
          url := v_url || '/functions/v1/communication-core',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_secret
          ),
          body := v_payload
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Fallback seguro para não impedir o INSERT do job
  RAISE WARNING 'Erro ao despachar job %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger para jobs de cobrança (eventos COLECTION_*)
DROP TRIGGER IF EXISTS trg_jobs_after_insert ON public.jobs;
CREATE TRIGGER trg_jobs_after_insert
  AFTER INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_dispatch_billing_job();

-- Trigger de retry para jobs de cobrança
DROP TRIGGER IF EXISTS trg_jobs_after_update ON public.jobs;
CREATE TRIGGER trg_jobs_after_update
  AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW
  WHEN (NEW.status = 'PENDING' AND OLD.status != 'PENDING')
  EXECUTE FUNCTION public.trg_dispatch_billing_job();

-- ======================================================================
-- COMENTÁRIO FINAL
-- ======================================================================

SELECT 'Migration 20261018: Billing Central Foundation + Dispatch Triggers completed' AS status;