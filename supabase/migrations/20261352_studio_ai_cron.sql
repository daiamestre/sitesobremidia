-- =====================================================================================================================
-- STUDIO AI — varredura a cada 1 min: libera o crédito de PIX já pago (F-219) e devolve o crédito de geração interrompida há mais de 15 min.
-- APLICAR depois de publicar a Edge Function studio-ai. ADITIVO (só uma tarefa nova no cron). Player: nenhum impacto.
-- ROLLBACK: select cron.unschedule('studio-ai-varrer');
-- =====================================================================================================================
select cron.schedule(
  'studio-ai-varrer',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/studio-ai',
       headers := jsonb_build_object('Content-Type', 'application/json'),
       body := '{"acao":"varrer"}'::jsonb,
       timeout_milliseconds := 60000); $$
);
