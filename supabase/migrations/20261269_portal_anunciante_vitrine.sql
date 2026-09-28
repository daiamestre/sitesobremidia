-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261269 — F-101
-- Portal do Anunciante: primeira vista focada em pontos parceiros,
-- exibições e campanhas; anunciante volta a ver os próprios contratos.
--
-- 1) contratos: a ctr_select_policy só reconhece o papel legado 'CLIENTE';
--    o anunciante (papel 'ANUNCIANTE') não via o próprio contrato em
--    "Contratos e Faturas". Nova policy aditiva, SÓ leitura, SÓ a própria
--    linha (mesmo padrão da 20261268 / cr_client_select_own).
--
-- 2) fn_portal_anunciante_vitrine(): uma chamada, só leitura, escopo
--    get_user_cliente_id() (SECURITY DEFINER; nunca vaza outro cliente).
--    Fontes reais (nenhum número inventado):
--      pontos onde anuncia = pontos do contrato (contrato_estabelecimentos)
--        ∪ pontos das playlists publicadas (cliente_playlist_pontos, ATIVA)
--        ∪ telas das campanhas (agendamento_telas → screens.ponto_id)
--        ∪ telas que exibiram anúncio do cliente nos últimos 30 dias;
--      exibição do cliente = playback_logs do contrato, da campanha ou de
--        mídia do cliente (mídia da campanha, enviada por usuário do cliente
--        ou item de playlist do cliente);
--      campanhas = agendamentos do cliente (não excluídos, ainda válidos).
--    Tela sem ponto parceiro aparece pelo nome da tela.
--
-- Player: nada muda (nenhuma função/tabela que o Player lê foi alterada).
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS ctr_select_proprio_cliente ON public.contratos;
--   DROP FUNCTION IF EXISTS public.fn_portal_anunciante_vitrine();
-- ======================================================================

DROP POLICY IF EXISTS ctr_select_proprio_cliente ON public.contratos;
CREATE POLICY ctr_select_proprio_cliente ON public.contratos
  FOR SELECT TO authenticated
  USING (
    cliente_id IS NOT NULL
    AND cliente_id = public.get_user_cliente_id()
    AND empresa_operadora_id = (
      SELECT u.empresa_operadora_id FROM public.usuarios u WHERE u.id = auth.uid() LIMIT 1
    )
  );

CREATE OR REPLACE FUNCTION public.fn_portal_anunciante_vitrine()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
  ),
  exib AS (
    SELECT pl.screen_id, pl.started_at, pl.agendamento_id
      FROM public.playback_logs pl
     WHERE pl.started_at > now() - interval '30 days'
       AND (
         pl.contrato_id IN (SELECT id FROM meus_contratos)
         OR pl.agendamento_id IN (SELECT id FROM minhas_campanhas)
         OR pl.media_id IN (SELECT id FROM minhas_midias)
       )
  ),
  -- chave do local: ponto parceiro (p:<id>) ou, sem ponto, a própria tela (s:<id>)
  exib_local AS (
    SELECT CASE WHEN s.ponto_id IS NOT NULL THEN 'p:' || s.ponto_id ELSE 's:' || s.id END AS chave,
           s.ponto_id, s.id AS screen_id, e.started_at, e.agendamento_id
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
    SELECT CASE WHEN s.ponto_id IS NOT NULL THEN 'p:' || s.ponto_id ELSE 's:' || s.id END,
           s.ponto_id, CASE WHEN s.ponto_id IS NULL THEN s.id END, 'CAMPANHA'
      FROM public.agendamento_telas t
      JOIN minhas_campanhas a ON a.id = t.agendamento_id
      JOIN public.screens s ON s.id = t.screen_id
     WHERE a.fim >= now() AND upper(coalesce(a.status, '')) NOT IN ('CANCELADO', 'CANCELADA')
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
             'telas', CASE WHEN l.ponto_id IS NOT NULL
                           THEN (SELECT count(*) FROM public.screens x WHERE x.ponto_id = l.ponto_id)
                           ELSE 1 END,
             'telas_online', CASE WHEN l.ponto_id IS NOT NULL
                           THEN (SELECT count(*) FROM public.screens x WHERE x.ponto_id = l.ponto_id AND x.last_ping_at > now() - interval '5 minutes')
                           ELSE (SELECT count(*) FROM public.screens x WHERE x.id = l.screen_id AND x.last_ping_at > now() - interval '5 minutes') END,
             'exibicoes_hoje', (SELECT count(*) FROM exib_local e WHERE e.chave = l.chave
                                  AND (e.started_at AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje),
             'exibicoes_30d', (SELECT count(*) FROM exib_local e WHERE e.chave = l.chave),
             'ultima_exibicao', (SELECT max(e.started_at) FROM exib_local e WHERE e.chave = l.chave)
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
             'exibicoes_30d', (SELECT count(*) FROM exib e WHERE e.agendamento_id = a.id)
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
      'hoje', (SELECT count(*) FROM exib e WHERE (e.started_at AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje),
      'ultimos_7_dias', (SELECT count(*) FROM exib e WHERE e.started_at > now() - interval '7 days'),
      'ultimos_30_dias', (SELECT count(*) FROM exib)
    ),
    'pontos', coalesce((SELECT jsonb_agg(j ORDER BY (j->>'exibicoes_30d')::int DESC, j->>'nome') FROM locais_json), '[]'::jsonb),
    'campanhas', coalesce((SELECT jsonb_agg(j ORDER BY (j->>'no_ar')::boolean DESC, inicio DESC) FROM campanhas_json), '[]'::jsonb)
  ) INTO v_res;

  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_portal_anunciante_vitrine() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_portal_anunciante_vitrine() TO authenticated;
