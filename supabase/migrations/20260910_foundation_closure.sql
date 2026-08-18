-- ======================================================================
-- MIGRATION: 20260910 — FOUNDATION CLOSURE (SECURITY HARDENING FASE G)
-- SOBRE MÍDIA PLATFORM | FASE DE FUNDAÇÃO — ANDROID / MEDIA NETWORK
-- ======================================================================
-- Fecha os itens P1 remanescentes da auditoria da fundação:
--   1. remote_commands: vocabulário de comandos expandido para o que o
--      player executa de fato (sync, rotate_portrait, rotate_landscape,
--      take_screenshot). O CHECK antigo rejeitava esses comandos,
--      silenciosamente quebrando Dashboard -> Android.
--   2. monitoring_logs: RLS NUNCA habilitada (tabela sem policy no repo).
--      Web Player inseria heartbeat com screen_id arbitrário (cross-tenant).
--   3. proof_of_play / screenshots_logs: policies antigas SELECT USING(true)
--      para authenticated (acesso a Proof-of-Play de TODOS os tenants).
--   4. devices: identidade única por identity_hash (anti-duplicação).
--   5. storage.proof_of_play: upload restrito à própria tela do usuário.
--   6. app_releases: escrita somente admin (leitura continua authenticated
--      para o OTA do player).
-- Idempotente: seguro para re-execução.
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. REMOTE_COMMANDS — vocabulário oficial do player
-- ----------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'remote_commands_command_check'
      AND conrelid = 'public.remote_commands'::regclass
  ) THEN
    ALTER TABLE public.remote_commands DROP CONSTRAINT remote_commands_command_check;
  END IF;
END $$;

ALTER TABLE public.remote_commands
  ADD CONSTRAINT remote_commands_command_check
  CHECK (command IN ('reload', 'reboot', 'screenshot', 'take_screenshot', 'sync', 'rotate_portrait', 'rotate_landscape'));

-- ----------------------------------------------------------------------
-- 2. MONITORING_LOGS — RLS: heartbeat só da própria tela/tenant
-- ----------------------------------------------------------------------
ALTER TABLE public.monitoring_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ml_select_own" ON public.monitoring_logs;
DROP POLICY IF EXISTS "ml_insert_own" ON public.monitoring_logs;
DROP POLICY IF EXISTS "ml_update_own" ON public.monitoring_logs;

CREATE POLICY "ml_select_own" ON public.monitoring_logs
  FOR SELECT TO authenticated
  USING (
    public.fn_player_can_access_screen_text(screen_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "ml_insert_own" ON public.monitoring_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_player_can_access_screen_text(screen_id));

CREATE POLICY "ml_update_own" ON public.monitoring_logs
  FOR UPDATE TO authenticated
  USING (public.fn_player_can_access_screen_text(screen_id))
  WITH CHECK (public.fn_player_can_access_screen_text(screen_id));

REVOKE ALL ON public.monitoring_logs FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.monitoring_logs TO authenticated;

-- ----------------------------------------------------------------------
-- 3. PROOF_OF_PLAY — Proof-of-Play restrito à frota do próprio tenant
-- ----------------------------------------------------------------------
ALTER TABLE public.proof_of_play ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view proof_of_play" ON public.proof_of_play;
DROP POLICY IF EXISTS "pop_select_own" ON public.proof_of_play;
DROP POLICY IF EXISTS "pop_insert_own" ON public.proof_of_play;

CREATE POLICY "pop_select_own" ON public.proof_of_play
  FOR SELECT TO authenticated
  USING (
    device_id IN (
      SELECT d.id FROM public.devices d
      WHERE d.screen_id IS NOT NULL AND public.fn_player_can_access_screen(d.screen_id)
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "pop_insert_own" ON public.proof_of_play
  FOR INSERT TO authenticated
  WITH CHECK (
    device_id IN (
      SELECT d.id FROM public.devices d
      WHERE d.screen_id IS NOT NULL AND public.fn_player_can_access_screen(d.screen_id)
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.proof_of_play FROM anon;
GRANT SELECT, INSERT ON public.proof_of_play TO authenticated;

-- ----------------------------------------------------------------------
-- 4. SCREENSHOTS_LOGS — idem
-- ----------------------------------------------------------------------
ALTER TABLE public.screenshots_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view screenshots_logs" ON public.screenshots_logs;
DROP POLICY IF EXISTS "sl_select_own" ON public.screenshots_logs;
DROP POLICY IF EXISTS "sl_insert_own" ON public.screenshots_logs;

CREATE POLICY "sl_select_own" ON public.screenshots_logs
  FOR SELECT TO authenticated
  USING (
    device_id IN (
      SELECT d.id FROM public.devices d
      WHERE d.screen_id IS NOT NULL AND public.fn_player_can_access_screen(d.screen_id)
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "sl_insert_own" ON public.screenshots_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    device_id IN (
      SELECT d.id FROM public.devices d
      WHERE d.screen_id IS NOT NULL AND public.fn_player_can_access_screen(d.screen_id)
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

REVOKE ALL ON public.screenshots_logs FROM anon;
GRANT SELECT, INSERT ON public.screenshots_logs TO authenticated;

-- ----------------------------------------------------------------------
-- 5. DEVICES — identidade única (1 hardware = 1 registro)
-- ----------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_identity_hash_unique
  ON public.devices(identity_hash)
  WHERE identity_hash IS NOT NULL;

-- ----------------------------------------------------------------------
-- 6. STORAGE PROOF_OF_PLAY — upload/overwrite somente da própria tela
--    (caminho oficial: {screen_id}/{uuid}.jpg)
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "pop_shot_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "pop_shot_update_own" ON storage.objects;
DROP POLICY IF EXISTS "pop_shot_select_own" ON storage.objects;

CREATE POLICY "pop_shot_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'proof_of_play'
    AND public.fn_player_can_access_screen_text(split_part(name, '/', 1))
  );

CREATE POLICY "pop_shot_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'proof_of_play'
    AND public.fn_player_can_access_screen_text(split_part(name, '/', 1))
  )
  WITH CHECK (
    bucket_id = 'proof_of_play'
    AND public.fn_player_can_access_screen_text(split_part(name, '/', 1))
  );

CREATE POLICY "pop_shot_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'proof_of_play'
    AND public.fn_player_can_access_screen_text(split_part(name, '/', 1))
  );

-- ----------------------------------------------------------------------
-- 7. APP_RELEASES — escrita somente admin (leitura segue authenticated)
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "ar_insert_admin" ON public.app_releases;
DROP POLICY IF EXISTS "ar_update_admin" ON public.app_releases;
DROP POLICY IF EXISTS "ar_delete_admin" ON public.app_releases;

CREATE POLICY "ar_insert_admin" ON public.app_releases
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "ar_update_admin" ON public.app_releases
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "ar_delete_admin" ON public.app_releases
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

GRANT INSERT, UPDATE, DELETE ON public.app_releases TO authenticated;

-- ----------------------------------------------------------------------
-- VERIFICAÇÃO FINAL
-- ----------------------------------------------------------------------
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('monitoring_logs','proof_of_play','screenshots_logs','app_releases','remote_commands','devices')
   OR (schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'pop_shot_%')
ORDER BY tablename, policyname;