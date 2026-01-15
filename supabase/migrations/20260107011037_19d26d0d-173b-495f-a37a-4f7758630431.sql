-- Create storage bucket for media files
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true);

-- Create media table to track uploaded files
CREATE TABLE public.media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

-- RLS policies for media table
CREATE POLICY "Users can view their own media"
ON public.media FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own media"
ON public.media FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own media"
ON public.media FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own media"
ON public.media FOR DELETE
USING (auth.uid() = user_id);

-- Admins can view all media
CREATE POLICY "Admins can view all media"
ON public.media FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Storage policies for media bucket
CREATE POLICY "Users can upload media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own media files"
ON storage.objects FOR SELECT
USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own media files"
ON storage.objects FOR DELETE
USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public can view media"
ON storage.objects FOR SELECT
USING (bucket_id = 'media');

-- Trigger for updated_at
CREATE TRIGGER update_media_updated_at
BEFORE UPDATE ON public.media
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();