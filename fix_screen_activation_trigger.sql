-- ==========================================================
-- FIX IMEDIATO: TRIGGER PARA PARAR PLAYER AO DESATIVAR TELA
-- 
-- Problema: O player continua reproduzindo porque o APK atual
-- não verifica is_active. Esta solução funciona SEM novo APK.
--
-- Como funciona:
-- 1. Quando is_active muda para FALSE:
--    → Salva playlist_id em saved_playlist_id (backup)
--    → Seta playlist_id = NULL
--    → Player existente detecta "sem playlist" e para de reproduzir
--
-- 2. Quando is_active muda para TRUE:
--    → Restaura playlist_id do backup saved_playlist_id
--    → Player sincroniza e volta a reproduzir normalmente
-- ==========================================================

-- 1. Adicionar coluna de backup para o playlist_id
ALTER TABLE public.screens 
ADD COLUMN IF NOT EXISTS saved_playlist_id UUID;

-- 2. Criar a função do trigger
CREATE OR REPLACE FUNCTION handle_screen_activation()
RETURNS TRIGGER AS $$
BEGIN
    -- Só agir quando is_active mudar
    IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
        IF NEW.is_active = false THEN
            -- DESATIVANDO: salvar playlist_id e limpar
            NEW.saved_playlist_id := OLD.playlist_id;
            NEW.playlist_id := NULL;
        ELSIF NEW.is_active = true AND OLD.is_active = false THEN
            -- REATIVANDO: restaurar playlist_id do backup
            IF NEW.playlist_id IS NULL AND OLD.saved_playlist_id IS NOT NULL THEN
                NEW.playlist_id := OLD.saved_playlist_id;
            END IF;
            NEW.saved_playlist_id := NULL;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Criar o trigger
DROP TRIGGER IF EXISTS tr_screen_activation ON public.screens;
CREATE TRIGGER tr_screen_activation
BEFORE UPDATE ON public.screens
FOR EACH ROW
EXECUTE FUNCTION handle_screen_activation();
