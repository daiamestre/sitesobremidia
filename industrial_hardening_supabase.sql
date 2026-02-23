-- ==========================================================
-- PROTOCOLO DE BLINDAGEM INDUSTRIAL - DATABASE LAYER
-- Otimização de Estatísticas e Segurança RLS
-- ==========================================================

BEGIN;

-- 1. FLEXIBILIDADE DE TIPOS (Evita descarte de logs por cast de UUID)
-- Se o screen_id ou media_id estiverem como UUID, alteramos para TEXT para aceitar 
-- tanto o UUID quanto o Custom ID durante transições de hardware.
DO $$ 
BEGIN 
    ALTER TABLE public.playback_logs ALTER COLUMN screen_id TYPE TEXT;
    ALTER TABLE public.playback_logs ALTER COLUMN media_id TYPE TEXT;
EXCEPTION WHEN OTHERS THEN 
    RAISE NOTICE 'Tipagem já ajustada ou erro ao alterar.';
END $$;

-- 2. POLÍTICA RLS "BRINDADA" PARA LOGS (Habilitar INSERT sem fricção)
DROP POLICY IF EXISTS "Permitir inserção de logs de reprodução" ON public.playback_logs;
CREATE POLICY "Permitir inserção de logs de reprodução industrial" 
ON public.playback_logs FOR INSERT 
TO public
WITH CHECK (true);

-- 3. MATERIALIZED VIEW PARA PERFORMANCE DE GRÁFICOS (Fim dos Timeouts)
-- Pré-calcula as estatísticas diárias para que o Dashboard carregue instantaneamente.
DROP MATERIALIZED VIEW IF EXISTS public.mv_daily_stats;
CREATE MATERIALIZED VIEW public.mv_daily_stats AS
SELECT 
    screen_id,
    date_trunc('day', started_at AT TIME ZONE 'UTC') as log_day,
    count(*) as total_plays
FROM public.playback_logs
GROUP BY 1, 2
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_stats ON public.mv_daily_stats (screen_id, log_day);

-- Função para atualizar a view (pode ser chamada via RPC ou Cron)
CREATE OR REPLACE FUNCTION public.refresh_daily_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. ÍNDICES DE PERFORMANCE FORENSE
CREATE INDEX IF NOT EXISTS idx_logs_screen_date ON public.playback_logs (screen_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_screens_custom_id ON public.screens (custom_id);

COMMIT;
