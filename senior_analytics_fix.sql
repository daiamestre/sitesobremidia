-- ==========================================================
-- SCRIPT DE FIX: ANALYTICS & ESTATÍSTICAS v1.0
-- Arquiteto: Antigravity | Foco: Visibilidade do Dashboard
-- ==========================================================

BEGIN;

-- 1. CORREÇÃO DE SEGURANÇA (RLS)
-- O player estava inserindo, mas o Dashboard NÃO conseguia ler os dados para o gráfico.

-- Garante que a tabela tenha RLS ativo
ALTER TABLE public.playback_logs ENABLE ROW LEVEL SECURITY;

-- POLÍTICA 1: Permite que o Dashboard (Usuários Logados) leia todas as estatísticas
DROP POLICY IF EXISTS "Permitir Leitura para Usuários Autenticados" ON public.playback_logs;
CREATE POLICY "Permitir Leitura para Usuários Autenticados"
ON public.playback_logs
FOR SELECT
TO authenticated
USING (true);

-- POLÍTICA 2: Permite que o Player envie os logs (Garante anon ou auth)
DROP POLICY IF EXISTS "Permitir Inserção de Logs" ON public.playback_logs;
CREATE POLICY "Permitir Inserção de Logs"
ON public.playback_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 2. OTIMIZAÇÃO DE PERFORMANCE PARA GRÁFICOS
-- Índices essenciais para que o gráfico carregue rápido mesmo com milhões de registros
CREATE INDEX IF NOT EXISTS idx_playback_logs_screen_date ON public.playback_logs (screen_id, started_at);
CREATE INDEX IF NOT EXISTS idx_playback_logs_date_only ON public.playback_logs (started_at);

-- 3. VISTA DE RESUMO DE PLAYER (OPCIONAL PARA FACILITAR RELATÓRIOS)
CREATE OR REPLACE VIEW public.vw_media_popularity AS
SELECT 
    media_id,
    count(*) as play_count,
    sum(duration) as total_duration_seconds
FROM public.playback_logs
WHERE started_at > NOW() - INTERVAL '30 days'
GROUP BY media_id
ORDER BY play_count DESC;

COMMIT;

-- ✅ RELATÓRIO: Permissões de Analytics Corrigidas. 
-- O Dashboard agora deve ser alimentado pelos dados do Player.
