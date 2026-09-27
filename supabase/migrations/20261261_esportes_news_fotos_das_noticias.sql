-- ============================================================================================
-- 20261261 — Esportes News: foto da própria notícia, qualquer crédito + fonte ge — F-91
--
-- Decisão do proprietário (27/09/2026, por escrito no chat): as notícias de esporte usam a foto da própria notícia
-- mesmo quando é de terceiros (CBF, clubes, agências), com o crédito original na tela; o proprietário assumiu o risco
-- de direito autoral (inclusive da fonte ge/Globo, antes classificada como não autorizada no F-79). A imagem nunca é
-- alterada; o crédito sempre acompanha.
--
-- Aditivo:
--   * novo modo content_news_sources.imagem = 'artigo' (foto principal da matéria, qualquer crédito);
--   * Agência Brasil passa de 'artigo_propria' para 'artigo'; as matérias ativas são verificadas de novo;
--   * nova fonte global 'ge-esportes' (RSS do ge, imagem do próprio feed; sem imagem -> imagem da página).
-- Widgets / RPCs / get_player_playlist_for_screen: sem mudança (fn_widget_esportes_news_dados já lê todas as fontes
-- de categoria 'esportes' com imagem). O widget RSS legado continua só com a Agência Brasil (filtro por slug).
--
-- ROLLBACK: UPDATE content_news_sources SET ativo = false WHERE slug = 'ge-esportes';
--           UPDATE content_news_items SET status = 'ARCHIVED' WHERE source_id = (id da ge-esportes);
--           UPDATE content_news_sources SET imagem = 'artigo_propria' WHERE slug = 'agencia-brasil-esportes';
--           UPDATE content_news_items SET image_url = NULL, image_credit = NULL, image_checked_at = NULL
--             WHERE source_id = (id da agencia-brasil-esportes);  -- o motor re-verifica só as próprias
-- ============================================================================================

ALTER TABLE public.content_news_sources DROP CONSTRAINT IF EXISTS ck_cns_imagem;
ALTER TABLE public.content_news_sources
    ADD CONSTRAINT ck_cns_imagem CHECK (imagem IN ('nenhuma', 'feed', 'artigo', 'artigo_propria'));

UPDATE public.content_news_sources SET imagem = 'artigo', updated_at = now()
 WHERE empresa_operadora_id IS NULL AND slug = 'agencia-brasil-esportes';

-- re-verificar as matérias ativas da Agência Brasil sem imagem (agora a foto de terceiros também vale)
UPDATE public.content_news_items i SET image_checked_at = NULL
  FROM public.content_news_sources s
 WHERE i.source_id = s.id AND s.slug = 'agencia-brasil-esportes' AND s.empresa_operadora_id IS NULL
   AND i.status = 'ACTIVE' AND i.image_url IS NULL;

INSERT INTO public.content_news_sources (empresa_operadora_id, slug, nome, tipo, url, categoria, licenca, max_items, fetch_interval_minutes, imagem)
SELECT NULL, 'ge-esportes', 'ge', 'rss', 'https://ge.globo.com/rss/ge/', 'esportes',
       'Uso decidido pelo proprietário (27/09/2026) com crédito da fonte; sem licença formal da Globo', 30, 30, 'feed'
WHERE NOT EXISTS (SELECT 1 FROM public.content_news_sources WHERE slug = 'ge-esportes' AND empresa_operadora_id IS NULL);
