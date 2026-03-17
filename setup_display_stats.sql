-- =========================================================================================
-- [OFFLINE ANALYTICS] - Sistema de Processamento de Estatísticas em Lote
-- =========================================================================================

-- 1. Criação da Tabela Otimizada (Armazena 1 linha por Mídia/Dia por Player)
CREATE TABLE IF NOT EXISTS public.display_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    screen_id UUID NOT NULL REFERENCES public.screens(id) ON DELETE CASCADE,
    media_id UUID NOT NULL,
    media_name TEXT NOT NULL,
    play_date DATE NOT NULL DEFAULT CURRENT_DATE,
    play_count INTEGER NOT NULL DEFAULT 1,
    total_duration_seconds INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Restrição Única para o Upsert Inteligente (Garante que não haverá linhas duplicadas do mesmo dia)
    UNIQUE(screen_id, media_id, play_date)
);

-- Habilita RLS por segurança
ALTER TABLE public.display_stats ENABLE ROW LEVEL SECURITY;

-- Permissões Padrão B2B
CREATE POLICY "Painel Administrativo pode ler stats" ON public.display_stats FOR SELECT USING (true);
CREATE POLICY "Player pode inserir stats" ON public.display_stats FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Player pode atualizar stats" ON public.display_stats FOR UPDATE USING (auth.role() = 'authenticated');


-- 2. Função de RPC Inteligente (Descarregamento do Lote do Android)
-- Esta função recebe o JSON Array de exibições enviado pelo PersistentHeartbeatService do Player
-- Agrupa as batidas locais por mídia e dia, e faz o merge direto no banco (Upsert Matemático).
CREATE OR REPLACE FUNCTION public.process_display_analytics_batch(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.display_stats (
        screen_id, 
        media_id, 
        media_name, 
        play_date, 
        play_count, 
        total_duration_seconds
    )
    SELECT 
        (p->>'screen_id')::uuid AS screen_id,
        (p->>'media_id')::uuid AS media_id,
        MAX(p->>'media_name') AS media_name,
        (p->>'played_at')::date AS play_date,
        COUNT(*) AS play_count,
        SUM((p->>'duration_seconds')::integer) AS total_duration_seconds
    FROM jsonb_array_elements(payload) AS p
    GROUP BY 
        (p->>'screen_id')::uuid, 
        (p->>'media_id')::uuid, 
        (p->>'played_at')::date
    ON CONFLICT (screen_id, media_id, play_date) 
    DO UPDATE SET 
        play_count = display_stats.play_count + EXCLUDED.play_count,
        total_duration_seconds = display_stats.total_duration_seconds + EXCLUDED.total_duration_seconds,
        updated_at = NOW();
END;
$$;


-- 3. View Otimizada para o Gráfico do Dashboard (Carregamento em 0ms)
-- Consome direto a tabela agregada e junta estatísticas dos últimos 7 dias.
CREATE OR REPLACE VIEW public.dashboard_media_stats AS
SELECT 
    media_id,
    MAX(media_name) as media_name,
    SUM(play_count) as total_plays,
    SUM(total_duration_seconds) as total_time_seconds,
    MIN(play_date) as first_seen_this_week,
    MAX(play_date) as last_seen_this_week
FROM 
    public.display_stats
WHERE 
    play_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY 
    media_id;
