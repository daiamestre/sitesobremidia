-- Drop the old check constraint that only allows media_id OR widget_id
ALTER TABLE public.playlist_items DROP CONSTRAINT IF EXISTS playlist_items_media_or_widget_check;

-- Create a new check constraint that allows exactly one of: media_id, widget_id, or external_link_id
ALTER TABLE public.playlist_items ADD CONSTRAINT playlist_items_single_item_check 
CHECK (
  (
    (media_id IS NOT NULL)::int + 
    (widget_id IS NOT NULL)::int + 
    (external_link_id IS NOT NULL)::int
  ) = 1
);