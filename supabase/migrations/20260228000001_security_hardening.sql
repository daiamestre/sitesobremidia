-- ==========================================================
-- PROTOCOLO DE ENDURECIMENTO DE SEGURANÇA (SECURITY HARDENING - FINAL)
-- Este script corrige os 7 erros críticos apontados pelo Consultor de Segurança
-- ==========================================================

-- 1. CORREÇÃO: Habilitar RLS em tabelas vulneráveis
ALTER TABLE IF EXISTS public.proof_of_play ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.screenshots_logs ENABLE ROW LEVEL SECURITY;

-- 2. CORREÇÃO: Políticas de Segurança (Apenas usuários autenticados)
DO $$ 
BEGIN
    -- Política para proof_of_play
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'proof_of_play' AND policyname = 'Authenticated users can view proof_of_play') THEN
        CREATE POLICY "Authenticated users can view proof_of_play" ON public.proof_of_play
            FOR SELECT TO authenticated USING (true);
    END IF;

    -- Política para screenshots_logs
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'screenshots_logs' AND policyname = 'Authenticated users can view screenshots_logs') THEN
        CREATE POLICY "Authenticated users can view screenshots_logs" ON public.screenshots_logs
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- 3. CORREÇÃO: Recriar Views com SECURITY INVOKER (Segurança de Linha ativada)
-- Nota: Usando 'WITH (security_invoker = true)' para Postgres 15+

DROP VIEW IF EXISTS public.vw_offline_screens;
CREATE OR REPLACE VIEW public.vw_offline_screens WITH (security_invoker = true) AS 
SELECT id, name, custom_id, last_ping_at, (now() - last_ping_at) AS offline_duration
FROM public.screens
WHERE last_ping_at < (now() - '00:05:00'::interval) AND is_active = true;

DROP VIEW IF EXISTS public.vw_screen_activity;
CREATE OR REPLACE VIEW public.vw_screen_activity WITH (security_invoker = true) AS 
SELECT screen_id, count(*) AS total_plays, max(started_at) AS last_play_at
FROM public.playback_logs
GROUP BY screen_id;

DROP VIEW IF EXISTS public.vw_media_popularity;
CREATE OR REPLACE VIEW public.vw_media_popularity WITH (security_invoker = true) AS 
SELECT l.media_id, m.name AS media_name, count(*) AS play_count, sum(l.duration) AS total_duration_seconds
FROM (public.playback_logs l LEFT JOIN public.media m ON ((l.media_id = (m.id)::text)))
WHERE (l.started_at > (now() - '30 days'::interval))
GROUP BY l.media_id, m.name
ORDER BY (count(*)) DESC;

DROP VIEW IF EXISTS public.vw_daily_stats;
CREATE OR REPLACE VIEW public.vw_daily_stats WITH (security_invoker = true) AS 
SELECT date_trunc('day'::text, started_at) AS day, count(*) AS total_plays, sum(duration) AS total_duration_seconds
FROM public.playback_logs
WHERE (started_at > (now() - '30 days'::interval))
GROUP BY (date_trunc('day'::text, started_at))
ORDER BY (date_trunc('day'::text, started_at));

DROP VIEW IF EXISTS public.vw_industrial_monitoring;
CREATE OR REPLACE VIEW public.vw_industrial_monitoring WITH (security_invoker = true) AS 
SELECT name, custom_id, status_note AS status, app_version, cpu_temp, ram_usage, free_space, uptime, last_ping_at,
CASE WHEN (last_ping_at < (now() - '00:05:00'::interval)) THEN 'OFFLINE'::text ELSE 'ONLINE'::text END AS connectivity_status
FROM public.screens;
