-- ==========================================================
-- FIX: REMOVER is_active = true DO HEARTBEAT (pulse_screen)
-- Problema: O RPC pulse_screen resetava is_active = true a cada
-- heartbeat, revertendo qualquer desativação feita pelo admin.
-- Solução: Remover a linha is_active = true do UPDATE.
-- ==========================================================

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
        last_ping_at = NOW()
        -- REMOVED: is_active = true (was resetting admin deactivation)
    WHERE id = v_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
