-- ==========================================================
-- MIGRACAO DE URLs: Supabase Storage -> Cloudflare R2 CDN
-- Projeto: bhwsybgsyvvhqtkdqozb
-- R2 Domain: https://pub-560b3bffe687403695c61035c8c8f7a7.r2.dev
-- ==========================================================

-- 1. Atualizar file_url de Supabase Storage para R2
UPDATE media
SET file_url = REPLACE(
    file_url,
    'https://bhwsybgsyvvhqtkdqozb.supabase.co/storage/v1/object/public/medias/',
    'https://pub-560b3bffe687403695c61035c8c8f7a7.r2.dev/'
)
WHERE file_url LIKE 'https://bhwsybgsyvvhqtkdqozb.supabase.co/storage/v1/object/public/medias/%';

-- 2. Tambem atualizar caso use o bucket 'media' (sem 's')
UPDATE media
SET file_url = REPLACE(
    file_url,
    'https://bhwsybgsyvvhqtkdqozb.supabase.co/storage/v1/object/public/media/',
    'https://pub-560b3bffe687403695c61035c8c8f7a7.r2.dev/'
)
WHERE file_url LIKE 'https://bhwsybgsyvvhqtkdqozb.supabase.co/storage/v1/object/public/media/%';

-- 3. Verificacao: Contar links que ainda apontam para o Supabase
SELECT count(*) AS links_restantes_supabase
FROM media
WHERE file_url LIKE '%supabase.co%';
