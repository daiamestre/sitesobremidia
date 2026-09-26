-- ============================================================================================
-- 20261256 — Widget Esportes v2 (F-86): resultados e próximos jogos por campeonato, janela de 3 dias e escudos oficiais.
--
-- Pedido do proprietário (26/09/2026):
--   * separado por campeonato ("Brasileirão Série A" / "Resultados e próximos jogos");
--   * resultados dos 3 dias anteriores (D-3..D-1) e próximos jogos de hoje até D+2 (horário de Brasília);
--   * páginas de 3 resultados + 3 próximos jogos (a paginação e a continuação entre exibições ficam no Player);
--   * nome do time SEMPRE com o escudo oficial do próprio time.
--
-- Escudos: nome gravado nos jogos -> artigo do clube na Wikipédia (o mesmo vínculo que o Sports Engine usa para
-- reconciliar) -> imagem principal do artigo (o escudo do infobox) -> cópia PNG no Storage (bucket escudos-times).
-- A conferência visual (nome x escudo) fica registrada em verificado_em. Se a Wikipédia trocar o arquivo de um escudo já
-- conferido, a cópia conferida continua em uso e a linha fica pendente_revisao (nunca troca sozinho por um não conferido).
--
-- Contrato com o Player (aditivo): config.esportes continua com modo/jogos/competicoes/creditos (Players 5.6.0/5.6.1
-- seguem iguais) e ganha layout=2, referencia, janela[] (D-3..D+9, com escudoMandante/escudoVisitante e ordem da
-- competição). D+9: o Player sem rede continua tendo os próximos jogos por alguns dias; ele recorta a janela pelo
-- próprio relógio.
-- Exibição: o widget só entra na reprodução se houver jogo na janela (antes: qualquer jogo publicado no modo).
-- ROLLBACK: recriar fn_widget_esportes_dados(jsonb), content_esportes_preview(jsonb) e fn_widget_pode_exibir da 20261251;
--           cron.unschedule('esportes-virada-do-dia'), cron.unschedule('sports-escudos-sync'); DROP TABLE content_sports_teams.
-- ============================================================================================

-- ------------------------------------------------------------------ 1. Escudos
CREATE TABLE IF NOT EXISTS public.content_sports_teams (
    nome              text PRIMARY KEY,          -- exatamente como em content_sports_fixtures.home/away_team_name
    wiki_host         text NOT NULL,
    artigo            text NOT NULL,             -- artigo do clube na Wikipédia
    wikidata_qid      text,
    arquivo           text NOT NULL,             -- arquivo do escudo (Wikipédia/Commons) usado na cópia atual
    arquivo_sha1      text,
    escudo_url        text,                      -- cópia PNG no Storage (bucket escudos-times)
    verificado_em     timestamptz,               -- conferência visual humana: escudo é o do time
    pendente_revisao  boolean NOT NULL DEFAULT false,
    arquivo_candidato text,                      -- arquivo novo visto na Wikipédia, aguardando conferência
    atualizado_em     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.content_sports_teams ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_sports_teams FROM PUBLIC, anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('escudos-times', 'escudos-times', true, 262144, ARRAY['image/png'])
ON CONFLICT (id) DO NOTHING;

-- Times com jogo publicado, por competição (a Edge Function sports-escudos-sync resolve os escudos destes nomes).
CREATE OR REPLACE FUNCTION public.content_sports_times_publicados()
RETURNS TABLE (competicao text, nome text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT DISTINCT c.slug, t.nome
      FROM public.content_sports_fixtures f
      JOIN public.content_sports_competitions c ON c.id = f.competition_id
      CROSS JOIN LATERAL (VALUES (f.home_team_name), (f.away_team_name)) t(nome)
     WHERE f.published AND f.empresa_operadora_id IS NULL AND c.empresa_operadora_id IS NULL AND c.ativo;
$$;
REVOKE ALL ON FUNCTION public.content_sports_times_publicados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.content_sports_times_publicados() TO service_role;

-- ------------------------------------------------------------------ 2. Dados do widget (aditivo) + referência de data da prévia
DROP FUNCTION IF EXISTS public.content_esportes_preview(jsonb);
DROP FUNCTION IF EXISTS public.fn_widget_esportes_dados(jsonb);

CREATE FUNCTION public.fn_widget_esportes_dados(p_config jsonb, p_referencia date DEFAULT NULL)
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
                   'escudoMandante', (SELECT t.escudo_url FROM public.content_sports_teams t WHERE t.nome = f.home_team_name),
                   'escudoVisitante', (SELECT t.escudo_url FROM public.content_sports_teams t WHERE t.nome = f.away_team_name)
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
                   'escudoMandante', (SELECT t.escudo_url FROM public.content_sports_teams t WHERE t.nome = f.home_team_name),
                   'escudoVisitante', (SELECT t.escudo_url FROM public.content_sports_teams t WHERE t.nome = f.away_team_name)
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

    SELECT COALESCE(jsonb_agg(jsonb_build_object('slug', c.slug, 'nome', c.nome, 'codigo', c.codigo, 'cobertura', c.cobertura, 'ordem', c.ordem) ORDER BY c.ordem), '[]'::jsonb)
      INTO v_competicoes
      FROM public.content_sports_competitions c
     WHERE c.empresa_operadora_id IS NULL AND c.ativo AND (v_comps IS NULL OR c.slug = ANY (v_comps));

    RETURN jsonb_build_object('modo', v_modo, 'fuso', 'America/Sao_Paulo', 'geradoEm', now(), 'competicoes', v_competicoes,
                              'jogos', v_jogos, 'creditos', 'Dados: openfootball (CC0) · Wikipédia (CC BY-SA)',
                              'layout', 2, 'referencia', to_char(v_hoje, 'YYYY-MM-DD'), 'janela', v_janela,
                              'simulado', p_referencia IS NOT NULL, 'agoraReferencia', v_agora);
END;
$$;

-- Prévia do painel: mesma resolução do Player. p_referencia (opcional) mostra como fica em outra data, com dados reais
-- daquela data (ex.: durante a pausa da Data FIFA). Nunca vai para as telas.
CREATE FUNCTION public.content_esportes_preview(p_config jsonb, p_referencia date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT CASE WHEN auth.uid() IS NULL THEN NULL
                ELSE public.fn_widget_esportes_dados(COALESCE(p_config, '{}'::jsonb), p_referencia) END;
$$;

-- Data de exemplo para a prévia quando a janela atual está vazia: o dia ANTERIOR ao último dia com jogo encerrado
-- (esse último dia entra em "próximos jogos" e os 3 dias antes dele em "resultados").
CREATE OR REPLACE FUNCTION public.content_esportes_ultima_data_com_jogos(p_config jsonb)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE (
        SELECT max(dia) - 1
          FROM public.content_sports_fixtures f
          JOIN public.content_sports_competitions c ON c.id = f.competition_id
          CROSS JOIN LATERAL (SELECT COALESCE((f.kickoff_utc AT TIME ZONE 'America/Sao_Paulo')::date, f.scheduled_date) AS dia) d
         WHERE f.published AND f.status = 'FINISHED' AND c.ativo AND f.empresa_operadora_id IS NULL
           AND dia < (now() AT TIME ZONE 'America/Sao_Paulo')::date
           AND (jsonb_typeof(p_config->'competicoes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_config->'competicoes') = 0
                OR c.slug IN (SELECT jsonb_array_elements_text(p_config->'competicoes')))
    ) END;
$$;

-- ------------------------------------------------------------------ 3. Regra de exibição: só com jogo na janela
CREATE OR REPLACE FUNCTION public.fn_esportes_tem_jogos_na_janela(p_config jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    WITH par AS (
        SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje,
               CASE WHEN jsonb_typeof(p_config->'competicoes') = 'array' AND jsonb_array_length(p_config->'competicoes') > 0
                    THEN ARRAY(SELECT jsonb_array_elements_text(p_config->'competicoes')) END AS comps,
               NULLIF(btrim(COALESCE(p_config->>'time', '')), '') AS time_filtro
    )
    SELECT EXISTS (
        SELECT 1
          FROM par, public.content_sports_fixtures f
          JOIN public.content_sports_competitions c ON c.id = f.competition_id
          CROSS JOIN LATERAL (SELECT COALESCE((f.kickoff_utc AT TIME ZONE 'America/Sao_Paulo')::date, f.scheduled_date) AS dia) d
         WHERE f.published AND f.empresa_operadora_id IS NULL AND c.empresa_operadora_id IS NULL AND c.ativo
           AND (par.comps IS NULL OR c.slug = ANY (par.comps))
           AND (par.time_filtro IS NULL OR lower(f.home_team_name) LIKE '%' || lower(par.time_filtro) || '%'
                OR lower(f.away_team_name) LIKE '%' || lower(par.time_filtro) || '%')
           AND ((f.status = 'FINISHED' AND f.home_score IS NOT NULL AND f.away_score IS NOT NULL
                 AND d.dia BETWEEN par.hoje - 3 AND par.hoje - 1)
             OR (f.status = 'SCHEDULED' AND d.dia BETWEEN par.hoje AND par.hoje + 2
                 AND (f.kickoff_utc IS NULL OR f.kickoff_utc > now())))
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_widget_pode_exibir(p_type text, p_config jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
        WHEN p_type = 'rss' AND p_config->>'origem' = 'agencia-brasil'
            THEN COALESCE(jsonb_array_length(public.fn_widget_noticias_dados(p_config)->'itens') > 0, false)
        ELSE true
    END;
$$;

REVOKE ALL ON FUNCTION public.fn_widget_esportes_dados(jsonb, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_esportes_tem_jogos_na_janela(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_widget_pode_exibir(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.content_esportes_preview(jsonb, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_esportes_preview(jsonb, date) TO authenticated;
REVOKE ALL ON FUNCTION public.content_esportes_ultima_data_com_jogos(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_esportes_ultima_data_com_jogos(jsonb) TO authenticated;

-- ------------------------------------------------------------------ 4. Agenda
-- Virada do dia (00:05 de Brasília = 03:05 UTC): a janela anda um dia -> as telas ressincronizam (o widget entra/sai).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('esportes-virada-do-dia', 'sports-escudos-sync');
SELECT cron.schedule('esportes-virada-do-dia', '5 3 * * *', $cron$ SELECT public.content_touch_widgets('sports'); $cron$);
-- Escudos: toda segunda 06:15 UTC (times novos; troca de arquivo na Wikipédia fica pendente de revisão).
SELECT cron.schedule('sports-escudos-sync', '15 6 * * 1', $cron$
    SELECT net.http_post(
        url := 'https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/sports-escudos-sync',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
                   'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CONTENT_ENGINE_SECRET' LIMIT 1)),
        body := '{"trigger":"cron"}'::jsonb,
        timeout_milliseconds := 120000);
$cron$);
