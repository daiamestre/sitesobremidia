-- F-156 — Painel completo (modelo de referência, imagens 2 e 4): uma função só, de leitura, para o painel inteiro.
--   * telas online / hoje / offline;
--   * sincronização das mídias por tela (atualizado / baixando / pendente / sem informação) — vem do que o Player informa
--     no heartbeat (device_health.sync_status / media_count / pending_media_count); tela sem relatório = "sem informação";
--   * espaço de disco dos aparelhos (informado por eles) e espaço das mídias enviadas (nuvem);
--   * exibições dos últimos 30 dias contra os 30 anteriores;
--   * telas com sinal nos últimos 7 dias (média, pico e comparação com a semana anterior).
-- Só LEITURA e SEM SECURITY DEFINER: cada perfil enxerga só o que a segurança de linhas (RLS) já deixa ver nas suas telas.
-- Nada muda no Player: o contrato dele continua igual.

CREATE OR REPLACE FUNCTION public.fn_dashboard_completo(p_offline_min integer DEFAULT 10)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH ref AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje,
           date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' AS inicio_hoje
  ), telas AS (
    SELECT s.id, s.name, s.cidade, s.estado, s.playlist_id,
           greatest(s.last_ping_at, (SELECT max(d.last_heartbeat) FROM public.devices d
                                      WHERE d.screen_id = s.id AND d.revoked_at IS NULL AND d.identity_hash = s.bound_device_id)) AS sinal,
           h.sync_status, h.media_count, h.pending_media_count, h.last_sync_at, h.storage_used_mb, h.storage_total_mb
      FROM public.screens s
      LEFT JOIN LATERAL (
        SELECT dh.sync_status, dh.media_count, dh.pending_media_count, dh.last_sync_at, dh.storage_used_mb, dh.storage_total_mb
          FROM public.devices d JOIN public.device_health dh ON dh.device_id = d.id
         WHERE d.screen_id = s.id AND d.revoked_at IS NULL AND d.identity_hash = s.bound_device_id
         ORDER BY dh.recorded_at DESC NULLS LAST LIMIT 1) h ON true
  ), marcadas AS (
    SELECT t.*,
           (t.sinal IS NOT NULL AND t.sinal > now() - make_interval(mins => greatest(p_offline_min, 1))) AS online,
           (t.sinal IS NOT NULL AND t.sinal >= r.inicio_hoje) AS sinal_hoje
      FROM telas t CROSS JOIN ref r
  ), sinc AS (
    SELECT m.*,
           CASE WHEN NOT m.online THEN 'sem_info'
                WHEN upper(coalesce(m.sync_status, '')) IN ('UPDATED', 'SYNCED', 'OK', 'UP_TO_DATE') THEN 'atualizado'
                WHEN upper(coalesce(m.sync_status, '')) IN ('DOWNLOADING', 'SYNCING') THEN 'baixando'
                WHEN upper(coalesce(m.sync_status, '')) IN ('PENDING', 'OUTDATED', 'OUT_OF_DATE') OR coalesce(m.pending_media_count, 0) > 0 THEN 'pendente'
                ELSE 'sem_info' END AS estado_sync
      FROM marcadas m
  ), exib AS (
    SELECT x.dia, x.sid, sum(x.n)::bigint AS n
      FROM (
        SELECT (pl.started_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, pl.screen_id AS sid, count(*) AS n
          FROM public.playback_logs pl, ref r
         WHERE pl.started_at >= ((r.hoje - 60)::timestamp AT TIME ZONE 'America/Sao_Paulo')
           AND pl.screen_id IN (SELECT id::text FROM telas)
         GROUP BY 1, 2
        UNION ALL
        SELECT ed.dia, ed.screen_id, sum(ed.exibicoes)
          FROM public.exibicoes_diarias ed, ref r
         WHERE ed.dia >= r.hoje - 60 AND ed.screen_id IN (SELECT id::text FROM telas)
         GROUP BY 1, 2
      ) x
     GROUP BY 1, 2
  ), sinal_dia AS (
    SELECT e.dia, e.sid FROM exib e
    UNION
    SELECT (hb.created_at AT TIME ZONE 'America/Sao_Paulo')::date, hb.screen_id::text
      FROM public.player_heartbeats hb, ref r
     WHERE hb.created_at >= ((r.hoje - 14)::timestamp AT TIME ZONE 'America/Sao_Paulo')
       AND hb.screen_id IN (SELECT id FROM telas)
  ), presenca AS (
    SELECT d::date AS dia,
           (SELECT count(DISTINCT s.sid) FROM sinal_dia s WHERE s.dia = d::date) AS ligadas,
           (SELECT count(DISTINCT e.sid) FROM exib e WHERE e.dia = d::date) AS exibiram
      FROM ref r, generate_series(r.hoje - 13, r.hoje, interval '1 day') d
  ), por_dia AS (
    SELECT d::date AS dia, coalesce((SELECT sum(e.n) FROM exib e WHERE e.dia = d::date), 0)::bigint AS exibicoes
      FROM ref r, generate_series(r.hoje - 59, r.hoje, interval '1 day') d
  )
  SELECT jsonb_build_object(
    'gerado_em', now(),
    'telas', (SELECT jsonb_build_object('total', count(*), 'online', count(*) FILTER (WHERE online),
                                        'hoje', count(*) FILTER (WHERE NOT online AND sinal_hoje),
                                        'offline', count(*) FILTER (WHERE NOT online AND NOT sinal_hoje)) FROM marcadas),
    'sincronizacao', (SELECT jsonb_build_object('atualizado', count(*) FILTER (WHERE estado_sync = 'atualizado'),
                                                'baixando', count(*) FILTER (WHERE estado_sync = 'baixando'),
                                                'pendente', count(*) FILTER (WHERE estado_sync = 'pendente'),
                                                'sem_info', count(*) FILTER (WHERE estado_sync = 'sem_info'),
                                                'reportando', count(*) FILTER (WHERE sync_status IS NOT NULL OR media_count IS NOT NULL)) FROM sinc),
    'telas_sync', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'nome', name, 'cidade', cidade, 'uf', upper(nullif(btrim(estado), '')),
                                                                 'sync', estado_sync, 'online', online, 'pendentes', coalesce(pending_media_count, 0),
                                                                 'midias', coalesce(media_count, 0), 'ultimo_sync', coalesce(last_sync_at, sinal)) ORDER BY name)
                              FROM sinc), '[]'::jsonb),
    'desatualizados', coalesce((SELECT jsonb_agg(q ORDER BY (q->>'pendentes')::int DESC) FROM (
                                  SELECT jsonb_build_object('id', id, 'nome', name, 'sync', estado_sync, 'pendentes', coalesce(pending_media_count, 0),
                                                            'midias', coalesce(media_count, 0), 'ultimo_sync', coalesce(last_sync_at, sinal)) AS q
                                    FROM sinc WHERE estado_sync IN ('pendente', 'baixando')
                                   ORDER BY coalesce(pending_media_count, 0) DESC LIMIT 50) z), '[]'::jsonb),
    'disco', jsonb_build_object(
      'aparelhos', (SELECT count(*) FROM marcadas WHERE storage_total_mb > 0),
      'aparelhos_usado_mb', (SELECT coalesce(sum(storage_used_mb) FILTER (WHERE storage_total_mb > 0), 0) FROM marcadas),
      'aparelhos_total_mb', (SELECT coalesce(sum(storage_total_mb) FILTER (WHERE storage_total_mb > 0), 0) FROM marcadas),
      'nuvem_bytes', (SELECT coalesce(sum(m.file_size), 0) FROM public.media m WHERE NOT coalesce(m.biblioteca, false)),
      'nuvem_arquivos', (SELECT count(*) FROM public.media m WHERE NOT coalesce(m.biblioteca, false))),
    'exibicoes', (SELECT jsonb_build_object(
                    'atual', coalesce(sum(exibicoes) FILTER (WHERE dia > r.hoje - 30), 0),
                    'anterior', coalesce(sum(exibicoes) FILTER (WHERE dia <= r.hoje - 30), 0),
                    'por_dia', jsonb_agg(jsonb_build_object('dia', dia, 'n', exibicoes) ORDER BY dia) FILTER (WHERE dia > r.hoje - 30))
                    FROM por_dia, ref r GROUP BY r.hoje),
    'presenca', (SELECT jsonb_build_object(
                   'dias', jsonb_agg(jsonb_build_object('dia', dia, 'ligadas', ligadas, 'exibiram', exibiram) ORDER BY dia) FILTER (WHERE dia > r.hoje - 7),
                   'soma_atual', coalesce(sum(ligadas) FILTER (WHERE dia > r.hoje - 7), 0),
                   'soma_anterior', coalesce(sum(ligadas) FILTER (WHERE dia <= r.hoje - 7), 0))
                   FROM presenca, ref r GROUP BY r.hoje)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_dashboard_completo(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_completo(integer) TO authenticated;
