-- =====================================================================
-- Device Fleet -> Dashboard/Screens: informacoes do dispositivo vinculado
--
-- Causa raiz (auditoria 2026-09-24): a migracao 20260825_device_fleet.sql ficou em
-- migrations_archive e NUNCA foi aplicada em producao. O Player chama
-- fn_device_register_extended / fn_device_heartbeat_v2 / fn_device_telemetry_batch,
-- que nao existiam, e o painel le colunas de devices/device_health que nao existiam.
--
-- 100% ADITIVA: so ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS e funcoes novas.
-- Nao altera RLS existente, RPCs existentes, pareamento (fn_device_bind) nem sessoes.
-- Diferencas em relacao ao arquivo arquivado (que nao era compativel com producao):
--   * usa as colunas reais de devices (last_heartbeat/last_seen/is_online);
--   * parametros de protocolo/timestamps/ids aceitam texto (o Player envia "1.0" e ISO/epoch);
--   * o heartbeat tambem espelha em screens os campos que o painel le (versao, IP, RAM, espaco, temp, uptime).
-- =====================================================================

-- 1) devices: identidade e hardware
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS android_id text,
  ADD COLUMN IF NOT EXISTS os_name text,
  ADD COLUMN IF NOT EXISTS os_sdk integer,
  ADD COLUMN IF NOT EXISTS architecture text,
  ADD COLUMN IF NOT EXISTS cpu_model text,
  ADD COLUMN IF NOT EXISTS cpu_cores integer,
  ADD COLUMN IF NOT EXISTS ram_total_mb bigint,
  ADD COLUMN IF NOT EXISTS storage_total_mb bigint,
  ADD COLUMN IF NOT EXISTS gpu text,
  ADD COLUMN IF NOT EXISTS screen_width integer,
  ADD COLUMN IF NOT EXISTS screen_height integer,
  ADD COLUMN IF NOT EXISTS screen_density double precision,
  ADD COLUMN IF NOT EXISTS screen_refresh_rate integer,
  ADD COLUMN IF NOT EXISTS device_type text,
  ADD COLUMN IF NOT EXISTS device_name text,
  ADD COLUMN IF NOT EXISTS player_version text,
  ADD COLUMN IF NOT EXISTS telemetry_protocol_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS uptime_seconds bigint;

-- 2) device_health: estado atual (nomes iguais aos que o painel le)
ALTER TABLE public.device_health
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS uptime_seconds bigint,
  ADD COLUMN IF NOT EXISTS cpu_usage_percent double precision,
  ADD COLUMN IF NOT EXISTS cpu_model text,
  ADD COLUMN IF NOT EXISTS cpu_cores integer,
  ADD COLUMN IF NOT EXISTS cpu_frequency_mhz integer,
  ADD COLUMN IF NOT EXISTS memory_usage_percent double precision,
  ADD COLUMN IF NOT EXISTS memory_used_mb bigint,
  ADD COLUMN IF NOT EXISTS memory_free_mb bigint,
  ADD COLUMN IF NOT EXISTS memory_total_mb bigint,
  ADD COLUMN IF NOT EXISTS storage_used_mb bigint,
  ADD COLUMN IF NOT EXISTS storage_free_mb bigint,
  ADD COLUMN IF NOT EXISTS storage_total_mb bigint,
  ADD COLUMN IF NOT EXISTS temperature_celsius double precision,
  ADD COLUMN IF NOT EXISTS temperature_source text,
  ADD COLUMN IF NOT EXISTS thermal_status text,
  ADD COLUMN IF NOT EXISTS battery_temperature_celsius double precision,
  ADD COLUMN IF NOT EXISTS battery_status text,
  ADD COLUMN IF NOT EXISTS battery_health text,
  ADD COLUMN IF NOT EXISTS network_type text,
  ADD COLUMN IF NOT EXISTS wifi_signal_dbm integer,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS connection_status text,
  ADD COLUMN IF NOT EXISTS screen_width integer,
  ADD COLUMN IF NOT EXISTS screen_height integer,
  ADD COLUMN IF NOT EXISTS screen_refresh_rate integer,
  ADD COLUMN IF NOT EXISTS screen_orientation text,
  ADD COLUMN IF NOT EXISTS player_version text,
  ADD COLUMN IF NOT EXISTS sync_status text,
  ADD COLUMN IF NOT EXISTS current_playlist_id uuid,
  ADD COLUMN IF NOT EXISTS last_playback_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS playback_error_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_playback_error text,
  ADD COLUMN IF NOT EXISTS media_count integer,
  ADD COLUMN IF NOT EXISTS pending_media_count integer,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS telemetry_protocol_version integer DEFAULT 1;

-- 3) historico de telemetria (lote offline-first)
CREATE TABLE IF NOT EXISTS public.device_telemetry (
  id bigserial PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  cpu_usage_percent double precision,
  cpu_temperature_celsius double precision,
  memory_usage_percent double precision,
  memory_used_mb bigint,
  memory_free_mb bigint,
  memory_total_mb bigint,
  storage_used_mb bigint,
  storage_free_mb bigint,
  storage_total_mb bigint,
  temperature_celsius double precision,
  thermal_status text,
  battery_level integer,
  battery_status text,
  network_type text,
  wifi_signal_dbm integer,
  uptime_seconds bigint,
  sync_status text,
  playback_status text
);
CREATE INDEX IF NOT EXISTS idx_device_telemetry_device_time ON public.device_telemetry(device_id, recorded_at DESC);
ALTER TABLE public.device_telemetry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dt_select_own ON public.device_telemetry;
CREATE POLICY dt_select_own ON public.device_telemetry FOR SELECT TO authenticated
  USING (
    device_id IN (SELECT d.id FROM public.devices d
                  WHERE d.screen_id IS NOT NULL AND public.fn_player_can_access_screen(d.screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
REVOKE ALL ON public.device_telemetry FROM anon;
GRANT SELECT ON public.device_telemetry TO authenticated;

-- 4) helpers de conversao tolerante (o Player envia ISO, epoch em ms ou texto livre)
CREATE OR REPLACE FUNCTION public.fn_fleet_to_ts(p text)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  IF p ~ '^\d{11,}$' THEN RETURN to_timestamp(p::double precision / 1000.0); END IF;
  IF p ~ '^\d{9,10}$' THEN RETURN to_timestamp(p::double precision); END IF;
  RETURN p::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.fn_fleet_to_uuid(p text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p::uuid ELSE NULL END
$$;

-- 5) fn_device_register_extended: grava identidade/hardware do aparelho ja pareado
CREATE OR REPLACE FUNCTION public.fn_device_register_extended(
  p_identity_hash text,
  p_screen_id uuid,
  p_manufacturer text DEFAULT NULL,
  p_brand text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_serial_number text DEFAULT NULL,
  p_android_id text DEFAULT NULL,
  p_os_version text DEFAULT NULL,
  p_os_sdk integer DEFAULT NULL,
  p_architecture text DEFAULT NULL,
  p_cpu_model text DEFAULT NULL,
  p_cpu_cores integer DEFAULT NULL,
  p_ram_total_mb bigint DEFAULT NULL,
  p_storage_total_mb bigint DEFAULT NULL,
  p_gpu text DEFAULT NULL,
  p_screen_width integer DEFAULT NULL,
  p_screen_height integer DEFAULT NULL,
  p_screen_density double precision DEFAULT NULL,
  p_screen_refresh_rate integer DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_player_version text DEFAULT NULL,
  p_telemetry_protocol_version text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dev public.devices%ROWTYPE;
  v_screen_name text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF p_identity_hash IS NULL OR length(p_identity_hash) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_identity');
  END IF;
  IF NOT public.fn_player_can_access_screen(p_screen_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'screen_denied');
  END IF;

  SELECT * INTO v_dev FROM public.devices
   WHERE identity_hash = p_identity_hash
   ORDER BY (screen_id IS NOT DISTINCT FROM p_screen_id) DESC, last_seen DESC NULLS LAST
   LIMIT 1;

  IF v_dev.id IS NOT NULL AND v_dev.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_revoked');
  END IF;
  IF v_dev.id IS NOT NULL AND v_dev.screen_id IS DISTINCT FROM p_screen_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_bound_other_screen');
  END IF;

  IF v_dev.id IS NULL THEN
    SELECT name INTO v_screen_name FROM public.screens WHERE id = p_screen_id;
    INSERT INTO public.devices (name, identity_hash, screen_id, activated_at, first_seen_at, last_seen, last_heartbeat, is_online)
    VALUES (COALESCE(v_screen_name, p_model, 'Player'), p_identity_hash, p_screen_id, now(), now(), now(), now(), true)
    RETURNING * INTO v_dev;
  END IF;

  UPDATE public.devices SET
    manufacturer = COALESCE(p_manufacturer, manufacturer),
    brand = COALESCE(p_brand, brand),
    model = COALESCE(p_model, model),
    serial_number = COALESCE(p_serial_number, serial_number),
    android_id = COALESCE(p_android_id, android_id),
    os_name = COALESCE(os_name, 'Android'),
    os_version = COALESCE(p_os_version, os_version),
    os_sdk = COALESCE(p_os_sdk, os_sdk),
    architecture = COALESCE(p_architecture, architecture),
    cpu_model = COALESCE(p_cpu_model, cpu_model),
    cpu_cores = COALESCE(p_cpu_cores, cpu_cores),
    ram_total_mb = COALESCE(p_ram_total_mb, ram_total_mb),
    storage_total_mb = COALESCE(p_storage_total_mb, storage_total_mb),
    gpu = COALESCE(p_gpu, gpu),
    screen_width = COALESCE(p_screen_width, screen_width),
    screen_height = COALESCE(p_screen_height, screen_height),
    screen_density = COALESCE(p_screen_density, screen_density),
    screen_refresh_rate = COALESCE(p_screen_refresh_rate, screen_refresh_rate),
    device_type = COALESCE(NULLIF(p_device_type, ''), device_type),
    player_version = COALESCE(p_player_version, player_version),
    app_version = COALESCE(p_player_version, app_version),
    first_seen_at = COALESCE(first_seen_at, now()),
    last_seen = now(),
    last_heartbeat = now(),
    is_online = true
  WHERE id = v_dev.id;

  -- Espelha o essencial em screens (o painel lista/filtra por elas)
  UPDATE public.screens SET
    device_type = COALESCE(NULLIF(lower(p_device_type), ''), device_type),
    hardware_version = COALESCE(NULLIF(btrim(concat_ws(' ', p_brand, p_model)), ''), hardware_version),
    version = COALESCE(p_player_version, version),
    app_version = COALESCE(p_player_version, app_version)
  WHERE id = p_screen_id;

  RETURN jsonb_build_object('ok', true, 'device_id', v_dev.id::text, 'screen_id', p_screen_id::text);
END $$;

-- 6) fn_device_heartbeat_v2: saude atual + espelho em devices e screens
CREATE OR REPLACE FUNCTION public.fn_device_heartbeat_v2(
  p_identity_hash text,
  p_screen_id uuid,
  p_uptime_seconds bigint DEFAULT NULL,
  p_cpu_usage_percent double precision DEFAULT NULL,
  p_cpu_temperature_celsius double precision DEFAULT NULL,
  p_memory_usage_percent double precision DEFAULT NULL,
  p_memory_used_mb bigint DEFAULT NULL,
  p_memory_free_mb bigint DEFAULT NULL,
  p_memory_total_mb bigint DEFAULT NULL,
  p_storage_used_mb bigint DEFAULT NULL,
  p_storage_free_mb bigint DEFAULT NULL,
  p_storage_total_mb bigint DEFAULT NULL,
  p_temperature_celsius double precision DEFAULT NULL,
  p_temperature_source text DEFAULT NULL,
  p_thermal_status text DEFAULT NULL,
  p_battery_level integer DEFAULT NULL,
  p_battery_temperature double precision DEFAULT NULL,
  p_battery_status text DEFAULT NULL,
  p_battery_health text DEFAULT NULL,
  p_network_type text DEFAULT NULL,
  p_wifi_signal_dbm integer DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_connection_status text DEFAULT NULL,
  p_sync_status text DEFAULT NULL,
  p_current_playlist_id text DEFAULT NULL,
  p_current_media_id text DEFAULT NULL,
  p_last_playback_at text DEFAULT NULL,
  p_last_sync_at text DEFAULT NULL,
  p_playback_error_count integer DEFAULT NULL,
  p_last_playback_error text DEFAULT NULL,
  p_media_count integer DEFAULT NULL,
  p_pending_media_count integer DEFAULT NULL,
  p_telemetry_protocol_version text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dev public.devices%ROWTYPE;
  v_status text;
  v_thermal text := COALESCE(NULLIF(upper(p_thermal_status), ''), 'N/A');
  v_temp double precision := COALESCE(p_temperature_celsius, p_cpu_temperature_celsius);
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF p_identity_hash IS NULL OR length(p_identity_hash) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_identity');
  END IF;
  IF NOT public.fn_player_can_access_screen(p_screen_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'screen_denied');
  END IF;

  SELECT * INTO v_dev FROM public.devices
   WHERE identity_hash = p_identity_hash
   ORDER BY (screen_id IS NOT DISTINCT FROM p_screen_id) DESC, last_seen DESC NULLS LAST
   LIMIT 1;
  IF v_dev.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'device_not_registered'); END IF;
  IF v_dev.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'device_revoked'); END IF;
  IF v_dev.screen_id IS DISTINCT FROM p_screen_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_bound_other_screen');
  END IF;

  v_status := CASE
    WHEN v_temp IS NOT NULL AND v_temp >= 85 THEN 'DEGRADED'
    WHEN p_storage_total_mb > 0 AND p_storage_used_mb IS NOT NULL
         AND (p_storage_used_mb::double precision / p_storage_total_mb) >= 0.95 THEN 'DEGRADED'
    WHEN COALESCE(p_memory_usage_percent, 0) >= 95 THEN 'DEGRADED'
    WHEN COALESCE(p_playback_error_count, 0) >= 10 THEN 'DEGRADED'
    WHEN v_thermal IN ('HIGH', 'CRITICAL') THEN 'DEGRADED'
    ELSE 'ONLINE'
  END;

  UPDATE public.devices SET
    last_seen = now(),
    last_heartbeat = now(),
    is_online = true,
    uptime_seconds = COALESCE(p_uptime_seconds, uptime_seconds),
    ip_address = COALESCE(NULLIF(p_ip_address, ''), ip_address),
    storage_available = COALESCE(p_storage_free_mb * 1048576, storage_available)
  WHERE id = v_dev.id;

  INSERT INTO public.device_health (
    device_id, last_seen, status, uptime_seconds,
    cpu_usage_percent, cpu_model, cpu_cores,
    memory_usage_percent, memory_used_mb, memory_free_mb, memory_total_mb,
    storage_used_mb, storage_free_mb, storage_total_mb,
    temperature_celsius, temperature_source, thermal_status,
    battery_level, battery_temperature_celsius, battery_status, battery_health,
    network_type, wifi_signal_dbm, ip_address, connection_status,
    screen_width, screen_height, screen_refresh_rate,
    player_version, storage_usage_percent, sync_status, current_playlist_id, current_media_id,
    last_playback_at, last_sync_at, playback_error_count, last_playback_error,
    media_count, pending_media_count, recorded_at, telemetry_protocol_version, app_version
  ) VALUES (
    v_dev.id, now(), v_status, p_uptime_seconds,
    p_cpu_usage_percent, v_dev.cpu_model, v_dev.cpu_cores,
    p_memory_usage_percent, p_memory_used_mb, p_memory_free_mb, p_memory_total_mb,
    p_storage_used_mb, p_storage_free_mb, p_storage_total_mb,
    v_temp, p_temperature_source, v_thermal,
    p_battery_level, p_battery_temperature, p_battery_status, p_battery_health,
    p_network_type, p_wifi_signal_dbm, p_ip_address, p_connection_status,
    v_dev.screen_width, v_dev.screen_height, v_dev.screen_refresh_rate,
    v_dev.player_version,
    CASE WHEN p_storage_total_mb > 0 AND p_storage_used_mb IS NOT NULL
         THEN round((p_storage_used_mb::numeric / p_storage_total_mb) * 100)::integer END,
    p_sync_status, public.fn_fleet_to_uuid(p_current_playlist_id), public.fn_fleet_to_uuid(p_current_media_id),
    public.fn_fleet_to_ts(p_last_playback_at), public.fn_fleet_to_ts(p_last_sync_at),
    COALESCE(p_playback_error_count, 0), p_last_playback_error,
    p_media_count, p_pending_media_count, now(), 1, v_dev.player_version
  )
  ON CONFLICT (device_id) DO UPDATE SET
    last_seen = EXCLUDED.last_seen, status = EXCLUDED.status, uptime_seconds = EXCLUDED.uptime_seconds,
    cpu_usage_percent = EXCLUDED.cpu_usage_percent, cpu_model = EXCLUDED.cpu_model, cpu_cores = EXCLUDED.cpu_cores,
    memory_usage_percent = EXCLUDED.memory_usage_percent, memory_used_mb = EXCLUDED.memory_used_mb,
    memory_free_mb = EXCLUDED.memory_free_mb, memory_total_mb = EXCLUDED.memory_total_mb,
    storage_used_mb = EXCLUDED.storage_used_mb, storage_free_mb = EXCLUDED.storage_free_mb,
    storage_total_mb = EXCLUDED.storage_total_mb,
    temperature_celsius = EXCLUDED.temperature_celsius, temperature_source = EXCLUDED.temperature_source,
    thermal_status = EXCLUDED.thermal_status,
    battery_level = EXCLUDED.battery_level, battery_temperature_celsius = EXCLUDED.battery_temperature_celsius,
    battery_status = EXCLUDED.battery_status, battery_health = EXCLUDED.battery_health,
    network_type = EXCLUDED.network_type, wifi_signal_dbm = EXCLUDED.wifi_signal_dbm,
    ip_address = EXCLUDED.ip_address, connection_status = EXCLUDED.connection_status,
    screen_width = EXCLUDED.screen_width, screen_height = EXCLUDED.screen_height,
    screen_refresh_rate = EXCLUDED.screen_refresh_rate, player_version = EXCLUDED.player_version,
    storage_usage_percent = EXCLUDED.storage_usage_percent, sync_status = EXCLUDED.sync_status,
    current_playlist_id = EXCLUDED.current_playlist_id, current_media_id = EXCLUDED.current_media_id,
    last_playback_at = EXCLUDED.last_playback_at, last_sync_at = EXCLUDED.last_sync_at,
    playback_error_count = EXCLUDED.playback_error_count, last_playback_error = EXCLUDED.last_playback_error,
    media_count = EXCLUDED.media_count, pending_media_count = EXCLUDED.pending_media_count,
    recorded_at = EXCLUDED.recorded_at, telemetry_protocol_version = EXCLUDED.telemetry_protocol_version,
    app_version = EXCLUDED.app_version;

  -- Espelha em screens o que o painel exibe (o trigger mantem last_ping_at = now() do servidor)
  UPDATE public.screens SET
    ip_address = COALESCE(NULLIF(p_ip_address, ''), ip_address),
    ram_usage = COALESCE((p_memory_used_mb * 1048576)::text, ram_usage),
    free_space = COALESCE((p_storage_free_mb * 1048576)::text, free_space),
    cpu_temp = COALESCE(v_temp::text, cpu_temp),
    uptime = COALESCE((p_uptime_seconds / 3600)::text || 'h', uptime),
    app_version = COALESCE(v_dev.player_version, app_version),
    version = COALESCE(v_dev.player_version, version)
  WHERE id = p_screen_id;

  RETURN jsonb_build_object('ok', true, 'device_id', v_dev.id::text, 'status', v_status);
END $$;

-- 7) fn_device_telemetry_batch: historico em lote
CREATE OR REPLACE FUNCTION public.fn_device_telemetry_batch(
  p_identity_hash text,
  p_screen_id uuid,
  p_telemetry jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dev public.devices%ROWTYPE;
  v_item jsonb;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF p_identity_hash IS NULL OR length(p_identity_hash) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_identity');
  END IF;
  IF NOT public.fn_player_can_access_screen(p_screen_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'screen_denied');
  END IF;
  SELECT * INTO v_dev FROM public.devices
   WHERE identity_hash = p_identity_hash AND screen_id = p_screen_id AND revoked_at IS NULL
   ORDER BY last_seen DESC NULLS LAST LIMIT 1;
  IF v_dev.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'device_not_registered'); END IF;

  IF p_telemetry IS NOT NULL AND jsonb_typeof(p_telemetry) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_telemetry) LOOP
      BEGIN
        INSERT INTO public.device_telemetry (
          device_id, cpu_usage_percent, cpu_temperature_celsius, memory_usage_percent, memory_used_mb,
          memory_free_mb, memory_total_mb, storage_used_mb, storage_free_mb, storage_total_mb,
          temperature_celsius, thermal_status, battery_level, battery_status, network_type,
          wifi_signal_dbm, uptime_seconds, sync_status, playback_status
        ) VALUES (
          v_dev.id,
          (v_item->>'cpu_usage_percent')::double precision, (v_item->>'cpu_temperature_celsius')::double precision,
          (v_item->>'memory_usage_percent')::double precision, (v_item->>'memory_used_mb')::bigint,
          (v_item->>'memory_free_mb')::bigint, (v_item->>'memory_total_mb')::bigint,
          (v_item->>'storage_used_mb')::bigint, (v_item->>'storage_free_mb')::bigint, (v_item->>'storage_total_mb')::bigint,
          (v_item->>'temperature_celsius')::double precision, v_item->>'thermal_status',
          (v_item->>'battery_level')::integer, v_item->>'battery_status', v_item->>'network_type',
          (v_item->>'wifi_signal_dbm')::integer, (v_item->>'uptime_seconds')::bigint,
          v_item->>'sync_status', v_item->>'playback_status'
        );
        v_count := v_count + 1;
      EXCEPTION WHEN others THEN
        NULL; -- um item invalido nao derruba o lote
      END;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('ok', true, 'inserted', v_count);
END $$;

-- 8) permissoes: so usuario autenticado (Player logado)
REVOKE ALL ON FUNCTION public.fn_device_register_extended(text, uuid, text, text, text, text, text, text, integer, text, text, integer, bigint, bigint, text, integer, integer, double precision, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_device_register_extended(text, uuid, text, text, text, text, text, text, integer, text, text, integer, bigint, bigint, text, integer, integer, double precision, integer, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_device_heartbeat_v2(text, uuid, bigint, double precision, double precision, double precision, bigint, bigint, bigint, bigint, bigint, bigint, double precision, text, text, integer, double precision, text, text, text, integer, text, text, text, text, text, text, text, integer, text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_device_heartbeat_v2(text, uuid, bigint, double precision, double precision, double precision, bigint, bigint, bigint, bigint, bigint, bigint, double precision, text, text, integer, double precision, text, text, text, integer, text, text, text, text, text, text, text, integer, text, integer, integer, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_device_telemetry_batch(text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_device_telemetry_batch(text, uuid, jsonb) TO authenticated;
