-- ======================================================================
-- 20260923_communication_jobs_webhook.sql
-- Postgres Trigger para acionar o Communication Core em novos jobs
-- ======================================================================

CREATE OR REPLACE FUNCTION public.trg_dispatch_communication_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_payload JSONB;
  v_request_id BIGINT;
BEGIN
  -- Apenas disparar se o status for PENDING
  IF NEW.status = 'PENDING' THEN
    -- Obter a URL e o secret do vault (ou usar environment configuration se não usar vault)
    -- Em Supabase comumente usamos net.http_post diretamente
    
    SELECT value INTO v_url FROM vault.secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT value INTO v_secret FROM vault.secrets WHERE name = 'INTERNAL_CORE_SECRET' LIMIT 1;
    
    -- Fallback se INTERNAL_CORE_SECRET não estiver presente
    IF v_secret IS NULL THEN
      SELECT value INTO v_secret FROM vault.secrets WHERE name = 'CRON_SECRET' LIMIT 1;
    END IF;

    IF v_url IS NOT NULL AND v_secret IS NOT NULL THEN
      v_payload := jsonb_build_object(
        'job_id', NEW.id,
        'event_name', COALESCE(NEW.event_name, NEW.tipo),
        'channel', COALESCE(NEW.canal, 'EMAIL'),
        'payload', NEW.payload
      );

      SELECT net.http_post(
        url := v_url || '/functions/v1/communication-core',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_secret
        ),
        body := v_payload
      ) INTO v_request_id;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Fallback seguro para não impedir o INSERT do job
  RAISE WARNING 'Erro ao despachar job % para communication-core: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_after_insert ON public.jobs;

CREATE TRIGGER trg_jobs_after_insert
  AFTER INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_dispatch_communication_job();

-- Trigger para retry (disparar de novo se mudar de status para PENDING via backoff ou manual)
DROP TRIGGER IF EXISTS trg_jobs_after_update ON public.jobs;

CREATE TRIGGER trg_jobs_after_update
  AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW
  WHEN (NEW.status = 'PENDING' AND OLD.status != 'PENDING')
  EXECUTE FUNCTION public.trg_dispatch_communication_job();
