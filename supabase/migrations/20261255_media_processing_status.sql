-- ============================================================================================
-- 20261255 — Pipeline de compressão de vídeo (F-85 / OF-F81-2): coluna de estado que a process-media já gravava.
--
-- Causa (provada 26/09/2026): process-media faz UPDATE media SET processing_status = ..., mas a coluna não existe;
-- o supabase-js devolve o erro sem lançar e a função seguia. Nenhum vídeo chegou a ser processado (0 execuções do
-- workflow compress-video). Aditiva e nula por padrão: a RPC do Player monta a mídia campo a campo
-- (id, name, file_url, file_type, file_hash), então nenhum consumidor muda.
-- Valores: processing | ready (comprimido e trocado) | skipped (já estava leve, nada mudou) | error.
-- ROLLBACK: ALTER TABLE public.media DROP COLUMN processing_status;
-- ============================================================================================
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS processing_status text;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_processing_status_valido') THEN
        ALTER TABLE public.media ADD CONSTRAINT media_processing_status_valido
            CHECK (processing_status IS NULL OR processing_status IN ('processing', 'ready', 'skipped', 'error'));
    END IF;
END $$;
