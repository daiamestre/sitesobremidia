-- ======================================================================
-- MIGRATION: 20260916 - FECHAMENTO P0 - RLS DEVICE_LOGS + DOWNLOAD_STATUS
-- SOBRE MIDIA PLATFORM | RESTAURACAO FORENSE - FECHAMENTO P0 (COMPLEMENTO 20260915)
-- ======================================================================
-- Contexto: verificacao ao vivo (pg_policies) comprovou que as tabelas
-- auxiliares do player ainda possuiam policies abertas:
--   - device_logs:   "Enable player log insert" INSERT WITH CHECK (true)
--                    para authenticated -> injecao de logs cross-tenant.
--   - download_status: "Enable player download status" ALL USING (true)
--                    WITH CHECK (true) -> leitura/escrita cross-tenant.
-- Ambas tambem mantinham grants completos para o role anon (dados do
-- player expostos pela API publica quando RLS nao cobre o acesso).
--
-- device_logs.device_id e FK -> devices(id) ON DELETE CASCADE (uuid).
-- A policy referencia devices via fn_player_can_access_screen(screen_id),
-- aceitando apenas logs de devices vinculados a telas do proprio tenant.
--
-- download_status.device_id e text (screen uuid/custom_id): policy usa
-- fn_player_can_access_screen_text(device_id).
--
-- Idempotente: DROP POLICY IF EXISTS.
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. DEVICE_LOGS - logs somente de devices do proprio tenant
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable player log insert" ON public.device_logs;
DROP POLICY IF EXISTS "dl_insert_own" ON public.device_logs;
DROP POLICY IF EXISTS "dl_select_own" ON public.device_logs;

CREATE POLICY "dl_insert_own" ON public.device_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    device_id IN (
      SELECT d.id FROM public.devices d
      WHERE d.screen_id IS NOT NULL AND public.fn_player_can_access_screen(d.screen_id)
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "dl_select_own" ON public.device_logs
  FOR SELECT TO authenticated
  USING (
    device_id IN (
      SELECT d.id FROM public.devices d
      WHERE d.screen_id IS NOT NULL AND public.fn_player_can_access_screen(d.screen_id)
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.device_logs FROM anon;
GRANT SELECT, INSERT ON public.device_logs TO authenticated;

-- ----------------------------------------------------------------------
-- 2. DOWNLOAD_STATUS - status de download somente do proprio tenant
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable player download status" ON public.download_status;
DROP POLICY IF EXISTS "ds_select_own" ON public.download_status;
DROP POLICY IF EXISTS "ds_insert_own" ON public.download_status;
DROP POLICY IF EXISTS "ds_update_own" ON public.download_status;

CREATE POLICY "ds_select_own" ON public.download_status
  FOR SELECT TO authenticated
  USING (
    public.fn_player_can_access_screen_text(device_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "ds_insert_own" ON public.download_status
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_player_can_access_screen_text(device_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "ds_update_own" ON public.download_status
  FOR UPDATE TO authenticated
  USING (
    public.fn_player_can_access_screen_text(device_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.fn_player_can_access_screen_text(device_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.download_status FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.download_status TO authenticated;

-- ----------------------------------------------------------------------
-- VERIFICACAO FINAL - nenhuma policy com qual/check (true) nas tabelas player
-- ----------------------------------------------------------------------
SELECT schemaname, tablename, policyname, cmd, roles, left(qual, 60) AS qual, left(with_check, 60) AS wc
FROM pg_policies
WHERE (tablename IN ('device_logs','download_status'))
ORDER BY tablename, policyname;