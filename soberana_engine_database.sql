-- ==========================================================
-- SOBERANA ENGINE: MANUTENÇÃO INTEGRAL DO BANCO DE DADOS
-- Objetivo: Ativar Realtime, garantir colunas de reporte e
-- otimizar as relações para o Player Autônomo.
-- ==========================================================

BEGIN;

-- 1. GARANTIR COLUNAS DE RELATÓRIO NA TABELA SCREENS
-- O Player usa estas colunas para dizer o que está fazendo em tempo real.
ALTER TABLE public.screens 
  ADD COLUMN IF NOT EXISTS last_action TEXT,
  ADD COLUMN IF NOT EXISTS last_action_value TEXT,
  ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_note TEXT,
  ADD COLUMN IF NOT EXISTS ram_usage TEXT,
  ADD COLUMN IF NOT EXISTS free_space TEXT,
  ADD COLUMN IF NOT EXISTS cpu_temp TEXT,
  ADD COLUMN IF NOT EXISTS uptime TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- 2. GARANTIR FOREIGN KEYS EM PLAYLIST_ITEMS
-- Isso permite que o Supabase faça JOINs automáticos (mais rápido).
ALTER TABLE public.playlist_items 
  ADD COLUMN IF NOT EXISTS widget_id UUID,
  ADD COLUMN IF NOT EXISTS external_link_id UUID;

-- Remover FKs antigas se existirem para evitar erro de duplicidade ao recriar
ALTER TABLE public.playlist_items DROP CONSTRAINT IF EXISTS fk_playlist_items_widget;
ALTER TABLE public.playlist_items DROP CONSTRAINT IF EXISTS fk_playlist_items_external_link;

ALTER TABLE public.playlist_items
  ADD CONSTRAINT fk_playlist_items_widget
  FOREIGN KEY (widget_id) REFERENCES public.widgets(id) ON DELETE CASCADE;

ALTER TABLE public.playlist_items
  ADD CONSTRAINT fk_playlist_items_external_link
  FOREIGN KEY (external_link_id) REFERENCES public.external_links(id) ON DELETE CASCADE;

-- 3. ATIVAR REALTIME PARA O PLAYER
-- Essencial para o player receber atualizações sem precisar reiniciar.
-- Adiciona as tabelas à publicação 'supabase_realtime' se ainda não forem membros.
DO $$
DECLARE
    tbl_name TEXT;
    target_tables TEXT[] := ARRAY['screens', 'playlists', 'playlist_items', 'media', 'widgets', 'external_links'];
BEGIN
    -- Garantir que a publicação existe
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    -- Adicionar apenas as tabelas que ainda não estão na publicação
    FOREACH tbl_name IN ARRAY target_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND schemaname = 'public' 
            AND tablename = tbl_name
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl_name);
        END IF;
    END LOOP;
END $$;

-- 4. PERMISSÕES DE LEITURA (RLS) PARA O PLAYER (MODO ANON)
-- Garante que o player consiga ler o conteúdo básico.
GRANT SELECT ON public.screens TO anon, authenticated;
GRANT SELECT ON public.playlists TO anon, authenticated;
GRANT SELECT ON public.playlist_items TO anon, authenticated;
GRANT SELECT ON public.media TO anon, authenticated;
GRANT SELECT ON public.widgets TO anon, authenticated;
GRANT SELECT ON public.external_links TO anon, authenticated;

COMMIT;

SELECT 'Banco de Dados Sincronizado com o Soberana Engine!' as status;
