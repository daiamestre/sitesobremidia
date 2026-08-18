-- ======================================================================
-- MIGRATION: 20260828 — ANDROID PLAYER DEVICE IDENTITY
-- SOBRE MÍDIA PLATFORM | FASE C: DEVICE IDENTITY / BINDING / REVOCATION
-- ======================================================================
-- Contexto (P0 da auditoria): o Player era identificado apenas por
-- screen_id (spooffável). Esta migration cria a entidade DEVICE com
-- identidade de hardware (identity_hash) vinculada a screen+tenant,
-- permitindo: registration, activation, binding, revocation, rotation.
--
-- Relação oficial:
--   TENANT (empresa_operadora) -> SCREEN (id) -> DEVICE (identity_hash)
--
-- A tabela devices já é referenciada por código existente (device_health
-- FK, RealtimeManager CDC devices.screen_token, updateDevicesHeartbeat).
-- Idempotente: CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. TABELA DEVICES (idempotente, tolerante a tabela pré-existente)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id       uuid REFERENCES public.screens(id) ON DELETE SET NULL,
  identity_hash   text UNIQUE,
  screen_token    text,
  name            text,
  model           text,
  status          text NOT NULL DEFAULT 'registered',
  last_seen       timestamptz,
  last_heartbeat  timestamptz,
  registered_at   timestamptz NOT NULL DEFAULT now(),
  activated_at    timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Colunas ausentes (tolerância a schema pré-existente no banco vivo)
DO $$
BEGIN
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS identity_hash text; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS screen_id uuid; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS revoked_at timestamptz; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS activated_at timestamptz; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS last_seen timestamptz; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_devices_screen_id ON public.devices(screen_id);
CREATE INDEX IF NOT EXISTS idx_devices_identity ON public.devices(identity_hash);

-- ----------------------------------------------------------------------
-- 2. RLS DEVICES — somente telas do próprio usuário/tenant
-- ----------------------------------------------------------------------
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dev_select_own" ON public.devices;
DROP POLICY IF EXISTS "dev_insert_own" ON public.devices;
DROP POLICY IF EXISTS "dev_update_own" ON public.devices;

CREATE POLICY "dev_select_own" ON public.devices
  FOR SELECT TO authenticated
  USING (
    (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "dev_insert_own" ON public.devices
  FOR INSERT TO authenticated
  WITH CHECK (
    (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "dev_update_own" ON public.devices
  FOR UPDATE TO authenticated
  USING (
    (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.devices FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.devices TO authenticated;

-- ----------------------------------------------------------------------
-- 3. DEVICE_HEALTH — policy ampliada: aceita device_id (devices) ou
-- screen_id (substitui dh_all_own da migration 20260827)
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "dh_all_own" ON public.device_health;

CREATE POLICY "dh_all_own" ON public.device_health
  FOR ALL TO authenticated
  USING (
    public.fn_player_can_access_screen(device_id)
    OR device_id IN (
      SELECT d.id FROM public.devices d
      WHERE d.screen_id IS NOT NULL AND public.fn_player_can_access_screen(d.screen_id)
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.fn_player_can_access_screen(device_id)
    OR device_id IN (
      SELECT d.id FROM public.devices d
      WHERE d.screen_id IS NOT NULL AND public.fn_player_can_access_screen(d.screen_id)
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ----------------------------------------------------------------------
-- 4. RPC: BIND — registro/ativação/rotação de device
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_device_bind(
  p_identity_hash text,
  p_screen_id uuid,
  p_model text DEFAULT NULL
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

  SELECT * INTO v_existing FROM public.devices WHERE identity_hash = p_identity_hash LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.revoked_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'device_revoked');
    END IF;
    IF v_existing.screen_id IS DISTINCT FROM p_screen_id THEN
      -- ROTAÇÃO: re-vinculação só permitida se o chamador também tiver
      -- acesso à tela original (mesmo tenant) — impede roubo de identidade
      IF NOT public.fn_player_can_access_screen(v_existing.screen_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'device_bound_other_tenant');
      END IF;
      UPDATE public.devices
        SET screen_id = p_screen_id, last_seen = now(),
            model = COALESCE(p_model, model), activated_at = now(), revoked_at = NULL
      WHERE id = v_existing.id
      RETURNING * INTO v_device;
    ELSE
      UPDATE public.devices
        SET last_seen = now(), model = COALESCE(p_model, model)
      WHERE id = v_existing.id
      RETURNING * INTO v_device;
    END IF;
  ELSE
    INSERT INTO public.devices (screen_id, identity_hash, model, status, registered_at, activated_at, last_seen)
    VALUES (p_screen_id, p_identity_hash, p_model, 'registered', now(), now(), now())
    RETURNING * INTO v_device;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'device_id', v_device.id::text,
    'status', v_device.status,
    'screen_id', v_device.screen_id::text
  );
END;
$$;

-- ----------------------------------------------------------------------
-- 5. RPC: ATTEST — validação periódica da identidade (revogação)
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_device_attest(
  p_identity_hash text,
  p_screen_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_device public.devices%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
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

  UPDATE public.devices SET last_seen = now(), last_heartbeat = now()
  WHERE id = v_device.id;

  RETURN jsonb_build_object(
    'ok', true,
    'device_id', v_device.id::text,
    'status', v_device.status
  );
END;
$$;

-- ----------------------------------------------------------------------
-- 6. RPC: REVOKE — Owner/Admin revoga um device (bloqueio imediato)
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_device_revoke(p_device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_device public.devices%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_device FROM public.devices WHERE id = p_device_id LIMIT 1;
  IF v_device.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_not_found');
  END IF;

  IF NOT public.fn_player_can_access_screen(v_device.screen_id)
     AND NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'denied');
  END IF;

  UPDATE public.devices SET revoked_at = now(), status = 'revoked'
  WHERE id = p_device_id;

  RETURN jsonb_build_object('ok', true, 'device_id', p_device_id::text);
END;
$$;

-- ----------------------------------------------------------------------
-- 7. GRANTS
-- ----------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.fn_device_bind(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_device_attest(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_device_revoke(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_device_bind(text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_device_attest(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_device_revoke(uuid) FROM anon;

-- VERIFICAÇÃO
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('devices','device_health')
ORDER BY tablename, policyname;