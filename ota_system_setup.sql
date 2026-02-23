-- ==========================================================
-- SCRIPT DE SISTEMA OTA (OVER-THE-AIR UPDATE) v1.0
-- Arquiteto: Antigravity | Atualização Industrial Automática
-- ==========================================================

BEGIN;

-- 1. TABELA DE RELEASES
CREATE TABLE IF NOT EXISTS public.app_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_code INTEGER NOT NULL UNIQUE,
    version_name TEXT NOT NULL,
    apk_url TEXT NOT NULL,
    release_notes TEXT,
    is_mandatory BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. HABILITAR RLS (SECURITY)
ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

-- 3. POLÍTICA DE LEITURA GLOBAL (ANONYMOUS/PLAYER)
CREATE POLICY "Allow public read app_releases" 
ON public.app_releases FOR SELECT 
TO anon, authenticated 
USING (true);

-- 4. ÍNDICE POR VERSION_CODE (Buscamos sempre o maior)
CREATE INDEX IF NOT EXISTS idx_app_releases_version_code ON public.app_releases (version_code DESC);

-- 5. VALOR INICIAL (VERSÃO ATUAL)
-- Isso serve para o player saber que já está na v1.2.0
INSERT INTO public.app_releases (version_code, version_name, apk_url, release_notes)
VALUES (120, '1.2.0-Hybrid', 'N/A', 'Versão atual em produção')
ON CONFLICT (version_code) DO NOTHING;

COMMIT;

-- INSTRUÇÕES DE ARMAZENAMENTO:
-- Crie um Bucket no Supabase Storage chamado "releases" (Público) 
-- e coloque o arquivo .apk lá. Depois adicione a URL na tabela app_releases.
