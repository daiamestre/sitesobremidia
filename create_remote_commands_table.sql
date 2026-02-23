-- ==========================================
-- CRIAÇÃO DA TABELA: REMOTE COMMANDS
-- ==========================================

-- 1. Criar a tabela (se não existir)
CREATE TABLE IF NOT EXISTS "public"."remote_commands" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "screen_id" UUID NOT NULL REFERENCES "public"."screens"("id") ON DELETE CASCADE,
    "command" TEXT NOT NULL CHECK (command IN ('reload', 'reboot', 'screenshot')),
    "payload" JSONB DEFAULT '{}'::jsonb,
    "status" TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed')),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "executed_at" TIMESTAMP WITH TIME ZONE
);

-- 2. Habilita RLS
ALTER TABLE "public"."remote_commands" ENABLE ROW LEVEL SECURITY;

-- 3. Limpar políticas antigas (para evitar erros ao rodar de novo)
DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."remote_commands";
DROP POLICY IF EXISTS "Enable update for all users" ON "public"."remote_commands";
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON "public"."remote_commands";

-- 4. CRIAR POLÍTICAS (RLS)

-- LEITURA: Permitir que o Player (Anon) e Dashboard (Auth) leiam
CREATE POLICY "Enable read access for all users" ON "public"."remote_commands"
FOR SELECT USING (true);

-- ATUALIZAÇÃO: Permitir que o Player (Anon) atualize o status para 'executed'
CREATE POLICY "Enable update for all users" ON "public"."remote_commands"
FOR UPDATE USING (true);

-- INSERÇÃO: Apenas Dashboard (Auth) pode criar comandos
CREATE POLICY "Enable insert for authenticated users only" ON "public"."remote_commands"
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 5. PERMISSÕES (GRANTS)
GRANT SELECT, UPDATE, INSERT ON "public"."remote_commands" TO service_role;
GRANT SELECT, UPDATE ON "public"."remote_commands" TO anon;
GRANT SELECT, UPDATE, INSERT ON "public"."remote_commands" TO authenticated;

-- Opcional: Criar índex para performance no polling
CREATE INDEX IF NOT EXISTS idx_remote_commands_screen_status ON "public"."remote_commands"("screen_id", "status");
