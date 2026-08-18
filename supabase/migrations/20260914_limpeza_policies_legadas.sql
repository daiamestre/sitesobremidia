-- ======================================================================
-- MIGRATION: 20260914 - LIMPEZA DE POLICIES LEGADAS PERMISSIVAS
-- SOBRE MIDIA PLATFORM | RESTAURACAO FORENSE - FECHAMENTO P0
-- ======================================================================
-- Contexto: apos aplicar 20260827/20260910/20260911, a verificacao
-- cross-tenant comprovou que policies LEGADAS com nomes diferentes dos
-- dropados pelas migrations continuaram ativas (Postgres avalia policies
-- com OR: basta UMA permissiva para vazar):
--   - screens: "Allow authenticated read" (SELECT USING true) -> vazou
--              SELECT cross-tenant
--   - screens: "safe_heartbeat_update_screens" (UPDATE USING true) ->
--              vazou UPDATE cross-tenant
--   - screens: "Public read access for players" (SELECT public true)
--   - playback_logs: "Permitir inserção de logs de reprodução industrial"
--              (INSERT WITH CHECK true) -> vazou INSERT cross-tenant
--   - monitoring_logs: "Enable insert for valid screens only" / 
--              "Enable read for screen owners" (pre-20260910 legadas)
--   - devices: "safe_heartbeat_update_devices" (UPDATE true) e
--              "Players podem ver apenas seus próprios dados" (no-op)
-- As policies substitutas tenant-scoped (scr_*, pbl_*, ml_*, dev_*)
-- ja existem (20260827/20260910/20260828) e cobrem os fluxos do app.
-- Nao toca em tabelas de player/contratos (fora do escopo da auditoria).
-- Idempotente: DROP POLICY IF EXISTS.
-- ======================================================================

DROP POLICY IF EXISTS "Allow authenticated read" ON public.screens;
DROP POLICY IF EXISTS "Public read access for players" ON public.screens;
DROP POLICY IF EXISTS "safe_heartbeat_update_screens" ON public.screens;

DROP POLICY IF EXISTS "Permitir inserção de logs de reprodução industrial" ON public.playback_logs;

DROP POLICY IF EXISTS "Enable insert for valid screens only" ON public.monitoring_logs;
DROP POLICY IF EXISTS "Enable read for screen owners" ON public.monitoring_logs;

DROP POLICY IF EXISTS "safe_heartbeat_update_devices" ON public.devices;
DROP POLICY IF EXISTS "Players podem ver apenas seus próprios dados" ON public.devices;