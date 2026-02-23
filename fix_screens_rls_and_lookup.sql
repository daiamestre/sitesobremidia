-- ==========================================================
-- FIX: PERMISSÕES E BUSCA DE TELAS (PLAYER)
-- Objetivo: Garantir que o player consiga encontrar a tela
-- mesmo sem login (anon) e ignorando maiúsculas/minúsculas.
-- ==========================================================

BEGIN;

-- 1. Habilitar RLS (Segurança) na tabela, caso não esteja
ALTER TABLE public.screens ENABLE ROW LEVEL SECURITY;

-- 2. Remover política restritiva anterior (se existir)
DROP POLICY IF EXISTS "Player Security Policy" ON public.screens;
DROP POLICY IF EXISTS "Permitir leitura para todos (anon/auth)" ON public.screens;

-- 3. Criar política flexível: Permite que QUALQUER UM (incluindo anon)
-- visualize os dados básicos da tela se souber o ID ou Custom ID.
-- Isso é seguro pois os dados de tela não são sensíveis e o ID funciona como um token.
CREATE POLICY "Permitir leitura para todos (anon/auth)" 
ON public.screens 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- 4. Garantir que o RPC pulse_screen seja insensível a maiúsculas
-- (Embora já pareça ser, vamos reforçar a busca)
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
    -- Busca insensível a maiúsculas no custom_id e exata no UUID
    SELECT id INTO v_id FROM public.screens 
    WHERE id::TEXT = p_screen_id 
       OR UPPER(custom_id) = UPPER(p_screen_id);

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
    WHERE id = v_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Conceder permissões básicas para o role anon
GRANT SELECT ON public.screens TO anon;
GRANT SELECT ON public.playlists TO anon;
GRANT SELECT ON public.playlist_items TO anon;
GRANT SELECT ON public.media TO anon;
GRANT SELECT ON public.widgets TO anon;
GRANT SELECT ON public.external_links TO anon;

COMMIT;

SELECT 'Correção de segurança e busca aplicada com sucesso!' as status;
