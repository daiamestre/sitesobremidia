-- ============================================================================================
-- 20261253 — Dashboard do Gestor de Mídias para OWNER/ADM (/dashboard): visão da EMPRESA inteira.
--
-- O Gestor de Mídias continua com fn_dashboard_resumo_gestor (só as SUAS telas/playlists/mídias) — inalterada.
-- Owner/ADM (fn_biblioteca_admin: OWNER/ADMIN/is_owner do próprio tenant) passam a ter o resumo da operação de mídia
-- da empresa: telas (inclusive as sem empresa_operadora_id gravada cujo dono é usuário da empresa), versões do Player,
-- exibições reais (playback_logs), playlists, Minhas Mídias, Biblioteca, widgets e Conteúdo automático (esportes/notícias).
-- SECURITY DEFINER com trava explícita de perfil + tenant. Qualquer outro perfil recebe {status:'SEM_PERMISSAO'}.
-- 100% aditivo. ROLLBACK: DROP FUNCTION public.fn_dashboard_resumo_midias_owner(integer, text);
-- ============================================================================================
CREATE OR REPLACE FUNCTION public.fn_dashboard_resumo_midias_owner(
    p_offline_min integer DEFAULT 10,
    p_tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant uuid := public.fn_biblioteca_tenant();
    v_hoje date := (now() AT TIME ZONE p_tz)::date;
    v_out jsonb;
BEGIN
    IF v_tenant IS NULL OR NOT public.fn_biblioteca_admin() THEN
        RETURN jsonb_build_object('status', 'SEM_PERMISSAO');
    END IF;

    WITH
    usuarios_emp AS (SELECT u.id FROM public.usuarios u WHERE u.empresa_operadora_id = v_tenant),
    telas AS (
        SELECT s.*, (s.last_ping_at IS NOT NULL AND s.last_ping_at > now() - make_interval(mins => p_offline_min)) AS online
          FROM public.screens s
         WHERE s.is_active IS DISTINCT FROM false
           AND (s.empresa_operadora_id = v_tenant OR (s.empresa_operadora_id IS NULL AND s.user_id IN (SELECT id FROM usuarios_emp)))
    ),
    playlists_emp AS (SELECT p.* FROM public.playlists p WHERE p.user_id IN (SELECT id FROM usuarios_emp)),
    midias_emp AS (SELECT m.* FROM public.media m WHERE m.user_id IN (SELECT id FROM usuarios_emp) AND NOT coalesce(m.biblioteca, false)),
    logs AS (
        SELECT (pl.started_at AT TIME ZONE p_tz)::date AS dia
          FROM public.playback_logs pl
         WHERE pl.screen_id IN (SELECT t.id::text FROM telas t)
           AND pl.started_at >= (v_hoje - 6)::timestamp AT TIME ZONE p_tz
    ),
    bib AS (
        SELECT i.id, m.file_type FROM public.biblioteca_itens i
          JOIN public.biblioteca_pastas b ON b.id = i.pasta_id AND b.deleted_at IS NULL AND b.empresa_operadora_id = v_tenant
          JOIN public.media m ON m.id = i.media_id
         WHERE i.deleted_at IS NULL
    ),
    widgets_emp AS (SELECT w.* FROM public.widgets w WHERE w.user_id IN (SELECT id FROM usuarios_emp))
    SELECT jsonb_build_object(
        'status', 'OK',
        'gerado_em', now(),
        'parametros', jsonb_build_object('offline_min', p_offline_min),
        'telas', jsonb_build_object(
            'total', (SELECT count(*) FROM telas),
            'online', (SELECT count(*) FROM telas WHERE online),
            'offline', (SELECT count(*) FROM telas WHERE NOT online),
            'sem_playlist', (SELECT count(*) FROM telas WHERE playlist_id IS NULL),
            'offline_itens', coalesce((SELECT jsonb_agg(x ORDER BY x.ultimo_sinal DESC NULLS LAST) FROM (
                SELECT t.id, t.name AS nome, t.location AS local, t.last_ping_at AS ultimo_sinal
                  FROM telas t WHERE NOT t.online ORDER BY t.last_ping_at DESC NULLS LAST LIMIT 8) x), '[]'::jsonb),
            'sem_playlist_itens', coalesce((SELECT jsonb_agg(x) FROM (
                SELECT t.id, t.name AS nome FROM telas t WHERE t.playlist_id IS NULL LIMIT 8) x), '[]'::jsonb),
            -- Versão do Player informada pelo heartbeat (screens.version); só telas com aparelho vinculado
            'versoes', coalesce((SELECT jsonb_agg(jsonb_build_object('versao', v, 'qtd', n) ORDER BY v DESC) FROM (
                SELECT coalesce(nullif(t.version, ''), 'desconhecida') AS v, count(*) AS n
                  FROM telas t WHERE t.bound_device_id IS NOT NULL GROUP BY 1) x), '[]'::jsonb)
        ),
        'exibicoes', jsonb_build_object(
            'hoje', (SELECT count(*) FROM logs WHERE dia = v_hoje),
            'semana', (SELECT count(*) FROM logs),
            'serie_7d', coalesce((SELECT jsonb_agg(jsonb_build_object('dia', g.dia::date, 'total', coalesce(c.n, 0)) ORDER BY g.dia)
                FROM generate_series(v_hoje - 6, v_hoje, interval '1 day') AS g(dia)
                LEFT JOIN (SELECT dia, count(*) AS n FROM logs GROUP BY dia) c ON c.dia = g.dia::date), '[]'::jsonb)
        ),
        'playlists', jsonb_build_object(
            'total', (SELECT count(*) FROM playlists_emp),
            'em_uso', (SELECT count(DISTINCT t.playlist_id) FROM telas t WHERE t.playlist_id IS NOT NULL),
            'recentes', coalesce((SELECT jsonb_agg(x ORDER BY x.alterada_em DESC) FROM (
                SELECT p.id, p.name AS nome, p.updated_at AS alterada_em,
                       (SELECT count(*) FROM public.playlist_items pi WHERE pi.playlist_id = p.id) AS itens
                  FROM playlists_emp p ORDER BY p.updated_at DESC LIMIT 6) x), '[]'::jsonb)
        ),
        'midias', jsonb_build_object(
            'total', (SELECT count(*) FROM midias_emp),
            'videos', (SELECT count(*) FROM midias_emp WHERE file_type = 'video'),
            'imagens', (SELECT count(*) FROM midias_emp WHERE file_type = 'image'),
            'semana', (SELECT count(*) FROM midias_emp WHERE created_at >= now() - interval '7 days')
        ),
        'biblioteca', jsonb_build_object(
            'pastas', (SELECT count(*) FROM public.biblioteca_pastas b WHERE b.empresa_operadora_id = v_tenant AND b.deleted_at IS NULL),
            'itens', (SELECT count(*) FROM bib),
            'videos', (SELECT count(*) FROM bib WHERE file_type = 'video'),
            'imagens', (SELECT count(*) FROM bib WHERE file_type = 'image')
        ),
        'widgets', jsonb_build_object(
            'total', (SELECT count(*) FROM widgets_emp),
            'ativos', (SELECT count(*) FROM widgets_emp WHERE is_active),
            'em_playlists', (SELECT count(DISTINCT pi.widget_id) FROM public.playlist_items pi WHERE pi.widget_id IN (SELECT id FROM widgets_emp)),
            'por_tipo', coalesce((SELECT jsonb_object_agg(widget_type, n) FROM (SELECT widget_type, count(*) n FROM widgets_emp GROUP BY 1) x), '{}'::jsonb)
        ),
        'conteudo', jsonb_build_object(
            'esportes_publicados', (SELECT count(*) FROM public.content_sports_fixtures f WHERE f.empresa_operadora_id IS NULL AND f.published),
            'esportes_ultima', (SELECT max(c.last_sync_at) FROM public.content_sports_competitions c WHERE c.empresa_operadora_id IS NULL),
            'esportes_fontes_com_falha', (SELECT count(*) FROM public.content_sports_source_health h WHERE h.status <> 'HEALTHY'),
            'noticias_ativas', (SELECT count(*) FROM public.content_news_items n WHERE n.empresa_operadora_id IS NULL AND n.status = 'ACTIVE'),
            'noticias_ultima', (SELECT max(s.last_success_at) FROM public.content_news_sources s WHERE s.empresa_operadora_id IS NULL),
            'noticias_saude', (SELECT min(coalesce(s.health, 'FAILED')) FROM public.content_news_sources s WHERE s.empresa_operadora_id IS NULL AND s.ativo)
        )
    ) INTO v_out;
    RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_dashboard_resumo_midias_owner(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_resumo_midias_owner(integer, text) TO authenticated;
