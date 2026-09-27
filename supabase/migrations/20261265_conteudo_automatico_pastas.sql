-- ============================================================================================
-- 20261265 — Conteúdo automático: demais pastas da Biblioteca + dados de esportes para o robô — F-95
--
-- Marca as pastas da empresa SOBRE MÍDIA (tenant das pastas criadas pelo proprietário) com o robô que as abastece.
-- Pastas de vídeo sem fonte de vídeo ainda (Vídeos Esporte) não são marcadas; as demais recebem artes em imagem:
--   Datas Comemorativas -> datas        | SOBREMÍDIA NEWS -> noticias | Esportes -> esportes | Futebol -> futebol
--   Vídeos Cinema -> cinema             | Vídeos Turismo -> turismo   | Charadas -> charadas  | Memes -> memes
--   Vídeos Humor -> humor               | Vídeos Incrível -> curiosidades | Vídeos Nostalgia -> nostalgia
--   Brasileirão / Premier League / La Liga / Champions League -> campeonato-<slug>
--   Apostas Esportivas -> jogos-rodada (jogos da rodada, SEM odds — decisão do proprietário)
--
-- conteudo_esportes_dados(): SÓ service_role (Edge Function conteudo-automatico). Por competição ativa: últimos 6
-- resultados e próximos 6 jogos PUBLICADOS (mesmas regras do Sports Engine), escudos só os conferidos, fundos da arte.
--
-- ROLLBACK: UPDATE biblioteca_pastas SET conteudo_automatico = NULL WHERE conteudo_automatico NOT IN ('loterias','sorteios');
--           DROP FUNCTION conteudo_esportes_dados();
-- ============================================================================================

UPDATE public.biblioteca_pastas p SET conteudo_automatico = m.slug
  FROM (VALUES ('datas comemorativas', 'datas'), ('sobremídia news', 'noticias'), ('esportes', 'esportes'),
               ('futebol', 'futebol'), ('vídeos cinema', 'cinema'), ('vídeos turismo', 'turismo'),
               ('charadas', 'charadas'), ('memes', 'memes'), ('vídeos humor', 'humor'),
               ('vídeos incrível', 'curiosidades'), ('vídeos nostalgia', 'nostalgia'),
               ('brasileirão', 'campeonato-brasileirao'), ('premier league', 'campeonato-premier-league'),
               ('la liga', 'campeonato-la-liga'), ('champions league', 'campeonato-champions-league'),
               ('apostas esportivas', 'jogos-rodada')) AS m(nome, slug)
 WHERE p.deleted_at IS NULL AND p.conteudo_automatico IS NULL
   AND p.empresa_operadora_id = '7d62aaec-e24d-4273-b257-867183cf658c'
   AND lower(btrim(p.nome)) = m.nome;

CREATE OR REPLACE FUNCTION public.conteudo_esportes_dados()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH jogos AS (
        SELECT c.slug, f.status, COALESCE(f.kickoff_utc, f.scheduled_date::timestamptz) AS quando,
               jsonb_build_object(
                   'mandante', f.home_team_name, 'visitante', f.away_team_name,
                   'placarMandante', f.home_score, 'placarVisitante', f.away_score, 'status', f.status, 'rodada', f.rodada,
                   'data', to_char(CASE WHEN f.kickoff_utc IS NOT NULL THEN (f.kickoff_utc AT TIME ZONE 'America/Sao_Paulo')::date ELSE f.scheduled_date END, 'YYYY-MM-DD'),
                   'hora', CASE WHEN f.kickoff_utc IS NOT NULL THEN to_char(f.kickoff_utc AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') END,
                   'escudoMandante', (SELECT t.escudo_url FROM public.content_sports_teams t WHERE t.nome = f.home_team_name AND t.verificado_em IS NOT NULL),
                   'escudoVisitante', (SELECT t.escudo_url FROM public.content_sports_teams t WHERE t.nome = f.away_team_name AND t.verificado_em IS NOT NULL)
               ) AS j
        FROM public.content_sports_fixtures f
        JOIN public.content_sports_competitions c ON c.id = f.competition_id
        WHERE f.empresa_operadora_id IS NULL AND f.published AND c.empresa_operadora_id IS NULL AND c.ativo
    )
    SELECT jsonb_build_object('geradoEm', now(), 'competicoes', COALESCE(jsonb_agg(jsonb_build_object(
        'slug', c.slug, 'nome', c.nome, 'ordem', c.ordem, 'fundoH', c.fundo_h_url, 'fundoV', c.fundo_v_url, 'fundoComTitulo', c.fundo_com_titulo,
        'ultimos', COALESCE((SELECT jsonb_agg(x.j ORDER BY x.quando) FROM (
            SELECT j, quando FROM jogos WHERE jogos.slug = c.slug AND status = 'FINISHED' ORDER BY quando DESC LIMIT 6) x), '[]'::jsonb),
        'proximos', COALESCE((SELECT jsonb_agg(x.j ORDER BY x.quando) FROM (
            SELECT j, quando FROM jogos WHERE jogos.slug = c.slug AND status = 'SCHEDULED' AND quando > now() - interval '2 hours'
             ORDER BY quando LIMIT 6) x), '[]'::jsonb)
    ) ORDER BY c.ordem), '[]'::jsonb))
    FROM public.content_sports_competitions c
    WHERE c.empresa_operadora_id IS NULL AND c.ativo;
$$;

REVOKE ALL ON FUNCTION public.conteudo_esportes_dados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conteudo_esportes_dados() TO service_role;

-- Estado atual de uma pasta automática (chave -> hash/url/path), para o robô não refazer nem reenviar o que não mudou.
CREATE OR REPLACE FUNCTION public.conteudo_auto_estado(p_conteudo text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(jsonb_object_agg(substr(t.tag, 6), jsonb_build_object('hash', m.file_hash, 'url', m.file_url, 'path', m.file_path)), '{}'::jsonb)
    FROM public.biblioteca_pastas p
    JOIN public.biblioteca_itens bi ON bi.pasta_id = p.id AND bi.deleted_at IS NULL
    JOIN public.media m ON m.id = bi.media_id
    CROSS JOIN LATERAL (SELECT x AS tag FROM unnest(bi.tags) x WHERE x LIKE 'auto:%' LIMIT 1) t
    WHERE p.conteudo_automatico = p_conteudo AND p.deleted_at IS NULL
      AND p.id = (SELECT id FROM public.biblioteca_pastas WHERE conteudo_automatico = p_conteudo AND deleted_at IS NULL ORDER BY created_at LIMIT 1);
$$;
REVOKE ALL ON FUNCTION public.conteudo_auto_estado(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conteudo_auto_estado(text) TO service_role;
