-- [OTIMIZAÇÃO] Manutenção de Logs do Player Android
-- Execute este script no SQL Editor do Supabase para manter o seu banco leve e dentro da cota.

-- 1. Limpar logs com mais de 7 dias (Tabela playback_logs - Dados do Dashboard/Gráficos)
DELETE FROM playback_logs 
WHERE started_at < NOW() - INTERVAL '7 days';

-- 2. Limpar logs de erro com mais de 7 dias (Tabela device_logs - Logs técnicos)
DELETE FROM device_logs 
WHERE created_at < NOW() - INTERVAL '7 days';

-- 3. [LIMPEZA DE STORAGE] "Limpeza Pesada" via SQL Proxy
-- Primeiro, ativamos a extensão 'pg_net' (necessária para falar com a Edge Function)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Agora chamamos a função 'maintenance' que criamos
SELECT
  net.http_post(
    url := 'https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/maintenance',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer SEU_ANON_KEY_OU_SERVICE_ROLE"}'::jsonb,
    body := '{}'::jsonb
  ) as job_id;


-- [DICA] Manutenção Manual de Storage (Vídeos/Imagens):
-- Vá em "Storage" -> bucket "media" e remova arquivos obsoletos para liberar quota de GB.
-- O Player Android sincroniza apenas o que está na playlist e limpa o cache local sozinho.



