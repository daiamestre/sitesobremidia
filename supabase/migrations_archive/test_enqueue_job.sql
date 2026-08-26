DO $$
DECLARE
  v_empresa_id UUID;
BEGIN
  INSERT INTO public.empresa_operadora (id, nome, nome_fantasia, razao_social, cnpj, email)
  VALUES (gen_random_uuid(), 'SOBRE MÍDIA', 'SOBRE MÍDIA', 'SOBRE MÍDIA LTDA', '00000000000000', 'onboarding@resend.dev')
  RETURNING id INTO v_empresa_id;

  PERFORM public.enfileirar_job(
    v_empresa_id,
    'COMMUNICATION_CORE_TEST',
    '{"to": "jairansantos@gmail.com"}'::jsonb,
    'teste-idempotencia-123'
  );
END $$;
