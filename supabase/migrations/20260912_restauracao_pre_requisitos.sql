-- ======================================================================
-- MIGRATION: 20260912 - PRE-REQUISITOS DA CADEIA DE HARDENING (RESTAURACAO)
-- SOBRE MIDIA PLATFORM | RESTAURACAO FORENSE - FASE 3/EXECUCAO
-- ======================================================================
-- Contexto: a cadeia de hardening 20260827-20260911 nunca foi aplicada ao
-- banco vivo (somente 20260825 e 20260826 existiam). A aplicacao das
-- migrations 20260910/20260911 falhou porque as funcoes auxiliares que a
-- cadeia reutiliza nao existiam no banco:
--   - public.get_user_empresa_operadora_id(uuid)  (definida em 018)
--   - public.fn_player_can_access_screen(uuid)     (definida em 20260827)
--   - public.fn_player_can_access_screen_text(text) (definida em 20260827)
-- Esta migration aditiva cria APENAS essas funcoes (definicoes verbatim
-- das migrations originais), sem re-executar policies antigas, para que
-- 20260827/20260910/20260911 possam ser aplicadas na ordem correta.
-- Idempotente: CREATE OR REPLACE + GRANT / REVOKE.
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. RESOLUCAO DE TENANT POR USUARIO AUTENTICADO (verbatim de 018)
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_empresa_operadora_id(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT empresa_operadora_id INTO v_tenant_id
  FROM public.usuarios
  WHERE id = p_user_id;

  IF v_tenant_id IS NULL THEN
    SELECT empresa_operadora_id INTO v_tenant_id
    FROM public.representantes
    WHERE usuario_id = p_user_id;
  END IF;

  RETURN v_tenant_id;
END;
$$;

-- ----------------------------------------------------------------------
-- 2. ACCESS CHECK DE SCREEN (verbatim de 20260827)
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_player_can_access_screen(p_screen_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- Variante para colunas screen_id em texto (playback_logs usa TEXT e pode
-- conter UUID ou custom_id do dispositivo).
CREATE OR REPLACE FUNCTION public.fn_player_can_access_screen_text(p_screen_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
BEGIN
  IF v_uid IS NULL OR p_screen_id IS NULL OR p_screen_id = '' THEN
    RETURN false;
  END IF;
  IF public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN true;
  END IF;
  SELECT public.get_user_empresa_operadora_id(v_uid) INTO v_tenant;
  RETURN EXISTS (
    SELECT 1 FROM public.screens s
    WHERE (s.id::text = p_screen_id OR s.custom_id = p_screen_id)
      AND (s.user_id = v_uid OR (v_tenant IS NOT NULL AND s.empresa_operadora_id = v_tenant))
  );
END;
$$;

-- ----------------------------------------------------------------------
-- 3. GRANTS (higiene: executavel por authenticated, nunca por anon)
-- ----------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_user_empresa_operadora_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_player_can_access_screen(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_player_can_access_screen_text(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_empresa_operadora_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_player_can_access_screen(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_player_can_access_screen_text(text) FROM anon;
