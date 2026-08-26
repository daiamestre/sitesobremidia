-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261033
-- FASE 17 FIX: fn_player_can_access_screen SECURITY DEFINER
--
-- CAUSA RAIZ PROVADA: a função era SECURITY INVOKER e consultava a própria
-- tabela public.screens. Policies de SELECT/UPDATE/DELETE/RETURNING que a
-- invocam re-entram na RLS de screens (recursão) e avaliam sempre FALSE,
-- quebrando INSERT..RETURNING (PostgREST), leituras de rows recém-criadas
-- pelo dono e qualquer fluxo autenticado legítimo.
--
-- CORREÇÃO: SECURITY DEFINER + search_path fixo (mesmo padrão das helpers
-- get_user_tenant_id / is_owner_or_admin). Sem bypass: a decisão continua
-- presa a user_id/tenant/admin; anon continua false.
-- ======================================================================
CREATE OR REPLACE FUNCTION public.fn_player_can_access_screen(p_screen_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  IF public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN true;
  END IF;
  SELECT public.get_user_empresa_operadora_id(v_uid) INTO v_tenant;
  RETURN EXISTS (
    SELECT 1 FROM public.screens s
    WHERE s.id = p_screen_id
      AND (s.user_id = v_uid OR (v_tenant IS NOT NULL AND s.empresa_operadora_id = v_tenant))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_player_can_access_screen(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_player_can_access_screen(uuid) TO authenticated;
