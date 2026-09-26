-- W8 (Widget Engine): widget de Publicidade lê a campanha REAL (campanhas/campanha_midias) — nenhum criativo é copiado.
--
-- Mesmo desenho do W7 (20261242): o widget guarda só widgets.config.campanhaId; a cada sincronização o Player recebe
-- em config.campanha os dados atuais (título, datas, status, URLs públicas dos criativos em imagem) — nunca gravados
-- no widget. Campanha fora do ar (status fora de APPROVED/ACTIVE, excluída, fora das datas no dia de Brasília, ou sem
-- criativo em imagem) não vai para a tela. Mudou campanha/criativo -> playlists com o widget são "tocadas" (Realtime).
-- Vídeos da campanha NÃO entram no widget (continuam indo como mídia comum da playlist).
--
-- get_player_playlist_for_screen NÃO muda: já chama fn_widget_config_resolvido / fn_widget_pode_exibir (W7).
-- ROLLBACK: recriar fn_widget_config_resolvido e fn_widget_pode_exibir com a definição de 20261242;
--   DROP TRIGGER tr_campanhas_touch_playlists ON public.campanhas; DROP TRIGGER tr_campanha_midias_touch_playlists ON public.campanha_midias;
--   DROP FUNCTION public.fn_campanhas_touch_playlists(); DROP FUNCTION public.fn_widget_campanha_dados(uuid);

-- URL pública do bucket campanhas_midia (bucket público; mesma URL que supabase.storage.getPublicUrl gera no painel).
CREATE OR REPLACE FUNCTION public.fn_widget_campanha_dados(p_campanha_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'id', c.id,
        'titulo', c.titulo,
        'status', c.status,
        'data_inicio', c.data_inicio,
        'data_fim', c.data_fim,
        'vigente', (c.status IN ('APPROVED', 'ACTIVE') AND c.deleted_at IS NULL
                    AND (now() AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN c.data_inicio AND c.data_fim),
        'criativos', COALESCE((
            SELECT jsonb_agg(x.url ORDER BY x.created_at, x.url)
            FROM (
                SELECT m.created_at,
                       'https://bhwsybgsyvvhqtkdqozb.supabase.co/storage/v1/object/public/campanhas_midia/' || m.storage_path AS url
                FROM public.campanha_midias m
                WHERE m.campanha_id = c.id
                  AND (m.content_type ILIKE 'image/%'
                       OR (m.content_type IS NULL AND m.storage_path ~* '\.(png|jpe?g|webp|gif)$'))
                ORDER BY m.created_at
                LIMIT 6
            ) x
        ), '[]'::jsonb)
    )
    FROM public.campanhas c
    WHERE c.id = p_campanha_id;
$$;

CREATE OR REPLACE FUNCTION public.fn_widget_config_resolvido(p_type text, p_config jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_type = 'offer' AND (p_config->>'ofertaId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN COALESCE(p_config, '{}'::jsonb)
                 || jsonb_build_object('oferta', public.fn_widget_oferta_dados((p_config->>'ofertaId')::uuid))
        WHEN p_type = 'advertising' AND (p_config->>'campanhaId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN COALESCE(p_config, '{}'::jsonb)
                 || jsonb_build_object('campanha', public.fn_widget_campanha_dados((p_config->>'campanhaId')::uuid))
        ELSE p_config
    END;
$$;

-- O widget pode ir para a tela? (oferta: vigente e com item; publicidade: vigente e com criativo; demais: sim)
CREATE OR REPLACE FUNCTION public.fn_widget_pode_exibir(p_type text, p_config jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_type = 'offer' THEN COALESCE((
            SELECT (d->>'vigente')::boolean AND jsonb_array_length(d->'itens') > 0
            FROM (SELECT public.fn_widget_config_resolvido(p_type, p_config)->'oferta' AS d) s
        ), false)
        WHEN p_type = 'advertising' THEN COALESCE((
            SELECT (d->>'vigente')::boolean AND jsonb_array_length(d->'criativos') > 0
            FROM (SELECT public.fn_widget_config_resolvido(p_type, p_config)->'campanha' AS d) s
        ), false)
        ELSE true
    END;
$$;

REVOKE ALL ON FUNCTION public.fn_widget_campanha_dados(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_widget_config_resolvido(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_widget_pode_exibir(text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_campanhas_touch_playlists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row record;
    v_campanha uuid;
BEGIN
    v_row := COALESCE(NEW, OLD);
    IF TG_TABLE_NAME = 'campanhas' THEN
        v_campanha := v_row.id;
    ELSE
        v_campanha := v_row.campanha_id;
    END IF;
    UPDATE public.playlists p
       SET updated_at = now()
     WHERE p.id IN (
        SELECT pi.playlist_id
          FROM public.playlist_items pi
          JOIN public.widgets w ON w.id = pi.widget_id
         WHERE w.widget_type = 'advertising' AND w.config->>'campanhaId' = v_campanha::text
     );
    RETURN v_row;
END;
$$;

DROP TRIGGER IF EXISTS tr_campanhas_touch_playlists ON public.campanhas;
CREATE TRIGGER tr_campanhas_touch_playlists AFTER INSERT OR UPDATE OR DELETE ON public.campanhas
    FOR EACH ROW EXECUTE FUNCTION public.fn_campanhas_touch_playlists();
DROP TRIGGER IF EXISTS tr_campanha_midias_touch_playlists ON public.campanha_midias;
CREATE TRIGGER tr_campanha_midias_touch_playlists AFTER INSERT OR UPDATE OR DELETE ON public.campanha_midias
    FOR EACH ROW EXECUTE FUNCTION public.fn_campanhas_touch_playlists();
