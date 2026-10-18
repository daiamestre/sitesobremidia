-- F-197 — a versão do aplicativo mostrada no painel vem do SINAL da tela (screens.version, gravado a cada batimento).
-- screens.app_version era gravado só no pareamento e ficava parado (Homolog B mostrava 5.7.6 com o Player em 5.7.10);
-- várias telas e funções do painel leem app_version. Agora ele acompanha a versão do sinal.
-- Rollback: DROP TRIGGER trg_screens_app_version_do_sinal ON public.screens; DROP FUNCTION public.trg_fn_screens_app_version_do_sinal();

CREATE OR REPLACE FUNCTION public.trg_fn_screens_app_version_do_sinal()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  IF NEW.version ~ '^[0-9]+\.[0-9]+\.[0-9]+' AND NEW.app_version IS DISTINCT FROM NEW.version THEN
    NEW.app_version := NEW.version;
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS trg_screens_app_version_do_sinal ON public.screens;
CREATE TRIGGER trg_screens_app_version_do_sinal BEFORE UPDATE OF version ON public.screens
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_screens_app_version_do_sinal();

UPDATE public.screens SET app_version = version
 WHERE version ~ '^[0-9]+\.[0-9]+\.[0-9]+' AND app_version IS DISTINCT FROM version;
