CREATE OR REPLACE FUNCTION public.fn_request_pairing_code(p_identity_hash text, p_device_model text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_code varchar(6);
  v_existing uuid;
  v_expires_at timestamptz := now() + interval '15 minutes';
BEGIN
  -- Marca códigos anteriores pendentes como expirados para este device
  UPDATE public.device_pairing_codes 
  SET status = 'expired' 
  WHERE identity_hash = p_identity_hash AND status = 'pending';

  -- Gera código único e aleatório de 6 dígitos
  LOOP
    v_code := lpad(floor(random() * 1000000)::text, 6, '0');
    SELECT id INTO v_existing FROM public.device_pairing_codes WHERE pairing_code = v_code AND status = 'pending';
    EXIT WHEN v_existing IS NULL;
  END LOOP;

  INSERT INTO public.device_pairing_codes (pairing_code, identity_hash, device_model, status, expires_at)
  VALUES (v_code, p_identity_hash, p_device_model, 'pending', v_expires_at);

  RETURN jsonb_build_object('ok', true, 'pairing_code', v_code, 'expires_at', v_expires_at);
END;
$function$
