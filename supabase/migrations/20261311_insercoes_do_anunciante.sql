-- ======================================================================
-- SOBRE MÍDIA — MIGRAÇÃO 20261311 — F-165
-- Inserções do anunciante: UMA fonte de verdade para "quantas vezes o meu anúncio passou".
--
-- Achados (dados reais):
--   * O Player (Android e web) grava cada exibição em playback_logs só com screen_id + media_id.
--     contrato_id e agendamento_id ficam vazios (0 de 29.120 linhas). O KPI "Inserções" do início do portal
--     (get_kpis_portal_anunciante) só contava linhas com contrato_id => dava sempre 0.
--   * A tela "Inserções por Dia" não olhava exibição nenhuma: multiplicava os dias das agendas dos PIs => "0 inserções"
--     para quem anuncia por playlist/mídia própria, e números inventados para quem tem agenda.
--   * O card "Onde seu anúncio passa" (fn_portal_anunciante_vitrine) lia só playback_logs (a faxina resume e apaga o
--     que passa de 20 dias em exibicoes_diarias) e não enxergava o resumo permanente.
--
-- Agora:
--   * fn_anunciante_exibicoes_base(cliente, desde): exibições do anunciante por dia/tela/mídia = linhas recentes
--     (playback_logs) + resumo permanente (exibicoes_diarias). A exibição é do anunciante quando a mídia é dele
--     (mídia da campanha, enviada por usuário dele, item de playlist dele, anúncio em ponto) ou quando o registro
--     traz contrato/agendamento dele. Função interna: ninguém de fora chama (só as funções abaixo).
--   * fn_portal_anunciante_insercoes(dias): total, hoje, 7 dias, por dia (com mídias e locais), por anúncio, por local
--     (ponto parceiro x tela própria x tela da rede) e por campanha.
--   * get_kpis_portal_anunciante.insercoes e fn_portal_anunciante_vitrine passam a usar a mesma fonte => os números batem.
--
-- Player: nada muda (nenhuma função/tabela que o Player lê foi alterada).
-- ROLLBACK: restaurar get_kpis_portal_anunciante (20261034) e fn_portal_anunciante_vitrine (20261276);
--           DROP FUNCTION public.fn_portal_anunciante_insercoes(integer); DROP FUNCTION public.fn_anunciante_exibicoes_base(uuid, date);
-- ======================================================================

CREATE OR REPLACE FUNCTION public.fn_anunciante_exibicoes_base(p_cliente uuid, p_desde date)
RETURNS TABLE (dia date, screen_id text, media_id text, agendamento_id uuid, qtd bigint, ultima timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH
  meus_contratos AS (
    SELECT k.id FROM public.contratos k WHERE k.cliente_id = p_cliente AND k.deleted_at IS NULL
  ),
  minhas_campanhas AS (
    SELECT a.id, a.media_id FROM public.agendamentos a WHERE a.cliente_id = p_cliente AND a.deleted_at IS NULL
  ),
  minhas_midias AS (
    SELECT a.media_id::text AS id FROM minhas_campanhas a WHERE a.media_id IS NOT NULL
    UNION
    SELECT m.id::text FROM public.media m
      JOIN public.usuarios u ON u.id = m.user_id
     WHERE u.cliente_id = p_cliente
    UNION
    SELECT i.biblioteca_media_id::text FROM public.cliente_playlist_itens i
      JOIN public.playlists_cliente p ON p.id = i.playlist_id
     WHERE p.cliente_id = p_cliente AND i.biblioteca_media_id IS NOT NULL
    UNION
    SELECT pa.media_id::text FROM public.ponto_anuncios pa WHERE pa.cliente_id = p_cliente AND pa.media_id IS NOT NULL
  ),
  recentes AS (
    SELECT (pl.started_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           pl.screen_id,
           coalesce(pl.media_id, '') AS media_id,
           pl.agendamento_id,
           count(*)::bigint AS qtd,
           max(pl.started_at) AS ultima
      FROM public.playback_logs pl
     WHERE pl.started_at >= (p_desde::timestamp AT TIME ZONE 'America/Sao_Paulo')
       AND pl.screen_id IS NOT NULL
       AND (
         pl.media_id IN (SELECT id FROM minhas_midias)
         OR pl.agendamento_id IN (SELECT id FROM minhas_campanhas)
         OR pl.contrato_id IN (SELECT id FROM meus_contratos)
       )
     GROUP BY 1, 2, 3, 4
  ),
  antigas AS (
    -- o resumo só guarda o que a faxina já apagou de playback_logs => não conta em dobro
    SELECT ed.dia, ed.screen_id, ed.media_id, NULL::uuid AS agendamento_id, ed.exibicoes::bigint AS qtd, ed.ultima
      FROM public.exibicoes_diarias ed
     WHERE ed.dia >= p_desde
       AND ed.media_id IN (SELECT id FROM minhas_midias)
  )
  SELECT r.dia, r.screen_id, r.media_id, r.agendamento_id, r.qtd, r.ultima FROM recentes r
  UNION ALL
  SELECT a.dia, a.screen_id, a.media_id, a.agendamento_id, a.qtd, a.ultima FROM antigas a;
$$;
REVOKE ALL ON FUNCTION public.fn_anunciante_exibicoes_base(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_portal_anunciante_insercoes(p_dias integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cliente uuid := public.get_user_cliente_id();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_dias integer := least(greatest(coalesce(p_dias, 30), 1), 365);
  v_res jsonb;
BEGIN
  IF v_cliente IS NULL THEN
    RETURN jsonb_build_object('status', 'SEM_PERMISSAO');
  END IF;

  WITH
  base AS (
    SELECT e.dia, e.screen_id, e.media_id, e.agendamento_id, e.qtd, e.ultima
      FROM public.fn_anunciante_exibicoes_base(v_cliente, v_hoje - (v_dias - 1)) e
  ),
  -- cada exibição já com o local: ponto parceiro (p:), tela própria do anunciante (s:) ou tela da rede sem ponto (s:)
  loc AS (
    SELECT b.dia, b.media_id, b.agendamento_id, b.qtd, b.ultima, b.screen_id,
           CASE WHEN s.id IS NULL THEN 's:' || b.screen_id
                WHEN s.cliente_id = v_cliente THEN 's:' || s.id
                WHEN s.ponto_id IS NOT NULL THEN 'p:' || s.ponto_id
                ELSE 's:' || s.id END AS chave,
           CASE WHEN s.cliente_id = v_cliente THEN 'PROPRIA'
                WHEN s.ponto_id IS NOT NULL THEN 'PARCEIRO'
                ELSE 'REDE' END AS tipo,
           CASE WHEN s.id IS NULL THEN 'Tela removida'
                WHEN s.cliente_id IS DISTINCT FROM v_cliente AND s.ponto_id IS NOT NULL
                     THEN coalesce(po.nome, nullif(s.location, ''), s.name, 'Tela')
                ELSE coalesce(nullif(s.location, ''), s.name, 'Tela') END AS nome,
           CASE WHEN s.cliente_id IS DISTINCT FROM v_cliente THEN coalesce(po.cidade, s.cidade) ELSE s.cidade END AS cidade,
           coalesce(m.name, 'Mídia') AS midia_nome
      FROM base b
      LEFT JOIN public.screens s ON s.id::text = b.screen_id
      LEFT JOIN public.pontos po ON po.id = s.ponto_id
      LEFT JOIN public.media m ON m.id::text = b.media_id
  ),
  por_dia AS (
    SELECT d.dia, d.q,
           (SELECT jsonb_agg(jsonb_build_object('media_id', x.media_id, 'nome', x.nome, 'quantidade', x.q) ORDER BY x.q DESC, x.nome)
              FROM (SELECT l.media_id, l.midia_nome AS nome, sum(l.qtd)::bigint AS q FROM loc l WHERE l.dia = d.dia GROUP BY 1, 2) x) AS midias,
           (SELECT jsonb_agg(jsonb_build_object('chave', x.chave, 'nome', x.nome, 'tipo', x.tipo, 'cidade', x.cidade, 'quantidade', x.q) ORDER BY x.q DESC, x.nome)
              FROM (SELECT l.chave, l.nome, l.tipo, l.cidade, sum(l.qtd)::bigint AS q FROM loc l WHERE l.dia = d.dia GROUP BY 1, 2, 3, 4) x) AS locais
      FROM (SELECT l.dia, sum(l.qtd)::bigint AS q FROM loc l GROUP BY l.dia) d
  ),
  por_anuncio AS (
    SELECT l.media_id, l.midia_nome AS nome,
           sum(l.qtd)::bigint AS total,
           coalesce(sum(l.qtd) FILTER (WHERE l.dia = v_hoje), 0)::bigint AS hoje,
           coalesce(sum(l.qtd) FILTER (WHERE l.dia >= v_hoje - 6), 0)::bigint AS ultimos_7_dias,
           max(l.ultima) AS ultima,
           (SELECT jsonb_agg(jsonb_build_object('chave', y.chave, 'nome', y.nome, 'tipo', y.tipo, 'quantidade', y.q) ORDER BY y.q DESC, y.nome)
              FROM (SELECT l2.chave, l2.nome, l2.tipo, sum(l2.qtd)::bigint AS q FROM loc l2 WHERE l2.media_id = l.media_id GROUP BY 1, 2, 3) y) AS locais
      FROM loc l
     GROUP BY l.media_id, l.midia_nome
  ),
  por_local AS (
    SELECT l.chave, l.tipo, max(l.nome) AS nome, max(l.cidade) AS cidade,
           sum(l.qtd)::bigint AS total,
           coalesce(sum(l.qtd) FILTER (WHERE l.dia = v_hoje), 0)::bigint AS hoje,
           coalesce(sum(l.qtd) FILTER (WHERE l.dia >= v_hoje - 6), 0)::bigint AS ultimos_7_dias,
           max(l.ultima) AS ultima
      FROM loc l
     GROUP BY l.chave, l.tipo
  ),
  -- campanhas do portal (tabela campanhas): mídias das agendas do mesmo contrato
  camp_midias AS (
    SELECT DISTINCT c.id AS campanha_id, a.media_id::text AS media_id, a.id AS agendamento_id
      FROM public.campanhas c
      JOIN public.pedidos_insercao pi ON pi.contrato_id = c.contrato_id
      JOIN public.agendamentos a ON a.pedido_insercao_id = pi.id AND a.deleted_at IS NULL
     WHERE c.cliente_id = v_cliente
  ),
  camp_exib AS (
    SELECT k.campanha_id, l.dia, sum(l.qtd)::bigint AS q
      FROM (SELECT DISTINCT cm.campanha_id FROM camp_midias cm) k
      JOIN loc l ON EXISTS (
             SELECT 1 FROM camp_midias cm
              WHERE cm.campanha_id = k.campanha_id
                AND ((cm.media_id IS NOT NULL AND cm.media_id = l.media_id) OR cm.agendamento_id = l.agendamento_id))
     GROUP BY k.campanha_id, l.dia
  ),
  por_campanha AS (
    SELECT c.id, c.titulo, c.status,
           coalesce((SELECT sum(x.q) FROM camp_exib x WHERE x.campanha_id = c.id), 0)::bigint AS total,
           coalesce((SELECT jsonb_agg(jsonb_build_object('data', x.dia, 'quantidade', x.q) ORDER BY x.dia) FROM camp_exib x WHERE x.campanha_id = c.id), '[]'::jsonb) AS por_dia
      FROM public.campanhas c
     WHERE c.cliente_id = v_cliente
  )
  SELECT jsonb_build_object(
    'status', 'OK',
    'gerado_em', now(),
    'periodo_dias', v_dias,
    'total', (SELECT coalesce(sum(l.qtd), 0) FROM loc l),
    'hoje', (SELECT coalesce(sum(l.qtd), 0) FROM loc l WHERE l.dia = v_hoje),
    'ultimos_7_dias', (SELECT coalesce(sum(l.qtd), 0) FROM loc l WHERE l.dia >= v_hoje - 6),
    'ultima_exibicao', (SELECT max(l.ultima) FROM loc l),
    'por_dia', coalesce((SELECT jsonb_agg(jsonb_build_object('data', d.dia, 'quantidade', d.q, 'midias', coalesce(d.midias, '[]'::jsonb), 'locais', coalesce(d.locais, '[]'::jsonb)) ORDER BY d.dia) FROM por_dia d), '[]'::jsonb),
    'por_anuncio', coalesce((SELECT jsonb_agg(jsonb_build_object('media_id', a.media_id, 'nome', a.nome, 'total', a.total, 'hoje', a.hoje, 'ultimos_7_dias', a.ultimos_7_dias, 'ultima', a.ultima, 'locais', coalesce(a.locais, '[]'::jsonb)) ORDER BY a.total DESC, a.nome) FROM por_anuncio a), '[]'::jsonb),
    'por_local', coalesce((SELECT jsonb_agg(jsonb_build_object('chave', p.chave, 'tipo', p.tipo, 'nome', p.nome, 'cidade', p.cidade, 'total', p.total, 'hoje', p.hoje, 'ultimos_7_dias', p.ultimos_7_dias, 'ultima', p.ultima) ORDER BY p.total DESC, p.nome) FROM por_local p), '[]'::jsonb),
    'por_campanha', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'titulo', c.titulo, 'status', c.status, 'total', c.total, 'por_dia', c.por_dia) ORDER BY c.total DESC, c.titulo) FROM por_campanha c), '[]'::jsonb)
  ) INTO v_res;

  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_portal_anunciante_insercoes(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_portal_anunciante_insercoes(integer) TO authenticated;

-- KPI "Inserções" do início do portal: mesma fonte (últimos 30 dias)
CREATE OR REPLACE FUNCTION public.get_kpis_portal_anunciante()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_cliente UUID := public.get_user_cliente_id();
    v_tenant UUID;
    v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    result JSON;
BEGIN
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;
    SELECT empresa_operadora_id INTO v_tenant FROM public.clientes WHERE id = v_cliente;

    SELECT json_build_object(
        'meus_pontos', (
            SELECT COUNT(*)
            FROM public.pontos po
            JOIN public.contrato_estabelecimentos ce ON ce.unidade_id = po.unidade_id
            JOIN public.contratos k ON k.id = ce.contrato_id
            WHERE k.cliente_id = v_cliente
              AND po.ativo
              AND k.status_workflow IN ('EM_PRODUCAO','AGUARDANDO_APROVACAO','CAMPANHA_APROVADA','CAMPANHA_ATIVA')
        ),
        'campanhas_ativas', (
            SELECT COUNT(*) FROM public.campanhas
            WHERE cliente_id = v_cliente
              AND status IN ('APPROVED','ACTIVE','REVIEW')
        ),
        'midias_ativas', (
            SELECT COUNT(*) FROM public.cliente_assets
            WHERE cliente_id = v_cliente
        ),
        'playlists', (
            SELECT COUNT(*) FROM public.playlists_cliente
            WHERE cliente_id = v_cliente AND status = 'ATIVA'
        ),
        'pontos_para_anunciar', (
            SELECT COUNT(*) FROM public.pontos
            WHERE empresa_operadora_id = v_tenant
              AND ativo AND disponibilidade = 'DISPONIVEL' AND deleted_at IS NULL
        ),
        'insercoes', (
            SELECT COALESCE(SUM(e.qtd), 0)::int
            FROM public.fn_anunciante_exibicoes_base(v_cliente, v_hoje - 29) e
        ),
        'contratos_vigentes', (
            SELECT COUNT(*) FROM public.contratos
            WHERE cliente_id = v_cliente
              AND status_workflow IN ('EM_PRODUCAO','AGUARDANDO_APROVACAO','CAMPANHA_APROVADA','CAMPANHA_ATIVA')
        )
    ) INTO result;

    RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_kpis_portal_anunciante() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kpis_portal_anunciante() TO authenticated;

-- Card "Onde seu anúncio passa": mesma fonte (30 dias), com tela própria do anunciante
CREATE OR REPLACE FUNCTION public.fn_portal_anunciante_vitrine()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cliente uuid := public.get_user_cliente_id();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_res jsonb;
BEGIN
  IF v_cliente IS NULL THEN
    RETURN jsonb_build_object('status', 'SEM_PERMISSAO');
  END IF;

  WITH
  meus_contratos AS (
    SELECT k.id FROM public.contratos k
     WHERE k.cliente_id = v_cliente AND k.deleted_at IS NULL
  ),
  minhas_campanhas AS (
    SELECT a.* FROM public.agendamentos a
     WHERE a.cliente_id = v_cliente AND a.deleted_at IS NULL
  ),
  minhas_midias AS (
    SELECT a.media_id::text AS id FROM minhas_campanhas a WHERE a.media_id IS NOT NULL
    UNION
    SELECT m.id::text FROM public.media m
      JOIN public.usuarios u ON u.id = m.user_id
     WHERE u.cliente_id = v_cliente
    UNION
    SELECT i.biblioteca_media_id::text FROM public.cliente_playlist_itens i
      JOIN public.playlists_cliente p ON p.id = i.playlist_id
     WHERE p.cliente_id = v_cliente AND i.biblioteca_media_id IS NOT NULL
    UNION
    SELECT pa.media_id::text FROM public.ponto_anuncios pa WHERE pa.cliente_id = v_cliente
  ),
  -- F-165: exibições do anunciante vêm da fonte única (linhas recentes + resumo permanente), por dia
  exib AS (
    SELECT e.dia, e.screen_id, e.media_id, e.agendamento_id, e.qtd, e.ultima
      FROM public.fn_anunciante_exibicoes_base(v_cliente, v_hoje - 29) e
  ),
  -- chave do local: ponto parceiro (p:<id>) ou, sem ponto, a própria tela (s:<id>)
  exib_local AS (
    SELECT CASE WHEN s.ponto_id IS NOT NULL AND s.cliente_id IS DISTINCT FROM v_cliente THEN 'p:' || s.ponto_id ELSE 's:' || s.id END AS chave,
           CASE WHEN s.cliente_id IS DISTINCT FROM v_cliente THEN s.ponto_id END AS ponto_id,
           s.id AS screen_id, e.dia, e.ultima, e.qtd, e.agendamento_id, e.media_id
      FROM exib e
      JOIN public.screens s ON s.id::text = e.screen_id
  ),
  locais_origem AS (
    SELECT 'p:' || coalesce(ce.ponto_id, po.id) AS chave, coalesce(ce.ponto_id, po.id) AS ponto_id,
           NULL::uuid AS screen_id, 'CONTRATO' AS origem
      FROM public.contrato_estabelecimentos ce
      JOIN meus_contratos k ON k.id = ce.contrato_id
      LEFT JOIN public.pontos po ON ce.ponto_id IS NULL AND po.unidade_id = ce.unidade_id AND po.deleted_at IS NULL
     WHERE coalesce(ce.ativo, true) AND coalesce(ce.ponto_id, po.id) IS NOT NULL
    UNION
    SELECT 'p:' || cpp.ponto_id, cpp.ponto_id, NULL::uuid, 'PLAYLIST'
      FROM public.cliente_playlist_pontos cpp
      JOIN public.playlists_cliente p ON p.id = cpp.playlist_id
     WHERE p.cliente_id = v_cliente AND p.status = 'ATIVA'
    UNION
    SELECT CASE WHEN s.ponto_id IS NOT NULL AND s.cliente_id IS DISTINCT FROM v_cliente THEN 'p:' || s.ponto_id ELSE 's:' || s.id END,
           CASE WHEN s.cliente_id IS DISTINCT FROM v_cliente THEN s.ponto_id END,
           CASE WHEN s.ponto_id IS NULL OR s.cliente_id = v_cliente THEN s.id END, 'CAMPANHA'
      FROM public.agendamento_telas t
      JOIN minhas_campanhas a ON a.id = t.agendamento_id
      JOIN public.screens s ON s.id = t.screen_id
     WHERE a.fim >= now() AND upper(coalesce(a.status, '')) NOT IN ('CANCELADO', 'CANCELADA')
    UNION
    -- F-107: anúncio ATIVO em ponto parceiro
    SELECT 'p:' || pa.ponto_id, pa.ponto_id, NULL::uuid, 'ANUNCIO'
      FROM public.ponto_anuncios pa
     WHERE pa.cliente_id = v_cliente AND pa.status = 'ATIVO'
    UNION
    -- F-165: tela própria do anunciante
    SELECT 's:' || s.id, NULL::uuid, s.id, 'PROPRIA'
      FROM public.screens s
     WHERE s.cliente_id = v_cliente
    UNION
    SELECT DISTINCT chave, ponto_id, CASE WHEN ponto_id IS NULL THEN screen_id END, 'EXIBICAO'
      FROM exib_local
  ),
  locais AS (
    SELECT lo.chave,
           max(lo.ponto_id::text)::uuid AS ponto_id,
           max(lo.screen_id::text)::uuid AS screen_id,
           array_agg(DISTINCT lo.origem) AS origens
      FROM locais_origem lo
     GROUP BY lo.chave
  ),
  locais_json AS (
    SELECT jsonb_build_object(
             'chave', l.chave,
             'nome', coalesce(po.nome, nullif(s.location, ''), s.name, 'Tela'),
             'cidade', coalesce(po.cidade, s.cidade),
             'bairro', po.bairro,
             'categoria', po.categoria,
             'foto_url', po.foto_url,
             'origens', to_jsonb(l.origens),
             'tipo', CASE WHEN l.ponto_id IS NOT NULL THEN 'PARCEIRO' WHEN s.cliente_id = v_cliente THEN 'PROPRIA' ELSE 'REDE' END,
             'telas', CASE WHEN l.ponto_id IS NOT NULL
                           THEN (SELECT count(*) FROM public.screens x WHERE x.ponto_id = l.ponto_id)
                           ELSE 1 END,
             'telas_online', CASE WHEN l.ponto_id IS NOT NULL
                           THEN (SELECT count(*) FROM public.screens x WHERE x.ponto_id = l.ponto_id AND x.last_ping_at > now() - interval '5 minutes')
                           ELSE (SELECT count(*) FROM public.screens x WHERE x.id = l.screen_id AND x.last_ping_at > now() - interval '5 minutes') END,
             'exibicoes_hoje', (SELECT coalesce(sum(e.qtd), 0) FROM exib_local e WHERE e.chave = l.chave AND e.dia = v_hoje),
             'exibicoes_30d', (SELECT coalesce(sum(e.qtd), 0) FROM exib_local e WHERE e.chave = l.chave),
             'ultima_exibicao', (SELECT max(e.ultima) FROM exib_local e WHERE e.chave = l.chave)
           ) AS j
      FROM locais l
      LEFT JOIN public.pontos po ON po.id = l.ponto_id
      LEFT JOIN public.screens s ON s.id = l.screen_id
  ),
  campanhas_json AS (
    SELECT jsonb_build_object(
             'id', a.id,
             'titulo', a.titulo,
             'status', a.status,
             'inicio', a.inicio,
             'fim', a.fim,
             'no_ar', (now() BETWEEN a.inicio AND a.fim) AND upper(coalesce(a.status, '')) NOT IN ('CANCELADO', 'CANCELADA', 'PAUSADO'),
             'total_telas', a.total_telas,
             'pontos', coalesce((
               SELECT jsonb_agg(DISTINCT coalesce(po.nome, nullif(s.location, ''), s.name))
                 FROM public.agendamento_telas t
                 JOIN public.screens s ON s.id = t.screen_id
                 LEFT JOIN public.pontos po ON po.id = s.ponto_id
                WHERE t.agendamento_id = a.id), '[]'::jsonb),
             'exibicoes_30d', (SELECT coalesce(sum(e.qtd), 0) FROM exib e WHERE e.agendamento_id = a.id OR (a.media_id IS NOT NULL AND e.media_id = a.media_id::text))
           ) AS j,
           a.inicio
      FROM minhas_campanhas a
     WHERE a.fim >= now() - interval '30 days'
       AND upper(coalesce(a.status, '')) NOT IN ('CANCELADO', 'CANCELADA')
  )
  SELECT jsonb_build_object(
    'status', 'OK',
    'gerado_em', now(),
    'exibicoes', jsonb_build_object(
      'hoje', (SELECT coalesce(sum(e.qtd), 0) FROM exib e WHERE e.dia = v_hoje),
      'ultimos_7_dias', (SELECT coalesce(sum(e.qtd), 0) FROM exib e WHERE e.dia >= v_hoje - 6),
      'ultimos_30_dias', (SELECT coalesce(sum(e.qtd), 0) FROM exib e)
    ),
    'pontos', coalesce((SELECT jsonb_agg(j ORDER BY (j->>'exibicoes_30d')::int DESC, j->>'nome') FROM locais_json), '[]'::jsonb),
    'campanhas', coalesce((SELECT jsonb_agg(j ORDER BY (j->>'no_ar')::boolean DESC, inicio DESC) FROM campanhas_json), '[]'::jsonb)
  ) INTO v_res;

  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_portal_anunciante_vitrine() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_portal_anunciante_vitrine() TO authenticated;
