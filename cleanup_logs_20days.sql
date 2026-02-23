-- SCRIPT DE LIMPEZA AUTOMÁTICA DE LOGS (RETENÇÃO DE 20 DIAS)
-- Este script cria uma "faxineira" que roda todo dia para apagar dados velhos.

-- 1. Cria a função de limpeza
CREATE OR REPLACE FUNCTION public.delete_old_logs()
RETURNS void
LANGUAGE sql
AS $$
  -- Apaga logs que começaram a mais de 20 dias atrás
  DELETE FROM public.playback_logs
  WHERE started_at < (now() - INTERVAL '20 days');
$$;

-- 2. Habilita a extensão de Agendamento (pg_cron)
-- Nota: Se der erro aqui, você precisa ir em Database -> Extensions e ativar "pg_cron" manualmente.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 3. Agenda a limpeza para rodar todos os dias às 03:00 da manhã (hora UTC)
-- '0 3 * * *' = Minuto 0, Hora 3, Todo dia, Todo mês, Todo dia da semana
SELECT cron.schedule(
  'cleanup-logs-daily', -- Nome da tarefa
  '0 3 * * *',          -- Horário (03:00 AM)
  'SELECT public.delete_old_logs()' -- Comando
);

-- 4. Verificação imediata (Roda uma vez agora para testar)
SELECT public.delete_old_logs();

SELECT 'Limpeza agendada com sucesso!' as status;
