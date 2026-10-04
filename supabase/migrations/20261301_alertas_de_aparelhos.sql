-- F-141 — Central de Alertas Operacionais: só o aparelho atual de cada tela, e "Limpar" dispensa o alerta.
-- Antes:
--   * a lista vinha direto da tabela devices: todo registro antigo de pareamento (aparelho trocado, tela apagada)
--     aparecia como "CRÍTICO" para sempre — 32 alertas para 5 aparelhos realmente pareados;
--   * o botão "Limpar" mandava um comando de limpar cache para o aparelho; o aviso nunca saía da tela;
--   * quem não administra as telas da empresa (gestor de mídias) via os aparelhos de todas as telas da empresa.
-- Nada muda no que o Player envia ou recebe: só leitura para o painel e uma marca de "alerta dispensado".

ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS alerta_dispensado_em timestamptz;
COMMENT ON COLUMN public.devices.alerta_dispensado_em IS 'F-141: quando o alerta deste aparelho foi dispensado no painel. O alerta volta se o aparelho der sinal depois disso e cair de novo.';

CREATE OR REPLACE FUNCTION public.fn_alertas_dispositivos()
RETURNS TABLE (id uuid, name text, model text, screen_id uuid, tela text, is_online boolean, last_seen timestamptz, last_heartbeat timestamptz, storage_available bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT d.id, d.name::text, d.model::text, d.screen_id, s.name::text, d.is_online, d.last_seen, d.last_heartbeat, d.storage_available::bigint
    FROM public.devices d
    JOIN public.screens s ON s.id = d.screen_id
   WHERE auth.uid() IS NOT NULL
     AND d.revoked_at IS NULL
     AND s.bound_device_id IS NOT NULL
     AND s.bound_device_id = d.identity_hash                      -- só o aparelho pareado HOJE a esta tela
     AND greatest(d.last_heartbeat, d.last_seen) < now() - interval '2 minutes'
     AND (d.alerta_dispensado_em IS NULL OR greatest(d.last_heartbeat, d.last_seen) > d.alerta_dispensado_em)
     AND public.fn_player_can_access_screen(s.id)
     AND (NOT public.fn_perfil_sem_gestao_de_telas() OR s.user_id = auth.uid())   -- gestor: só as próprias telas
   ORDER BY d.last_heartbeat DESC NULLS LAST;
$$;

-- Dispensa um alerta (ou todos os visíveis, quando p_device é nulo). Devolve quantos foram dispensados.
CREATE OR REPLACE FUNCTION public.fn_dispensar_alerta_dispositivo(p_device uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'É preciso estar logado.' USING ERRCODE = '42501'; END IF;
  UPDATE public.devices d SET alerta_dispensado_em = now()
   WHERE d.id IN (SELECT a.id FROM public.fn_alertas_dispositivos() a)
     AND (p_device IS NULL OR d.id = p_device);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_alertas_dispositivos() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_dispensar_alerta_dispositivo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_alertas_dispositivos() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_dispensar_alerta_dispositivo(uuid) TO authenticated, service_role;
