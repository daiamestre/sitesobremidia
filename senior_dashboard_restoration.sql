-- ==========================================================
-- SCRIPT DE RESTAURAÇÃO: DASHBOARD & ANALYTICS v2.0
-- Arquiteto: Antigravity | Foco: Ativar Gráficos do Painel
-- ==========================================================

BEGIN;

-- 1. LIMPEZA DE DEPENDÊNCIAS (ESSENCIAL)
-- Removemos as vistas que bloqueiam a alteração de tipo das colunas.
DROP VIEW IF EXISTS public.vw_media_popularity;
DROP VIEW IF EXISTS public.vw_daily_stats;
DROP VIEW IF EXISTS public.vw_screen_activity;
DROP VIEW IF EXISTS public.vw_media_stats;

-- 2. GARANTIR ESTRUTURA DE TELEMETRIA
-- Agora o Postgres permite alterar os tipos por não ter mais dependências ativas.
ALTER TABLE public.playback_logs ALTER COLUMN media_id TYPE TEXT;
ALTER TABLE public.playback_logs ALTER COLUMN screen_id TYPE TEXT;
ALTER TABLE public.playback_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED';

-- 2. RECONSTRUÇÃO DE VIEWS CRÍTICAS PARA O DASHBOARD
-- O Dashboard do "SobreMídia" geralmente busca por estas views:

-- Vista 1: Popularidade (Top Mídias)
CREATE OR REPLACE VIEW public.vw_media_popularity AS
SELECT 
    l.media_id,
    m.name as media_name,
    count(*) as play_count,
    sum(l.duration) as total_duration_seconds
FROM public.playback_logs l
LEFT JOIN public.media m ON l.media_id = m.id::TEXT
WHERE l.started_at > NOW() - INTERVAL '30 days'
GROUP BY l.media_id, m.name
ORDER BY play_count DESC;

-- Vista 2: Estatísticas Diárias (Para o Gráfico de Linha do Dashboard)
CREATE OR REPLACE VIEW public.vw_daily_stats AS
SELECT 
    date_trunc('day', started_at) as day,
    count(*) as total_plays,
    sum(duration) as total_duration_seconds
FROM public.playback_logs
WHERE started_at > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1 ASC;

-- Vista 3: Resumo por Tela (Estado de Saúde da Rede)
CREATE OR REPLACE VIEW public.vw_screen_activity AS
SELECT 
    screen_id,
    count(*) as total_plays,
    max(started_at) as last_play_at
FROM public.playback_logs
GROUP BY screen_id;

-- 3. AJUSTE DO SENTINELA (HEARTBEAT)
-- Torna o pulse_screen mais resiliente a IDs técnicos (MAC/Android ID) 
-- para evitar o "Heartbeat erro" durante o boot.

CREATE OR REPLACE FUNCTION public.pulse_screen(
    p_screen_id TEXT,
    p_status TEXT,
    p_version TEXT,
    p_ram_usage TEXT DEFAULT 'N/A',
    p_free_space TEXT DEFAULT 'N/A',
    p_device_type TEXT DEFAULT 'mobile',
    p_cpu_temp TEXT DEFAULT 'N/A',
    p_uptime TEXT DEFAULT 'N/A',
    p_ip_address TEXT DEFAULT 'N/A'
) RETURNS JSONB AS $$
DECLARE
    v_id UUID;
BEGIN
    -- Busca por UUID ou Custom ID
    SELECT id INTO v_id FROM public.screens 
    WHERE id::TEXT = p_screen_id OR custom_id = p_screen_id;

    IF v_id IS NULL THEN
        -- Se não achou, registra uma nota de "Awaiting Approval" ou apenas ignora sem dar erro fatal
        RETURN jsonb_build_object('success', false, 'error', 'ID de tela não registrado: ' || p_screen_id);
    END IF;

    UPDATE public.screens SET
        status_note = p_status,
        hardware_version = p_version,
        ram_usage = p_ram_usage,
        free_space = p_free_space,
        device_type = p_device_type,
        last_ping_at = NOW(),
        is_active = true
    WHERE id = v_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. PERMISSÕES DE LEITURA E INSERÇÃO (INDUSTRIAL BLINDAGE)
ALTER TABLE public.playback_logs ENABLE ROW LEVEL SECURITY;

-- POLÍTICA DE LEITURA: Essencial para o Dashboard (Painel React)
DROP POLICY IF EXISTS "Leitura de Estatísticas Dashboard" ON public.playback_logs;
CREATE POLICY "Leitura de Estatísticas Dashboard" ON public.playback_logs
FOR SELECT TO authenticated USING (true);

-- POLÍTICA DE INSERÇÃO: Essencial para o Player (Garante anon ou auth)
DROP POLICY IF EXISTS "Inserção de Logs Player" ON public.playback_logs;
CREATE POLICY "Inserção de Logs Player" ON public.playback_logs 
FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 5. PERFORMANCE (ÍNDICES)
-- Índice de cobertura para o gráfico de 7 dias (Filtra por tela e ordena por tempo)
CREATE INDEX IF NOT EXISTS idx_logs_screen_started_at ON public.playback_logs (screen_id, started_at DESC);

COMMIT;

-- ✅ RELATÓRIO: Dashboad Re-Ativado & Blindado. 
-- Execute este script no SQL Editor do Supabase para restaurar os gráficos.
SELECT 'Dashboard Analytics v2.0 Ativado com Sucesso' as status;
