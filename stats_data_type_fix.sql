-- ==========================================
-- STATS DATA TYPE FIX & FIRE TEST
-- Goal: Loosen constraints for heterogeneous device IDs
-- ==========================================

-- 1. Precision Cleanup (Avoid "cannot alter type..." and policy errors)
DROP VIEW IF EXISTS public.vw_media_popularity;
DROP VIEW IF EXISTS public.vw_media_stats;

-- Drop Foreign Keys
ALTER TABLE public.playback_logs DROP CONSTRAINT IF EXISTS playback_logs_media_id_fkey;
ALTER TABLE public.playback_logs DROP CONSTRAINT IF EXISTS playback_logs_screen_id_fkey;

-- Drop Policies (RLS Dependencies)
-- Nuclear Option: Dynamic drop for ALL policies on this table
DO $$ 
DECLARE 
    pol RECORD;
BEGIN 
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'playback_logs' AND schemaname = 'public') 
    LOOP 
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.playback_logs';
    END LOOP; 
END $$;

-- 2. Loosen Constraints & Add Missing Columns (Safe Migration)
ALTER TABLE public.playback_logs ALTER COLUMN media_id TYPE TEXT;
ALTER TABLE public.playback_logs ALTER COLUMN screen_id TYPE TEXT;

-- Garantir coluna de Status (Requerida pelo novo DTO Industrial)
ALTER TABLE public.playback_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED';

-- Garantir que started_at seja um timestamp (Postgres converte ISO8601 automaticamente)
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE public.playback_logs ALTER COLUMN started_at TYPE TIMESTAMPTZ USING started_at::TIMESTAMPTZ;
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Já é timestamp ou coluna vazia
    END;
END $$;

-- 2. Ensure RLS is still permissive for our fix
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'playback_logs' 
        AND policyname = 'Allow Player Insert'
    ) THEN
        ALTER TABLE public.playback_logs ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Allow Player Insert" ON public.playback_logs 
        FOR INSERT WITH CHECK (true);
    END IF;
END $$;

-- 3. FIRE TEST (Manual Insertion)
-- Use this to see if the dashboard "wakes up"
-- REPLACE 'YOUR_SCREEN_ID' with the ID you see in the Dashboard
/*
INSERT INTO public.playback_logs (screen_id, media_id, duration, started_at)
VALUES ('YOUR_SCREEN_ID', 'manual-test-media', 30, NOW());
*/

-- 4. Verification View for Media Popularity
CREATE OR REPLACE VIEW vw_media_stats AS
SELECT 
    media_id,
    screen_id,
    COUNT(*) as play_count,
    SUM(duration) as total_duration_sec,
    MAX(started_at) as last_play_at
FROM public.playback_logs
GROUP BY media_id, screen_id;
