-- ============================================================================================
-- 20261251 — SOBRE MÍDIA Sports Engine + Notícias de Esportes (custo zero)
-- Contrato: docs/engineering/SPORTS_ENGINE_CONTRATO.md
--
-- Reaproveita as tabelas content_sports_* e content_news_* (criadas sem registro por um rascunho de outra sessão,
-- vazias de conteúdo desde o F-79) e as torna DADO GLOBAL DA PLATAFORMA (empresa_operadora_id NULL):
-- resultado de jogo e notícia não pertencem a uma empresa. Escrita: só a Edge Function (service_role).
-- Leitura: o servidor entrega aos widgets já resolvido (fn_widget_config_resolvido), igual a Ofertas/Publicidade.
--
-- Aditivo: nenhuma coluna existente é removida. Única mudança em estrutura protegida: 1 linha de filtro em
-- get_player_playlist_for_screen (widget "sports" só para Player >= 5.6.0; aparelhos antigos não recebem e
-- não exibem "Widget não suportado"). Payload das telas atuais: idêntico (não há widget sports).
--
-- ROLLBACK: DROP das funções fn_widget_esportes_dados, fn_widget_noticias_dados, fn_widget_suportado_no_aparelho,
-- content_touch_widgets, content_sports_painel, content_esportes_preview, content_noticias_preview; recriar
-- fn_widget_config_resolvido / fn_widget_pode_exibir (20261243) e get_player_playlist_for_screen sem a linha W11;
-- cron.unschedule('sports-engine-sync'), cron.unschedule('news-engine-sync'); DROP das 4 tabelas novas.
-- ============================================================================================

-- ------------------------------------------------------------------ 1. Estrutura base (banco novo)
CREATE TABLE IF NOT EXISTS public.content_sports_competitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id uuid REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
    external_id text,
    nome text NOT NULL,
    slug text NOT NULL,
    pais text,
    temporada text,
    logo_url text,
    ativo boolean NOT NULL DEFAULT true,
    source text NOT NULL DEFAULT 'openfootball+wikipedia',
    last_sync_at timestamptz,
    last_sync_error text,
    fixtures_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.content_sports_fixtures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id uuid REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
    competition_id uuid NOT NULL REFERENCES public.content_sports_competitions(id) ON DELETE CASCADE,
    external_fixture_id text,
    temporada text,
    rodada text,
    match_date date,
    kickoff_utc timestamptz,
    home_team_id text,
    home_team_name text NOT NULL DEFAULT '',
    home_team_logo text,
    away_team_id text,
    away_team_name text NOT NULL DEFAULT '',
    away_team_logo text,
    home_score integer,
    away_score integer,
    status text NOT NULL DEFAULT 'SCHEDULED',
    status_display text,
    venue text,
    source text NOT NULL DEFAULT 'openfootball',
    raw_status text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.content_news_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id uuid REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
    category_id uuid,
    nome text NOT NULL,
    tipo text NOT NULL DEFAULT 'rss',
    url text NOT NULL,
    ativo boolean NOT NULL DEFAULT true,
    max_items integer NOT NULL DEFAULT 20,
    fetch_interval_minutes integer NOT NULL DEFAULT 60,
    last_fetch_at timestamptz,
    last_fetch_items integer,
    last_fetch_error text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.content_news_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id uuid REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
    source_id uuid REFERENCES public.content_news_sources(id) ON DELETE SET NULL,
    category_id uuid,
    external_guid text,
    content_hash text NOT NULL,
    title text NOT NULL,
    summary text,
    image_url text,
    source_name text NOT NULL DEFAULT '',
    source_url text,
    article_url text,
    published_at timestamptz,
    expires_at timestamptz,
    last_displayed_at timestamptz,
    display_count integer NOT NULL DEFAULT 0,
    rotation_position integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'ACTIVE',
    is_active boolean NOT NULL DEFAULT true,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ 2. Dado global + colunas do contrato
ALTER TABLE public.content_sports_competitions ALTER COLUMN empresa_operadora_id DROP NOT NULL;
ALTER TABLE public.content_sports_fixtures     ALTER COLUMN empresa_operadora_id DROP NOT NULL;
ALTER TABLE public.content_news_sources        ALTER COLUMN empresa_operadora_id DROP NOT NULL;
ALTER TABLE public.content_news_items          ALTER COLUMN empresa_operadora_id DROP NOT NULL;

ALTER TABLE public.content_sports_competitions
    ADD COLUMN IF NOT EXISTS codigo text,
    ADD COLUMN IF NOT EXISTS cobertura text,
    ADD COLUMN IF NOT EXISTS fuso text,
    ADD COLUMN IF NOT EXISTS fontes jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;
ALTER TABLE public.content_sports_competitions DROP CONSTRAINT IF EXISTS content_sports_competitions_source_check;
ALTER TABLE public.content_sports_competitions ADD CONSTRAINT content_sports_competitions_source_check
    CHECK (source IN ('api-football', 'manual', 'other', 'openfootball+wikipedia', 'wikipedia'));
ALTER TABLE public.content_sports_competitions DROP CONSTRAINT IF EXISTS ck_csc_cobertura;
ALTER TABLE public.content_sports_competitions ADD CONSTRAINT ck_csc_cobertura
    CHECK (cobertura IS NULL OR cobertura IN ('FULL', 'PARTIAL', 'UNAVAILABLE'));
CREATE UNIQUE INDEX IF NOT EXISTS ux_csc_global_slug ON public.content_sports_competitions (slug) WHERE empresa_operadora_id IS NULL;

ALTER TABLE public.content_sports_fixtures
    ADD COLUMN IF NOT EXISTS match_key text,
    ADD COLUMN IF NOT EXISTS competition_code text,
    ADD COLUMN IF NOT EXISTS scheduled_date date,
    ADD COLUMN IF NOT EXISTS time_known boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS source_timezone text,
    ADD COLUMN IF NOT EXISTS home_team_source text,
    ADD COLUMN IF NOT EXISTS away_team_source text,
    ADD COLUMN IF NOT EXISTS validation_state text,
    ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS confidence text,
    ADD COLUMN IF NOT EXISTS reject_reason text,
    ADD COLUMN IF NOT EXISTS source_url text,
    ADD COLUMN IF NOT EXISTS source_version text,
    ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
    ADD COLUMN IF NOT EXISTS validation_source text,
    ADD COLUMN IF NOT EXISTS validation_url text,
    ADD COLUMN IF NOT EXISTS validation_version text,
    ADD COLUMN IF NOT EXISTS collected_at timestamptz,
    ADD COLUMN IF NOT EXISTS validated_at timestamptz,
    ADD COLUMN IF NOT EXISTS published_at timestamptz,
    ADD COLUMN IF NOT EXISTS parser_version text,
    ADD COLUMN IF NOT EXISTS row_hash text,
    ADD COLUMN IF NOT EXISTS evidence jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS ux_csf_match_key ON public.content_sports_fixtures (match_key);
CREATE INDEX IF NOT EXISTS ix_csf_publicados ON public.content_sports_fixtures (competition_id, status, kickoff_utc) WHERE published;
ALTER TABLE public.content_sports_fixtures DROP CONSTRAINT IF EXISTS ck_csf_validation_state;
ALTER TABLE public.content_sports_fixtures ADD CONSTRAINT ck_csf_validation_state
    CHECK (validation_state IS NULL OR validation_state IN ('VALIDATED', 'PENDING_VALIDATION', 'CONFLICT', 'SUSPICIOUS', 'REJECTED'));
-- Regra do contrato no próprio banco: nada de LIVE/UNKNOWN publicado; FINISHED publicado exige placar e validação.
ALTER TABLE public.content_sports_fixtures DROP CONSTRAINT IF EXISTS ck_csf_publicacao;
ALTER TABLE public.content_sports_fixtures ADD CONSTRAINT ck_csf_publicacao CHECK (
    NOT published OR (
        validation_state = 'VALIDATED'
        AND status IN ('SCHEDULED', 'FINISHED', 'POSTPONED', 'CANCELLED')
        AND (status <> 'FINISHED' OR (home_score IS NOT NULL AND away_score IS NOT NULL))
        AND source_url IS NOT NULL AND validation_source IS NOT NULL
    )
);

ALTER TABLE public.content_news_sources
    ADD COLUMN IF NOT EXISTS slug text,
    ADD COLUMN IF NOT EXISTS categoria text,
    ADD COLUMN IF NOT EXISTS licenca text,
    ADD COLUMN IF NOT EXISTS etag text,
    ADD COLUMN IF NOT EXISTS last_modified text,
    ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
    ADD COLUMN IF NOT EXISTS health text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_cns_global_slug ON public.content_news_sources (slug) WHERE empresa_operadora_id IS NULL;
ALTER TABLE public.content_news_items
    ADD COLUMN IF NOT EXISTS categoria text,
    ADD COLUMN IF NOT EXISTS licenca text,
    ADD COLUMN IF NOT EXISTS autor text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_cni_global_hash ON public.content_news_items (content_hash) WHERE empresa_operadora_id IS NULL;
CREATE INDEX IF NOT EXISTS ix_cni_global_categoria ON public.content_news_items (categoria, published_at DESC) WHERE empresa_operadora_id IS NULL AND status = 'ACTIVE';

-- ------------------------------------------------------------------ 3. Observabilidade (somente service_role)
CREATE TABLE IF NOT EXISTS public.content_sports_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    trigger text NOT NULL DEFAULT 'cron',
    modo text,
    status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED')),
    publicou_mudancas boolean NOT NULL DEFAULT false,
    detalhes jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_csr_started ON public.content_sports_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.content_sports_source_health (
    fonte text NOT NULL,
    competicao text NOT NULL,
    status text NOT NULL CHECK (status IN ('HEALTHY', 'DEGRADED', 'FAILED')),
    last_success_at timestamptz,
    last_failure_at timestamptz,
    failure_reason text,
    last_version text,
    last_etag text,
    records_received integer NOT NULL DEFAULT 0,
    records_accepted integer NOT NULL DEFAULT 0,
    records_rejected integer NOT NULL DEFAULT 0,
    records_changed integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (fonte, competicao)
);

CREATE TABLE IF NOT EXISTS public.content_sports_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    competicao text NOT NULL,
    fonte text NOT NULL,
    versao text NOT NULL,
    url text NOT NULL,
    publicado_em timestamptz,
    lido_em timestamptz NOT NULL DEFAULT now(),
    payload_hash text NOT NULL,
    total integer NOT NULL,
    payload jsonb NOT NULL,
    UNIQUE (competicao, fonte, versao)
);
CREATE INDEX IF NOT EXISTS ix_css_lookup ON public.content_sports_snapshots (competicao, fonte, lido_em DESC);

CREATE TABLE IF NOT EXISTS public.content_sports_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    at timestamptz NOT NULL DEFAULT now(),
    run_id uuid REFERENCES public.content_sports_runs(id) ON DELETE SET NULL,
    competicao text NOT NULL,
    match_key text NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('MATCH_SCHEDULE_CHANGED', 'RESULT_CONFIRMED', 'CONFLICT', 'SUSPICIOUS_CHANGE', 'MATCH_UNPUBLISHED', 'MATCH_PUBLISHED')),
    antes jsonb,
    depois jsonb
);
CREATE INDEX IF NOT EXISTS ix_cse_at ON public.content_sports_events (at DESC);

-- ------------------------------------------------------------------ 4. Competições globais (reuso das 4 linhas do rascunho)
UPDATE public.content_sports_competitions c SET
    empresa_operadora_id = NULL, external_id = NULL, source = v.source, nome = v.nome, pais = v.pais, temporada = v.temporada,
    codigo = v.codigo, cobertura = v.cobertura, fuso = v.fuso, fontes = v.fontes, ordem = v.ordem, ativo = true,
    last_sync_at = NULL, last_sync_error = NULL, fixtures_count = 0, updated_at = now()
FROM (VALUES
    ('brasileirao', 'Brasileirão Série A', 'Brasil', '2026', 'BSA', 'FULL', 'America/Sao_Paulo', 'openfootball+wikipedia', 0,
     '{"openfootball":"2026/br.1.json","wikipedia":"pt.wikipedia.org/wiki/Campeonato_Brasileiro_de_Futebol_de_2026_-_Série_A"}'::jsonb),
    ('premier-league', 'Premier League', 'Inglaterra', '2026/27', 'PL', 'FULL', 'Europe/London', 'openfootball+wikipedia', 1,
     '{"openfootball":"2026-27/en.1.json","wikipedia":"en.wikipedia.org/wiki/2026–27_Premier_League"}'::jsonb),
    ('la-liga', 'La Liga', 'Espanha', '2026/27', 'PD', 'FULL', 'Europe/Madrid', 'openfootball+wikipedia', 2,
     '{"openfootball":"2026-27/es.1.json","wikipedia":"en.wikipedia.org/wiki/Template:2026–27_La_Liga_table"}'::jsonb),
    ('champions-league', 'Champions League', 'Europa', '2026/27', 'CL', 'PARTIAL', 'Europe/Paris', 'wikipedia', 3,
     '{"wikipedia":"en.wikipedia.org/wiki/2026–27_UEFA_Champions_League_league_phase"}'::jsonb)
) AS v(slug, nome, pais, temporada, codigo, cobertura, fuso, source, ordem, fontes)
WHERE c.slug = v.slug
  AND NOT EXISTS (SELECT 1 FROM public.content_sports_competitions g WHERE g.slug = v.slug AND g.empresa_operadora_id IS NULL AND g.id <> c.id)
  AND c.id = (SELECT min(x.id::text)::uuid FROM public.content_sports_competitions x WHERE x.slug = v.slug);

INSERT INTO public.content_sports_competitions (empresa_operadora_id, nome, slug, pais, temporada, codigo, cobertura, fuso, source, ordem, fontes)
SELECT NULL, v.nome, v.slug, v.pais, v.temporada, v.codigo, v.cobertura, v.fuso, v.source, v.ordem, v.fontes
FROM (VALUES
    ('brasileirao', 'Brasileirão Série A', 'Brasil', '2026', 'BSA', 'FULL', 'America/Sao_Paulo', 'openfootball+wikipedia', 0, '{}'::jsonb),
    ('premier-league', 'Premier League', 'Inglaterra', '2026/27', 'PL', 'FULL', 'Europe/London', 'openfootball+wikipedia', 1, '{}'::jsonb),
    ('la-liga', 'La Liga', 'Espanha', '2026/27', 'PD', 'FULL', 'Europe/Madrid', 'openfootball+wikipedia', 2, '{}'::jsonb),
    ('champions-league', 'Champions League', 'Europa', '2026/27', 'CL', 'PARTIAL', 'Europe/Paris', 'wikipedia', 3, '{}'::jsonb)
) AS v(slug, nome, pais, temporada, codigo, cobertura, fuso, source, ordem, fontes)
WHERE NOT EXISTS (SELECT 1 FROM public.content_sports_competitions g WHERE g.slug = v.slug AND g.empresa_operadora_id IS NULL);

INSERT INTO public.content_news_sources (empresa_operadora_id, slug, nome, tipo, url, categoria, licenca, max_items, fetch_interval_minutes)
SELECT NULL, 'agencia-brasil-esportes', 'Agência Brasil', 'rss', 'https://agenciabrasil.ebc.com.br/rss/esportes/feed.xml', 'esportes', 'CC BY 4.0', 30, 30
WHERE NOT EXISTS (SELECT 1 FROM public.content_news_sources WHERE slug = 'agencia-brasil-esportes' AND empresa_operadora_id IS NULL);

-- ------------------------------------------------------------------ 5. RLS: leitura só do que está publicado; escrita só service_role
ALTER TABLE public.content_sports_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_sports_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_news_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_sports_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_sports_source_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_sports_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_sports_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS csc_admin_write ON public.content_sports_competitions;
DROP POLICY IF EXISTS csf_admin_write ON public.content_sports_fixtures;
DROP POLICY IF EXISTS cns_admin_write ON public.content_news_sources;
DROP POLICY IF EXISTS cni_admin_write ON public.content_news_items;
DROP POLICY IF EXISTS csc_global_select ON public.content_sports_competitions;
CREATE POLICY csc_global_select ON public.content_sports_competitions FOR SELECT TO authenticated USING (empresa_operadora_id IS NULL AND ativo);
DROP POLICY IF EXISTS csf_global_select ON public.content_sports_fixtures;
CREATE POLICY csf_global_select ON public.content_sports_fixtures FOR SELECT TO authenticated USING (empresa_operadora_id IS NULL AND published);
DROP POLICY IF EXISTS cni_global_select ON public.content_news_items;
CREATE POLICY cni_global_select ON public.content_news_items FOR SELECT TO authenticated USING (empresa_operadora_id IS NULL AND status = 'ACTIVE' AND is_active);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.content_sports_competitions, public.content_sports_fixtures,
    public.content_news_sources, public.content_news_items FROM anon, authenticated;
REVOKE ALL ON public.content_sports_runs, public.content_sports_source_health, public.content_sports_snapshots,
    public.content_sports_events FROM anon, authenticated;

-- ------------------------------------------------------------------ 6. Dados prontos para os widgets
CREATE OR REPLACE FUNCTION public.fn_widget_esportes_dados(p_config jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_modo text := CASE WHEN p_config->>'modo' IN ('resultados', 'proximos', 'hoje') THEN p_config->>'modo' ELSE 'resultados' END;
    v_limite int := CASE WHEN (p_config->>'limite') ~ '^\d{1,2}$' THEN LEAST(GREATEST((p_config->>'limite')::int, 1), 12) ELSE 6 END;
    v_comps text[] := CASE WHEN jsonb_typeof(p_config->'competicoes') = 'array' AND jsonb_array_length(p_config->'competicoes') > 0
                           THEN ARRAY(SELECT jsonb_array_elements_text(p_config->'competicoes')) END;
    v_time text := NULLIF(btrim(COALESCE(p_config->>'time', '')), '');
    v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_jogos jsonb;
    v_competicoes jsonb;
BEGIN
    SELECT COALESCE(jsonb_agg(j ORDER BY ordem_chave), '[]'::jsonb) INTO v_jogos FROM (
        SELECT jsonb_build_object(
                   'competicao', c.nome, 'codigo', c.codigo, 'slug', c.slug, 'rodada', f.rodada,
                   'mandante', f.home_team_name, 'visitante', f.away_team_name,
                   'placarMandante', f.home_score, 'placarVisitante', f.away_score, 'status', f.status,
                   'data', to_char(CASE WHEN f.kickoff_utc IS NOT NULL THEN (f.kickoff_utc AT TIME ZONE 'America/Sao_Paulo')::date ELSE f.scheduled_date END, 'YYYY-MM-DD'),
                   'hora', CASE WHEN f.kickoff_utc IS NOT NULL THEN to_char(f.kickoff_utc AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') END,
                   'kickoffUtc', f.kickoff_utc
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
                WHEN 'proximos' THEN f.status = 'SCHEDULED' AND (f.kickoff_utc > now() OR (f.kickoff_utc IS NULL AND f.scheduled_date > v_hoje))
                WHEN 'hoje' THEN (CASE WHEN f.kickoff_utc IS NOT NULL THEN (f.kickoff_utc AT TIME ZONE 'America/Sao_Paulo')::date ELSE f.scheduled_date END) = v_hoje
                                 AND (f.status = 'FINISHED' OR f.kickoff_utc IS NULL OR f.kickoff_utc > now())
                ELSE f.status = 'FINISHED'
              END
        ORDER BY ordem_chave
        LIMIT v_limite
    ) s;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('slug', c.slug, 'nome', c.nome, 'codigo', c.codigo, 'cobertura', c.cobertura) ORDER BY c.ordem), '[]'::jsonb)
      INTO v_competicoes
      FROM public.content_sports_competitions c
     WHERE c.empresa_operadora_id IS NULL AND c.ativo AND (v_comps IS NULL OR c.slug = ANY (v_comps));

    RETURN jsonb_build_object('modo', v_modo, 'fuso', 'America/Sao_Paulo', 'geradoEm', now(), 'competicoes', v_competicoes,
                              'jogos', v_jogos, 'creditos', 'Dados: openfootball (CC0) · Wikipédia (CC BY-SA)');
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_widget_noticias_dados(p_config jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
                  AND (expires_at IS NULL OR expires_at > now())
                ORDER BY published_at DESC NULLS LAST
                LIMIT CASE WHEN (p_config->>'maxItems') ~ '^\d{1,2}$' THEN LEAST(GREATEST((p_config->>'maxItems')::int, 1), 20) ELSE 8 END
            ) n
        ), '[]'::jsonb)
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_widget_config_resolvido(p_type text, p_config jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT CASE
        WHEN p_type = 'offer' AND (p_config->>'ofertaId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN COALESCE(p_config, '{}'::jsonb)
                 || jsonb_build_object('oferta', public.fn_widget_oferta_dados((p_config->>'ofertaId')::uuid))
        WHEN p_type = 'advertising' AND (p_config->>'campanhaId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN COALESCE(p_config, '{}'::jsonb)
                 || jsonb_build_object('campanha', public.fn_widget_campanha_dados((p_config->>'campanhaId')::uuid))
        WHEN p_type = 'sports'
            THEN COALESCE(p_config, '{}'::jsonb) || jsonb_build_object('esportes', public.fn_widget_esportes_dados(COALESCE(p_config, '{}'::jsonb)))
        WHEN p_type = 'rss' AND p_config->>'origem' = 'agencia-brasil'
            THEN p_config || jsonb_build_object('noticias', public.fn_widget_noticias_dados(p_config))
        ELSE p_config
    END;
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
        -- Sem jogo publicado (validado) não há o que mostrar: o widget sai da reprodução em vez de ocupar a tela vazio.
        WHEN p_type = 'sports' THEN COALESCE(jsonb_array_length(public.fn_widget_esportes_dados(COALESCE(p_config, '{}'::jsonb))->'jogos') > 0, false)
        WHEN p_type = 'rss' AND p_config->>'origem' = 'agencia-brasil'
            THEN COALESCE(jsonb_array_length(public.fn_widget_noticias_dados(p_config)->'itens') > 0, false)
        ELSE true
    END;
$$;

-- Tipos novos só vão para aparelhos que sabem desenhá-los (evita "Widget não suportado" em Player antigo).
CREATE OR REPLACE FUNCTION public.fn_widget_suportado_no_aparelho(p_type text, p_device_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT CASE
        WHEN p_type IS DISTINCT FROM 'sports' THEN true
        ELSE COALESCE((
            SELECT (regexp_match(d.app_version, '(\d+)\.(\d+)\.(\d+)'))::int[] >= ARRAY[5, 6, 0]
            FROM public.devices d
            WHERE d.identity_hash = p_device_id AND d.app_version ~ '\d+\.\d+\.\d+'
            ORDER BY d.last_seen DESC NULLS LAST
            LIMIT 1
        ), false)
    END;
$$;

-- Dados publicados mudaram -> "toca" as playlists com widgets desse tipo (Realtime -> Player sincroniza em segundo plano).
CREATE OR REPLACE FUNCTION public.content_touch_widgets(p_tipo text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
    UPDATE public.playlists p SET updated_at = now()
     WHERE p.id IN (
        SELECT pi.playlist_id FROM public.playlist_items pi JOIN public.widgets w ON w.id = pi.widget_id
         WHERE (p_tipo = 'sports' AND w.widget_type = 'sports')
            OR (p_tipo = 'noticias' AND w.widget_type = 'rss' AND w.config->>'origem' = 'agencia-brasil'));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

-- Prévia no painel (qualquer usuário autenticado: são dados públicos já validados).
CREATE OR REPLACE FUNCTION public.content_esportes_preview(p_config jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE public.fn_widget_esportes_dados(COALESCE(p_config, '{}'::jsonb)) END;
$$;
CREATE OR REPLACE FUNCTION public.content_noticias_preview(p_config jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE public.fn_widget_noticias_dados(COALESCE(p_config, '{}'::jsonb)) END;
$$;

-- Painel de saúde do motor (somente Owner/ADM).
CREATE OR REPLACE FUNCTION public.content_sports_painel()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT public.fn_biblioteca_admin() THEN
        RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
        'competicoes', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'slug', c.slug, 'nome', c.nome, 'cobertura', c.cobertura, 'ultimaSincronizacao', c.last_sync_at, 'erro', c.last_sync_error,
                'publicados', (SELECT count(*) FROM public.content_sports_fixtures f WHERE f.competition_id = c.id AND f.published),
                'resultados', (SELECT count(*) FROM public.content_sports_fixtures f WHERE f.competition_id = c.id AND f.published AND f.status = 'FINISHED'),
                'proximos', (SELECT count(*) FROM public.content_sports_fixtures f WHERE f.competition_id = c.id AND f.published AND f.status = 'SCHEDULED' AND (f.kickoff_utc > now() OR f.kickoff_utc IS NULL)),
                'pendentes', (SELECT count(*) FROM public.content_sports_fixtures f WHERE f.competition_id = c.id AND f.validation_state = 'PENDING_VALIDATION'),
                'conflitos', (SELECT count(*) FROM public.content_sports_fixtures f WHERE f.competition_id = c.id AND f.validation_state IN ('CONFLICT', 'SUSPICIOUS'))
            ) ORDER BY c.ordem), '[]'::jsonb) FROM public.content_sports_competitions c WHERE c.empresa_operadora_id IS NULL),
        'saude', (SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.competicao, h.fonte), '[]'::jsonb) FROM public.content_sports_source_health h),
        'execucoes', (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.started_at DESC), '[]'::jsonb) FROM (SELECT * FROM public.content_sports_runs ORDER BY started_at DESC LIMIT 10) r),
        'eventos', (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.at DESC), '[]'::jsonb) FROM (SELECT * FROM public.content_sports_events ORDER BY at DESC LIMIT 30) e),
        'noticias', (SELECT COALESCE(jsonb_agg(jsonb_build_object('fonte', s.nome, 'categoria', s.categoria, 'saude', s.health, 'ultimoSucesso', s.last_success_at,
                        'ultimaLeitura', s.last_fetch_at, 'erro', s.last_fetch_error,
                        'ativas', (SELECT count(*) FROM public.content_news_items n WHERE n.source_id = s.id AND n.status = 'ACTIVE'))), '[]'::jsonb)
                     FROM public.content_news_sources s WHERE s.empresa_operadora_id IS NULL)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_widget_esportes_dados(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_widget_noticias_dados(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_widget_config_resolvido(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_widget_pode_exibir(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_widget_suportado_no_aparelho(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.content_touch_widgets(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.content_touch_widgets(text) TO service_role;
REVOKE ALL ON FUNCTION public.content_esportes_preview(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.content_noticias_preview(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.content_sports_painel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_esportes_preview(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.content_noticias_preview(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.content_sports_painel() TO authenticated;

-- ------------------------------------------------------------------ 7. get_player_playlist_for_screen: + 1 filtro (W11), resto idêntico
CREATE OR REPLACE FUNCTION public.get_player_playlist_for_screen(p_identifier text, p_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_ctx RECORD;
    v_screen RECORD;
    v_playlist RECORD;
    v_items JSONB;
    v_screen_owner_empresa UUID;
    v_auth_uid UUID;
BEGIN
    v_auth_uid := auth.uid();

    -- 1. Extrair Seguranca e Contexto se autenticado
    IF v_auth_uid IS NOT NULL THEN
        SELECT u.empresa_operadora_id, p.nome AS cargo_nome INTO v_user_ctx
        FROM public.usuarios u
        LEFT JOIN public.perfis p ON u.perfil_id = p.id
        WHERE u.id = v_auth_uid;
    END IF;

    -- Validar que o device_id nao seja nulo ou UNKNOWN
    IF p_device_id IS NULL OR trim(p_device_id) = '' OR p_device_id = 'UNKNOWN_DEVICE' OR p_device_id = 'UNKNOWN' THEN
        RETURN '{"status": "DEVICE_ACCESS_DENIED", "message": "Identidade fisica de hardware invalida ou nao informada."}'::JSONB;
    END IF;

    -- 2. Fetch Screen
    SELECT * INTO v_screen
    FROM public.screens
    WHERE (custom_id ILIKE p_identifier OR (length(p_identifier) > 20 AND id::text = p_identifier));

    IF NOT FOUND THEN
        RETURN '{"status": "SCREEN_NOT_FOUND"}'::JSONB;
    END IF;

    IF NOT v_screen.is_active THEN
        RETURN '{"status": "SCREEN_SUSPENDED"}'::JSONB;
    END IF;

    -- 3. A. Bloqueio Financeiro Global de Contrato: Verificar se a tela pertence a um contrato SUSPENSO_FINANCEIRO
    IF v_screen.ponto_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM public.pontos po
            JOIN public.contrato_estabelecimentos ce ON (
                (ce.ponto_id IS NOT NULL AND ce.ponto_id = po.id)
                OR (ce.ponto_id IS NULL AND ce.unidade_id = po.unidade_id)
            )
            JOIN public.contratos c ON c.id = ce.contrato_id
            WHERE po.id = v_screen.ponto_id
              AND c.status_workflow = 'SUSPENSO_FINANCEIRO'
        ) THEN
            RETURN '{"status": "SCREEN_SUSPENDED", "message": "Tela bloqueada temporariamente (Suspensão Financeira)."}'::JSONB;
        END IF;

        -- 3. B. Trava Atômica de Expansão Pré-Pagamento (Hardened H1: P2.1 Desambiguação de Ponto + P2.2 Semântica CANCELADO + Tenant):
        -- Se o ponto/unidade foi adicionado via expansão cuja fatura contas_receber está em aberto (PENDENTE/VENCIDO), nega distribuição de playlist.
        IF EXISTS (
            SELECT 1
            FROM public.pontos po
            JOIN public.contrato_estabelecimentos ce ON (
                (ce.ponto_id IS NOT NULL AND ce.ponto_id = po.id)
                OR (ce.ponto_id IS NULL AND ce.unidade_id = po.unidade_id)
            )
            JOIN public.contas_receber cr ON cr.expansao_id = ce.expansao_id
            WHERE po.id = v_screen.ponto_id
              AND ce.expansao_id IS NOT NULL
              AND cr.empresa_operadora_id = v_screen.empresa_operadora_id
              AND cr.status IN ('PENDENTE', 'ABERTA', 'VENCIDO', 'VENCIDA', 'ATRASADO', 'ATRASADA', 'VENCENDO_HOJE', 'AGENDADA', 'PARCIAL', 'PARCIAL_PAGA')
        ) THEN
            RETURN '{"status": "SCREEN_SUSPENDED", "message": "Tela bloqueada temporariamente (Aguardando confirmação de pagamento da expansão)."}'::JSONB;
        END IF;
    END IF;

    -- 4. Screen Ownership Check (se autenticado e nao for OWNER/ADMIN)
    IF v_auth_uid IS NOT NULL THEN
        IF v_user_ctx.cargo_nome NOT IN ('OWNER', 'ADMIN') THEN
            IF v_screen.user_id = v_auth_uid THEN
                NULL;
            ELSIF v_screen.empresa_operadora_id IS NOT NULL AND v_screen.empresa_operadora_id = v_user_ctx.empresa_operadora_id THEN
                NULL;
            ELSE
                SELECT empresa_operadora_id INTO v_screen_owner_empresa
                FROM public.usuarios
                WHERE id = v_screen.user_id;

                IF v_screen_owner_empresa IS NOT NULL AND v_screen_owner_empresa != v_user_ctx.empresa_operadora_id THEN
                    RETURN '{"status": "SCREEN_ACCESS_DENIED"}'::JSONB;
                END IF;
            END IF;
        END IF;
    END IF;

    -- 5. Device Binding Check
    IF v_screen.bound_device_id IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.devices
            WHERE identity_hash = p_device_id
              AND revoked_at IS NOT NULL
        ) THEN
            RETURN '{"status": "DEVICE_REVOKED", "message": "O vinculo deste aparelho com esta tela foi revogado pelo administrador."}'::JSONB;
        END IF;

        PERFORM pg_advisory_xact_lock(hashtext('sobremidia:device:' || p_device_id));

        IF EXISTS (
            SELECT 1 FROM public.screens
            WHERE bound_device_id = p_device_id
              AND id <> v_screen.id
        ) THEN
            RETURN '{"status": "DEVICE_ALREADY_BOUND", "message": "Este aparelho ja esta vinculado a outra tela. Desvincule-o antes de parear em uma nova tela."}'::JSONB;
        END IF;

        UPDATE public.screens SET bound_device_id = p_device_id, last_ping_at = now() WHERE id = v_screen.id;

        IF EXISTS (SELECT 1 FROM public.devices WHERE identity_hash = p_device_id) THEN
            UPDATE public.devices
            SET screen_id = v_screen.id, last_seen = now()
            WHERE identity_hash = p_device_id;
        ELSE
            INSERT INTO public.devices (name, screen_id, identity_hash, revoked_at, last_seen)
            VALUES (COALESCE(v_screen.name, 'Player'), v_screen.id, p_device_id, NULL, now());
        END IF;
    ELSIF v_screen.bound_device_id = p_device_id THEN
        IF EXISTS (
            SELECT 1 FROM public.devices
            WHERE identity_hash = p_device_id
              AND revoked_at IS NOT NULL
        ) THEN
            RETURN '{"status": "DEVICE_REVOKED", "message": "O vinculo deste aparelho com esta tela foi revogado pelo administrador."}'::JSONB;
        END IF;

        UPDATE public.devices
        SET last_seen = now(), last_heartbeat = now()
        WHERE identity_hash = p_device_id;

        UPDATE public.screens SET last_ping_at = now() WHERE id = v_screen.id;
    ELSE
        RETURN '{"status": "DEVICE_ALREADY_BOUND"}'::JSONB;
    END IF;

    -- 6. Playlist Validation
    IF v_screen.playlist_id IS NULL THEN
        RETURN '{"status": "NO_PLAYLIST_ASSIGNED"}'::JSONB;
    END IF;

    SELECT * INTO v_playlist FROM public.playlists WHERE id = v_screen.playlist_id;

    IF NOT FOUND THEN
        RETURN '{"status": "PLAYLIST_NOT_FOUND"}'::JSONB;
    END IF;

    -- 7. Fetch Items & Build Payload
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', pi.id,
            'position', pi.position,
            'duration', pi.duration,
            'start_time', pi.start_time,
            'end_time', pi.end_time,
            'days_of_week', array_to_string(pi.days, ','),
            'media', (
                SELECT jsonb_build_object(
                    'id', m.id,
                    'name', m.name,
                    'file_url', m.file_url,
                    'file_type', m.file_type,
                    'file_hash', m.file_hash
                )
                FROM public.media m WHERE m.id = pi.media_id
            ),
            'widget', (
                SELECT jsonb_build_object(
                    'id', w.id,
                    'name', w.name,
                    'widget_type', w.widget_type,
                    'config', public.fn_widget_config_resolvido(w.widget_type, w.config)
                )
                FROM public.widgets w WHERE w.id = pi.widget_id
            )
        ) ORDER BY pi.position ASC
    ) INTO v_items
    FROM public.playlist_items pi
    WHERE pi.playlist_id = v_playlist.id
      -- W1: widget DESATIVADO no painel não vai para a tela (antes continuava tocando)
      AND NOT EXISTS (SELECT 1 FROM public.widgets w0 WHERE w0.id = pi.widget_id AND w0.is_active = false)
      -- W7: oferta fora do ar (status/datas de Brasília) ou sem itens não vai para a tela
      AND NOT EXISTS (SELECT 1 FROM public.widgets w7 WHERE w7.id = pi.widget_id AND NOT public.fn_widget_pode_exibir(w7.widget_type, w7.config))
      -- W11: tipo novo (sports) só para Player que sabe desenhá-lo (>= 5.6.0); aparelho antigo não recebe nem mostra aviso
      AND NOT EXISTS (SELECT 1 FROM public.widgets w11 WHERE w11.id = pi.widget_id AND NOT public.fn_widget_suportado_no_aparelho(w11.widget_type, p_device_id));

    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        RETURN '{"status": "PLAYLIST_EMPTY"}'::JSONB;
    END IF;

    -- 8. Return Payload
    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'data', jsonb_build_object(
            'id', v_screen.id,
            'name', v_screen.name,
            'custom_id', v_screen.custom_id,
            'is_active', v_screen.is_active,
            'playlist_id', v_screen.playlist_id,
            'orientation', v_screen.orientation,
            'resolution', v_screen.resolution,
            'playlists', jsonb_build_object(
                'id', v_playlist.id,
                'name', v_playlist.name,
                'resolution', v_playlist.resolution,
                'playlist_resolution', v_playlist.resolution,
                'audio_enabled', COALESCE(v_playlist.audio_enabled, false),
                'playlist_items', v_items
            )
        )
    );
END;
$function$;

-- ------------------------------------------------------------------ 8. Agenda (pg_cron -> pg_net -> Edge Functions), segredo no Vault
-- O segredo CONTENT_ENGINE_SECRET é criado fora da migração (vault.create_secret) e configurado nas Edge Functions.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('sports-engine-sync', 'news-engine-sync');
SELECT cron.schedule('sports-engine-sync', '*/15 * * * *', $cron$
    SELECT net.http_post(
        url := 'https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/sports-engine-sync',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
                   'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CONTENT_ENGINE_SECRET' LIMIT 1)),
        body := '{"trigger":"cron"}'::jsonb,
        timeout_milliseconds := 120000);
$cron$);
SELECT cron.schedule('news-engine-sync', '7,37 * * * *', $cron$
    SELECT net.http_post(
        url := 'https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/news-engine-sync',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
                   'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CONTENT_ENGINE_SECRET' LIMIT 1)),
        body := '{"trigger":"cron"}'::jsonb,
        timeout_milliseconds := 60000);
$cron$);
