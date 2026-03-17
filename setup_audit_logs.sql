-- 1. Criar o Bucket de Armazenamento para Logs de Auditoria
INSERT INTO storage.buckets (id, name, public) 
VALUES ('audit_logs', 'audit_logs', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Políticas de Segurança

-- Remover políticas se já existirem para evitar erro
DROP POLICY IF EXISTS "Permitir listagem de logs para usuários autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Permitir upload de logs para usuários autenticados" ON storage.objects;

-- Permitir que usuários autenticados (Dashboard) listem e baixem os arquivos
CREATE POLICY "Permitir listagem de logs para usuários autenticados"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'audit_logs');

-- Permitir que o sistema (Edge Functions / Service Role) insira novos logs
CREATE POLICY "Permitir upload de logs para usuários autenticados"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'audit_logs');
