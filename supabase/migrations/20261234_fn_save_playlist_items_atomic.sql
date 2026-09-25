-- Gravacao ATOMICA dos itens de uma playlist (painel: Lista de Reprodução da tela e editor da playlist).
--
-- Auditoria 2026-09-25 — o painel salvava com DELETE de todos os itens + INSERT em chamadas separadas:
--   * se o INSERT falhava depois do DELETE, a playlist ficava VAZIA (o Player recebia PLAYLIST_EMPTY);
--   * o INSERT omitia start_time/end_time/days: o agendamento nunca era gravado (0 de 35 itens tinham agenda) e cada
--     "Salvar" da tela APAGAVA agendamentos existentes;
--   * duracao 0/negativa era aceita.
-- Esta funcao faz tudo em UMA transacao (tudo ou nada), valida antes de apagar e grava agenda e duracao.
-- SECURITY INVOKER: as politicas RLS existentes de playlist_items/playlists continuam valendo (mesmas permissoes de antes).
CREATE OR REPLACE FUNCTION public.fn_save_playlist_items(p_playlist_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item     jsonb;
  v_ord      integer := 0;
  v_media    uuid;
  v_widget   uuid;
  v_link     uuid;
  v_dur      integer;
  v_start    time;
  v_end      time;
  v_days     integer[];
  v_day      integer;
  v_existing integer;
  v_deleted  integer;
  v_rows     jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid_items: esperado um array' USING ERRCODE = '22023';
  END IF;

  -- A RLS de SELECT em playlists decide se o chamador enxerga (e pode editar) esta playlist.
  PERFORM 1 FROM public.playlists WHERE id = p_playlist_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'playlist_not_found_or_denied' USING ERRCODE = '42501';
  END IF;

  -- 1) Valida e normaliza TUDO antes de apagar qualquer coisa.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_media  := NULLIF(v_item->>'media_id', '')::uuid;
    v_widget := NULLIF(v_item->>'widget_id', '')::uuid;
    v_link   := NULLIF(v_item->>'external_link_id', '')::uuid;
    IF (v_media IS NOT NULL)::int + (v_widget IS NOT NULL)::int + (v_link IS NOT NULL)::int <> 1 THEN
      RAISE EXCEPTION 'invalid_item_source: item % precisa de exatamente uma origem (midia, widget ou link)', v_ord + 1
        USING ERRCODE = '22023';
    END IF;

    v_dur := COALESCE(NULLIF(v_item->>'duration', '')::numeric, 10)::integer;
    v_dur := LEAST(GREATEST(v_dur, 1), 86400);           -- 1 s .. 24 h

    v_start := NULLIF(btrim(COALESCE(v_item->>'start_time', '')), '')::time;
    v_end   := NULLIF(btrim(COALESCE(v_item->>'end_time', '')), '')::time;

    v_days := NULL;
    IF v_item ? 'days' AND jsonb_typeof(v_item->'days') = 'array' AND jsonb_array_length(v_item->'days') > 0 THEN
      SELECT array_agg(DISTINCT (d)::integer ORDER BY (d)::integer) INTO v_days
      FROM jsonb_array_elements_text(v_item->'days') AS d;
      FOREACH v_day IN ARRAY v_days LOOP
        IF v_day < 0 OR v_day > 6 THEN
          RAISE EXCEPTION 'invalid_days: dia % fora de 0..6', v_day USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'media_id', v_media, 'widget_id', v_widget, 'external_link_id', v_link,
      'position', v_ord, 'duration', v_dur, 'start_time', v_start, 'end_time', v_end, 'days', v_days
    ));
    v_ord := v_ord + 1;
  END LOOP;

  -- 2) Troca atomica.
  SELECT count(*) INTO v_existing FROM public.playlist_items WHERE playlist_id = p_playlist_id;
  DELETE FROM public.playlist_items WHERE playlist_id = p_playlist_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted < v_existing THEN
    -- a RLS impediu de apagar tudo: aborta (a transacao inteira volta atras, nada e perdido)
    RAISE EXCEPTION 'delete_denied: sem permissao para alterar todos os itens desta playlist' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.playlist_items (playlist_id, media_id, widget_id, external_link_id, position, duration, start_time, end_time, days)
  SELECT p_playlist_id,
         (r->>'media_id')::uuid, (r->>'widget_id')::uuid, (r->>'external_link_id')::uuid,
         (r->>'position')::integer, (r->>'duration')::integer,
         (r->>'start_time')::time, (r->>'end_time')::time,
         CASE WHEN jsonb_typeof(r->'days') = 'array'
              THEN ARRAY(SELECT jsonb_array_elements_text(r->'days')::integer) END
  FROM jsonb_array_elements(v_rows) AS r;

  -- 3) Avisa o Player (Realtime em playlists).
  UPDATE public.playlists SET updated_at = now() WHERE id = p_playlist_id;

  RETURN jsonb_build_object('ok', true, 'count', v_ord);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_save_playlist_items(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_save_playlist_items(uuid, jsonb) TO authenticated;
