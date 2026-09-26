-- ============================================================================================
-- 20261257 — Esportes (F-87): Copa do Brasil (masculino), fundos temáticos por campeonato e escudo só conferido.
--
-- * Copa do Brasil: a Wikipédia em português só tem as chaves (sem data/horário por jogo); a em inglês tem uma caixa
--   por jogo com data e horário. Cobertura PARTIAL, como a Champions: publica o que duas revisões confirmam. Jogos em
--   cidade fora do horário de Brasília ficam de fora (parseCaixasClassicas). Ordem: logo depois do Brasileirão.
-- * Fundos: arte própria por campeonato (estádio, gramado, bola, taça estilizada), servida pelo site; o widget troca o
--   fundo a cada campeonato. Aditivo: config.esportes.competicoes[] ganha fundoH/fundoV.
-- * Escudos: só aparecem depois da conferência visual (verificado_em). Sem ela, as iniciais — nunca um escudo não
--   conferido (pedido do proprietário: "a logo precisa ser exatamente a logo do time").
-- ROLLBACK: recriar fn_widget_esportes_dados da 20261256; UPDATE ... SET ativo = false WHERE slug = 'copa-do-brasil';
--           ALTER TABLE content_sports_competitions DROP COLUMN fundo_h_url, DROP COLUMN fundo_v_url.
-- ============================================================================================
ALTER TABLE public.content_sports_competitions ADD COLUMN IF NOT EXISTS fundo_h_url text;
ALTER TABLE public.content_sports_competitions ADD COLUMN IF NOT EXISTS fundo_v_url text;

INSERT INTO public.content_sports_competitions (nome, slug, pais, temporada, ativo, source, codigo, cobertura, fuso, fontes, ordem)
SELECT 'Copa do Brasil', 'copa-do-brasil', 'Brasil', '2026', true, 'wikipedia', 'CDB', 'PARTIAL', 'America/Sao_Paulo',
       '{"wikipedia": "en.wikipedia.org/wiki/2026_Copa_do_Brasil"}'::jsonb, 1
WHERE NOT EXISTS (SELECT 1 FROM public.content_sports_competitions WHERE slug = 'copa-do-brasil' AND empresa_operadora_id IS NULL);

UPDATE public.content_sports_competitions SET ordem = CASE slug
    WHEN 'brasileirao' THEN 0 WHEN 'copa-do-brasil' THEN 1 WHEN 'premier-league' THEN 2 WHEN 'la-liga' THEN 3 WHEN 'champions-league' THEN 4 ELSE ordem END
 WHERE empresa_operadora_id IS NULL;

UPDATE public.content_sports_competitions
   SET fundo_h_url = 'https://sitesobremidia.vercel.app/esportes/fundos/' || slug || '-h.jpg',
       fundo_v_url = 'https://sitesobremidia.vercel.app/esportes/fundos/' || slug || '-v.jpg'
 WHERE empresa_operadora_id IS NULL
   AND slug IN ('brasileirao', 'copa-do-brasil', 'premier-league', 'la-liga', 'champions-league');

CREATE OR REPLACE FUNCTION public.fn_widget_esportes_dados(p_config jsonb, p_referencia date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_modo text := CASE WHEN p_config->>'modo' IN ('resultados', 'proximos', 'hoje') THEN p_config->>'modo' ELSE 'resultados' END;
    v_limite int := CASE WHEN (p_config->>'limite') ~ '^\d{1,2}$' THEN LEAST(GREATEST((p_config->>'limite')::int, 1), 12) ELSE 6 END;
    v_comps text[] := CASE WHEN jsonb_typeof(p_config->'competicoes') = 'array' AND jsonb_array_length(p_config->'competicoes') > 0
                           THEN ARRAY(SELECT jsonb_array_elements_text(p_config->'competicoes')) END;
    v_time text := NULLIF(btrim(COALESCE(p_config->>'time', '')), '');
    -- p_referencia só vem da prévia do painel (content_esportes_preview); o Player sempre recebe o dia de hoje.
    v_hoje date := COALESCE(p_referencia, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
    v_agora timestamptz := CASE WHEN p_referencia IS NULL THEN now()
                                ELSE (p_referencia::timestamp + time '12:00') AT TIME ZONE 'America/Sao_Paulo' END;
    v_jogos jsonb;
    v_janela jsonb;
    v_competicoes jsonb;
BEGIN
    -- Lista antiga (Players 5.6.0/5.6.1): mesma regra de antes, agora com os escudos.
    SELECT COALESCE(jsonb_agg(j ORDER BY ordem_chave), '[]'::jsonb) INTO v_jogos FROM (
        SELECT jsonb_build_object(
                   'competicao', c.nome, 'codigo', c.codigo, 'slug', c.slug, 'rodada', f.rodada,
                   'mandante', f.home_team_name, 'visitante', f.away_team_name,
                   'placarMandante', f.home_score, 'placarVisitante', f.away_score, 'status', f.status,
                   'data', to_char(CASE WHEN f.kickoff_utc IS NOT NULL THEN (f.kickoff_utc AT TIME ZONE 'America/Sao_Paulo')::date ELSE f.scheduled_date END, 'YYYY-MM-DD'),
                   'hora', CASE WHEN f.kickoff_utc IS NOT NULL THEN to_char(f.kickoff_utc AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') END,
                   'kickoffUtc', f.kickoff_utc,
                   'escudoMandante', (SELECT t.escudo_url FROM public.content_sports_teams t WHERE t.nome = f.home_team_name AND t.verificado_em IS NOT NULL),
                   'escudoVisitante', (SELECT t.escudo_url FROM public.content_sports_teams t WHERE t.nome = f.away_team_name AND t.verificado_em IS NOT NULL)
               ) AS j,
               CASE WHEN v_modo = 'resultados'
                    THEN -extract(epoch FROM COALESCE(f.kickoff_utc, f.scheduled_date::timestamptz))
                    ELSE extract(epoch FROM COALESCE(f.kickoff_utc, f.scheduled_date::timestamptz)) END AS ordem_chave
        FROM public.content_sports_fixtures f
        JOIN public.content_sports_competitions c ON c.id = f.competition_id
        WHERE f.empresa_operadora_id IS NULL AND f.published
          AND c.empresa_operadora_id IS NULL AND c.ativo
          AND (v_comps IS NULL OR c.slug = ANY (v_comps))
          AND (v_time IS NULL OR lower(f.home_team_name) LIKE '%' || lower(v_time) || '%' OR lower(f.away_team_name) LIKE '%' || lower(v_time) || '%')
          AND CASE v_modo
                WHEN 'proximos' THEN f.status = 'SCHEDULED' AND (f.kickoff_utc > v_agora OR (f.kickoff_utc IS NULL AND f.scheduled_date > v_hoje))
                WHEN 'hoje' THEN (CASE WHEN f.kickoff_utc IS NOT NULL THEN (f.kickoff_utc AT TIME ZONE 'America/Sao_Paulo')::date ELSE f.scheduled_date END) = v_hoje
                                 AND (f.status = 'FINISHED' OR f.kickoff_utc IS NULL OR f.kickoff_utc > v_agora)
                ELSE f.status = 'FINISHED'
              END
        ORDER BY ordem_chave
        LIMIT v_limite
    ) s;

    -- Janela v2: D-3..D+9 (o Player recorta D-3..D-1 = resultados e D..D+2 = próximos pelo relógio dele).
    SELECT COALESCE(jsonb_agg(j ORDER BY ordem, chave), '[]'::jsonb) INTO v_janela FROM (
        SELECT jsonb_build_object(
                   'competicao', c.nome, 'codigo', c.codigo, 'slug', c.slug, 'rodada', f.rodada, 'ordemCompeticao', c.ordem,
                   'mandante', f.home_team_name, 'visitante', f.away_team_name,
                   'placarMandante', f.home_score, 'placarVisitante', f.away_score, 'status', f.status,
                   'data', to_char(dia, 'YYYY-MM-DD'),
                   'hora', CASE WHEN f.kickoff_utc IS NOT NULL THEN to_char(f.kickoff_utc AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') END,
                   'kickoffUtc', f.kickoff_utc,
                   'escudoMandante', (SELECT t.escudo_url FROM public.content_sports_teams t WHERE t.nome = f.home_team_name AND t.verificado_em IS NOT NULL),
                   'escudoVisitante', (SELECT t.escudo_url FROM public.content_sports_teams t WHERE t.nome = f.away_team_name AND t.verificado_em IS NOT NULL)
               ) AS j,
               c.ordem AS ordem,
               COALESCE(f.kickoff_utc, dia::timestamptz) AS chave
        FROM public.content_sports_fixtures f
        JOIN public.content_sports_competitions c ON c.id = f.competition_id
        CROSS JOIN LATERAL (SELECT COALESCE((f.kickoff_utc AT TIME ZONE 'America/Sao_Paulo')::date, f.scheduled_date) AS dia) d
        WHERE f.empresa_operadora_id IS NULL AND f.published
          AND c.empresa_operadora_id IS NULL AND c.ativo
          AND (v_comps IS NULL OR c.slug = ANY (v_comps))
          AND (v_time IS NULL OR lower(f.home_team_name) LIKE '%' || lower(v_time) || '%' OR lower(f.away_team_name) LIKE '%' || lower(v_time) || '%')
          AND f.status IN ('FINISHED', 'SCHEDULED')
          AND dia BETWEEN v_hoje - 3 AND v_hoje + 9
    ) s;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('slug', c.slug, 'nome', c.nome, 'codigo', c.codigo, 'cobertura', c.cobertura, 'ordem', c.ordem, 'fundoH', c.fundo_h_url, 'fundoV', c.fundo_v_url) ORDER BY c.ordem), '[]'::jsonb)
      INTO v_competicoes
      FROM public.content_sports_competitions c
     WHERE c.empresa_operadora_id IS NULL AND c.ativo AND (v_comps IS NULL OR c.slug = ANY (v_comps));

    RETURN jsonb_build_object('modo', v_modo, 'fuso', 'America/Sao_Paulo', 'geradoEm', now(), 'competicoes', v_competicoes,
                              'jogos', v_jogos, 'creditos', 'Dados: openfootball (CC0) · Wikipédia (CC BY-SA)',
                              'layout', 2, 'referencia', to_char(v_hoje, 'YYYY-MM-DD'), 'janela', v_janela,
                              'simulado', p_referencia IS NOT NULL, 'agoraReferencia', v_agora);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_widget_esportes_dados(jsonb, date) FROM PUBLIC, anon, authenticated;

-- Escudos em JPG (alguns clubes só têm o escudo em JPG na Wikipédia).
UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/png', 'image/jpeg'] WHERE id = 'escudos-times';
