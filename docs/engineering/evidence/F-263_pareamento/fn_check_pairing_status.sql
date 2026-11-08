CREATE OR REPLACE FUNCTION public.fn_check_pairing_status(p_identity_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$
