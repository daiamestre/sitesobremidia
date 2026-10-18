-- F-198 — mudanças da tela no painel chegam à TV NA HORA. O Player 5.7.10 percebe a alteração da tela em tempo real,
-- mas som, rádio, playlist, formato e rotação só eram aplicados na próxima sincronização (som medido: 52 s).
-- Agora o próprio banco manda o comando "reload" (Atualizar Player, que o 5.7.10 já executa em ~1 s) quando um desses
-- campos muda — sem repetir se já há um reload esperando para a mesma tela. Nada muda no aparelho.
-- Rollback: DROP TRIGGER trg_screens_aplica_na_hora ON public.screens; DROP FUNCTION public.trg_fn_screens_aplica_na_hora();
CREATE OR REPLACE FUNCTION public.trg_fn_screens_aplica_na_hora()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  IF NEW.bound_device_id IS NULL THEN RETURN NEW; END IF;  -- sem aparelho, nada a avisar
  IF NEW.audio_enabled IS DISTINCT FROM OLD.audio_enabled
     OR NEW.radio_ativa IS DISTINCT FROM OLD.radio_ativa
     OR NEW.radio_playlist_id IS DISTINCT FROM OLD.radio_playlist_id
     OR NEW.radio_volume IS DISTINCT FROM OLD.radio_volume
     OR NEW.rotacao_tela IS DISTINCT FROM OLD.rotacao_tela
     OR NEW.playlist_id IS DISTINCT FROM OLD.playlist_id
     OR NEW.resolution IS DISTINCT FROM OLD.resolution
     OR NEW.orientation IS DISTINCT FROM OLD.orientation THEN
    IF NOT EXISTS (SELECT 1 FROM public.remote_commands c
                    WHERE c.screen_id = NEW.id AND c.command = 'reload' AND c.status = 'pending'
                      AND c.created_at > now() - interval '30 seconds') THEN
      INSERT INTO public.remote_commands (screen_id, command, status, payload)
      VALUES (NEW.id, 'reload', 'pending', jsonb_build_object('origem', 'painel: configuração da tela mudou'));
    END IF;
  END IF;
  RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS trg_screens_aplica_na_hora ON public.screens;
CREATE TRIGGER trg_screens_aplica_na_hora
  AFTER UPDATE OF audio_enabled, radio_ativa, radio_playlist_id, radio_volume, rotacao_tela, playlist_id, resolution, orientation
  ON public.screens FOR EACH ROW EXECUTE FUNCTION public.trg_fn_screens_aplica_na_hora();
