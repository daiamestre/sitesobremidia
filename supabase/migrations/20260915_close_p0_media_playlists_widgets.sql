-- ======================================================================
-- MIGRATION: 20260915 - FECHAMENTO FINAL P0 - POLICIES PUBLICAS REMANESCENTES
-- SOBRE MIDIA PLATFORM | RESTAURACAO FORENSE - FECHAMENTO P0 (COMPLEMENTO 20260914)
-- ======================================================================
-- Contexto: apos 20260914 (screens/playback_logs/monitoring_logs/devices),
-- a verificacao authenticated (nao apenas anon) comprovou que policies
-- publicas com qual=true ainda ativas em media/playlists/playlist_items/
-- widgets/external_links permitiam leitura cross-tenant por qualquer
-- usuario autenticado (Postgres avalia policies com OR: basta UMA
-- permissiva para vazar).
-- As policies substitutas user-scoped (auth.uid() = user_id) ja existem
-- em todas as tabelas (Users can view their own *), cobrindo o frontend
-- web. O player Android usa grants anon que ja foram revogados (janela
-- propria do Android).
-- Idempotente: DROP POLICY IF EXISTS.
-- ======================================================================

-- media
DROP POLICY IF EXISTS "Allow authenticated read" ON public.media;
DROP POLICY IF EXISTS "Public read access" ON public.media;
DROP POLICY IF EXISTS "Permitir leitura anon/auth para media" ON public.media;

-- playlists
DROP POLICY IF EXISTS "Allow authenticated read" ON public.playlists;
DROP POLICY IF EXISTS "Public read access" ON public.playlists;

-- playlist_items
DROP POLICY IF EXISTS "Allow authenticated read" ON public.playlist_items;
DROP POLICY IF EXISTS "Public read access" ON public.playlist_items;

-- widgets
DROP POLICY IF EXISTS "Permitir leitura anon/auth para widgets" ON public.widgets;

-- external_links
DROP POLICY IF EXISTS "Permitir leitura anon/auth para links" ON public.external_links;