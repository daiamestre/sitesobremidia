-- ============================================================================
-- SOBRE MÍDIA PLATFORM — SECURITY HARDENING (FASE J)
-- OTA integrity: app_releases.sha256
-- ============================================================================
-- O APK publicado no OTA precisa ter o hash SHA-256 registrado aqui.
-- O player nativo NUNCA instala release sem sha256 válido (64 hex chars).
-- ============================================================================

ALTER TABLE public.app_releases
    ADD COLUMN IF NOT EXISTS sha256 TEXT;

-- Integridade: sha256 deve ser nulo ou exatamente 64 caracteres hexadecimais
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'app_releases_sha256_format_check'
          AND conrelid = 'public.app_releases'::regclass
    ) THEN
        ALTER TABLE public.app_releases
            ADD CONSTRAINT app_releases_sha256_format_check
            CHECK (sha256 IS NULL OR sha256 ~ '^[a-fA-F0-9]{64}$');
    END IF;
END $$;