-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20260920
-- ETAPA 8: CRON SCHEDULE PARA check-offline-screens
-- + Tabela de controle de idempotência para notificações de player offline
-- ----------------------------------------------------------------------
-- Problema: check-offline-screens existia como Edge Function mas não
-- possuía agendamento cron registrado → órfã, nunca executava.
-- Problema secundário: sem idempotência → poderia enviar múltiplas
-- notificações pelo mesmo evento offline.
-- ======================================================================

-- ======================================================================
-- 1. HABILITAR pg_cron (se não estiver habilitado)
-- Note: no Supabase, pg_cron é habilitado via dashboard ou CLI.
-- Esta migration registra o schedule assumindo que pg_cron está ativo.
-- ======================================================================

-- ======================================================================
-- 2. TABELA DE CONTROLE DE IDEMPOTÊNCIA — notificacoes_player_enviadas
-- Rastreia quais alertas de offline já foram enviados para evitar flood.
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.notificacoes_player_enviadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  screen_id TEXT NOT NULL,             -- ID da tela (pode ser UUID ou string)
  usuario_id UUID,                     -- Usuário proprietário da tela
  evento VARCHAR(30) NOT NULL DEFAULT 'PLAYER_OFFLINE' CHECK (
    evento IN ('PLAYER_OFFLINE', 'PLAYER_ONLINE')
  ),
  canal VARCHAR(20) NOT NULL DEFAULT 'EMAIL',
  idempotency_key TEXT NOT NULL UNIQUE, -- Formato: PLAYER_OFFLINE:{screen_id}:{periodo_hora}
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido_em TIMESTAMPTZ,            -- Preenchido quando player volta online
  minutos_offline INT,
  correlation_id UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_npe_tenant ON public.notificacoes_player_enviadas(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_npe_screen ON public.notificacoes_player_enviadas(screen_id, evento);
CREATE INDEX IF NOT EXISTS idx_npe_idem ON public.notificacoes_player_enviadas(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_npe_enviado ON public.notificacoes_player_enviadas(enviado_em DESC);

-- RLS: mesmo tenant
ALTER TABLE public.notificacoes_player_enviadas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notificacoes_player_enviadas' AND policyname = 'npe_select_tenant'
  ) THEN
    CREATE POLICY npe_select_tenant ON public.notificacoes_player_enviadas
    FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()));
  END IF;

  -- INSERT somente via service_role (cron server-side)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notificacoes_player_enviadas' AND policyname = 'npe_no_client_insert'
  ) THEN
    CREATE POLICY npe_no_client_insert ON public.notificacoes_player_enviadas
    FOR INSERT TO authenticated
    WITH CHECK (FALSE); -- apenas service_role pode inserir
  END IF;
END $$;

-- ======================================================================
-- 3. RPC: marcar_player_online
-- Chamada pelo Player Android quando restabelece conexão.
-- Resolve notificações abertas + emite notificação IN_APP de recuperação.
-- ======================================================================

CREATE OR REPLACE FUNCTION public.marcar_player_online(
  p_screen_id TEXT,
  p_empresa_operadora_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved INT := 0;
BEGIN
  -- Marcar notificações de PLAYER_OFFLINE como resolvidas
  UPDATE public.notificacoes_player_enviadas
  SET resolvido_em = NOW()
  WHERE screen_id = p_screen_id
    AND evento = 'PLAYER_OFFLINE'
    AND resolvido_em IS NULL;

  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  -- Registrar evento de retorno online para auditoria
  IF v_resolved > 0 AND p_empresa_operadora_id IS NOT NULL THEN
    INSERT INTO public.notificacoes_central (
      empresa_operadora_id,
      tipo_evento,
      canal,
      titulo,
      mensagem,
      prioridade,
      severidade,
      status_envio,
      status_notificacao,
      lida
    ) VALUES (
      p_empresa_operadora_id,
      'PLAYER_ONLINE',
      'IN_APP',
      'Player voltou online',
      format('Tela %s restabeleceu a conexão.', p_screen_id),
      'SUCESSO',
      'INFO',
      'SENT',
      'NAO_LIDA',
      FALSE
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'screen_id', p_screen_id,
    'notifications_resolved', v_resolved
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_player_online(TEXT, UUID) TO authenticated;

-- ======================================================================
-- 4. CRON SCHEDULE VIA pg_cron
-- Executa check-offline-screens a cada 5 minutos (24/7).
-- ======================================================================

-- Remover schedule anterior se existir (evitar duplicação)
SELECT cron.unschedule('check-offline-screens-cron') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'check-offline-screens-cron'
);

-- Criar novo schedule: a cada 5 minutos
SELECT cron.schedule(
  'check-offline-screens-cron',   -- nome único do job
  '*/5 * * * *',                  -- a cada 5 minutos
  $$
  SELECT net.http_post(
    url := (SELECT value FROM vault.secrets WHERE name = 'SUPABASE_URL' LIMIT 1)
           || '/functions/v1/check-offline-screens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM vault.secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('source', 'pg_cron')
  )
  $$
);

-- ======================================================================
-- Nota de arquitetura:
-- O cron usa pg_cron + net.http_post (extensão http do Supabase).
-- CRON_SECRET deve estar configurado em vault.secrets E como variável
-- de ambiente da Edge Function.
-- A idempotência dos e-mails é controlada por notificacoes_player_enviadas.
-- O check-offline-screens DEVE inserir registros na tabela de idempotência
-- antes de enviar o e-mail, usando ON CONFLICT DO NOTHING para evitar
-- duplicatas.
-- ======================================================================
