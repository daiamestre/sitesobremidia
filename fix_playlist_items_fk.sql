-- ============================================================
-- FIX: Adicionar Foreign Keys para Widgets e External Links
-- na tabela playlist_items.
-- 
-- PROBLEMA: O PostgREST (Supabase) não consegue fazer JOIN
-- automático sem uma FK explícita no schema.
-- ============================================================

-- 1. Garantir que as colunas existam (caso ainda não existam)
ALTER TABLE public.playlist_items 
  ADD COLUMN IF NOT EXISTS widget_id UUID,
  ADD COLUMN IF NOT EXISTS external_link_id UUID;

-- 2. Adicionar Foreign Key para widgets
ALTER TABLE public.playlist_items
  ADD CONSTRAINT fk_playlist_items_widget
  FOREIGN KEY (widget_id) 
  REFERENCES public.widgets(id)
  ON DELETE CASCADE;

-- 3. Adicionar Foreign Key para external_links
ALTER TABLE public.playlist_items
  ADD CONSTRAINT fk_playlist_items_external_link
  FOREIGN KEY (external_link_id) 
  REFERENCES public.external_links(id)
  ON DELETE CASCADE;
