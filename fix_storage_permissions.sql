-- ==========================================
-- SCRIPT MÍNIMO DE SEGURANÇA
-- Execute este script no SQL Editor do Supabase
-- (Ele não mexe no Storage para evitar erros de permissão)
-- ==========================================

-- 1. Garantir colunas na tabela de telas
ALTER TABLE "public"."screens" 
ADD COLUMN IF NOT EXISTS "last_screenshot_url" TEXT,
ADD COLUMN IF NOT EXISTS "last_screenshot_at" TIMESTAMP WITH TIME ZONE;

-- 2. Garantir a tabela de comandos remotos
CREATE TABLE IF NOT EXISTS "public"."remote_commands" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "screen_id" UUID NOT NULL REFERENCES "public"."screens"("id") ON DELETE CASCADE,
    "command" TEXT NOT NULL,
    "payload" JSONB DEFAULT '{}'::jsonb,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "executed_at" TIMESTAMP WITH TIME ZONE
);

-- 3. Habilitar Realtime para os comandos
-- (Se falhar, ignore este item e habilite via interface 'Realtime' no Dashboard)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'remote_commands'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE "public"."remote_commands";
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Nao foi possivel ativar realtime via SQL. Habilite manualmente no dashboard.';
END $$;
