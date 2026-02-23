-- ==========================================================
-- SCRIPT DE EVOLUÇÃO INDUSTRIAL v4.0 (SUPABASE)
-- Arquiteto: Antigravity | Foco: Telemetria Avançada & Estabilidade
-- ==========================================================

BEGIN;

-- 1. TELEMETRIA AVANÇADA NA TABELA SCREENS
-- Adicionando campos para diagnóstico profundo de hardware
ALTER TABLE IF EXISTS public.screens 
ADD COLUMN IF NOT EXISTS cpu_temp TEXT,
ADD COLUMN IF NOT EXISTS uptime TEXT,
ADD COLUMN IF NOT EXISTS app_version TEXT,
ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- 2. SUPORTE A CACHE INTELIGENTE (OFFLINE-FIRST)
-- Campo para permitir que o app verifique mudanças sem precisar baixar todo o JSON
ALTER TABLE IF EXISTS public.playlists 
ADD COLUMN IF NOT EXISTS last_modified TIMESTAMPTZ DEFAULT NOW();

-- Trigger para atualizar last_modified automaticamente em qualquer mudança na playlist
CREATE OR REPLACE FUNCTION update_playlist_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_modified = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_playlist_time ON public.playlists;
CREATE TRIGGER tr_update_playlist_time
BEFORE UPDATE ON public.playlists
FOR EACH ROW EXECUTE FUNCTION update_playlist_timestamp();

-- 3. ATUALIZAÇÃO DO RPC pulse_screen (v4.0)
-- Agora suporta Temperatura de CPU e Tempo de Atividade
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
    -- Busca flexível (UUID ou Custom ID)
    SELECT id INTO v_id FROM public.screens 
    WHERE id::TEXT = p_screen_id OR custom_id = p_screen_id;

    IF v_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tela não encontrada');
    END IF;

    UPDATE public.screens SET
        status_note = p_status,
        app_version = p_version,
        ram_usage = p_ram_usage,
        free_space = p_free_space,
        device_type = p_device_type,
        cpu_temp = p_cpu_temp,
        uptime = p_uptime,
        ip_address = p_ip_address,
        last_ping_at = NOW(),
        is_active = true
    WHERE id = v_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. VISTA DE MONITORAMENTO INDUSTRIAL
DROP VIEW IF EXISTS public.vw_industrial_monitoring;
CREATE VIEW public.vw_industrial_monitoring AS
SELECT 
    name, 
    custom_id, 
    status_note as status,
    app_version,
    cpu_temp, 
    ram_usage, 
    free_space,
    uptime,
    last_ping_at,
    CASE 
        WHEN last_ping_at < NOW() - INTERVAL '5 minutes' THEN 'OFFLINE'
        ELSE 'ONLINE'
    END as connectivity_status
FROM public.screens;

COMMIT;

-- ✅ RELATÓRIO: Evolução v4.0 aplicada. 
-- Campos de Telemetria e Cache Ativados.
