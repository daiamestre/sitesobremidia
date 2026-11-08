CREATE OR REPLACE FUNCTION public.fn_link_device_to_screen(p_pairing_code character varying, p_screen_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$
