-- ==========================================================
-- SCRIPT DE BLINDAGEM NUCLEAR v3.0: RESTAURAÇÃO TOTAL DAS ESTATÍSTICAS
-- Objetivo: Resolver o descasamento de IDs e garantir sincronismo imediato.
-- ==========================================================

BEGIN;

-- 1. NORMALIZADOR AUTOMÁTICO DE IDs (O "CEREBRO" DO LOG)
-- Este gatilho garante que mesmo que o player envie o ID Físico (MAC/Serial),
-- o banco de dados o converta para o UUID correto que o Dashboard espera.

CREATE OR REPLACE FUNCTION public.normalize_playback_log()
RETURNS TRIGGER AS $$
DECLARE
    v_uuid UUID;
BEGIN
    -- Tenta encontrar o UUID real baseado no ID enviado (que pode ser Custom ID ou o próprio UUID)
    SELECT id INTO v_uuid FROM public.screens 
    WHERE id::TEXT = NEW.screen_id OR custom_id = NEW.screen_id
    LIMIT 1;

    -- Se encontrou o UUID, substitui o valor para manter consistência no Dashboard
    IF v_uuid IS NOT NULL THEN
        NEW.screen_id := v_uuid::TEXT;
    END IF;

    -- Garante que o timestamp nunca seja nulo
    IF NEW.started_at IS NULL THEN
        NEW.started_at := NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplica o gatilho na tabela de logs
DROP TRIGGER IF EXISTS tr_normalize_playback_log ON public.playback_logs;
CREATE TRIGGER tr_normalize_playback_log
BEFORE INSERT ON public.playback_logs
FOR EACH ROW EXECUTE FUNCTION public.normalize_playback_log();

-- 2. REPARAÇÃO DE VISTAS (DASHBOARD COMPATIBILITY)
DROP VIEW IF EXISTS public.vw_media_popularity;
CREATE OR REPLACE VIEW public.vw_media_popularity AS
SELECT 
    l.media_id,
    m.name as media_name,
    count(*) as play_count,
    sum(l.duration) as total_duration_seconds,
    max(l.started_at) as last_play
FROM public.playback_logs l
LEFT JOIN public.media m ON l.media_id = m.id::TEXT
WHERE l.started_at > NOW() - INTERVAL '30 days'
GROUP BY l.media_id, m.name
ORDER BY play_count DESC;

-- Vista para o Gráfico de 7 dias (Coração do Analytics.tsx)
DROP VIEW IF EXISTS public.vw_daily_stats;
CREATE OR REPLACE VIEW public.vw_daily_stats AS
SELECT 
    date_trunc('day', started_at) as day,
    count(*) as total_plays
FROM public.playback_logs
WHERE started_at > NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1 ASC;

-- 3. PERMISSÕES DE ACESSO (NUCLEAR RLS)
-- Garante que o usuário do Painel possa ler os logs sem travas
ALTER TABLE public.playback_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dashboard Read Access" ON public.playback_logs;
CREATE POLICY "Dashboard Read Access" ON public.playback_logs
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Player Insert Access" ON public.playback_logs;
CREATE POLICY "Player Insert Access" ON public.playback_logs
FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 4. TESTE DE FOGO (SIMULAÇÃO DE LOG)
-- Verificamos se o trigger está funcionando. 
-- (Isto deve criar uma entrada no gráfico se houver telas cadastradas)
INSERT INTO public.playback_logs (screen_id, media_id, duration)
SELECT id::TEXT, 'test-trigger-v3', 10 
FROM public.screens 
LIMIT 1;

COMMIT;

SELECT 'Estatísticas Blindadas e IDs Normalizados com Sucesso' as status;
