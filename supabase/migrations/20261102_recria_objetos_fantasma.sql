-- ======================================================================
-- SOBRE MÍDIA — MIGRATION CORRETIVA 20261044
-- RECRIA OBJETOS FANTASMA (REPO × CLOUD DRIFT)
--
-- Causa raiz auditada: as migrations históricas 017/023/027/028 estão
-- marcadas como aplicadas, porém parte dos objetos que elas criam NÃO
-- existe mais no banco vivo (remoção ocorrida fora do sistema de
-- migrations). O código de aplicação e as Edge Functions consomem esses
-- objetos em produção (Centro Operacional, BI, IA, auditoria de
-- segurança e preferências de notificação offline), gerando erros 400
-- PGRST em runtime.
--
-- Estratégia (conforme governança do projeto):
--   * Migration CORRETIVA — histórico intacto;
--   * 100% idempotente (IF NOT EXISTS / DO blocks);
--   * Aditiva — nenhum dado ou objeto existente é alterado;
--   * RLS multi-tenant no padrão atual da casa
--     (public.get_user_empresa_operadora_id(auth.uid()));
--   * Sem backdoors: nenhuma política permissiva global nova.
-- ======================================================================

-- ---------------------------------------------------------------------
-- 1) CENTRO OPERACIONAL — tabelas filhas ausentes (origem: migration 017)
--    (operacoes e operacao_players já existem no banco vivo)
-- ---------------------------------------------------------------------

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

ALTER TABLE public.operacao_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacao_metricas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacao_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacao_auditoria ENABLE ROW LEVEL SECURITY;

-- Isolamento multi-tenant via join em operacoes (tabelas filhas não
-- carregam empresa_operadora_id própria).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['operacao_logs','operacao_metricas','operacao_alertas','operacao_auditoria']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS p_tenant_%s_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS p_tenant_%s_insert ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY p_tenant_%1$s_select ON public.%1$I FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.operacoes o
          WHERE o.id = %1$I.operacao_id
            AND (o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                 OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL)
        )
      )
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY p_tenant_%1$s_insert ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.operacoes o
          WHERE o.id = %1$I.operacao_id
            AND (o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                 OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL)
        )
      )
    $f$, t);
  END LOOP;

  -- Resolução de alertas exige UPDATE escopado ao tenant
  DROP POLICY IF EXISTS p_tenant_operacao_alertas_update ON public.operacao_alertas;
  CREATE POLICY p_tenant_operacao_alertas_update ON public.operacao_alertas FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_alertas.operacao_id
        AND (o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
             OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.operacoes o
      WHERE o.id = operacao_alertas.operacao_id
        AND (o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
             OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL)
    )
  );
END $$;

-- ---------------------------------------------------------------------
-- 2) BI ENTERPRISE — bi_agendamentos ausente (origem: migration 023)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bi_agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  frequencia VARCHAR(20) NOT NULL CHECK (frequencia IN ('DIARIO', 'SEMANAL', 'MENSAL', 'QUARTAL', 'ANUAL')),
  destinatarios JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'PAUSADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bi_agendamentos_tenant ON public.bi_agendamentos(empresa_operadora_id);

ALTER TABLE public.bi_agendamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_tenant_bi_agendamentos_select ON public.bi_agendamentos;
CREATE POLICY p_tenant_bi_agendamentos_select ON public.bi_agendamentos FOR SELECT TO authenticated
USING (
  empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL
);

DROP POLICY IF EXISTS p_tenant_bi_agendamentos_insert ON public.bi_agendamentos;
CREATE POLICY p_tenant_bi_agendamentos_insert ON public.bi_agendamentos FOR INSERT TO authenticated
WITH CHECK (
  empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
);

-- ---------------------------------------------------------------------
-- 3) CORPORATE AI — ai_predicoes ausente (origem: migration 027)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_predicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  previsao JSONB NOT NULL DEFAULT '{}'::jsonb,
  confianca NUMERIC(5, 2) DEFAULT 95.00,
  origem VARCHAR(50) NOT NULL DEFAULT 'DATA_WAREHOUSE',
  modelo VARCHAR(100) NOT NULL DEFAULT 'Gemini-1.5-Pro',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_predicoes_tenant ON public.ai_predicoes(empresa_operadora_id);

ALTER TABLE public.ai_predicoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_tenant_ai_predicoes_select ON public.ai_predicoes;
CREATE POLICY p_tenant_ai_predicoes_select ON public.ai_predicoes FOR SELECT TO authenticated
USING (
  empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL
);

-- ---------------------------------------------------------------------
-- 4) AUDITORIA DE SEGURANÇA — security_logs ausente (origem: migration 028)
--    Contrato preservado: INSERT aberto (login anônimo precisa registrar
--    falhas), SELECT restrito a ADMIN. Sem dados sensíveis além dos já
--    previstos no schema original.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('LOGIN_FAILED', 'LOGIN_SUCCESS', 'LOGOUT', 'REPRESENTATIVE_APPROVED', 'PASSWORD_CHANGED', 'ACCESS_DENIED')),
  user_email VARCHAR(255),
  user_id UUID,
  user_agent TEXT,
  ip_address VARCHAR(45),
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_security_logs_event_type ON public.security_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_logs_user_email ON public.security_logs(user_email);

ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_security_logs_insert ON public.security_logs;
CREATE POLICY p_security_logs_insert ON public.security_logs
FOR INSERT TO anon, authenticated
WITH CHECK (TRUE);

DROP POLICY IF EXISTS p_security_logs_admin_select ON public.security_logs;
CREATE POLICY p_security_logs_admin_select ON public.security_logs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND UPPER(p.nome) = 'ADMIN'
  )
);

-- ---------------------------------------------------------------------
-- 5) PREFERÊNCIAS DE NOTIFICAÇÃO OFFLINE — colunas ausentes em profiles
--    Consumidas por: Settings.tsx (leitura/gravação) e Edge Functions
--    check-offline-screens / send-status-notification (cron de alerta).
-- ---------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS offline_notification_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS offline_notification_threshold INT NOT NULL DEFAULT 5
  CHECK (offline_notification_threshold BETWEEN 1 AND 1440);

-- ---------------------------------------------------------------------
-- 6) GRANTs mínimos (defesa em profundidade; sem PUBLIC)
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT ON public.operacao_logs TO authenticated;
GRANT SELECT, INSERT ON public.operacao_metricas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.operacao_alertas TO authenticated;
GRANT SELECT, INSERT ON public.operacao_auditoria TO authenticated;
GRANT SELECT, INSERT ON public.bi_agendamentos TO authenticated;
GRANT SELECT ON public.ai_predicoes TO authenticated;
GRANT INSERT ON public.security_logs TO anon, authenticated;
GRANT SELECT ON public.security_logs TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
