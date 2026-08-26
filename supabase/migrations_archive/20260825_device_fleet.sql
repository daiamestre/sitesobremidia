-- ======================================================================
-- MIGRATION: 20260825 — SOBRE MÍDIA DEVICE FLEET / DEVICE HEALTH
-- Camada Enterprise de Identificação, Telemetria, Monitoramento e Saúde
-- ======================================================================
-- Princípios:
-- 1. ADITIVO: Não altera tabelas existentes (screens, devices, device_health)
-- 2. EXTENSÍVEL: Novas colunas em devices, nova tabela device_telemetry
-- 3. SEGURO: RLS usando fn_player_can_access_screen existente
-- 4. COMPATÍVEL: Player antigo continua funcionando (fallbacks N/A)
-- 5. IDEMPOTENTE: Seguro para re-execução
-- ======================================================================

-- -------------------------------------------------------------------------
-- 1. ESTENDER TABELA DEVICES — Identidade Estendida do Aparelho
-- -------------------------------------------------------------------------
DO $$
BEGIN
  -- Identificação física
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS manufacturer text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS brand text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS model text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS serial_number text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS android_id text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Sistema Operacional
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS os_name text DEFAULT 'Android'; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS os_version text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS os_sdk int; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Hardware
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS architecture text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS cpu_model text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS cpu_cores int; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS ram_total_mb bigint; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS storage_total_mb bigint; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS gpu text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Display
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS screen_width int; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS screen_height int; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS screen_density float; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS screen_refresh_rate int; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Classificação
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS device_type text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS device_name text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Player
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS player_version text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS telemetry_protocol_version int DEFAULT 1; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Timestamps
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS first_seen_at timestamptz; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS last_seen_at timestamptz; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Atualiza first_seen_at para registros existentes
  UPDATE public.devices SET first_seen_at = COALESCE(first_seen_at, registered_at, created_at, now())
  WHERE first_seen_at IS NULL;
END $$;

-- Check constraint para device_type (valores permitidos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'devices_device_type_check' AND conrelid = 'public.devices'::regclass
  ) THEN
    ALTER TABLE public.devices 
    ADD CONSTRAINT devices_device_type_check 
    CHECK (device_type IN (
      'PHONE', 'TABLET', 'TV_BOX', 'ANDROID_TV', 'GOOGLE_TV', 'SMART_TV', 'UNKNOWN'
    ));
  END IF;
END $$;

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_devices_type ON public.devices(device_type);
CREATE INDEX IF NOT EXISTS idx_devices_last_heartbeat ON public.devices(last_heartbeat_at);
CREATE INDEX IF NOT EXISTS idx_devices_screen_id ON public.devices(screen_id);

-- -------------------------------------------------------------------------
-- 2. ESTENDER DEVICE_HEALTH — Estado Atual Completo do Dispositivo
-- -------------------------------------------------------------------------
DO $$
BEGIN
  -- Uptime e status
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS uptime_seconds bigint; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS status text DEFAULT 'UNKNOWN'; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- CPU
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS cpu_usage_percent float; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS cpu_model text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS cpu_cores int; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS cpu_frequency_mhz int; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Memória
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS memory_usage_percent float; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS memory_used_mb bigint; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS memory_free_mb bigint; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS memory_total_mb bigint; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Armazenamento
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS storage_used_mb bigint; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS storage_free_mb bigint; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS storage_total_mb bigint; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Temperatura
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS temperature_celsius float; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS temperature_source text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS thermal_status text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Bateria
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS battery_level int; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS battery_temperature float; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS battery_status text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS battery_health text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Rede
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS network_type text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS wifi_signal_dbm int; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS ip_address text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS connection_status text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Display
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS screen_width int; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS screen_height int; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS screen_refresh_rate int; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS screen_orientation text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Player
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS player_version text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS sync_status text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS current_playlist_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS current_media_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS last_playback_at timestamptz; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS last_sync_at timestamptz; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Playback Health
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS playback_error_count int DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS last_playback_error text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS media_count int; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS pending_media_count int; EXCEPTION WHEN duplicate_column THEN NULL; END;
  
  -- Metadados
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS recorded_at timestamptz DEFAULT now(); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.device_health ADD COLUMN IF NOT EXISTS telemetry_protocol_version int DEFAULT 1; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Check constraint para status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'device_health_status_check' AND conrelid = 'public.device_health'::regclass
  ) THEN
    ALTER TABLE public.device_health 
    ADD CONSTRAINT device_health_status_check 
    CHECK (status IN ('ONLINE', 'OFFLINE', 'DEGRADED', 'UNKNOWN'));
  END IF;
END $$;

-- Check constraint para thermal_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'device_health_thermal_check' AND conrelid = 'public.device_health'::regclass
  ) THEN
    ALTER TABLE public.device_health 
    ADD CONSTRAINT device_health_thermal_check 
    CHECK (thermal_status IN ('NORMAL', 'ELEVATED', 'HIGH', 'CRITICAL', 'N/A', 'UNKNOWN') OR thermal_status IS NULL);
  END IF;
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_device_health_status ON public.device_health(status);
CREATE INDEX IF NOT EXISTS idx_device_health_last_seen ON public.device_health(last_seen);

-- -------------------------------------------------------------------------
-- 3. CRIAR DEVICE_TELEMETRY — Histórico de Telemetria
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_telemetry (
  id              bigserial PRIMARY KEY,
  device_id       uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  
  -- CPU
  cpu_usage_percent     float,
  cpu_temperature_celsius float,
  
  -- Memória
  memory_usage_percent  float,
  memory_used_mb        bigint,
  memory_free_mb        bigint,
  memory_total_mb       bigint,
  
  -- Armazenamento
  storage_used_mb       bigint,
  storage_free_mb       bigint,
  storage_total_mb      bigint,
  
  -- Temperatura
  temperature_celsius   float,
  thermal_status        text,
  
  -- Bateria
  battery_level         int,
  battery_temperature   float,
  battery_status        text,
  
  -- Rede
  network_type          text,
  wifi_signal_dbm       int,
  
  -- Sistema
  uptime_seconds        bigint,
  
  -- Player
  sync_status           text,
  playback_status       text,
  
  -- Protocolo
  telemetry_protocol_version int DEFAULT 1
);

-- Índices para queries de séries temporais
CREATE INDEX IF NOT EXISTS idx_device_telemetry_device_time ON public.device_telemetry(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_telemetry_recorded ON public.device_telemetry(recorded_at);

-- Particionamento por tempo (opcional, para scale futuro)
-- Comentado por enquanto - ativar quando volume justificar
-- ALTER TABLE public.device_telemetry SET (timescaledb.hypertable);

-- -------------------------------------------------------------------------
-- 4. RPC: DEVICE REGISTER EXTENDED — Registro Completo do Dispositivo
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_device_register_extended(
  p_identity_hash text,
  p_screen_id uuid,
  p_manufacturer text DEFAULT NULL,
  p_brand text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_serial_number text DEFAULT NULL,
  p_android_id text DEFAULT NULL,
  p_os_version text DEFAULT NULL,
  p_os_sdk int DEFAULT NULL,
  p_architecture text DEFAULT NULL,
  p_cpu_model text DEFAULT NULL,
  p_cpu_cores int DEFAULT NULL,
  p_ram_total_mb bigint DEFAULT NULL,
  p_storage_total_mb bigint DEFAULT NULL,
  p_gpu text DEFAULT NULL,
  p_screen_width int DEFAULT NULL,
  p_screen_height int DEFAULT NULL,
  p_screen_density float DEFAULT NULL,
  p_screen_refresh_rate int DEFAULT NULL,
  p_device_type text DEFAULT 'UNKNOWN',
  p_player_version text DEFAULT NULL,
  p_telemetry_protocol_version int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.devices%ROWTYPE;
  v_device public.devices%ROWTYPE;
  v_screen_tenant uuid;
BEGIN
  -- Validação básica
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_identity_hash IS NULL OR length(p_identity_hash) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_identity');
  END IF;
  IF NOT public.fn_player_can_access_screen(p_screen_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'screen_denied');
  END IF;

  -- Busca device existente
  SELECT * INTO v_existing FROM public.devices WHERE identity_hash = p_identity_hash LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    -- Device já existe
    IF v_existing.revoked_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'device_revoked');
    END IF;
    
    -- Verifica se pode rotacionar para outra tela (mesmo tenant)
    IF v_existing.screen_id IS DISTINCT FROM p_screen_id THEN
      IF NOT public.fn_player_can_access_screen(v_existing.screen_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'device_bound_other_tenant');
      END IF;
    END IF;
    
    -- UPDATE com informações estendidas
    UPDATE public.devices
    SET screen_id = p_screen_id,
        last_seen = now(),
        last_heartbeat_at = now(),
        manufacturer = COALESCE(p_manufacturer, manufacturer),
        brand = COALESCE(p_brand, brand),
        model = COALESCE(p_model, model),
        serial_number = COALESCE(p_serial_number, serial_number),
        android_id = COALESCE(p_android_id, android_id),
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
        telemetry_protocol_version = COALESCE(p_telemetry_protocol_version, telemetry_protocol_version),
        activated_at = COALESCE(activated_at, now()),
        revoked_at = NULL,
        status = 'registered'
    WHERE id = v_existing.id
    RETURNING * INTO v_device;
  ELSE
    -- INSERT novo device
    INSERT INTO public.devices (
      screen_id, identity_hash, manufacturer, brand, model, serial_number,
      android_id, os_version, os_sdk, architecture, cpu_model, cpu_cores,
      ram_total_mb, storage_total_mb, gpu, screen_width, screen_height,
      screen_density, screen_refresh_rate, device_type, player_version,
      telemetry_protocol_version, status, registered_at, activated_at, last_seen, first_seen_at
    ) VALUES (
      p_screen_id, p_identity_hash, p_manufacturer, p_brand, p_model, p_serial_number,
      p_android_id, p_os_version, p_os_sdk, p_architecture, p_cpu_model, p_cpu_cores,
      p_ram_total_mb, p_storage_total_mb, p_gpu, p_screen_width, p_screen_height,
      p_screen_density, p_screen_refresh_rate, p_device_type, p_player_version,
      p_telemetry_protocol_version, 'registered', now(), now(), now(), now()
    )
    RETURNING * INTO v_device;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'device_id', v_device.id::text,
    'status', v_device.status,
    'screen_id', v_device.screen_id::text,
    'device_type', v_device.device_type
  );
END;
$$;

-- -------------------------------------------------------------------------
-- 5. RPC: DEVICE HEARTBEAT V2 — Heartbeat Completo com Health Evaluation
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_device_heartbeat_v2(
  p_identity_hash text,
  p_screen_id uuid,
  p_uptime_seconds bigint DEFAULT NULL,
  p_cpu_usage_percent float DEFAULT NULL,
  p_cpu_temperature_celsius float DEFAULT NULL,
  p_memory_usage_percent float DEFAULT NULL,
  p_memory_used_mb bigint DEFAULT NULL,
  p_memory_free_mb bigint DEFAULT NULL,
  p_memory_total_mb bigint DEFAULT NULL,
  p_storage_used_mb bigint DEFAULT NULL,
  p_storage_free_mb bigint DEFAULT NULL,
  p_storage_total_mb bigint DEFAULT NULL,
  p_temperature_celsius float DEFAULT NULL,
  p_temperature_source text DEFAULT NULL,
  p_thermal_status text DEFAULT NULL,
  p_battery_level int DEFAULT NULL,
  p_battery_temperature float DEFAULT NULL,
  p_battery_status text DEFAULT NULL,
  p_battery_health text DEFAULT NULL,
  p_network_type text DEFAULT NULL,
  p_wifi_signal_dbm int DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_connection_status text DEFAULT NULL,
  p_screen_width int DEFAULT NULL,
  p_screen_height int DEFAULT NULL,
  p_screen_refresh_rate int DEFAULT NULL,
  p_screen_orientation text DEFAULT NULL,
  p_player_version text DEFAULT NULL,
  p_sync_status text DEFAULT NULL,
  p_current_playlist_id uuid DEFAULT NULL,
  p_current_media_id uuid DEFAULT NULL,
  p_last_playback_at timestamptz DEFAULT NULL,
  p_last_sync_at timestamptz DEFAULT NULL,
  p_playback_error_count int DEFAULT 0,
  p_last_playback_error text DEFAULT NULL,
  p_media_count int DEFAULT NULL,
  p_pending_media_count int DEFAULT NULL,
  p_app_version text DEFAULT NULL,
  p_telemetry_protocol_version int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_device public.devices%ROWTYPE;
  v_health public.device_health%ROWTYPE;
  v_status text := 'UNKNOWN';
  v_thermal text;
  v_storage_pct float;
  v_memory_pct float;
BEGIN
  -- Validação
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_identity_hash IS NULL OR length(p_identity_hash) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_identity');
  END IF;
  IF NOT public.fn_player_can_access_screen(p_screen_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'screen_denied');
  END IF;

  -- Busca device
  SELECT * INTO v_device FROM public.devices WHERE identity_hash = p_identity_hash LIMIT 1;
  IF v_device.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_not_registered');
  END IF;
  IF v_device.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_revoked');
  END IF;
  IF v_device.screen_id IS DISTINCT FROM p_screen_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_bound_other_screen');
  END IF;

  -- Atualiza device (last_seen, last_heartbeat, uptime)
  UPDATE public.devices
  SET last_seen = now(),
      last_heartbeat_at = now(),
      uptime_seconds = COALESCE(p_uptime_seconds, devices.uptime_seconds),
      player_version = COALESCE(p_player_version, player_version)
  WHERE id = v_device.id;

  -- ================================================================
  -- AVALIAÇÃO AUTOMÁTICA DE STATUS (HEALTH EVALUATION)
  -- ================================================================
  
  -- Storage %
  v_storage_pct := CASE 
    WHEN p_storage_total_mb IS NOT NULL AND p_storage_total_mb > 0 AND p_storage_used_mb IS NOT NULL
    THEN (p_storage_used_mb::float / p_storage_total_mb::float) * 100
    ELSE NULL
  END;

  -- Memory %
  v_memory_pct := CASE
    WHEN p_memory_total_mb IS NOT NULL AND p_memory_total_mb > 0 AND p_memory_used_mb IS NOT NULL
    THEN (p_memory_used_mb::float / p_memory_total_mb::float) * 100
    ELSE NULL
  END;

  -- Thermal status normalizado
  v_thermal := COALESCE(NULLIF(p_thermal_status, ''), 'N/A');

  -- Lógica de status automático
  v_status := CASE
    -- OFFLINE será determinado pelo cron job baseado em last_seen
    WHEN FALSE THEN 'OFFLINE' -- placeholder
    -- DEGRADED: problemas sérios mas online
    WHEN p_temperature_celsius IS NOT NULL AND p_temperature_celsius >= 85 THEN 'DEGRADED'
    WHEN v_storage_pct IS NOT NULL AND v_storage_pct >= 95 THEN 'DEGRADED'
    WHEN v_memory_pct IS NOT NULL AND v_memory_pct >= 95 THEN 'DEGRADED'
    WHEN p_playback_error_count IS NOT NULL AND p_playback_error_count >= 10 THEN 'DEGRADED'
    WHEN v_thermal IN ('HIGH', 'CRITICAL') THEN 'DEGRADED'
    -- ONLINE: heartbeat recente e sem problemas críticos
    ELSE 'ONLINE'
  END;

  -- ================================================================
  -- UPSERT DEVICE_HEALTH (estado atual)
  -- ================================================================
  INSERT INTO public.device_health (
    device_id, last_seen, uptime_seconds, status,
    cpu_usage_percent, cpu_model, cpu_cores, cpu_frequency_mhz,
    memory_usage_percent, memory_used_mb, memory_free_mb, memory_total_mb,
    storage_used_mb, storage_free_mb, storage_total_mb,
    temperature_celsius, temperature_source, thermal_status,
    battery_level, battery_temperature, battery_status, battery_health,
    network_type, wifi_signal_dbm, ip_address, connection_status,
    screen_width, screen_height, screen_refresh_rate, screen_orientation,
    player_version, sync_status, current_playlist_id, current_media_id,
    last_playback_at, last_sync_at,
    playback_error_count, last_playback_error, media_count, pending_media_count,
    recorded_at, telemetry_protocol_version
  ) VALUES (
    v_device.id, now(), p_uptime_seconds, v_status,
    p_cpu_usage_percent, v_device.cpu_model, v_device.cpu_cores, NULL,
    p_memory_usage_percent, p_memory_used_mb, p_memory_free_mb, p_memory_total_mb,
    p_storage_used_mb, p_storage_free_mb, p_storage_total_mb,
    p_temperature_celsius, p_temperature_source, v_thermal,
    p_battery_level, p_battery_temperature, p_battery_status, p_battery_health,
    p_network_type, p_wifi_signal_dbm, p_ip_address, p_connection_status,
    p_screen_width, p_screen_height, p_screen_refresh_rate, p_screen_orientation,
    p_player_version, p_sync_status, p_current_playlist_id, p_current_media_id,
    p_last_playback_at, p_last_sync_at,
    p_playback_error_count, p_last_playback_error, p_media_count, p_pending_media_count,
    now(), p_telemetry_protocol_version
  )
  ON CONFLICT (device_id) DO UPDATE SET
    last_seen = EXCLUDED.last_seen,
    uptime_seconds = EXCLUDED.uptime_seconds,
    status = EXCLUDED.status,
    cpu_usage_percent = EXCLUDED.cpu_usage_percent,
    cpu_model = EXCLUDED.cpu_model,
    cpu_cores = EXCLUDED.cpu_cores,
    cpu_frequency_mhz = EXCLUDED.cpu_frequency_mhz,
    memory_usage_percent = EXCLUDED.memory_usage_percent,
    memory_used_mb = EXCLUDED.memory_used_mb,
    memory_free_mb = EXCLUDED.memory_free_mb,
    memory_total_mb = EXCLUDED.memory_total_mb,
    storage_used_mb = EXCLUDED.storage_used_mb,
    storage_free_mb = EXCLUDED.storage_free_mb,
    storage_total_mb = EXCLUDED.storage_total_mb,
    temperature_celsius = EXCLUDED.temperature_celsius,
    temperature_source = EXCLUDED.temperature_source,
    thermal_status = EXCLUDED.thermal_status,
    battery_level = EXCLUDED.battery_level,
    battery_temperature = EXCLUDED.battery_temperature,
    battery_status = EXCLUDED.battery_status,
    battery_health = EXCLUDED.battery_health,
    network_type = EXCLUDED.network_type,
    wifi_signal_dbm = EXCLUDED.wifi_signal_dbm,
    ip_address = EXCLUDED.ip_address,
    connection_status = EXCLUDED.connection_status,
    screen_width = EXCLUDED.screen_width,
    screen_height = EXCLUDED.screen_height,
    screen_refresh_rate = EXCLUDED.screen_refresh_rate,
    screen_orientation = EXCLUDED.screen_orientation,
    player_version = EXCLUDED.player_version,
    sync_status = EXCLUDED.sync_status,
    current_playlist_id = EXCLUDED.current_playlist_id,
    current_media_id = EXCLUDED.current_media_id,
    last_playback_at = EXCLUDED.last_playback_at,
    last_sync_at = EXCLUDED.last_sync_at,
    playback_error_count = EXCLUDED.playback_error_count,
    last_playback_error = EXCLUDED.last_playback_error,
    media_count = EXCLUDED.media_count,
    pending_media_count = EXCLUDED.pending_media_count,
    recorded_at = EXCLUDED.recorded_at,
    telemetry_protocol_version = EXCLUDED.telemetry_protocol_version;

  -- ================================================================
  -- INSERT DEVICE_TELEMETRY (histórico) — apenas sample (ex: 1/10 heartbeats)
  -- Para não encher o banco, só grava se random < 0.1 OU se status mudou
  -- ================================================================
  IF random() < 0.1 OR v_status IN ('DEGRADED', 'OFFLINE') THEN
    INSERT INTO public.device_telemetry (
      device_id, recorded_at,
      cpu_usage_percent, cpu_temperature_celsius,
      memory_usage_percent, memory_used_mb, memory_free_mb, memory_total_mb,
      storage_used_mb, storage_free_mb, storage_total_mb,
      temperature_celsius, thermal_status,
      battery_level, battery_temperature, battery_status,
      network_type, wifi_signal_dbm,
      uptime_seconds, sync_status, playback_status,
      telemetry_protocol_version
    ) VALUES (
      v_device.id, now(),
      p_cpu_usage_percent, p_cpu_temperature_celsius,
      p_memory_usage_percent, p_memory_used_mb, p_memory_free_mb, p_memory_total_mb,
      p_storage_used_mb, p_storage_free_mb, p_storage_total_mb,
      p_temperature_celsius, v_thermal,
      p_battery_level, p_battery_temperature, p_battery_status,
      p_network_type, p_wifi_signal_dbm,
      p_uptime_seconds, p_sync_status, 
      CASE WHEN p_last_playback_at IS NOT NULL AND p_last_playback_at > now() - interval '10 minutes' THEN 'PLAYING' ELSE 'IDLE' END,
      p_telemetry_protocol_version
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'device_id', v_device.id::text,
    'status', v_status,
    'storage_pct', round(v_storage_pct::numeric, 1),
    'memory_pct', round(v_memory_pct::numeric, 1),
    'thermal', v_thermal,
    'message', 'Heartbeat registrado com health evaluation'
  );
END;
$$;

-- -------------------------------------------------------------------------
-- 6. RPC: DEVICE TELEMETRY BATCH — Inserção em Lote (Offline-First)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_device_telemetry_batch(
  p_identity_hash text,
  p_screen_id uuid,
  p_telemetry jsonb  -- array de objetos telemetry
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_device public.devices%ROWTYPE;
  v_item jsonb;
  v_count int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_identity_hash IS NULL OR length(p_identity_hash) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_identity');
  END IF;
  IF NOT public.fn_player_can_access_screen(p_screen_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'screen_denied');
  END IF;

  SELECT * INTO v_device FROM public.devices WHERE identity_hash = p_identity_hash LIMIT 1;
  IF v_device.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_not_registered');
  END IF;
  IF v_device.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_revoked');
  END IF;
  IF v_device.screen_id IS DISTINCT FROM p_screen_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_bound_other_screen');
  END IF;

  -- Processa array de telemetria
  IF p_telemetry IS NOT NULL AND jsonb_typeof(p_telemetry) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_telemetry)
    LOOP
      INSERT INTO public.device_telemetry (
        device_id, recorded_at,
        cpu_usage_percent, cpu_temperature_celsius,
        memory_usage_percent, memory_used_mb, memory_free_mb, memory_total_mb,
        storage_used_mb, storage_free_mb, storage_total_mb,
        temperature_celsius, thermal_status,
        battery_level, battery_temperature, battery_status,
        network_type, wifi_signal_dbm,
        uptime_seconds, sync_status, playback_status,
        telemetry_protocol_version
      ) VALUES (
        v_device.id,
        COALESCE((v_item->>'recorded_at')::timestamptz, now()),
        (v_item->>'cpu_usage_percent')::float,
        (v_item->>'cpu_temperature_celsius')::float,
        (v_item->>'memory_usage_percent')::float,
        (v_item->>'memory_used_mb')::bigint,
        (v_item->>'memory_free_mb')::bigint,
        (v_item->>'memory_total_mb')::bigint,
        (v_item->>'storage_used_mb')::bigint,
        (v_item->>'storage_free_mb')::bigint,
        (v_item->>'storage_total_mb')::bigint,
        (v_item->>'temperature_celsius')::float,
        v_item->>'thermal_status',
        (v_item->>'battery_level')::int,
        (v_item->>'battery_temperature')::float,
        v_item->>'battery_status',
        v_item->>'network_type',
        (v_item->>'wifi_signal_dbm')::int,
        (v_item->>'uptime_seconds')::bigint,
        v_item->>'sync_status',
        v_item->>'playback_status',
        COALESCE((v_item->>'telemetry_protocol_version')::int, 1)
      );
      v_count := v_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'inserted', v_count);
END;
$$;

-- -------------------------------------------------------------------------
-- 7. RLS POLICIES — Novas Tabelas
-- -------------------------------------------------------------------------

-- DEVICE_TELEMETRY
ALTER TABLE public.device_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dt_select_own" ON public.device_telemetry;
DROP POLICY IF EXISTS "dt_insert_own" ON public.device_telemetry;

CREATE POLICY "dt_select_own" ON public.device_telemetry
  FOR SELECT TO authenticated
  USING (
    device_id IN (
      SELECT d.id FROM public.devices d
      WHERE d.screen_id IS NOT NULL AND public.fn_player_can_access_screen(d.screen_id)
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "dt_insert_own" ON public.device_telemetry
  FOR INSERT TO authenticated
  WITH CHECK (
    device_id IN (
      SELECT d.id FROM public.devices d
      WHERE d.screen_id IS NOT NULL AND public.fn_player_can_access_screen(d.screen_id)
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.device_telemetry FROM anon;
GRANT SELECT, INSERT ON public.device_telemetry TO authenticated;

-- Garantir RLS nas tabelas estendidas (devices já tem, device_health já tem)
-- Apenas confirmar grants
GRANT SELECT, INSERT, UPDATE ON public.devices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.device_health TO authenticated;

-- -------------------------------------------------------------------------
-- 8. GRANTS RPCs
-- -------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.fn_device_register_extended(
  text, uuid, text, text, text, text, text, text, int, text, text, int,
  bigint, bigint, text, int, int, float, int, text, text, int
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_device_heartbeat_v2(
  text, uuid, bigint, float, float, float, bigint, bigint, bigint,
  bigint, bigint, bigint, float, text, text, int, float, text, text,
  text, int, text, int, int, int, text, uuid, uuid, timestamptz, timestamptz,
  int, text, int, int, text, int
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_device_telemetry_batch(text, uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_device_register_extended(...) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_device_heartbeat_v2(...) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_device_telemetry_batch(...) FROM anon;

-- -------------------------------------------------------------------------
-- 9. CRON JOB — Atualização de Status OFFLINE (executar a cada 5 min)
-- -------------------------------------------------------------------------
-- Nota: Requer pg_cron extension. Se não disponível, implementar via worker externo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove job antigo se existir
    PERFORM cron.unschedule('device_fleet_offline_check');
    
    -- Agenda verificação a cada 5 minutos
    PERFORM cron.schedule(
      'device_fleet_offline_check',
      '*/5 * * * *',
      $$
      UPDATE public.device_health dh
      SET status = 'OFFLINE'
      WHERE dh.status = 'ONLINE'
        AND dh.last_seen < now() - interval '5 minutes'
        AND EXISTS (
          SELECT 1 FROM public.devices d
          WHERE d.id = dh.device_id
            AND d.revoked_at IS NULL
        );
      $$
    );
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- 10. VIEW PARA DASHBOARD — Device Fleet Summary
-- -------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_device_fleet_summary AS
SELECT 
  d.id as device_id,
  d.identity_hash,
  d.device_type,
  d.device_name,
  d.manufacturer,
  d.brand,
  d.model,
  d.serial_number,
  d.os_version,
  d.os_sdk,
  d.architecture,
  d.cpu_model,
  d.cpu_cores,
  d.ram_total_mb,
  d.storage_total_mb,
  d.gpu,
  d.screen_width,
  d.screen_height,
  d.screen_refresh_rate,
  d.player_version,
  d.telemetry_protocol_version,
  d.screen_id,
  d.status as device_status,
  d.first_seen_at,
  d.last_seen_at,
  d.last_heartbeat_at,
  d.revoked_at,
  s.codigo_operacional as screen_codigo,
  s.name as screen_name,
  s.is_active as screen_active,
  s.bound_device_id,
  dh.status as health_status,
  dh.last_seen as health_last_seen,
  dh.uptime_seconds,
  dh.cpu_usage_percent,
  dh.memory_usage_percent,
  dh.storage_used_mb,
  dh.storage_free_mb,
  dh.storage_total_mb,
  round(
    CASE WHEN dh.storage_total_mb > 0 
    THEN (dh.storage_used_mb::float / dh.storage_total_mb::float) * 100 
    ELSE NULL END, 1
  ) as storage_pct,
  dh.temperature_celsius,
  dh.thermal_status,
  dh.battery_level,
  dh.battery_status,
  dh.network_type,
  dh.wifi_signal_dbm,
  dh.ip_address,
  dh.player_version as health_player_version,
  dh.sync_status,
  dh.current_playlist_id,
  dh.current_media_id,
  dh.last_playback_at,
  dh.last_sync_at,
  dh.playback_error_count,
  dh.last_playback_error
FROM public.devices d
LEFT JOIN public.screens s ON s.id = d.screen_id
LEFT JOIN public.device_health dh ON dh.device_id = d.id
WHERE d.revoked_at IS NULL;

GRANT SELECT ON public.v_device_fleet_summary TO authenticated;

-- ======================================================================
-- FIM DA MIGRATION
-- ======================================================================
SELECT 'Migration 20260825_device_fleet applied successfully' AS status;