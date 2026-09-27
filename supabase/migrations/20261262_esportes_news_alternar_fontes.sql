-- ============================================================================================
-- 20261262 — Esportes News: alterna as fontes e tira o que não é notícia — F-91
--
-- * fn_widget_esportes_news_dados: as notícias vêm intercaladas por fonte (1ª da Agência Brasil, 1ª do ge, 2ª da
--   Agência Brasil...), da mais nova para a mais antiga — sem isso o ge (dezenas de itens por hora) ocupava a lista
--   inteira e as notícias da Agência Brasil (CBF, Seleção) nunca apareciam. Contrato (campos) inalterado.
-- * Itens já gravados que não são notícia (página de jogo "... - globoesporte.com", enquete, link da página inicial)
--   passam a ARCHIVED; o motor passa a recusá-los (rss.ts naoENoticia). Emoji de vídeo "▶️" sai do título.
--
-- ROLLBACK: recriar fn_widget_esportes_news_dados de 20261260 (ordem só por published_at);
--           os itens ARCHIVED aqui ficam arquivados (nada é apagado).
-- ============================================================================================

UPDATE public.content_news_items SET status = 'ARCHIVED', updated_at = now()
 WHERE empresa_operadora_id IS NULL AND status = 'ACTIVE'
   AND (title ~* '\s-\s(ao vivo\s-\s)?globoesporte\.com\s*$' OR title ~* '^enquete\M'
        OR article_url ~* '^https?://[^/]+/?$');

UPDATE public.content_news_items SET title = btrim(regexp_replace(title, '^[▶️\s]+', '')), updated_at = now()
 WHERE empresa_operadora_id IS NULL AND title ~ '^[▶️]';

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
            ) ORDER BY n.rodada, n.published_at DESC NULLS LAST)
            FROM (
                SELECT i.*, row_number() OVER (PARTITION BY i.source_id ORDER BY i.published_at DESC NULLS LAST) AS rodada
                FROM public.content_news_items i
                WHERE i.empresa_operadora_id IS NULL AND i.status = 'ACTIVE' AND i.is_active
                  AND i.categoria = 'esportes'
                  AND i.image_url ~ '^https://'
                  AND (i.expires_at IS NULL OR i.expires_at > now())
                ORDER BY rodada, i.published_at DESC NULLS LAST
                LIMIT CASE WHEN (p_config->>'maxItems') ~ '^\d{1,2}$' THEN LEAST(GREATEST((p_config->>'maxItems')::int, 1), 20) ELSE 10 END
            ) n
        ), '[]'::jsonb)
    );
$function$;

REVOKE ALL ON FUNCTION public.fn_widget_esportes_news_dados(jsonb) FROM PUBLIC, anon, authenticated;
