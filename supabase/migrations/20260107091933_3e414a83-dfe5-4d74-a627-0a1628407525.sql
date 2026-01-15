-- Criar tabela para widgets que podem ser adicionados às playlists
CREATE TABLE public.widgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  widget_type TEXT NOT NULL CHECK (widget_type IN ('clock', 'weather', 'rss')),
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.widgets ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own widgets" 
ON public.widgets 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own widgets" 
ON public.widgets 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own widgets" 
ON public.widgets 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own widgets" 
ON public.widgets 
FOR DELETE 
USING (auth.uid() = user_id);

-- Admin pode ver todos
CREATE POLICY "Admins can view all widgets"
ON public.widgets
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

-- Adicionar coluna widget_id na playlist_items para permitir widgets como itens
ALTER TABLE public.playlist_items 
ADD COLUMN widget_id UUID REFERENCES public.widgets(id) ON DELETE CASCADE;

-- Tornar media_id opcional (agora pode ser mídia OU widget)
ALTER TABLE public.playlist_items 
ALTER COLUMN media_id DROP NOT NULL;

-- Adicionar constraint para garantir que tem mídia OU widget
ALTER TABLE public.playlist_items 
ADD CONSTRAINT playlist_items_media_or_widget_check 
CHECK (
  (media_id IS NOT NULL AND widget_id IS NULL) OR 
  (media_id IS NULL AND widget_id IS NOT NULL)
);

-- Trigger para updated_at
CREATE TRIGGER update_widgets_updated_at
BEFORE UPDATE ON public.widgets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();