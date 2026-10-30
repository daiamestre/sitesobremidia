-- =====================================================================================================================
-- STUDIO AI — varredura a cada 5 min: geração interrompida há mais de 15 min vira falha e o crédito volta ao cliente.
-- APLICAR depois de publicar a Edge Function studio-ai. ADITIVO (só uma tarefa nova no cron). Player: nenhum impacto.
-- ROLLBACK: select cron.unschedule('studio-ai-varrer');
-- =====================================================================================================================
select cron.schedule(
  'studio-ai-varrer',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/studio-ai',
       headers := jsonb_build_object('Content-Type', 'application/json'),
       body := '{"acao":"varrer"}'::jsonb,
       timeout_milliseconds := 60000); $$
);
