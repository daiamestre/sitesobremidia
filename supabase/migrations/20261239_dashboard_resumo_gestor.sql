-- Fase 3 do plano de Dashboards: "Central do Dia" do GESTOR DE MÍDIAS (/dashboard).
--
-- Mesmo recorte das telas completas do Gestor (Telas, Playlists, Mídias filtram user_id = auth.uid()): telas
-- online/offline/sem playlist, exibições das SUAS telas (hoje e 7 dias), playlists alteradas, mídias recentes e itens
-- com agendamento. Substitui os 4 números que estavam FIXOS em "0" no código da tela inicial (AGENTS.md §6).
-- SECURITY INVOKER (RLS vale) + filtro explícito pelo usuário. anon negado.
-- 100% aditivo. Reversível: DROP FUNCTION public.fn_dashboard_resumo_gestor(integer, text);

CREATE OR REPLACE FUNCTION public.fn_dashboard_resumo_gestor(
    p_offline_min integer DEFAULT 10,
    p_tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
WITH
hoje AS (
    SELECT (now() AT TIME ZONE p_tz)::date AS d
),
telas AS (
    SELECT s.*,
           (s.last_ping_at IS NOT NULL AND s.last_ping_at > now() - make_interval(mins => p_offline_min)) AS online
      FROM public.screens s
     WHERE s.user_id = auth.uid() AND s.is_active IS DISTINCT FROM false
),
minhas_playlists AS (
    SELECT p.* FROM public.playlists p WHERE p.user_id = auth.uid()
),
logs AS (
    SELECT (pl.started_at AT TIME ZONE p_tz)::date AS dia
      FROM public.playback_logs pl
     WHERE pl.screen_id IN (SELECT t.id::text FROM telas t)
       AND pl.started_at >= ((SELECT d FROM hoje) - 6)::timestamp AT TIME ZONE p_tz
)
SELECT CASE WHEN auth.uid() IS NULL THEN jsonb_build_object('status', 'SEM_PERMISSAO') ELSE jsonb_build_object(
    'status', 'OK',
    'gerado_em', now(),
    'parametros', jsonb_build_object('offline_min', p_offline_min),
    'telas', jsonb_build_object(
        'total', (SELECT count(*) FROM telas),
        'online', (SELECT count(*) FROM telas WHERE online),
        'offline', (SELECT count(*) FROM telas WHERE NOT online),
        'sem_playlist', (SELECT count(*) FROM telas WHERE playlist_id IS NULL),
        'offline_itens', coalesce((
            SELECT jsonb_agg(x ORDER BY x.ultimo_sinal DESC NULLS LAST)
              FROM (SELECT t.id, t.name AS nome, t.location AS local, t.last_ping_at AS ultimo_sinal
                      FROM telas t WHERE NOT t.online ORDER BY t.last_ping_at DESC NULLS LAST LIMIT 8) x), '[]'::jsonb),
        'sem_playlist_itens', coalesce((
            SELECT jsonb_agg(x) FROM (SELECT t.id, t.name AS nome FROM telas t WHERE t.playlist_id IS NULL LIMIT 8) x), '[]'::jsonb)
    ),
    'exibicoes', jsonb_build_object(
        'hoje', (SELECT count(*) FROM logs WHERE dia = (SELECT d FROM hoje)),
        'semana', (SELECT count(*) FROM logs),
        'serie_7d', coalesce((
            SELECT jsonb_agg(jsonb_build_object('dia', g.dia::date, 'total', coalesce(c.n, 0)) ORDER BY g.dia)
              FROM generate_series((SELECT d FROM hoje) - 6, (SELECT d FROM hoje), interval '1 day') AS g(dia)
              LEFT JOIN (SELECT dia, count(*) AS n FROM logs GROUP BY dia) c ON c.dia = g.dia::date), '[]'::jsonb)
    ),
    'playlists', jsonb_build_object(
        'total', (SELECT count(*) FROM minhas_playlists),
        'em_uso', (SELECT count(DISTINCT t.playlist_id) FROM telas t WHERE t.playlist_id IS NOT NULL),
        'itens_agendados', (SELECT count(*) FROM public.playlist_items pi
                             WHERE pi.playlist_id IN (SELECT id FROM minhas_playlists)
                               AND (pi.start_time IS NOT NULL OR pi.end_time IS NOT NULL OR pi.days IS NOT NULL)),
        'recentes', coalesce((
            SELECT jsonb_agg(x ORDER BY x.alterada_em DESC)
              FROM (SELECT p.id, p.name AS nome, p.updated_at AS alterada_em,
                           (SELECT count(*) FROM public.playlist_items pi WHERE pi.playlist_id = p.id) AS itens
                      FROM minhas_playlists p ORDER BY p.updated_at DESC LIMIT 6) x), '[]'::jsonb)
    ),
    'midias', jsonb_build_object(
        'total', (SELECT count(*) FROM public.media m WHERE m.user_id = auth.uid()),
        'videos', (SELECT count(*) FROM public.media m WHERE m.user_id = auth.uid() AND m.file_type = 'video'),
        'imagens', (SELECT count(*) FROM public.media m WHERE m.user_id = auth.uid() AND m.file_type = 'image'),
        'semana', (SELECT count(*) FROM public.media m WHERE m.user_id = auth.uid() AND m.created_at >= now() - interval '7 days'),
        'recentes', coalesce((
            SELECT jsonb_agg(x ORDER BY x.enviada_em DESC)
              FROM (SELECT m.id, m.name AS nome, m.file_type AS tipo, m.duration_ms, m.created_at AS enviada_em
                      FROM public.media m WHERE m.user_id = auth.uid() ORDER BY m.created_at DESC LIMIT 6) x), '[]'::jsonb)
    )
) END;
$$;

REVOKE ALL ON FUNCTION public.fn_dashboard_resumo_gestor(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_resumo_gestor(integer, text) TO authenticated;
