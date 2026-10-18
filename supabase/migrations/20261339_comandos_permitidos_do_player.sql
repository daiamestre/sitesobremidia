-- F-198 — a lista de comandos aceitos pelo banco (remote_commands_command_check) não tinha todos os que o Player
-- entende: "Instalar atualização agora" (install_update, F-194), "Atualizar aplicativo" (update_app, F-183) e o modo
-- manutenção eram RECUSADOS pelo banco e nunca chegavam à TV. A lista passa a ser exatamente a do Player 5.7.10.
-- Rollback: recriar a constraint com ARRAY['reload','reboot','screenshot','take_screenshot','sync','rotate_portrait','rotate_landscape','unpair'].
ALTER TABLE public.remote_commands DROP CONSTRAINT IF EXISTS remote_commands_command_check;
ALTER TABLE public.remote_commands ADD CONSTRAINT remote_commands_command_check CHECK (command = ANY (ARRAY[
  'reload', 'reboot', 'restart_player', 'reboot_device', 'screenshot', 'take_screenshot', 'sync',
  'update_app', 'check_update', 'install_update',
  'maintenance_open', 'open_maintenance', 'maintenance_close', 'close_maintenance',
  'rotate_portrait', 'rotate_landscape', 'unpair'
]));

-- O Player responde com textos como "unsupported - Device Owner required for physical reboot" (reiniciar o aparelho sem
-- Device Owner). O banco só aceita pending/executed/failed e recusava a resposta: o comando ficava "pendente" para
-- sempre. Agora a resposta vira "failed" e o texto vai para payload.error_message (o painel mostra o motivo).
CREATE OR REPLACE FUNCTION public.trg_fn_remote_commands_status_do_player()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('pending', 'executed', 'failed') THEN
    NEW.payload := coalesce(NEW.payload, '{}'::jsonb) || jsonb_build_object('error_message', NEW.status, 'status_note', NEW.status);
    NEW.status := CASE WHEN NEW.status ILIKE 'executed%' OR NEW.status ILIKE 'success%' THEN 'executed' ELSE 'failed' END;
  END IF;
  RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS trg_remote_commands_status_do_player ON public.remote_commands;
CREATE TRIGGER trg_remote_commands_status_do_player BEFORE INSERT OR UPDATE OF status ON public.remote_commands
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_remote_commands_status_do_player();
