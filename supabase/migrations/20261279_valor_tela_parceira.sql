-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261279 — F-109
-- OWNER/ADMIN mudam o valor para anunciar de uma tela parceira; o valor
-- "a partir de" do ponto passa a ser o menor valor entre as telas dele.
-- ROLLBACK: DROP FUNCTION IF EXISTS public.fn_atualizar_valor_tela(uuid, numeric);
-- ======================================================================
CREATE OR REPLACE FUNCTION public.fn_atualizar_valor_tela(p_tela uuid, p_valor numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_ponto uuid;
BEGIN
  IF NOT public.fn_eh_owner_ou_admin() THEN
    RAISE EXCEPTION 'Só o dono e os administradores alteram o valor da tela parceira.' USING ERRCODE = '42501';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN RAISE EXCEPTION 'Informe um valor maior que zero.' USING ERRCODE = '22023'; END IF;
  UPDATE public.screens SET valor_anuncio = round(p_valor, 2), updated_at = now()
   WHERE id = p_tela AND tipo_tela = 'PARCEIRA' AND empresa_operadora_id = public.get_user_tenant_id()
   RETURNING ponto_id INTO v_ponto;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tela parceira não encontrada.' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.pontos SET valor_anuncio = (SELECT min(valor_anuncio) FROM public.screens WHERE ponto_id = v_ponto AND tipo_tela = 'PARCEIRA'),
         updated_at = now()
   WHERE id = v_ponto;
  RETURN jsonb_build_object('status', 'OK');
END;
$$;
REVOKE ALL ON FUNCTION public.fn_atualizar_valor_tela(uuid, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_valor_tela(uuid, numeric) TO authenticated;
