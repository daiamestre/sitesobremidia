-- ============================================================================================
-- 20261267 — Conteúdo automático com VÍDEO (Pexels) + pasta Vídeos Esporte — F-97
-- conteudo_auto_publicar passa a gravar a duração (duration_ms) e a miniatura do vídeo — o Player usa a duração
-- real (fn_media_duracao_item) para tocar o vídeo inteiro. A pasta "Vídeos Esporte" passa a ser abastecida pelo robô.
-- ROLLBACK: recriar conteudo_auto_publicar de 20261266; UPDATE biblioteca_pastas SET conteudo_automatico = NULL
--           WHERE conteudo_automatico = 'videos-esporte';
-- ============================================================================================

CREATE OR REPLACE FUNCTION public.conteudo_auto_publicar(p_conteudo text, p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pasta record; v_item jsonb; v_dono uuid; v_bi record; v_media uuid; v_ordem integer;
    v_chaves text[]; v_novos integer := 0; v_atualizados integer := 0; v_iguais integer := 0; v_removidos integer := 0;
    v_substituidos text[] := '{}'; v_pastas integer := 0;
BEGIN
    IF coalesce(p_conteudo, '') !~ '^[a-z][a-z0-9_-]{1,40}$' THEN RAISE EXCEPTION 'conteudo_invalido'; END IF;
    IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN RAISE EXCEPTION 'itens_invalidos'; END IF;
    -- validação antes de mexer em qualquer coisa
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
        IF coalesce(v_item->>'chave', '') !~ '^[a-z0-9:_-]{1,80}$'
           OR coalesce(v_item->>'url', '') !~ '^https://'
           OR coalesce(v_item->>'path', '') = ''
           OR coalesce(v_item->>'hash', '') = ''
           OR coalesce(v_item->>'nome', '') = ''
           OR coalesce(v_item->>'tipo', '') NOT IN ('image', 'video')
           OR coalesce(v_item->>'aspecto', '') NOT IN ('16x9', '9x16') THEN
            RAISE EXCEPTION 'item_invalido: %', left(v_item::text, 200);
        END IF;
    END LOOP;
    SELECT array_agg(v->>'chave') INTO v_chaves FROM jsonb_array_elements(p_itens) v;

    FOR v_pasta IN SELECT * FROM public.biblioteca_pastas WHERE conteudo_automatico = p_conteudo AND deleted_at IS NULL LOOP
        v_pastas := v_pastas + 1;
        SELECT u.id INTO v_dono FROM public.usuarios u
         WHERE u.empresa_operadora_id = v_pasta.empresa_operadora_id AND coalesce(u.is_owner, false)
         ORDER BY u.created_at LIMIT 1;
        v_dono := coalesce(v_dono, v_pasta.created_by);
        IF v_dono IS NULL THEN CONTINUE; END IF;
        v_ordem := 0;

        FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
            SELECT bi.id, bi.media_id, m.file_hash, m.file_path INTO v_bi
              FROM public.biblioteca_itens bi JOIN public.media m ON m.id = bi.media_id
             WHERE bi.pasta_id = v_pasta.id AND bi.deleted_at IS NULL AND ('auto:' || (v_item->>'chave')) = ANY (bi.tags)
             LIMIT 1;
            IF v_bi.id IS NULL THEN
                INSERT INTO public.media (user_id, name, file_path, file_url, file_type, file_size, mime_type, aspect_ratio, file_hash, biblioteca, thumbnail_url, duration_ms)
                VALUES (v_dono, v_item->>'nome', v_item->>'path', v_item->>'url', v_item->>'tipo',
                        coalesce((v_item->>'bytes')::bigint, 0), coalesce(v_item->>'mime', 'image/jpeg'), v_item->>'aspecto',
                        v_item->>'hash', true,
                        CASE WHEN v_item->>'tipo' = 'image' THEN v_item->>'url' WHEN coalesce(v_item->>'thumb', '') ~ '^https://' THEN v_item->>'thumb' END,
                        CASE WHEN (v_item->>'duracao_ms') ~ '^[0-9]{1,9}$' THEN (v_item->>'duracao_ms')::int END)
                RETURNING id INTO v_media;
                INSERT INTO public.biblioteca_itens (pasta_id, media_id, ordem, descricao, tags, created_by)
                VALUES (v_pasta.id, v_media, v_ordem, v_item->>'descricao',
                        ARRAY['auto:' || (v_item->>'chave'), 'conteudo:' || p_conteudo], v_dono);
                v_novos := v_novos + 1;
            ELSIF v_bi.file_hash IS DISTINCT FROM v_item->>'hash' THEN
                IF v_bi.file_path IS DISTINCT FROM v_item->>'path' THEN v_substituidos := v_substituidos || v_bi.file_path; END IF;
                UPDATE public.media SET name = v_item->>'nome', file_path = v_item->>'path', file_url = v_item->>'url',
                       file_size = coalesce((v_item->>'bytes')::bigint, file_size), aspect_ratio = v_item->>'aspecto',
                       file_hash = v_item->>'hash', file_type = v_item->>'tipo', mime_type = coalesce(v_item->>'mime', mime_type),
                       thumbnail_url = CASE WHEN v_item->>'tipo' = 'image' THEN v_item->>'url' WHEN coalesce(v_item->>'thumb', '') ~ '^https://' THEN v_item->>'thumb' ELSE thumbnail_url END,
                       duration_ms = CASE WHEN (v_item->>'duracao_ms') ~ '^[0-9]{1,9}$' THEN (v_item->>'duracao_ms')::int ELSE duration_ms END,
                       updated_at = now()
                 WHERE id = v_bi.media_id;
                -- o gatilho de biblioteca_itens "toca" as playlists que usam a pasta (o Player baixa o arquivo novo)
                UPDATE public.biblioteca_itens SET ordem = v_ordem, descricao = v_item->>'descricao', updated_at = now() WHERE id = v_bi.id;
                v_atualizados := v_atualizados + 1;
            ELSE
                UPDATE public.biblioteca_itens SET ordem = v_ordem WHERE id = v_bi.id AND ordem IS DISTINCT FROM v_ordem;
                v_iguais := v_iguais + 1;
            END IF;
            v_ordem := v_ordem + 1;
        END LOOP;

        -- F-95: conteúdo automático que deixou de existir (ex.: notícia antiga) sai da pasta DE VEZ: item apagado e a
        -- mídia também, com o arquivo devolvido para o robô apagar do R2 — a não ser que a mídia esteja em uso em alguma
        -- playlist ou em outra pasta (aí só o item sai). Itens colocados à mão (sem a tag 'auto:') nunca são tocados.
        FOR v_bi IN
            SELECT bi.id, bi.media_id, m.file_hash, m.file_path FROM public.biblioteca_itens bi JOIN public.media m ON m.id = bi.media_id
             WHERE bi.pasta_id = v_pasta.id
               AND EXISTS (SELECT 1 FROM unnest(bi.tags) t WHERE t LIKE 'auto:%')
               AND NOT EXISTS (SELECT 1 FROM unnest(bi.tags) t WHERE t = ANY (SELECT 'auto:' || c FROM unnest(v_chaves) c))
        LOOP
            DELETE FROM public.biblioteca_itens WHERE id = v_bi.id;
            IF NOT EXISTS (SELECT 1 FROM public.playlist_items WHERE media_id = v_bi.media_id)
               AND NOT EXISTS (SELECT 1 FROM public.cliente_playlist_itens WHERE biblioteca_media_id = v_bi.media_id)
               AND NOT EXISTS (SELECT 1 FROM public.biblioteca_itens WHERE media_id = v_bi.media_id) THEN
                DELETE FROM public.media WHERE id = v_bi.media_id;
                v_substituidos := v_substituidos || v_bi.file_path;
            END IF;
            v_removidos := v_removidos + 1;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object('pastas', v_pastas, 'novos', v_novos, 'atualizados', v_atualizados, 'iguais', v_iguais,
                              'removidos', v_removidos, 'substituidos', to_jsonb(v_substituidos));
END;
$$;

REVOKE ALL ON FUNCTION public.conteudo_auto_publicar(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conteudo_auto_publicar(text, jsonb) TO service_role;

UPDATE public.biblioteca_pastas SET conteudo_automatico = 'videos-esporte'
 WHERE deleted_at IS NULL AND conteudo_automatico IS NULL AND lower(btrim(nome)) = 'vídeos esporte'
   AND empresa_operadora_id = '7d62aaec-e24d-4273-b257-867183cf658c';
