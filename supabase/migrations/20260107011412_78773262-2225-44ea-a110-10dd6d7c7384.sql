-- Create playlists table
CREATE TABLE public.playlists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create playlist_items table (media in playlist with order and duration)
CREATE TABLE public.playlist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  duration INTEGER NOT NULL DEFAULT 10, -- duration in seconds
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create screens table
CREATE TABLE public.screens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  resolution TEXT DEFAULT '1920x1080',
  orientation TEXT DEFAULT 'landscape' CHECK (orientation IN ('landscape', 'portrait')),
  playlist_id UUID REFERENCES public.playlists(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_ping_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screens ENABLE ROW LEVEL SECURITY;

-- Playlists RLS policies
CREATE POLICY "Users can view their own playlists"
ON public.playlists FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own playlists"
ON public.playlists FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own playlists"
ON public.playlists FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own playlists"
ON public.playlists FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all playlists"
ON public.playlists FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Playlist items RLS policies (based on playlist ownership)
CREATE POLICY "Users can view their playlist items"
ON public.playlist_items FOR SELECT
USING (EXISTS (SELECT 1 FROM public.playlists WHERE id = playlist_id AND user_id = auth.uid()));

CREATE POLICY "Users can insert their playlist items"
ON public.playlist_items FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.playlists WHERE id = playlist_id AND user_id = auth.uid()));

CREATE POLICY "Users can update their playlist items"
ON public.playlist_items FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.playlists WHERE id = playlist_id AND user_id = auth.uid()));

CREATE POLICY "Users can delete their playlist items"
ON public.playlist_items FOR DELETE
USING (EXISTS (SELECT 1 FROM public.playlists WHERE id = playlist_id AND user_id = auth.uid()));

-- Screens RLS policies
CREATE POLICY "Users can view their own screens"
ON public.screens FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own screens"
ON public.screens FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own screens"
ON public.screens FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own screens"
ON public.screens FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all screens"
ON public.screens FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_playlists_updated_at
BEFORE UPDATE ON public.playlists
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_screens_updated_at
BEFORE UPDATE ON public.screens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();