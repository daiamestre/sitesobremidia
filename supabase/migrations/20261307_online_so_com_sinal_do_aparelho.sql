-- ======================================================================
-- SOBRE MÍDIA — MIGRAÇÃO 20261307 — F-151
-- Falso "online": a tela aparecia online só porque alguém mexeu nela no painel.
--
-- Causa: o gatilho tr_screens_universal_heartbeat gravava last_ping_at = now() em QUALQUER alteração da linha da tela
-- (trocar playlist, ligar/desligar, som, valor, etc.), e não só no sinal do aparelho.
--
-- Correção: o gatilho só carimba o horário do servidor quando a própria atualização traz um sinal — isto é, quando
-- last_ping_at vem alterado. É o que fazem o Player Android (updateScreenStatus), o Player web (usePlayerHeartbeat) e
-- as funções pulse_screen, fn_device_heartbeat_v2, fn_player_report_telemetry e get_player_playlist_for_screen.
-- O horário continua sendo o do SERVIDOR (aparelho com relógio errado não atrapalha). Nada muda para o Player.
--
-- ROLLBACK: recriar a função com "NEW.last_ping_at = now();" incondicional.
-- ======================================================================
CREATE OR REPLACE FUNCTION public.handle_universal_heartbeat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
BEGIN
  IF NEW.last_ping_at IS DISTINCT FROM OLD.last_ping_at THEN
    -- sinal do aparelho: vale o relógio do servidor (o do Android/TV Box pode estar errado)
    NEW.last_ping_at = now();
  ELSE
    -- alteração feita pelo painel: não é sinal de vida da tela
    NEW.last_ping_at = OLD.last_ping_at;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
