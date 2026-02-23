-- ==========================================================
-- SCRIPT DE CONTROLE DE ÁUDIO REMOTO v1.0
-- Arquiteto: Antigravity | Controle em Tempo Real
-- ==========================================================

BEGIN;

-- 1. ADICIONAR COLUNA DE ÁUDIO ÀS TELAS
ALTER TABLE public.screens 
ADD COLUMN IF NOT EXISTS audio_enabled BOOLEAN DEFAULT true;

-- 2. COMENTÁRIO PARA DOCUMENTAÇÃO
COMMENT ON COLUMN public.screens.audio_enabled IS 'Define se o volume do player deve estar ligado ou mutado.';

-- 3. GARANTIR QUE OS DADOS JÁ EXISTENTES TENHAM ÁUDIO LIGADO (DEFAULT)
UPDATE public.screens SET audio_enabled = true WHERE audio_enabled IS NULL;

COMMIT;

-- OBSERVAÇÃO: Ao mudar este valor no painel Supabase, 
-- o player irá refletir a mudança no próximo Heartbeat ou na sincronização manual.
