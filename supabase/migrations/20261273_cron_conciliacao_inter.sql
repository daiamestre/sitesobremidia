-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261273 — F-105
-- Conciliação automática com o Banco Inter a cada 15 minutos (PIX e boleto).
-- As funções consultam o próprio Inter e só registram o que o banco confirma
-- como pago (fn_registrar_pagamento_inter). Cobre avisos (webhooks) perdidos.
--
-- ROLLBACK:
--   SELECT cron.unschedule('inter-conciliacao-pix');
--   SELECT cron.unschedule('inter-conciliacao-boleto');
-- ======================================================================
DO $$
BEGIN
  PERFORM cron.unschedule('inter-conciliacao-pix') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inter-conciliacao-pix');
  PERFORM cron.unschedule('inter-conciliacao-boleto') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inter-conciliacao-boleto');
  PERFORM cron.schedule('inter-conciliacao-pix', '2,17,32,47 * * * *', $cmd$
    SELECT net.http_post(
      url := 'https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/inter-pix-engine',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{"action":"reconciliar"}'::jsonb,
      timeout_milliseconds := 120000);
  $cmd$);
  PERFORM cron.schedule('inter-conciliacao-boleto', '4,19,34,49 * * * *', $cmd$
    SELECT net.http_post(
      url := 'https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/inter-billing-engine',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{"action":"reconciliar"}'::jsonb,
      timeout_milliseconds := 120000);
  $cmd$);
END $$;
