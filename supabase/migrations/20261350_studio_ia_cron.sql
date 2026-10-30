-- =====================================================================================================================
-- STUDIO DE IA (MG02) — fila: pg_cron chama o orquestrador a cada minuto (mesmo padrão de "analisar-midias-pendentes").
-- APLICAR SÓ DEPOIS de publicar a Edge Function studio-orquestrador (senão a tarefa só gera chamadas 404, sem efeito).
-- ADITIVO: só cria uma tarefa nova no cron. Impacto no Player: nenhum.
-- A ação "tick" só avança produções que os próprios usuários pediram (lease + transições validadas no banco);
-- chamá-la a mais não cria trabalho nem gasto novo.
-- ROLLBACK: select cron.unschedule('studio-orquestrador');
-- =====================================================================================================================
select cron.schedule(
  'studio-orquestrador',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/studio-orquestrador',
       headers := jsonb_build_object('Content-Type', 'application/json'),
       body := '{"acao":"tick"}'::jsonb,
       timeout_milliseconds := 140000); $$
);
