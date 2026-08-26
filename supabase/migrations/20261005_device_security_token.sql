-- ======================================================================
-- MIGRATION: 20261005 — ANDROID PLAYER SECURITY TOKEN & RLS
-- SOBRE MÍDIA PLATFORM | FASE C: DEVICE JWT / SCREEN TOKEN
-- ======================================================================

ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS screen_token text;

-- ----------------------------------------------------------------------
-- 1. Criação da Função para Ler o Cabeçalho Customizado
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_device_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT id FROM public.devices 
  WHERE screen_token = current_setting('request.headers', true)::json->>'x-device-token'
    AND screen_token IS NOT NULL
  LIMIT 1;
$$;

-- ----------------------------------------------------------------------
-- 2. Modificação da RPC fn_link_device_to_screen para gerar o token
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_link_device_to_screen(
  p_pairing_code varchar(6),
  p_screen_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_record public.device_pairing_codes%ROWTYPE;
  v_new_screen_token text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_record 
  FROM public.device_pairing_codes 
  WHERE pairing_code = p_pairing_code AND status = 'pending'
  LIMIT 1;

  IF v_record.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  END IF;

  IF v_record.expires_at < now() THEN
    UPDATE public.device_pairing_codes SET status = 'expired' WHERE id = v_record.id;
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  END IF;

  -- Update pairing status
  UPDATE public.device_pairing_codes 
  SET status = 'paired', screen_id = p_screen_id 
  WHERE id = v_record.id;

  -- Gera um token seguro de 64 caracteres
  v_new_screen_token := encode(gen_random_bytes(32), 'hex');

  -- Associa o identity_hash à tabela devices oficial e injeta o token
  INSERT INTO public.devices (screen_id, identity_hash, screen_token, model, status, activated_at, last_seen)
  VALUES (p_screen_id, v_record.identity_hash, v_new_screen_token, v_record.device_model, 'registered', now(), now())
  ON CONFLICT (identity_hash) DO UPDATE 
  SET screen_id = EXCLUDED.screen_id,
      screen_token = EXCLUDED.screen_token,
      model = COALESCE(EXCLUDED.model, devices.model),
      activated_at = EXCLUDED.activated_at,
      last_seen = EXCLUDED.last_seen;

  RETURN jsonb_build_object('ok', true, 'identity_hash', v_record.identity_hash, 'screen_token', v_new_screen_token);
END;
$$;

-- ----------------------------------------------------------------------
-- 3. Modificação da RPC fn_check_pairing_status para retornar o token
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_check_pairing_status(
  p_identity_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record public.device_pairing_codes%ROWTYPE;
  v_device_token text;
BEGIN
  SELECT * INTO v_record 
  FROM public.device_pairing_codes 
  WHERE identity_hash = p_identity_hash AND status IN ('pending', 'paired')
  ORDER BY created_at DESC LIMIT 1;

  IF v_record.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;

  IF v_record.expires_at < now() AND v_record.status = 'pending' THEN
    UPDATE public.device_pairing_codes SET status = 'expired' WHERE id = v_record.id;
    RETURN jsonb_build_object('ok', false, 'status', 'expired');
  END IF;

  -- Se estiver pareado, precisamos pegar o screen_token da tabela devices
  IF v_record.status = 'paired' THEN
    SELECT screen_token INTO v_device_token FROM public.devices WHERE identity_hash = p_identity_hash LIMIT 1;
    RETURN jsonb_build_object(
      'ok', true, 
      'status', v_record.status, 
      'screen_id', v_record.screen_id,
      'screen_token', v_device_token
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 
    'status', v_record.status, 
    'screen_id', v_record.screen_id
  );
END;
$$;

-- ----------------------------------------------------------------------
-- 4. RLS na tabela SCREENS para leitura do player
-- ----------------------------------------------------------------------
-- Drop existing player read policy if any exist specifically for anon
DROP POLICY IF EXISTS "screens_anon_read" ON public.screens;
DROP POLICY IF EXISTS "screens_player_read" ON public.screens;

-- Substituir "read_anon" que era aberto por "read_device"
CREATE POLICY "screens_device_read" ON public.screens
FOR SELECT USING (
  id = (SELECT screen_id FROM public.devices WHERE id = public.current_device_id())
);

-- Note: A API Web continuará conseguindo ler via as roles autenticadas normais (public.fn_player_can_access_screen).
