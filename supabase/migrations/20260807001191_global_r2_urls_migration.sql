-- ======================================================================
-- MIGRATION: GLOBAL CLOUDFLARE R2 MIGRATION MAP
-- Criação da tabela de mapa de migração auditável para troca de URLs
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.storage_migration_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(50) NOT NULL,
  record_id UUID NOT NULL,
  old_url TEXT NOT NULL,
  new_url TEXT NOT NULL,
  bucket VARCHAR(50) NOT NULL,
  arquivo TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'ERROR')),
  error_log TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_storage_mig_status ON public.storage_migration_map(status);
CREATE INDEX IF NOT EXISTS idx_storage_mig_table ON public.storage_migration_map(table_name);

-- O update efetivo será feito via Node.js lendo o JSON gerado
-- ou posteriormente via um script PL/pgSQL que lê a tabela storage_migration_map.
