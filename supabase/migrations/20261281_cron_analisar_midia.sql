-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261281 — F-110
-- Varredura do robô de análise de mídias a cada 10 minutos (mídias PENDENTES
-- que não foram analisadas logo após o envio).
-- ROLLBACK: SELECT cron.unschedule('analisar-midias-pendentes');
-- ======================================================================
DO $$
BEGIN
  PERFORM cron.unschedule('analisar-midias-pendentes') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analisar-midias-pendentes');
  PERFORM cron.schedule('analisar-midias-pendentes', '*/10 * * * *', $cmd$
    SELECT net.http_post(
      url := 'https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/analisar-midia',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{"action":"varrer"}'::jsonb,
      timeout_milliseconds := 120000);
  $cmd$);
END $$;
