-- F-200 — os comandos da launcher (launcher_sobremidia, launcher_original) só podem ser pedidos pelo dono e pelo ADM.
-- O gestor dono da tela continua mandando todos os outros comandos; a trava é no banco (não só no painel).
-- Aditivo: gatilho novo em remote_commands que só olha esses 2 comandos. Player 5.7.10: sem impacto (não os recebe).
-- ROLLBACK: DROP TRIGGER IF EXISTS trg_remote_commands_launcher_so_admin ON public.remote_commands;
--           DROP FUNCTION IF EXISTS public.trg_fn_remote_commands_launcher_so_admin();

CREATE OR REPLACE FUNCTION public.trg_fn_remote_commands_launcher_so_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.command IN ('launcher_sobremidia', 'launcher_original')
     AND auth.uid() IS NOT NULL AND NOT public.fn_biblioteca_admin() THEN
    RAISE EXCEPTION 'Só o dono e o ADM mudam a launcher dos aparelhos.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_remote_commands_launcher_so_admin ON public.remote_commands;
CREATE TRIGGER trg_remote_commands_launcher_so_admin BEFORE INSERT ON public.remote_commands
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_remote_commands_launcher_so_admin();
