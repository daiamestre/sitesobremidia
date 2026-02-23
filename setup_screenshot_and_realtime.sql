-- ==========================================
-- CONFIGURAÇAO DE SCREENSHOT E REALTIME
-- Execute este script no SQL Editor do Supabase
-- ==========================================

-- 1. Adicionar colunas de screenshot à tabela 'screens'
ALTER TABLE "public"."screens" 
ADD COLUMN IF NOT EXISTS "last_screenshot_url" TEXT,
ADD COLUMN IF NOT EXISTS "last_screenshot_at" TIMESTAMP WITH TIME ZONE;

-- 2. Habilitar Realtime para a tabela 'remote_commands'
-- Isso é CRITÍCO para o Player receber comandos instantaneamente
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
END $$;

-- 3. Garantir que a tabela remote_commands existe (Precavendo erro)
-- Este bloco é similar ao create_remote_commands_table.sql mas focado em compatibilidade
CREATE TABLE IF NOT EXISTS "public"."remote_commands" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "screen_id" UUID NOT NULL REFERENCES "public"."screens"("id") ON DELETE CASCADE,
    "command" TEXT NOT NULL,
    "payload" JSONB DEFAULT '{}'::jsonb,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "executed_at" TIMESTAMP WITH TIME ZONE
);

-- 4. Habilitar Realtime também para a tabela 'screens' (Opcional, mas útil para ver online/offline)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'screens'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE "public"."screens";
    END IF;
END $$;
