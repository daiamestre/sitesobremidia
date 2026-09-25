-- Auditoria 2026-09-25 (F-57 / F-58)
--
-- F-57: "Estatisticas de Exibicao" paravam de contar. O painel baixava TODAS as linhas de playback_logs do periodo e
-- contava no navegador, mas o PostgREST devolve no maximo 1000 linhas por consulta. Telas com >1000 exibicoes/dia
-- (desde 22-23/09) ficaram com o grafico truncado/zerado. A contagem passa a ser feita NO BANCO (agregacao).
-- SECURITY INVOKER: a RLS de playback_logs (pbl_select_own) continua valendo; cada usuario so conta o que ja podia ver.
--
-- F-58: editar um widget (fundo, cores, feed) nao chegava ao Player ate o proximo polling, porque so playlists e
-- playlist_items estao na publicacao Realtime. O gatilho abaixo "toca" as playlists que usam o widget e o Player
-- (que ja assina playlists) ressincroniza na hora.
--
-- 100% aditivo. Reversivel:
--   DROP FUNCTION public.fn_playback_stats(text, timestamptz, timestamptz, text, text);
--   DROP FUNCTION public.fn_playback_totals(text[]);
--   DROP TRIGGER tr_widgets_touch_playlists ON public.widgets; DROP FUNCTION public.fn_widgets_touch_playlists();

CREATE OR REPLACE FUNCTION public.fn_playback_stats(
    p_screen_id text,
    p_from timestamptz,
    p_to timestamptz,
    p_bucket text DEFAULT 'day',
    p_tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE (bucket timestamptz, total bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT
        (date_trunc(CASE WHEN p_bucket = 'hour' THEN 'hour' ELSE 'day' END, pl.started_at AT TIME ZONE p_tz)) AT TIME ZONE p_tz AS bucket,
        count(*)::bigint AS total
    FROM public.playback_logs pl
    WHERE pl.started_at >= p_from
      AND pl.started_at <= p_to
      AND (p_screen_id IS NULL OR pl.screen_id = p_screen_id)
    GROUP BY 1
    ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.fn_playback_totals(p_screen_ids text[])
RETURNS TABLE (screen_id text, total bigint, last_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT pl.screen_id, count(*)::bigint AS total, max(pl.started_at) AS last_at
    FROM public.playback_logs pl
    WHERE pl.screen_id = ANY (p_screen_ids)
    GROUP BY pl.screen_id;
$$;

REVOKE ALL ON FUNCTION public.fn_playback_stats(text, timestamptz, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_playback_totals(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_playback_stats(text, timestamptz, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_playback_totals(text[]) TO authenticated;

-- Indice para a agregacao por tela/periodo (o filtro principal do painel).
CREATE INDEX IF NOT EXISTS idx_playback_logs_screen_started
    ON public.playback_logs (screen_id, started_at DESC);

-- F-58: editar widget -> playlists que o usam sao "tocadas" -> Realtime -> Player ressincroniza.
CREATE OR REPLACE FUNCTION public.fn_widgets_touch_playlists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.playlists p
       SET updated_at = now()
     WHERE p.id IN (SELECT pi.playlist_id FROM public.playlist_items pi WHERE pi.widget_id = NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_widgets_touch_playlists ON public.widgets;
CREATE TRIGGER tr_widgets_touch_playlists
    AFTER UPDATE OF name, widget_type, config, is_active ON public.widgets
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_widgets_touch_playlists();
