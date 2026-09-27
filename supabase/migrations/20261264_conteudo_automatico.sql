-- ============================================================================================
-- 20261264 — Conteúdo automático nas pastas da Biblioteca (Loterias, Sorteios; demais pastas nas próximas etapas) — F-94
--
-- Pedido do proprietário: pastas que se atualizam sozinhas com conteúdo real (ex.: resultados e próximos sorteios da
-- Caixa), prontas para ir inteiras para a playlist (F-93).
--
-- Aditivo:
--   * biblioteca_pastas.conteudo_automatico: qual robô abastece a pasta ('loterias', 'sorteios', ...). NULL = pasta comum.
--     As pastas "Loterias" e "Sorteios" existentes são marcadas.
--   * conteudo_auto_publicar(p_conteudo, p_itens): chamada SÓ pela Edge Function conteudo-automatico (service_role).
--     Para cada pasta marcada com p_conteudo: item novo -> mídia da Biblioteca + item da pasta (tag 'auto:<chave>');
--     item existente com arquivo novo -> a MESMA mídia passa a apontar para o arquivo novo (playlists e pasta na
--     playlist continuam válidas; o Player baixa o novo pelo hash); chave que deixou de existir -> item vai para a
--     Lixeira. Itens colocados à mão na pasta nunca são tocados.
--     Dono da mídia: o Owner da empresa da pasta (senão quem criou a pasta).
--     Devolve os caminhos de arquivo substituídos (o robô apaga do R2).
--
-- ROLLBACK: DROP FUNCTION conteudo_auto_publicar(text, jsonb); ALTER TABLE biblioteca_pastas DROP COLUMN conteudo_automatico;
--           (mídias/itens criados ficam como conteúdo comum da Biblioteca; podem ser excluídos pela Lixeira).
-- ============================================================================================

ALTER TABLE public.biblioteca_pastas ADD COLUMN IF NOT EXISTS conteudo_automatico text;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_bp_conteudo_automatico') THEN
        ALTER TABLE public.biblioteca_pastas ADD CONSTRAINT ck_bp_conteudo_automatico
            CHECK (conteudo_automatico IS NULL OR conteudo_automatico ~ '^[a-z][a-z0-9_-]{1,40}$');
    END IF;
END $$;

UPDATE public.biblioteca_pastas SET conteudo_automatico = 'loterias'
 WHERE deleted_at IS NULL AND conteudo_automatico IS NULL AND lower(btrim(nome)) = 'loterias';
UPDATE public.biblioteca_pastas SET conteudo_automatico = 'sorteios'
 WHERE deleted_at IS NULL AND conteudo_automatico IS NULL AND lower(btrim(nome)) = 'sorteios';

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
                INSERT INTO public.media (user_id, name, file_path, file_url, file_type, file_size, mime_type, aspect_ratio, file_hash, biblioteca, thumbnail_url)
                VALUES (v_dono, v_item->>'nome', v_item->>'path', v_item->>'url', v_item->>'tipo',
                        coalesce((v_item->>'bytes')::bigint, 0), coalesce(v_item->>'mime', 'image/jpeg'), v_item->>'aspecto',
                        v_item->>'hash', true, CASE WHEN v_item->>'tipo' = 'image' THEN v_item->>'url' END)
                RETURNING id INTO v_media;
                INSERT INTO public.biblioteca_itens (pasta_id, media_id, ordem, descricao, tags, created_by)
                VALUES (v_pasta.id, v_media, v_ordem, v_item->>'descricao',
                        ARRAY['auto:' || (v_item->>'chave'), 'conteudo:' || p_conteudo], v_dono);
                v_novos := v_novos + 1;
            ELSIF v_bi.file_hash IS DISTINCT FROM v_item->>'hash' THEN
                IF v_bi.file_path IS DISTINCT FROM v_item->>'path' THEN v_substituidos := v_substituidos || v_bi.file_path; END IF;
                UPDATE public.media SET name = v_item->>'nome', file_path = v_item->>'path', file_url = v_item->>'url',
                       file_size = coalesce((v_item->>'bytes')::bigint, file_size), aspect_ratio = v_item->>'aspecto',
                       file_hash = v_item->>'hash', thumbnail_url = CASE WHEN v_item->>'tipo' = 'image' THEN v_item->>'url' ELSE thumbnail_url END,
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

        -- conteúdo automático que deixou de existir -> Lixeira (itens colocados à mão não têm a tag 'auto:')
        WITH sai AS (
            UPDATE public.biblioteca_itens bi SET deleted_at = now(), updated_at = now()
             WHERE bi.pasta_id = v_pasta.id AND bi.deleted_at IS NULL
               AND EXISTS (SELECT 1 FROM unnest(bi.tags) t WHERE t LIKE 'auto:%')
               AND NOT EXISTS (SELECT 1 FROM unnest(bi.tags) t WHERE t = ANY (SELECT 'auto:' || c FROM unnest(v_chaves) c))
            RETURNING 1)
        SELECT v_removidos + count(*) INTO v_removidos FROM sai;
    END LOOP;

    RETURN jsonb_build_object('pastas', v_pastas, 'novos', v_novos, 'atualizados', v_atualizados, 'iguais', v_iguais,
                              'removidos', v_removidos, 'substituidos', to_jsonb(v_substituidos));
END;
$$;

REVOKE ALL ON FUNCTION public.conteudo_auto_publicar(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conteudo_auto_publicar(text, jsonb) TO service_role;
