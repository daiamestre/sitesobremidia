-- F-194 (Controle Remoto) — a hora da captura de tela vem do relógio do SERVIDOR.
-- O totem gravou last_screenshot_at no ano 2083 (relógio do aparelho errado): o painel mostrava "captura de daqui a
-- 57 anos" e a ordem das capturas ficava errada. Mesmo padrão do sinal (handle_universal_heartbeat).
-- Rollback: DROP TRIGGER trg_screens_captura_hora_servidor ON public.screens; DROP FUNCTION public.trg_fn_screens_captura_hora_servidor();

CREATE OR REPLACE FUNCTION public.trg_fn_screens_captura_hora_servidor()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  IF NEW.last_screenshot_at IS DISTINCT FROM OLD.last_screenshot_at AND NEW.last_screenshot_at IS NOT NULL THEN
    NEW.last_screenshot_at := now();
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS trg_screens_captura_hora_servidor ON public.screens;
CREATE TRIGGER trg_screens_captura_hora_servidor BEFORE UPDATE OF last_screenshot_at ON public.screens
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_screens_captura_hora_servidor();

-- capturas gravadas com data no futuro (relógio errado): sem data, até a próxima captura
UPDATE public.screens SET last_screenshot_at = NULL WHERE last_screenshot_at > now() + interval '1 day';
