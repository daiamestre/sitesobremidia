-- ============================================================================================
-- 20261252 — Trava de versão do widget Esportes (W11): ler a versão que o Player REALMENTE informa.
--
-- Causa (provada no emulador, 26/09/2026): devices.app_version só é gravado por fn_device_register_extended, que o
-- Player não chama (MainActivity.initializeDeviceFleet está definido e nunca é usado). A Tela Homolog A rodava
-- 5.6.0 e devices.app_version seguia "5.5.1-MicroGate" -> o widget sports nunca aparecia.
-- A versão instalada chega a cada heartbeat (PersistentHeartbeatService -> pulse_screen) em screens.version.
-- Correção mínima: usar a MAIOR versão entre screens.version (tela vinculada a este aparelho) e devices.app_version.
-- Só muda o resultado para o tipo 'sports'; demais tipos continuam sempre true.
-- ROLLBACK: recriar fn_widget_suportado_no_aparelho da 20261251.
-- ============================================================================================
CREATE OR REPLACE FUNCTION public.fn_widget_suportado_no_aparelho(p_type text, p_device_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT CASE
        WHEN p_type IS DISTINCT FROM 'sports' THEN true
        ELSE COALESCE((
            SELECT max((regexp_match(v, '(\d+)\.(\d+)\.(\d+)'))::int[]) >= ARRAY[5, 6, 0]
            FROM (
                SELECT s.version AS v FROM public.screens s WHERE s.bound_device_id = p_device_id
                UNION ALL
                SELECT d.app_version FROM public.devices d WHERE d.identity_hash = p_device_id
            ) versoes
            WHERE v ~ '\d+\.\d+\.\d+'
        ), false)
    END;
$$;
REVOKE ALL ON FUNCTION public.fn_widget_suportado_no_aparelho(text, text) FROM PUBLIC, anon, authenticated;
