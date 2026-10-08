-- F-163 — Aposentar uma pasta de conteúdo automático (primeira: "Vídeos Esporte", conteudo_automatico = 'videos-esporte').
-- Decisão do proprietário (08/10/2026): a pasta deixa de existir e o robô para de buscar vídeos de esporte. As pastas
-- Esportes e Futebol (notícias esportivas) e os campeonatos NÃO são tocados.
--
-- conteudo_auto_aposentar(p_conteudo):
--   * só vale para conteúdos que estão na lista de aposentados abaixo (nunca apaga pasta qualquer por engano);
--   * tira a pasta das playlists que a usavam, apaga os itens da pasta e as mídias que NÃO estão em mais nenhum lugar
--     (outra pasta, playlist ou playlist de cliente), apaga a pasta de vez e devolve os caminhos dos arquivos no R2
--     para o robô apagá-los (o banco não mexe no armazenamento);
--   * pode ser chamada de novo sem efeito (sem pasta, devolve zeros);
--   * só o robô (service_role, via Edge Function conteudo-automatico) executa.
CREATE OR REPLACE FUNCTION public.conteudo_auto_aposentar(p_conteudo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pasta record; v_bi record; v_pl integer;
  v_aposentados constant text[] := ARRAY['videos-esporte'];
  v_pastas integer := 0; v_itens integer := 0; v_midias integer := 0; v_em_playlists integer := 0;
  v_arquivos text[] := '{}';
BEGIN
  IF p_conteudo IS NULL OR NOT (p_conteudo = ANY (v_aposentados)) THEN RAISE EXCEPTION 'conteudo_nao_aposentado'; END IF;

  FOR v_pasta IN SELECT id FROM public.biblioteca_pastas WHERE conteudo_automatico = p_conteudo LOOP
    v_pastas := v_pastas + 1;
    SELECT count(*) INTO v_pl FROM public.playlist_items WHERE biblioteca_pasta_id = v_pasta.id;
    v_em_playlists := v_em_playlists + v_pl;
    DELETE FROM public.playlist_items WHERE biblioteca_pasta_id = v_pasta.id;

    FOR v_bi IN
      SELECT bi.id, bi.media_id, m.file_path FROM public.biblioteca_itens bi LEFT JOIN public.media m ON m.id = bi.media_id
       WHERE bi.pasta_id = v_pasta.id
    LOOP
      DELETE FROM public.biblioteca_itens WHERE id = v_bi.id;
      v_itens := v_itens + 1;
      IF v_bi.media_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.playlist_items WHERE media_id = v_bi.media_id)
         AND NOT EXISTS (SELECT 1 FROM public.cliente_playlist_itens WHERE biblioteca_media_id = v_bi.media_id)
         AND NOT EXISTS (SELECT 1 FROM public.biblioteca_itens WHERE media_id = v_bi.media_id) THEN
        DELETE FROM public.media WHERE id = v_bi.media_id;
        v_midias := v_midias + 1;
        IF v_bi.file_path LIKE 'conteudo/%' THEN v_arquivos := v_arquivos || v_bi.file_path; END IF;
      END IF;
    END LOOP;

    DELETE FROM public.biblioteca_pastas WHERE id = v_pasta.id;
  END LOOP;

  RETURN jsonb_build_object('pastas', v_pastas, 'itens', v_itens, 'midias_apagadas', v_midias,
                            'tiradas_de_playlists', v_em_playlists, 'arquivos', to_jsonb(v_arquivos));
END;
$$;

REVOKE ALL ON FUNCTION public.conteudo_auto_aposentar(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conteudo_auto_aposentar(text) TO service_role;
