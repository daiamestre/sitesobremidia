-- ============================================================================================
-- 20261260 — Widget "Esportes News" (widget_type = 'sports_news'), separado de "Notícias (RSS)" — F-90
--
-- Pedido do proprietário: notícias de esportes em um widget próprio, e SEMPRE com a imagem da notícia
-- (notícia sem imagem não vai para a tela).
--
-- Aditivo:
--   * content_news_sources.imagem: de onde vem a imagem de cada fonte
--       'nenhuma'        -> fonte só de texto (não alimenta o Esportes News);
--       'feed'           -> a imagem vem no próprio item do feed (media:content / enclosure / <img>);
--       'artigo_propria' -> abre a matéria e usa a foto principal SÓ quando o crédito é do próprio veículo
--                           (Agência Brasil/EBC, CC BY 4.0). Foto de terceiros (CBF, clubes, Reuters...) é recusada.
--   * content_news_items.image_credit / image_checked_at: crédito da foto e quando a imagem foi verificada.
--   * fn_widget_esportes_news_dados: só itens COM imagem https. fn_widget_pode_exibir: sem nenhum -> widget sai da
--     reprodução (não ocupa a tela vazio). fn_widget_suportado_no_aparelho: 'sports_news' só para Player >= 5.6.6
--     (o 5.6.5 trataria o tipo como RSS comum). content_touch_widgets('noticias') também atualiza o Esportes News.
--   * fn_widget_noticias_dados (widget RSS "agencia-brasil", legado): passa a ler SÓ as notícias da Agência Brasil
--     — o crédito que ele devolve é fixo "Agência Brasil"; outras fontes de esportes não podem aparecer nele.
--
-- Estrutura protegida: get_player_playlist_for_screen NÃO muda (já usa as 3 funções acima por tipo).
-- Payload das telas atuais: idêntico (não existe widget 'sports_news' nem 'rss' agencia-brasil no banco).
--
-- ROLLBACK: DROP FUNCTION fn_widget_esportes_news_dados(jsonb), content_esportes_news_preview(jsonb);
-- recriar fn_widget_config_resolvido / fn_widget_pode_exibir / fn_widget_suportado_no_aparelho /
-- content_touch_widgets / fn_widget_noticias_dados como em 20261251 (+ 20261256 para pode_exibir de sports);
-- ALTER TABLE ... DROP COLUMN imagem / image_credit / image_checked_at.
-- ============================================================================================

ALTER TABLE public.content_news_sources
    ADD COLUMN IF NOT EXISTS imagem text NOT NULL DEFAULT 'nenhuma';
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_cns_imagem') THEN
        ALTER TABLE public.content_news_sources
            ADD CONSTRAINT ck_cns_imagem CHECK (imagem IN ('nenhuma', 'feed', 'artigo_propria'));
    END IF;
END $$;

ALTER TABLE public.content_news_items
    ADD COLUMN IF NOT EXISTS image_credit text,
    ADD COLUMN IF NOT EXISTS image_checked_at timestamptz;

-- Agência Brasil: foto só quando é dela (crédito ".../Agência Brasil", EBC, TV Brasil, Rádio Nacional)
UPDATE public.content_news_sources SET imagem = 'artigo_propria'
 WHERE empresa_operadora_id IS NULL AND slug = 'agencia-brasil-esportes';

-- ------------------------------------------------------------------ dados do widget
CREATE OR REPLACE FUNCTION public.fn_widget_esportes_news_dados(p_config jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT jsonb_build_object(
        'geradoEm', now(),
        'itens', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', left(n.content_hash, 16), 'titulo', n.title, 'resumo', n.summary, 'imagem', n.image_url,
                'creditoImagem', n.image_credit, 'fonte', n.source_name, 'licenca', n.licenca, 'publicadoEm', n.published_at
            ) ORDER BY n.published_at DESC NULLS LAST)
            FROM (
                SELECT * FROM public.content_news_items
                WHERE empresa_operadora_id IS NULL AND status = 'ACTIVE' AND is_active
                  AND categoria = 'esportes'
                  AND image_url ~ '^https://'
                  AND (expires_at IS NULL OR expires_at > now())
                ORDER BY published_at DESC NULLS LAST
                LIMIT CASE WHEN (p_config->>'maxItems') ~ '^\d{1,2}$' THEN LEAST(GREATEST((p_config->>'maxItems')::int, 1), 20) ELSE 10 END
            ) n
        ), '[]'::jsonb)
    );
$function$;

-- Legado (widget RSS "agencia-brasil"): só Agência Brasil, como o crédito fixo que ele devolve
CREATE OR REPLACE FUNCTION public.fn_widget_noticias_dados(p_config jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT jsonb_build_object(
        'categoria', COALESCE(NULLIF(p_config->>'categoria', ''), 'esportes'),
        'geradoEm', now(),
        'creditos', 'Fonte: Agência Brasil (CC BY 4.0)',
        'itens', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('titulo', n.title, 'resumo', n.summary, 'fonte', n.source_name, 'publicadoEm', n.published_at) ORDER BY n.published_at DESC NULLS LAST)
            FROM (
                SELECT * FROM public.content_news_items
                WHERE empresa_operadora_id IS NULL AND status = 'ACTIVE' AND is_active
                  AND categoria = COALESCE(NULLIF(p_config->>'categoria', ''), 'esportes')
                  AND source_id IN (SELECT s.id FROM public.content_news_sources s
                                     WHERE s.empresa_operadora_id IS NULL AND s.slug LIKE 'agencia-brasil-%')
                  AND (expires_at IS NULL OR expires_at > now())
                ORDER BY published_at DESC NULLS LAST
                LIMIT CASE WHEN (p_config->>'maxItems') ~ '^\d{1,2}$' THEN LEAST(GREATEST((p_config->>'maxItems')::int, 1), 20) ELSE 8 END
            ) n
        ), '[]'::jsonb)
    );
$function$;

CREATE OR REPLACE FUNCTION public.fn_widget_config_resolvido(p_type text, p_config jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
        WHEN p_type = 'offer' AND (p_config->>'ofertaId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN COALESCE(p_config, '{}'::jsonb)
                 || jsonb_build_object('oferta', public.fn_widget_oferta_dados((p_config->>'ofertaId')::uuid))
        WHEN p_type = 'advertising' AND (p_config->>'campanhaId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN COALESCE(p_config, '{}'::jsonb)
                 || jsonb_build_object('campanha', public.fn_widget_campanha_dados((p_config->>'campanhaId')::uuid))
        WHEN p_type = 'sports'
            THEN COALESCE(p_config, '{}'::jsonb) || jsonb_build_object('esportes', public.fn_widget_esportes_dados(COALESCE(p_config, '{}'::jsonb)))
        WHEN p_type = 'sports_news'
            THEN COALESCE(p_config, '{}'::jsonb) || jsonb_build_object('esportesNews', public.fn_widget_esportes_news_dados(COALESCE(p_config, '{}'::jsonb)))
        WHEN p_type = 'rss' AND p_config->>'origem' = 'agencia-brasil'
            THEN p_config || jsonb_build_object('noticias', public.fn_widget_noticias_dados(p_config))
        ELSE p_config
    END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_widget_pode_exibir(p_type text, p_config jsonb)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
        WHEN p_type = 'offer' THEN COALESCE((
            SELECT (d->>'vigente')::boolean AND jsonb_array_length(d->'itens') > 0
            FROM (SELECT public.fn_widget_config_resolvido(p_type, p_config)->'oferta' AS d) s
        ), false)
        WHEN p_type = 'advertising' THEN COALESCE((
            SELECT (d->>'vigente')::boolean AND jsonb_array_length(d->'criativos') > 0
            FROM (SELECT public.fn_widget_config_resolvido(p_type, p_config)->'campanha' AS d) s
        ), false)
        -- Esportes v2: sem resultado nos 3 dias anteriores nem jogo de hoje até D+2, o widget sai da reprodução
        -- (ex.: pausa da Data FIFA) em vez de ocupar a tela vazio. Volta sozinho na virada do dia com jogos.
        WHEN p_type = 'sports' THEN public.fn_esportes_tem_jogos_na_janela(COALESCE(p_config, '{}'::jsonb))
        -- Esportes News: só existe notícia com imagem; sem nenhuma, o widget sai da reprodução.
        WHEN p_type = 'sports_news'
            THEN COALESCE(jsonb_array_length(public.fn_widget_esportes_news_dados(COALESCE(p_config, '{}'::jsonb))->'itens') > 0, false)
        WHEN p_type = 'rss' AND p_config->>'origem' = 'agencia-brasil'
            THEN COALESCE(jsonb_array_length(public.fn_widget_noticias_dados(p_config)->'itens') > 0, false)
        ELSE true
    END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_widget_suportado_no_aparelho(p_type text, p_device_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
        WHEN p_type IS DISTINCT FROM 'sports' AND p_type IS DISTINCT FROM 'sports_news' THEN true
        ELSE COALESCE((
            SELECT max((regexp_match(v, '(\d+)\.(\d+)\.(\d+)'))::int[])
                   >= CASE WHEN p_type = 'sports_news' THEN ARRAY[5, 6, 6] ELSE ARRAY[5, 6, 0] END
            FROM (
                SELECT s.version AS v FROM public.screens s WHERE s.bound_device_id = p_device_id
                UNION ALL
                SELECT d.app_version FROM public.devices d WHERE d.identity_hash = p_device_id
            ) versoes
            WHERE v ~ '\d+\.\d+\.\d+'
        ), false)
    END;
$function$;

CREATE OR REPLACE FUNCTION public.content_touch_widgets(p_tipo text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_n integer;
BEGIN
    UPDATE public.playlists p SET updated_at = now()
     WHERE p.id IN (
        SELECT pi.playlist_id FROM public.playlist_items pi JOIN public.widgets w ON w.id = pi.widget_id
         WHERE (p_tipo = 'sports' AND w.widget_type = 'sports')
            OR (p_tipo = 'noticias' AND w.widget_type = 'sports_news')
            OR (p_tipo = 'noticias' AND w.widget_type = 'rss' AND w.config->>'origem' = 'agencia-brasil'));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$function$;

-- Prévia do painel (usuário logado)
CREATE OR REPLACE FUNCTION public.content_esportes_news_preview(p_config jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE public.fn_widget_esportes_news_dados(COALESCE(p_config, '{}'::jsonb)) END;
$function$;

REVOKE ALL ON FUNCTION public.fn_widget_esportes_news_dados(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_widget_noticias_dados(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_widget_config_resolvido(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_widget_pode_exibir(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_widget_suportado_no_aparelho(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.content_touch_widgets(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.content_touch_widgets(text) TO service_role;
REVOKE ALL ON FUNCTION public.content_esportes_news_preview(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_esportes_news_preview(jsonb) TO authenticated;
