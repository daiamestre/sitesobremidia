-- Adicionar coluna custom_id na tabela screens
ALTER TABLE public.screens ADD COLUMN custom_id text UNIQUE;

-- Criar índice para busca rápida por custom_id
CREATE INDEX idx_screens_custom_id ON public.screens(custom_id);