-- HABILITAR LEITURA DE LOGS PARA O DASHBOARD
-- Este script corrige o problema onde o "Gráfico fica vazio" mesmo com o player enviando dados.
-- Problema: O Dashboard não tem permissão para LER a tabela playback_logs.

-- 1. Habilita RLS (Segurança) na tabela, caso não esteja
ALTER TABLE public.playback_logs ENABLE ROW LEVEL SECURITY;

-- 2. Permite que usuários LOGADOS (Authenticated) vejam os logs
-- (Isso é essencial para o Dashboard conseguir montar o gráfico)
CREATE POLICY "Permitir Leitura para Usuários Autenticados"
ON public.playback_logs
FOR SELECT
TO authenticated
USING (true);

-- 3. Permite que o Player (Anonimo ou Autenticado) INSIRA logs
-- (Garante que o envio de dados continue funcionando)
CREATE POLICY "Permitir Inserção de Logs"
ON public.playback_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Confirmação
SELECT 'Permissões corrigidas com sucesso!' as status;
