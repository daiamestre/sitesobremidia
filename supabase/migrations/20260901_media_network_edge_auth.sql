-- ======================================================================
-- MIGRATION: 20260901 — MEDIA NETWORK EDGE AUTH + OBJECT SCOPE VALIDATION
-- SOBRE MÍDIA PLATFORM | FASE F: SECURITY HARDENING (EDGE FUNCTIONS)
-- ======================================================================
-- Contexto (P0 da auditoria):
--   - get-upload-url aceitava userId e caminhos arbitrários SEM JWT,
--     permitindo upload cross-user/cross-tenant em R2 (IDOR).
--   - r2Client.ts embutia ACCESS/SECRET KEY do R2 no bundle do browser.
--   - upload-audit-log não exigia autenticação.
-- Esta migration provê as funções seguras usadas pelas Edge Functions:
--   1. Grants explícitos das RPCs de tenant/role para authenticated.
--   2. fn_r2_validate_object_scope — validação SERVER-SIDE (SECURITY
--      DEFINER) do caminho do objeto antes de gerar presigned URL
--      (upload/delete). O caminho é aprovado SOMENTE se:
--        - pertence ao usuário autenticado ({user_id}/...)  OU
--        - pertence ao tenant do usuário (tenants/{tenant_id}/...)  OU
--        - chamador é admin (com prefixos de sistema bloqueados).
-- Idempotente: CREATE OR REPLACE / GRANT.
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. GRANTS EXPLÍCITOS DAS RPCs DE TENANT/ROLE (chamadas por edge fn
--    com o JWT do usuário; default PUBLIC é insuficiente por hygiene)
-- ----------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_user_empresa_operadora_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_empresa_operadora_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;

-- ----------------------------------------------------------------------
-- 2. VALIDAÇÃO DE ESCOPO DE OBJETO R2 (SECURITY DEFINER)
-- Regras (ordem de avaliação):
--   a) Formato/traversal básico (charset, sem .., sem / inicial).
--   b) Admin: acesso amplo, exceto prefixos de sistema.
--   c) {user_id}/...  -> escopo direto do usuário autenticado.
--   d) tenants/{tenant_id}/... -> somente o tenant do usuário.
--   e) Zonas legadas (UUID no topo, temp/, thumbnails/, etc.): permitido
--      somente se NÃO existir row em media (novo arquivo) OU a row de
--      media pertencer ao usuário autenticado. Impede overwrite/delete
--      de mídia alheia via caminhos antigos (IDOR).
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_r2_validate_object_scope(p_object_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_first_segment text;
  v_other_owner boolean;
BEGIN
  IF v_uid IS NULL OR p_object_key IS NULL OR p_object_key = '' THEN
    RETURN false;
  END IF;

  -- Formato permitido: letras/dígitos/-/_// e .
  IF p_object_key !~ '^[A-Za-z0-9_\-./]+$' THEN
    RETURN false;
  END IF;

  -- Sem path traversal
  IF p_object_key LIKE '%..%' OR p_object_key LIKE '/%' OR p_object_key LIKE '\\%' THEN
    RETURN false;
  END IF;

  v_first_segment := split_part(p_object_key, '/', 1);

  -- Admin: acesso amplo, exceto prefixos de sistema (releases, audit_logs,
  -- screenshots, templates de contrato) que pertencem a fluxos internos.
  IF public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN v_first_segment NOT IN ('releases', 'audit_logs', 'screenshots', 'contrato_templates');
  END IF;

  -- Escopo usuário: {user_id}/...
  IF v_first_segment = v_uid::text THEN
    RETURN true;
  END IF;

  -- Escopo tenant: tenants/{tenant_id}/...
  IF v_first_segment = 'tenants' THEN
    SELECT public.get_user_empresa_operadora_id(v_uid) INTO v_tenant;
    RETURN v_tenant IS NOT NULL
      AND split_part(p_object_key, '/', 2) = v_tenant::text;
  END IF;

  -- Zonas legadas (top-level/temp/thumbnails): ownership via tabela media.
  -- SECURITY DEFINER ignora RLS -> checagem EXPLÍCITA de user_id.
  SELECT EXISTS (
    SELECT 1 FROM public.media
    WHERE file_path = p_object_key
      AND user_id IS DISTINCT FROM v_uid
    LIMIT 1
  ) INTO v_other_owner;

  RETURN NOT v_other_owner;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_r2_validate_object_scope(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_r2_validate_object_scope(text) FROM anon;

-- ----------------------------------------------------------------------
-- 3. TELEMETRIA OFICIAL DO PLAYER (player_heartbeats)
--    Caminho único de telemetria: HealthMonitorWorker envia via RPC
--    SECURITY DEFINER; tenant/player resolvidos SERVER-SIDE pela tela.
--    Elimina escritores duplicados em screens/device_health/devices.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_player_report_telemetry(
  p_screen_id uuid,
  p_cpu_usage numeric DEFAULT NULL,
  p_memory_usage numeric DEFAULT NULL,
  p_temp_celsius numeric DEFAULT NULL,
  p_storage_free_mb bigint DEFAULT NULL,
  p_versao_app text DEFAULT NULL,
  p_ip_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_screen public.screens%ROWTYPE;
  v_player uuid;
  v_tenant uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF NOT public.fn_player_can_access_screen(p_screen_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'screen_denied');
  END IF;

  SELECT * INTO v_screen FROM public.screens WHERE id = p_screen_id LIMIT 1;
  IF v_screen.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'screen_not_found');
  END IF;

  v_tenant := v_screen.empresa_operadora_id;

  -- Player canônico do tenant/screen (fallback: nenhum → NULL p/ FK)
  SELECT p.id INTO v_player
  FROM public.players p
  WHERE p.empresa_operadora_id = v_tenant
  LIMIT 1;

  INSERT INTO public.player_heartbeats (
    player_id, empresa_operadora_id, screen_id, ip_address,
    cpu_usage, memory_usage, temp_celsius, storage_free_mb,
    versao_app, status_ping, ping_at
  ) VALUES (
    v_player, v_tenant, p_screen_id, p_ip_address,
    p_cpu_usage, p_memory_usage, p_temp_celsius, p_storage_free_mb,
    p_versao_app, 'ONLINE', now()
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_player_report_telemetry(uuid, numeric, numeric, numeric, bigint, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_player_report_telemetry(uuid, numeric, numeric, numeric, bigint, text, text) FROM anon;

-- VERIFICAÇÃO
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname IN ('fn_r2_validate_object_scope', 'fn_player_report_telemetry', 'get_user_empresa_operadora_id')
ORDER BY proname;