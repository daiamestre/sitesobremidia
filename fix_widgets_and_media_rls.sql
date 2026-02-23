-- ==========================================================
-- FIX: PERMISSÕES DE LEITURA PARA WIDGETS E MÍDIAS (PLAYER)
-- Objetivo: Garantir que o player consiga ler os detalhes do widget
-- e mídias individuais no modo standalone.
-- ==========================================================

BEGIN;

-- 1. Habilitar RLS em tabelas críticas
ALTER TABLE public.widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_links ENABLE ROW LEVEL SECURITY;

-- 2. Limpar políticas antigas (se houver) para evitar conflitos
DROP POLICY IF EXISTS "Permitir leitura anon/auth para widgets" ON public.widgets;
DROP POLICY IF EXISTS "Permitir leitura anon/auth para media" ON public.media;
DROP POLICY IF EXISTS "Permitir leitura anon/auth para links" ON public.external_links;

-- 3. Criar políticas de leitura BRANCA (Broad Select)
-- Isso é seguro pois os IDs já funcionam como tokens de acesso.
CREATE POLICY "Permitir leitura anon/auth para widgets" 
ON public.widgets FOR SELECT 
TO anon, authenticated 
USING (true);

CREATE POLICY "Permitir leitura anon/auth para media" 
ON public.media FOR SELECT 
TO anon, authenticated 
USING (true);

CREATE POLICY "Permitir leitura anon/auth para links" 
ON public.external_links FOR SELECT 
TO anon, authenticated 
USING (true);

-- 4. Re-conceder permissões de GRANT
GRANT SELECT ON public.widgets TO anon, authenticated;
GRANT SELECT ON public.media TO anon, authenticated;
GRANT SELECT ON public.external_links TO anon, authenticated;

COMMIT;

SELECT 'Políticas de widgets e mídias aplicadas com sucesso!' as status;
