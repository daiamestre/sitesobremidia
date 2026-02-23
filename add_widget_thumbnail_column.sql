-- Adiciona a coluna thumbnail_url para suportar capas de widgets
ALTER TABLE public.widgets 
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Comentário para documentação
COMMENT ON COLUMN public.widgets.thumbnail_url IS 'URL da imagem de capa/miniatura do widget';
