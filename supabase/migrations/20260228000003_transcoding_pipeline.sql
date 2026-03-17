-- ==========================================================
-- FASE 4: Pipeline de Transcodificacao - Metadados
-- ==========================================================

-- Adicionar colunas de processamento na tabela media
DO $$
BEGIN
    -- Status de processamento: 'ready', 'pending_transcoding', 'transcoding', 'done', 'error'
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'media' AND column_name = 'processing_status'
    ) THEN
        ALTER TABLE media ADD COLUMN processing_status TEXT DEFAULT 'ready';
    END IF;

    -- Metadados de transcodificacao (JSON com bitrate, resolucao, codec alvo)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'media' AND column_name = 'transcoding_meta'
    ) THEN
        ALTER TABLE media ADD COLUMN transcoding_meta JSONB;
    END IF;

    -- Thumbnail URL separada para galeria do Dashboard
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'media' AND column_name = 'thumbnail_url'
    ) THEN
        ALTER TABLE media ADD COLUMN thumbnail_url TEXT;
    END IF;
END $$;

-- Indice para buscar midias pendentes de processamento
CREATE INDEX IF NOT EXISTS idx_media_processing_status ON media (processing_status);
