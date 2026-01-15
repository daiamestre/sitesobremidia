-- Add external_link_id column to playlist_items table
ALTER TABLE public.playlist_items 
ADD COLUMN external_link_id uuid REFERENCES public.external_links(id) ON DELETE CASCADE;