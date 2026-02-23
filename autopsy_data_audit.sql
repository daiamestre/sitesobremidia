-- ==========================================================
-- SCRIPT DE AUTÓPSIA: AUDITORIA DE DADOS DE REPRODUÇÃO
-- Objetivo: Revelar onde os dados estão "sumindo" (Suspeito A e C)
-- Arquiteto: Antigravity 🕵️‍♂️
-- ==========================================================

-- 1. VISÃO GERAL: Últimos 20 logs gravados no banco
-- Isso confirma se o player está alcançando o servidor.
SELECT 
    id, 
    screen_id, 
    media_id, 
    duration, 
    started_at, 
    created_at,
    status
FROM public.playback_logs 
ORDER BY created_at DESC 
LIMIT 20;

-- 2. DETECTOR DE "LOGS ÓRFÃOS"
-- Verifica se existem logs com IDs que NÃO pertencem a nenhuma tela cadastrada.
-- Se isso retornar dados, o player está usando um ID que o Dashboard não conhece.
SELECT 
    screen_id, 
    COUNT(*) as logs_count,
    MAX(started_at) as ultimo_log
FROM public.playback_logs 
WHERE screen_id NOT IN (SELECT id::TEXT FROM public.screens)
  AND screen_id NOT IN (SELECT custom_id FROM public.screens WHERE custom_id IS NOT NULL)
GROUP BY screen_id;

-- 3. SAÚDE DAS TELAS (O QUE O DASHBOARD ESPERA)
-- Lista como as telas estão cadastradas para compararmos com os logs acima.
SELECT id, name, custom_id, last_ping_at, is_active 
FROM public.screens 
ORDER BY last_ping_at DESC;

-- 4. TESTE DE PERFORMANCE DA QUERY DO DASHBOARD
-- Mostra o que o gráfico deveria estar exibindo HOJE.
SELECT 
    date_trunc('day', started_at) as dia,
    count(*) as total_reproducoes
FROM public.playback_logs
WHERE started_at > NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1 DESC;
