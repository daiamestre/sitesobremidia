-- Adiciona a coluna file_hash na tabela media para suportar validação de integridade no Player Android
-- E migra para o Cloudflare R2

ALTER TABLE public.media ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Comentário para documentação
COMMENT ON COLUMN public.media.file_hash IS 'Hash MD5 do arquivo para verificação de integridade no player.';

-- Habilitar permissões caso necessário (geralmente herdadas)
GRANT ALL ON TABLE public.media TO authenticated;
GRANT ALL ON TABLE public.media TO service_role;
