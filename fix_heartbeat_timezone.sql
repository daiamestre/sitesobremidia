-- ==========================================================
-- SCRIPT DE GIRO VERTICAL (V9)
-- Objetivo: Forçar a TELA1 para o modo RETRATO (Portrait)
-- ==========================================================

BEGIN;

-- 1. GIRO DE TELA
-- Isso diz ao Android: "Fique em pé (Vertical)"
UPDATE public.screens 
SET orientation = 'portrait' 
WHERE custom_id = 'TELA1';

COMMIT;

-- 2. ✅ VERIFICAÇÃO
-- Veja se a coluna 'orientation' agora diz 'portrait'
SELECT id, name, orientation, last_ping_at 
FROM public.screens 
WHERE custom_id = 'TELA1';
