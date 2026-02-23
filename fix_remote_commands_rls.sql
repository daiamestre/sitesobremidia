-- ==========================================
-- FIX PERMISSÕES: REMOTE COMMANDS (PLAYER)
-- ==========================================

-- Habilita RLS na tabela (se não estiver)
ALTER TABLE remote_commands ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas (para evitar conflitos)
DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."remote_commands";
DROP POLICY IF EXISTS "Enable update for all users" ON "public"."remote_commands";
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON "public"."remote_commands";

-- 1. PERMITIR LEITURA (SELECT) para TODOS (Anon incluído)
-- Motivo: O Player roda sem estar logado (Anon Key) e precisa ver se há comandos pendentes.
CREATE POLICY "Enable read access for all users" ON "public"."remote_commands"
FOR SELECT USING (true);

-- 2. PERMITIR ATUALIZAÇÃO (UPDATE) para TODOS (Anon incluído)
-- Motivo: O Player precisa marcar o comando como 'executed' ou 'failed' (status).
CREATE POLICY "Enable update for all users" ON "public"."remote_commands"
FOR UPDATE USING (true) WITH CHECK (true);

-- 3. PERMITIR INSERÇÃO (INSERT) apenas para AUTENTICADOS (Dashboard)
-- Motivo: Só usuarios logados no Dashboard podem enviar comandos. Players não criam comandos.
CREATE POLICY "Enable insert for authenticated users only" ON "public"."remote_commands"
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Verificação final
-- Confere se Grants estão OK para anon
GRANT SELECT, UPDATE ON "public"."remote_commands" TO anon;
GRANT SELECT, UPDATE ON "public"."remote_commands" TO authenticated;
GRANT INSERT ON "public"."remote_commands" TO authenticated;
