-- ======================================================================
-- SOBRE MÍDIA — MIGRAÇÃO 20261304 — F-147
-- Prova de exibição do Player WEB (inclusive por zona).
--
-- Achado: o Player web grava em playback_logs sem login (chave pública) e a tabela só aceita usuário autenticado —
-- toda gravação era recusada ("permission denied for table playback_logs"). O Player Android não é afetado (grava
-- com a sessão dele).
--
-- Correção sem abrir a tabela: função SECURITY DEFINER que só aceita registros do APARELHO VINCULADO à tela
-- (mesma identidade que get_player_playlist_for_screen já confere). A tabela continua fechada para anônimo.
--
-- ROLLBACK: DROP FUNCTION IF EXISTS public.fn_player_registrar_exibicoes(text, text, jsonb);
-- ======================================================================
CREATE OR REPLACE FUNCTION public.fn_player_registrar_exibicoes(p_identifier text, p_device_id text, p_registros jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tela public.screens%ROWTYPE;
  v_gravados integer := 0;
BEGIN
  IF p_device_id IS NULL OR btrim(p_device_id) = '' OR p_device_id IN ('UNKNOWN', 'UNKNOWN_DEVICE') THEN
    RETURN '{"status": "SEM_ACESSO", "gravados": 0}'::jsonb;
  END IF;
  IF p_identifier ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    SELECT * INTO v_tela FROM public.screens WHERE id = p_identifier::uuid;
  END IF;
  IF v_tela.id IS NULL THEN
    SELECT * INTO v_tela FROM public.screens WHERE custom_id = p_identifier LIMIT 1;
  END IF;
  IF v_tela.id IS NULL OR v_tela.bound_device_id IS DISTINCT FROM p_device_id THEN
    RETURN '{"status": "SEM_ACESSO", "gravados": 0}'::jsonb;
  END IF;
  IF jsonb_typeof(p_registros) IS DISTINCT FROM 'array' THEN
    RETURN '{"status": "INVALIDO", "gravados": 0}'::jsonb;
  END IF;

  INSERT INTO public.playback_logs (screen_id, media_id, playlist_id, started_at, duration, status, empresa_operadora_id, zona_id, zona_numero)
  SELECT v_tela.id::text, m.id::text, NULL, r.inicio, r.duracao, 'completed', v_tela.empresa_operadora_id, z.id, z.numero
    FROM (
      SELECT e->>'media_id' AS media,
             CASE WHEN e->>'started_at' ~ '^\d{4}-\d{2}-\d{2}T' THEN (e->>'started_at')::timestamptz END AS inicio,
             CASE WHEN e->>'duration' ~ '^\d{1,5}$' THEN LEAST(GREATEST((e->>'duration')::integer, 1), 3600) END AS duracao,
             CASE WHEN e->>'zona_id' ~ '^[0-9a-fA-F-]{36}$' THEN (e->>'zona_id')::uuid END AS zona
        FROM jsonb_array_elements(p_registros) WITH ORDINALITY AS t(e, n)
       WHERE n <= 200
    ) r
    JOIN public.media m ON m.id::text = r.media
    -- a zona só é aceita se for desta tela; senão o registro entra como tela cheia
    LEFT JOIN public.layout_zones z ON z.id = r.zona
          AND z.layout_id = (SELECT l.id FROM public.screen_layouts l WHERE l.screen_id = v_tela.id)
   WHERE r.inicio IS NOT NULL AND r.duracao IS NOT NULL
     AND r.inicio <= now() + interval '5 minutes' AND r.inicio >= now() - interval '7 days';
  GET DIAGNOSTICS v_gravados = ROW_COUNT;

  RETURN jsonb_build_object('status', 'SUCCESS', 'gravados', v_gravados);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_player_registrar_exibicoes(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_player_registrar_exibicoes(text, text, jsonb) TO anon, authenticated, service_role;
