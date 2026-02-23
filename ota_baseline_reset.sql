-- ==========================================================
-- RESET DE BASELINE OTA v1.0.0
-- Alinhando Banco de Dados com o novo VersionCode = 1
-- ==========================================================

BEGIN;

-- 1. LIMPAR VERSÕES ANTERIORES DO APP_RELEASES (OPCIONAL MAS RECOMENDADO PARA O "CLEAN START")
DELETE FROM public.app_releases;

-- 2. INSERIR A VERSÃO 1.0.0 COMO BASELINE
-- Isso evita que o app tente atualizar para a versão 120 (antiga) indevidamente
INSERT INTO public.app_releases (version_code, version_name, apk_url, release_notes)
VALUES (1, '1.0.0', 'N/A', 'Versão Inicial de Lançamento (Fase 1)')
ON CONFLICT (version_code) DO NOTHING;

COMMIT;
