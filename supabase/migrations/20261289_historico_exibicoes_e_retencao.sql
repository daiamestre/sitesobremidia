-- F-123 — Operação por meses/anos: comprovante de exibição permanente e históricos técnicos com limite.
-- Antes:
--   * playback_logs (uma linha por exibição) era apagada após 20 dias SEM guardar resumo: o comprovante de
--     exibição do anunciante sumia e os totais do painel encolhiam sozinhos.
--   * player_heartbeats (sinal de vida, ~860 linhas/tela/dia) e o histórico das rotinas agendadas nunca eram
--     limpos: com 100 telas seriam ~8 GB/ano só de sinal de vida.
--   * playback_logs tinha 10 índices, 5 deles repetidos (mais disco e gravação mais lenta a cada exibição).
-- Agora: antes de apagar, a faxina soma as exibições por dia/tela/mídia numa tabela pequena e permanente; os
-- relatórios somam "linhas recentes + resumo"; históricos técnicos têm prazo; índices repetidos saem.

CREATE TABLE IF NOT EXISTS public.exibicoes_diarias (
  dia date NOT NULL,                      -- dia no horário de Brasília
  screen_id text NOT NULL,                -- mesmo identificador gravado pelo Player em playback_logs
  media_id text NOT NULL DEFAULT '',
  exibicoes bigint NOT NULL DEFAULT 0,
  segundos bigint NOT NULL DEFAULT 0,
  primeira timestamptz,
  ultima timestamptz,
  PRIMARY KEY (dia, screen_id, media_id)
);
COMMENT ON TABLE public.exibicoes_diarias IS 'F-123: resumo permanente das exibições (por dia, tela e mídia) feito pela faxina antes de apagar playback_logs com mais de 20 dias.';
CREATE INDEX IF NOT EXISTS idx_exibicoes_diarias_tela_dia ON public.exibicoes_diarias (screen_id, dia);

ALTER TABLE public.exibicoes_diarias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exibicoes_diarias FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.exibicoes_diarias FROM authenticated;
GRANT SELECT ON public.exibicoes_diarias TO authenticated;
-- Lê quem já pode ler as exibições da tela (mesma regra de playback_logs). Ninguém grava pelo painel.
DROP POLICY IF EXISTS exibicoes_diarias_leitura ON public.exibicoes_diarias;
CREATE POLICY exibicoes_diarias_leitura ON public.exibicoes_diarias
  FOR SELECT TO authenticated USING (public.fn_player_can_access_screen_text(screen_id));

-- Faxina diária (03:00): resume e só então apaga — na mesma operação, sem perder nem contar em dobro.
CREATE OR REPLACE FUNCTION public.delete_old_logs()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  WITH apagadas AS (
    DELETE FROM public.playback_logs
     WHERE started_at < now() - interval '20 days'
    RETURNING screen_id, media_id, started_at, coalesce(duracao_segundos, duration, 0) AS seg
  ), resumo AS (
    SELECT (a.started_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           a.screen_id,
           coalesce(a.media_id, '') AS media_id,
           count(*) AS exibicoes,
           sum(greatest(a.seg, 0)) AS segundos,
           min(a.started_at) AS primeira,
           max(a.started_at) AS ultima
      FROM apagadas a
     WHERE a.screen_id IS NOT NULL
     GROUP BY 1, 2, 3
  )
  INSERT INTO public.exibicoes_diarias AS e (dia, screen_id, media_id, exibicoes, segundos, primeira, ultima)
  SELECT r.dia, r.screen_id, r.media_id, r.exibicoes, r.segundos, r.primeira, r.ultima FROM resumo r
  ON CONFLICT (dia, screen_id, media_id) DO UPDATE
     SET exibicoes = e.exibicoes + EXCLUDED.exibicoes,
         segundos  = e.segundos + EXCLUDED.segundos,
         primeira  = least(e.primeira, EXCLUDED.primeira),
         ultima    = greatest(e.ultima, EXCLUDED.ultima);

  -- históricos técnicos (o painel não lê o passado deles): prazo fixo
  DELETE FROM public.player_heartbeats WHERE ping_at < now() - interval '15 days';
  DELETE FROM public.device_telemetry WHERE recorded_at < now() - interval '30 days';
  DELETE FROM public.device_logs WHERE created_at < now() - interval '90 days';
  DELETE FROM public.monitoring_logs WHERE created_at < now() - interval '180 days';

  -- histórico das rotinas agendadas: uma falha aqui não pode impedir a faxina
  BEGIN
    DELETE FROM cron.job_run_details WHERE end_time < now() - interval '14 days';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'faxina: histórico das rotinas não foi limpo (%)', SQLERRM;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_old_logs() FROM PUBLIC, anon, authenticated;

-- Relatórios: linhas recentes + resumo permanente (o resumo só tem o que já foi apagado → não conta em dobro).
CREATE OR REPLACE FUNCTION public.fn_playback_totals(p_screen_ids text[])
RETURNS TABLE (screen_id text, total bigint, last_at timestamptz)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT x.screen_id, sum(x.total)::bigint AS total, max(x.last_at) AS last_at
    FROM (
      SELECT pl.screen_id, count(*)::bigint AS total, max(pl.started_at) AS last_at
        FROM public.playback_logs pl
       WHERE pl.screen_id = ANY (p_screen_ids)
       GROUP BY pl.screen_id
      UNION ALL
      SELECT ed.screen_id, sum(ed.exibicoes)::bigint, max(ed.ultima)
        FROM public.exibicoes_diarias ed
       WHERE ed.screen_id = ANY (p_screen_ids)
       GROUP BY ed.screen_id
    ) x
   GROUP BY x.screen_id;
$$;

CREATE OR REPLACE FUNCTION public.fn_playback_stats(p_screen_id text, p_from timestamptz, p_to timestamptz, p_bucket text DEFAULT 'day', p_tz text DEFAULT 'America/Sao_Paulo')
RETURNS TABLE (bucket timestamptz, total bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT x.bucket, sum(x.total)::bigint AS total
    FROM (
      SELECT (date_trunc(CASE WHEN p_bucket = 'hour' THEN 'hour' ELSE 'day' END, pl.started_at AT TIME ZONE p_tz)) AT TIME ZONE p_tz AS bucket,
             count(*)::bigint AS total
        FROM public.playback_logs pl
       WHERE pl.started_at >= p_from
         AND pl.started_at <= p_to
         AND (p_screen_id IS NULL OR pl.screen_id = p_screen_id)
       GROUP BY 1
      UNION ALL
      -- dias antigos (só no agrupamento por dia; por hora o resumo não tem o detalhe)
      SELECT (ed.dia::timestamp AT TIME ZONE p_tz) AS bucket, sum(ed.exibicoes)::bigint AS total
        FROM public.exibicoes_diarias ed
       WHERE p_bucket IS DISTINCT FROM 'hour'
         AND ed.dia >= (p_from AT TIME ZONE p_tz)::date
         AND ed.dia <= (p_to AT TIME ZONE p_tz)::date
         AND (p_screen_id IS NULL OR ed.screen_id = p_screen_id)
       GROUP BY 1
    ) x
   GROUP BY x.bucket
   ORDER BY x.bucket;
$$;

-- Índices repetidos de playback_logs (ficam: chave, started_at, (screen_id, started_at), player_id, agendamento_id).
DROP INDEX IF EXISTS public.idx_playback_logs_date_only;      -- igual a idx_playback_logs_started
DROP INDEX IF EXISTS public.idx_pbl_start;                    -- mesmo campo em ordem inversa (o índice é lido nos dois sentidos)
DROP INDEX IF EXISTS public.idx_logs_screen_started_at;       -- os três abaixo repetem idx_playback_logs_screen_date
DROP INDEX IF EXISTS public.idx_logs_screen_date;
DROP INDEX IF EXISTS public.idx_playback_logs_screen_started;
