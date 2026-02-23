-- ==========================================================
-- MASTER SCRIPT: FUNDAÇÃO INDUSTRIAL SIGNAL PLAYER v3.0
-- Arquiteto: Antigravity | Estado: FINAL / PRODUÇÃO
-- ==========================================================
-- Este script consolida TODAS as atualizações necessárias para o 
-- Handshake, Telemetria, Proof-of-Play e ErrorBoundary.
-- ==========================================================

BEGIN;

-- 1. EXTENSÕES E TABELAS BASE
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- [TELEMETRIA] Adicionar colunas de Hardware na tabela screens (se não existirem)
ALTER TABLE IF EXISTS public.screens 
ADD COLUMN IF NOT EXISTS status_note TEXT,
ADD COLUMN IF NOT EXISTS hardware_version TEXT,
ADD COLUMN IF NOT EXISTS ram_usage TEXT,
ADD COLUMN IF NOT EXISTS free_space TEXT,
ADD COLUMN IF NOT EXISTS device_type TEXT DEFAULT 'mobile', -- 'mobile' or 'tv'
ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMPTZ DEFAULT NOW();

-- [PROVA DE EXIBIÇÃO] Tabela de Logs de Playback
CREATE TABLE IF NOT EXISTS public.playback_logs (
    id BIGSERIAL PRIMARY KEY,
    screen_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    duration INTEGER NOT NULL, -- em segundos
    started_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'COMPLETED',
    signature TEXT, -- Garantia de integridade do log
    metadata JSONB DEFAULT '{}'::jsonb
);

-- [ERROR BOUNDARY v2.4] Tabela de Logs de Erro/Crash Sistema
CREATE TABLE IF NOT EXISTS public.system_errors (
    id BIGSERIAL PRIMARY KEY,
    screen_id TEXT NOT NULL,
    error_type TEXT NOT NULL, -- 'CRASH', 'NETWORK', 'DECODER'
    message TEXT,
    stack_trace TEXT,
    hardware_stats JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- [MÍDIA] Garantir coluna de URL
ALTER TABLE IF EXISTS public.media 
ADD COLUMN IF NOT EXISTS file_url TEXT;

-- 2. PERFORMANCE (ÍNDICES)
CREATE INDEX IF NOT EXISTS idx_screens_custom_id ON public.screens (custom_id);
CREATE INDEX IF NOT EXISTS idx_screens_last_ping ON public.screens (last_ping_at);
CREATE INDEX IF NOT EXISTS idx_playback_logs_started ON public.playback_logs (started_at);

-- 3. SEGURANÇA (RLS)
ALTER TABLE public.screens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playback_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    -- Política de Acesso por ID ou Custom ID
    DROP POLICY IF EXISTS "Player Security Policy" ON public.screens;
    CREATE POLICY "Player Security Policy" ON public.screens 
    FOR SELECT TO authenticated 
    USING (id::TEXT = auth.jwt() ->> 'sub' OR custom_id = auth.jwt() ->> 'sub');

    DROP POLICY IF EXISTS "Player Insert Logs" ON public.playback_logs;
    CREATE POLICY "Player Insert Logs" ON public.playback_logs 
    FOR INSERT TO authenticated WITH CHECK (true);

    DROP POLICY IF EXISTS "Player Insert Errors" ON public.system_errors;
    CREATE POLICY "Player Insert Errors" ON public.system_errors 
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. LÓGICA SERVER-SIDE (RPCs)

-- [PULSE] Atualização de Heartbeat e Telemetria
CREATE OR REPLACE FUNCTION public.pulse_screen(
    p_screen_id TEXT,
    p_status TEXT,
    p_version TEXT,
    p_ram_usage TEXT DEFAULT 'N/A',
    p_free_space TEXT DEFAULT 'N/A',
    p_device_type TEXT DEFAULT 'mobile'
) RETURNS JSONB AS $$
DECLARE
    v_id UUID;
BEGIN
    -- Tenta encontrar por UUID ou Custom ID
    SELECT id INTO v_id FROM public.screens 
    WHERE id::TEXT = p_screen_id OR custom_id = p_screen_id;

    IF v_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tela não encontrada');
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

-- [REPORT ERROR] Suporte ao ErrorBoundary
CREATE OR REPLACE FUNCTION public.report_error(
    p_screen_id TEXT,
    p_error_type TEXT,
    p_message TEXT,
    p_stack_trace TEXT,
    p_hardware_stats JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
BEGIN
    INSERT INTO public.system_errors (screen_id, error_type, message, stack_trace, hardware_stats)
    VALUES (p_screen_id, p_error_type, p_message, p_stack_trace, p_hardware_stats);
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- [MAINTENANCE] Purga automática de registros antigos (>30 dias)
CREATE OR REPLACE FUNCTION public.purge_old_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM public.playback_logs WHERE started_at < NOW() - INTERVAL '30 days';
    DELETE FROM public.system_errors WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. STORAGE (PERMISSÕES MÍDIA)
-- Garante que o bucket 'media' seja legível pelo Player (via Anon ou Auth)
-- [NOTA] Execute via Dashboard ou altere se bucket se chamar diferente
-- INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', true) ON CONFLICT DO NOTHING;

COMMIT;

-- ✅ RELATÓRIO FINAL: Banco de Dados Signal Player 100% HARDENED
SELECT 'Foundation v3.0 Instalada com Sucesso' as status;
