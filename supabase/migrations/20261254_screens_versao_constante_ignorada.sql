-- ============================================================================================
-- 20261254 — screens.version: não deixar a constante "1.0.0" apagar a versão real do Player.
--
-- Causa (provada no emulador, 26/09/2026, Player 5.6.1 release): o Player tem dois batimentos que gravam
-- screens.version. PersistentHeartbeatService envia a versão instalada (ex.: "5.6.1-MicroGate"); já
-- PlayerRepositoryImpl.sendHeartbeat (estados IDLE / NO_PLAYLIST / BLOCKED) envia PlayerConfig.APP_VERSION,
-- constante "1.0.0" desde o "Clean Start". A versão da tela alterna entre as duas. A trava de widgets W11
-- (fn_widget_suportado_no_aparelho, 20261252) lê screens.version -> um aparelho 5.6.x veria o widget
-- Esportes só em parte do tempo. Os Players já instalados (5.5.x/5.6.1) continuam enviando a constante,
-- então a correção precisa estar no servidor (o Player 5.6.2 também passa a enviar a versão real).
--
-- Correção mínima e aditiva: gatilho BEFORE UPDATE que mantém a versão anterior quando a nova é exatamente
-- "1.0.0", a anterior é uma versão real (x.y.z com sufixo) e o aparelho vinculado é o MESMO. Troca de aparelho
-- (bound_device_id diferente), INSERT e qualquer outra versão seguem gravando normalmente.
-- ROLLBACK: DROP TRIGGER tr_screens_versao_constante ON public.screens; DROP FUNCTION public.fn_screens_versao_constante();
-- ============================================================================================
CREATE OR REPLACE FUNCTION public.fn_screens_versao_constante()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.version = '1.0.0'
       AND OLD.version ~ '^\d+\.\d+\.\d+-'
       AND NEW.bound_device_id IS NOT DISTINCT FROM OLD.bound_device_id THEN
        NEW.version := OLD.version;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_screens_versao_constante ON public.screens;
CREATE TRIGGER tr_screens_versao_constante
    BEFORE UPDATE OF version ON public.screens
    FOR EACH ROW EXECUTE FUNCTION public.fn_screens_versao_constante();

REVOKE ALL ON FUNCTION public.fn_screens_versao_constante() FROM PUBLIC, anon, authenticated;
