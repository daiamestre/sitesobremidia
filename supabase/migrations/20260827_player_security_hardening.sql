-- ======================================================================
-- MIGRATION: 20260827 — ANDROID PLAYER SECURITY HARDENING
-- SOBRE MÍDIA PLATFORM | FASE B: RLS / TENANT ISOLATION
-- ======================================================================
-- Contexto: Auditoria de segurança do Android Player (P0):
--   - remote_commands com USING(true) para anon+authenticated (cross-tenant)
--   - playback_logs com INSERT anon WITH CHECK(true) (Proof-of-Play forjável)
--   - device_health com FOR ALL authenticated USING(true)
--   - screens com tenant-null exposto a anon (empresa_operadora_id IS NULL)
--   - storage screenshots com upload público irrestrito
--   - app_releases (manifest OTA) legível por anon
-- Objetivo: o Player só acessa a própria tela/device/tenant.
-- Idempotente: seguro para re-execução.
-- ======================================================================

-- ----------------------------------------------------------------------
-- 0. FUNÇÕES AUXILIARES (REUTILIZADAS POR TODAS AS POLICIES)
-- ----------------------------------------------------------------------
-- Autorização: usuário autenticado possui a tela (user_id) OU pertence ao
-- tenant (empresa_operadora_id) OU é admin (has_role). Anon é SEMPRE negado.
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
-- 1. SCREENS — isolamento por owner/tenant/admin; anon NUNCA
-- ----------------------------------------------------------------------
ALTER TABLE public.screens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "screens_tenant_isolation" ON public.screens;
DROP POLICY IF EXISTS "Users can view their own screens" ON public.screens;
DROP POLICY IF EXISTS "Users can insert their own screens" ON public.screens;
DROP POLICY IF EXISTS "Users can update their own screens" ON public.screens;
DROP POLICY IF EXISTS "Users can delete their own screens" ON public.screens;
DROP POLICY IF EXISTS "Admins can view all screens" ON public.screens;
DROP POLICY IF EXISTS "Block anonymous access to screens" ON public.screens;
DROP POLICY IF EXISTS "Player Security Policy" ON public.screens;
DROP POLICY IF EXISTS "Permitir leitura para todos (anon/auth)" ON public.screens;

CREATE POLICY "scr_select_own" ON public.screens
  FOR SELECT TO authenticated
  USING (public.fn_player_can_access_screen(id));

-- INSERT: auto-registro do player com user_id = auth.uid() ou tela do tenant
CREATE POLICY "scr_insert_own" ON public.screens
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- UPDATE: heartbeat/status/screenshot do próprio player
CREATE POLICY "scr_update_own" ON public.screens
  FOR UPDATE TO authenticated
  USING (public.fn_player_can_access_screen(id))
  WITH CHECK (public.fn_player_can_access_screen(id));

CREATE POLICY "scr_delete_own" ON public.screens
  FOR DELETE TO authenticated
  USING (public.fn_player_can_access_screen(id));

REVOKE ALL ON public.screens FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.screens TO authenticated;

-- ----------------------------------------------------------------------
-- 2. REMOTE_COMMANDS — comandos apenas da própria tela/tenant
-- ----------------------------------------------------------------------
ALTER TABLE public.remote_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.remote_commands;
DROP POLICY IF EXISTS "Enable update for all users" ON public.remote_commands;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.remote_commands;
DROP POLICY IF EXISTS "rc_select_own" ON public.remote_commands;
DROP POLICY IF EXISTS "rc_update_own" ON public.remote_commands;
DROP POLICY IF EXISTS "rc_insert_own" ON public.remote_commands;

CREATE POLICY "rc_select_own" ON public.remote_commands
  FOR SELECT TO authenticated
  USING (public.fn_player_can_access_screen(screen_id));

CREATE POLICY "rc_update_own" ON public.remote_commands
  FOR UPDATE TO authenticated
  USING (public.fn_player_can_access_screen(screen_id))
  WITH CHECK (public.fn_player_can_access_screen(screen_id));

CREATE POLICY "rc_insert_own" ON public.remote_commands
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_player_can_access_screen(screen_id));

REVOKE ALL ON public.remote_commands FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.remote_commands TO authenticated;

-- ----------------------------------------------------------------------
-- 3. PLAYBACK_LOGS — Proof-of-Play somente da própria tela/tenant
-- ----------------------------------------------------------------------
ALTER TABLE public.playback_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pbl_tenant_isolation" ON public.playback_logs;
DROP POLICY IF EXISTS "allow_select_all" ON public.playback_logs;
DROP POLICY IF EXISTS "allow_insert_all" ON public.playback_logs;
DROP POLICY IF EXISTS "Dashboard Read Access" ON public.playback_logs;
DROP POLICY IF EXISTS "Player Insert Access" ON public.playback_logs;
DROP POLICY IF EXISTS "Leitura de Estatísticas Dashboard" ON public.playback_logs;
DROP POLICY IF EXISTS "Inserção de Logs Player" ON public.playback_logs;
DROP POLICY IF EXISTS "Allow Player Insert" ON public.playback_logs;
DROP POLICY IF EXISTS "Player Insert Logs" ON public.playback_logs;
DROP POLICY IF EXISTS "Permitir inserção de logs de reprodução" ON public.playback_logs;
DROP POLICY IF EXISTS "Permitir Leitura para Usuários Autenticados" ON public.playback_logs;
DROP POLICY IF EXISTS "Permitir Inserção de Logs" ON public.playback_logs;

CREATE POLICY "pbl_select_own" ON public.playback_logs
  FOR SELECT TO authenticated
  USING (
    public.fn_player_can_access_screen_text(screen_id)
    OR empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR player_id IN (
      SELECT id FROM public.players
      WHERE empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "pbl_insert_own" ON public.playback_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_player_can_access_screen_text(screen_id));

CREATE POLICY "pbl_update_own" ON public.playback_logs
  FOR UPDATE TO authenticated
  USING (public.fn_player_can_access_screen_text(screen_id))
  WITH CHECK (public.fn_player_can_access_screen_text(screen_id));

REVOKE ALL ON public.playback_logs FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.playback_logs TO authenticated;

-- ----------------------------------------------------------------------
-- 4. DEVICE_HEALTH — heartbeat ligado às telas do próprio usuário/tenant
-- ----------------------------------------------------------------------
ALTER TABLE public.device_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated to upsert health" ON public.device_health;
DROP POLICY IF EXISTS "dh_all_own" ON public.device_health;

CREATE POLICY "dh_all_own" ON public.device_health
  FOR ALL TO authenticated
  USING (
    public.fn_player_can_access_screen(device_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.fn_player_can_access_screen(device_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.device_health FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.device_health TO authenticated;

-- ----------------------------------------------------------------------
-- 5. PLAYER_HEARTBEATS — telemetria do próprio tenant/player
-- ----------------------------------------------------------------------
ALTER TABLE public.player_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "phb_tenant_isolation" ON public.player_heartbeats;
DROP POLICY IF EXISTS "phb_select_own" ON public.player_heartbeats;
DROP POLICY IF EXISTS "phb_insert_own" ON public.player_heartbeats;

CREATE POLICY "phb_select_own" ON public.player_heartbeats
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR player_id IN (
      SELECT id FROM public.players
      WHERE empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    )
    OR (screen_id IS NOT NULL AND public.fn_player_can_access_screen(screen_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "phb_insert_own" ON public.player_heartbeats
  FOR INSERT TO authenticated
  WITH CHECK (
    screen_id IS NOT NULL
    AND public.fn_player_can_access_screen(screen_id)
  );

REVOKE ALL ON public.player_heartbeats FROM anon;
GRANT SELECT, INSERT ON public.player_heartbeats TO authenticated;

-- ----------------------------------------------------------------------
-- 6. APP_RELEASES (OTA MANIFEST) — somente autenticados
-- ----------------------------------------------------------------------
ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read app_releases" ON public.app_releases;
DROP POLICY IF EXISTS "ar_select_authenticated" ON public.app_releases;

CREATE POLICY "ar_select_authenticated" ON public.app_releases
  FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.app_releases FROM anon;
GRANT SELECT ON public.app_releases TO authenticated;

-- ----------------------------------------------------------------------
-- 7. STORAGE (SCREENSHOTS) — upload/overwrite somente da própria tela
-- Nota: o bucket permanece public=false em policies de leitura pública
-- porque o Dashboard consome URLs públicas; o controle de escrita agora é
-- por propriedade de tela. (Roadmap: bucket privado + signed URLs.)
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "Public Screenshot Access" ON storage.objects;
DROP POLICY IF EXISTS "Player Upload Screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Player Update Screenshots" ON storage.objects;
DROP POLICY IF EXISTS "scr_shot_select_own" ON storage.objects;
DROP POLICY IF EXISTS "scr_shot_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "scr_shot_update_own" ON storage.objects;
DROP POLICY IF EXISTS "scr_shot_delete_own" ON storage.objects;

CREATE POLICY "scr_shot_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'screenshots'
    AND name IN (
      SELECT s.id::text || '.jpg' FROM public.screens s
      WHERE public.fn_player_can_access_screen(s.id)
    )
  );

CREATE POLICY "scr_shot_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'screenshots'
    AND name IN (
      SELECT s.id::text || '.jpg' FROM public.screens s
      WHERE public.fn_player_can_access_screen(s.id)
    )
  );

CREATE POLICY "scr_shot_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'screenshots'
    AND name IN (
      SELECT s.id::text || '.jpg' FROM public.screens s
      WHERE public.fn_player_can_access_screen(s.id)
    )
  )
  WITH CHECK (
    bucket_id = 'screenshots'
    AND name IN (
      SELECT s.id::text || '.jpg' FROM public.screens s
      WHERE public.fn_player_can_access_screen(s.id)
    )
  );

CREATE POLICY "scr_shot_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'screenshots'
    AND name IN (
      SELECT s.id::text || '.jpg' FROM public.screens s
      WHERE public.fn_player_can_access_screen(s.id)
    )
  );

-- ----------------------------------------------------------------------
-- 8. LIMPEZA DE GRANTS ANON EM TABELAS DE MÍDIA/CONTEÚDO
-- (fix_screens_rls_and_lookup.sql concedeu SELECT anon em 6 tabelas)
-- ----------------------------------------------------------------------
REVOKE ALL ON public.playlists FROM anon;
REVOKE ALL ON public.playlist_items FROM anon;
REVOKE ALL ON public.media FROM anon;
REVOKE ALL ON public.widgets FROM anon;
REVOKE ALL ON public.external_links FROM anon;

-- VERIFICAÇÃO (diagnóstico): lista policies resultantes por tabela
SELECT
  schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('screens','remote_commands','playback_logs','device_health','player_heartbeats','app_releases')
   OR (schemaname = 'storage' AND tablename = 'objects' AND EXISTS (
     SELECT 1 FROM pg_policies p2
     WHERE p2.schemaname = 'storage' AND p2.tablename = 'objects'
       AND p2.policyname LIKE 'scr_shot_%'
   ))
ORDER BY tablename, policyname;