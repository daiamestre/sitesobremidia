-- BIBLIOTECA DE MÍDIAS (acervo oficial por empresa operadora) — integrada à cadeia EXISTENTE do Player.
--
-- Decisão (auditoria 2026-09-26): a única cadeia que chega ao Player é media -> playlist_items -> playlists -> screens.
-- Por isso o arquivo da Biblioteca É uma linha de public.media (marcada biblioteca = true): o Player não muda e nada é
-- duplicado (um vídeo em N playlists = 1 arquivo + N referências). A tabela antiga biblioteca_midias (vazia, sem pastas,
-- sem ligação com playlists) NÃO é usada nem alterada.
--
--   biblioteca_pastas  : pastas do acervo, por empresa (tenant), com Lixeira (deleted_at/deleted_by)
--   biblioteca_itens   : pasta <-> mídia (referência). Duplicar pasta = novas referências, sem copiar arquivo.
--   media.biblioteca   : a mídia é conteúdo oficial (some do "Minhas Mídias" de quem enviou; leitura para o tenant)
--   cliente_playlist_itens.biblioteca_media_id : o Anunciante usa a mídia da Biblioteca na playlist do portal por
--                        referência (sem virar cliente_asset); publicar_playlist_cliente entrega a mesma mídia ao Player.
--
-- Administração (criar/renomear/duplicar/excluir/restaurar pasta, enviar/editar/mover/excluir mídia): só OWNER/ADMIN do
-- próprio tenant (fn_biblioteca_admin), checado no BANCO (RLS + RPC), não só na tela.
-- Consumo (ver, buscar, adicionar à playlist/tela): qualquer usuário do tenant, só nas playlists/telas que já pode editar.
--
-- ROLLBACK (na ordem):
--   recriar publicar_playlist_cliente com a definição anterior (join interno em cliente_assets);
--   DROP FUNCTION das funções biblioteca_* e fn_biblioteca_* / fn_media_biblioteca_*; DROP TRIGGER tr_media_biblioteca_protege ON media;
--   DROP POLICY media_biblioteca_select ON media;
--   ALTER TABLE cliente_playlist_itens DROP CONSTRAINT cpi_origem_unica, DROP COLUMN biblioteca_media_id; (só se não houver itens da Biblioteca)
--   DROP TABLE biblioteca_itens, biblioteca_pastas; ALTER TABLE media DROP COLUMN biblioteca;

-- ============================================================ estrutura
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS biblioteca boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.biblioteca_pastas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id uuid NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
    nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 80),
    descricao text,
    ordem integer NOT NULL DEFAULT 0,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    deleted_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_biblioteca_pastas_nome_ativa
    ON public.biblioteca_pastas (empresa_operadora_id, lower(btrim(nome))) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_biblioteca_pastas_tenant ON public.biblioteca_pastas (empresa_operadora_id, deleted_at);

CREATE TABLE IF NOT EXISTS public.biblioteca_itens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pasta_id uuid NOT NULL REFERENCES public.biblioteca_pastas(id) ON DELETE CASCADE,
    media_id uuid NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
    ordem integer NOT NULL DEFAULT 0,
    descricao text,
    tags text[] NOT NULL DEFAULT '{}',
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    deleted_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_biblioteca_itens_pasta_media_ativo
    ON public.biblioteca_itens (pasta_id, media_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_biblioteca_itens_media ON public.biblioteca_itens (media_id);
CREATE INDEX IF NOT EXISTS ix_biblioteca_itens_pasta ON public.biblioteca_itens (pasta_id, deleted_at);

-- Item da playlist do portal: exatamente UMA origem (mídia própria do anunciante OU mídia da Biblioteca).
ALTER TABLE public.cliente_playlist_itens ALTER COLUMN asset_id DROP NOT NULL;
ALTER TABLE public.cliente_playlist_itens ADD COLUMN IF NOT EXISTS biblioteca_media_id uuid REFERENCES public.media(id) ON DELETE RESTRICT;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cpi_origem_unica') THEN
        ALTER TABLE public.cliente_playlist_itens ADD CONSTRAINT cpi_origem_unica CHECK (num_nonnulls(asset_id, biblioteca_media_id) = 1);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS ix_cpi_biblioteca_media ON public.cliente_playlist_itens (biblioteca_media_id) WHERE biblioteca_media_id IS NOT NULL;

-- ============================================================ quem é quem
CREATE OR REPLACE FUNCTION public.fn_biblioteca_tenant()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT public.get_user_empresa_operadora_id(auth.uid());
$$;

-- OWNER / ADMIN (perfil) do tenant — ou papel admin da plataforma. Fonte oficial do perfil: usuarios.perfil / is_owner.
CREATE OR REPLACE FUNCTION public.fn_biblioteca_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT auth.uid() IS NOT NULL AND public.fn_biblioteca_tenant() IS NOT NULL AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR EXISTS (
            SELECT 1 FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id
            WHERE u.id = auth.uid() AND (u.is_owner OR upper(coalesce(p.nome, '')) IN ('OWNER', 'ADMIN'))
        )
    );
$$;

-- A mídia é da Biblioteca do tenant de quem pergunta (mesmo que esteja na Lixeira: playlists que já a usam continuam lendo).
CREATE OR REPLACE FUNCTION public.fn_media_biblioteca_visivel(p_media_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.biblioteca_itens i JOIN public.biblioteca_pastas p ON p.id = i.pasta_id
        WHERE i.media_id = p_media_id AND p.empresa_operadora_id = public.fn_biblioteca_tenant()
    );
$$;

-- A mídia está DISPONÍVEL para novo uso (item e pasta fora da Lixeira, no tenant de quem pergunta).
CREATE OR REPLACE FUNCTION public.fn_media_biblioteca_disponivel(p_media_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.biblioteca_itens i JOIN public.biblioteca_pastas p ON p.id = i.pasta_id
        JOIN public.media m ON m.id = i.media_id
        WHERE i.media_id = p_media_id AND m.biblioteca
          AND i.deleted_at IS NULL AND p.deleted_at IS NULL
          AND p.empresa_operadora_id = public.fn_biblioteca_tenant()
    );
$$;

-- Duração do item na playlist a partir da mídia (vídeo/áudio = duração real arredondada para cima; imagem = 10 s).
CREATE OR REPLACE FUNCTION public.fn_media_duracao_item(p_media_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT GREATEST(1, CASE
        WHEN m.file_type IN ('video', 'audio') AND m.duration_ms IS NOT NULL THEN ceil(m.duration_ms / 1000.0)::int
        WHEN m.file_type IN ('video', 'audio') THEN 15
        ELSE 10 END)
    FROM public.media m WHERE m.id = p_media_id;
$$;

-- ============================================================ RLS
ALTER TABLE public.biblioteca_pastas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biblioteca_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bp_select ON public.biblioteca_pastas;
CREATE POLICY bp_select ON public.biblioteca_pastas FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.fn_biblioteca_tenant() AND (deleted_at IS NULL OR public.fn_biblioteca_admin()));
DROP POLICY IF EXISTS bp_admin_insert ON public.biblioteca_pastas;
CREATE POLICY bp_admin_insert ON public.biblioteca_pastas FOR INSERT TO authenticated
    WITH CHECK (empresa_operadora_id = public.fn_biblioteca_tenant() AND public.fn_biblioteca_admin());
DROP POLICY IF EXISTS bp_admin_update ON public.biblioteca_pastas;
CREATE POLICY bp_admin_update ON public.biblioteca_pastas FOR UPDATE TO authenticated
    USING (empresa_operadora_id = public.fn_biblioteca_tenant() AND public.fn_biblioteca_admin())
    WITH CHECK (empresa_operadora_id = public.fn_biblioteca_tenant() AND public.fn_biblioteca_admin());
DROP POLICY IF EXISTS bp_admin_delete ON public.biblioteca_pastas;
CREATE POLICY bp_admin_delete ON public.biblioteca_pastas FOR DELETE TO authenticated
    USING (empresa_operadora_id = public.fn_biblioteca_tenant() AND public.fn_biblioteca_admin());

DROP POLICY IF EXISTS bi_select ON public.biblioteca_itens;
CREATE POLICY bi_select ON public.biblioteca_itens FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.biblioteca_pastas p WHERE p.id = biblioteca_itens.pasta_id
                   AND p.empresa_operadora_id = public.fn_biblioteca_tenant()
                   AND ((p.deleted_at IS NULL AND biblioteca_itens.deleted_at IS NULL) OR public.fn_biblioteca_admin())));
DROP POLICY IF EXISTS bi_admin_insert ON public.biblioteca_itens;
CREATE POLICY bi_admin_insert ON public.biblioteca_itens FOR INSERT TO authenticated
    WITH CHECK (public.fn_biblioteca_admin() AND EXISTS (SELECT 1 FROM public.biblioteca_pastas p
                WHERE p.id = biblioteca_itens.pasta_id AND p.empresa_operadora_id = public.fn_biblioteca_tenant()));
DROP POLICY IF EXISTS bi_admin_update ON public.biblioteca_itens;
CREATE POLICY bi_admin_update ON public.biblioteca_itens FOR UPDATE TO authenticated
    USING (public.fn_biblioteca_admin() AND EXISTS (SELECT 1 FROM public.biblioteca_pastas p
           WHERE p.id = biblioteca_itens.pasta_id AND p.empresa_operadora_id = public.fn_biblioteca_tenant()))
    WITH CHECK (public.fn_biblioteca_admin() AND EXISTS (SELECT 1 FROM public.biblioteca_pastas p
           WHERE p.id = biblioteca_itens.pasta_id AND p.empresa_operadora_id = public.fn_biblioteca_tenant()));
DROP POLICY IF EXISTS bi_admin_delete ON public.biblioteca_itens;
CREATE POLICY bi_admin_delete ON public.biblioteca_itens FOR DELETE TO authenticated
    USING (public.fn_biblioteca_admin() AND EXISTS (SELECT 1 FROM public.biblioteca_pastas p
           WHERE p.id = biblioteca_itens.pasta_id AND p.empresa_operadora_id = public.fn_biblioteca_tenant()));

-- Mídia da Biblioteca: leitura para o tenant (as políticas existentes de "dono" continuam valendo para o resto).
DROP POLICY IF EXISTS media_biblioteca_select ON public.media;
CREATE POLICY media_biblioteca_select ON public.media FOR SELECT TO authenticated
    USING (biblioteca AND public.fn_media_biblioteca_visivel(id));

-- Mídia da Biblioteca em uso numa playlist não pode ser apagada de verdade (evita sumir das telas em silêncio;
-- o ON DELETE CASCADE de playlist_items apagaria o item de todas as playlists).
CREATE OR REPLACE FUNCTION public.fn_media_biblioteca_protege()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_usos integer;
BEGIN
    IF OLD.biblioteca THEN
        SELECT (SELECT count(*) FROM public.playlist_items WHERE media_id = OLD.id)
             + (SELECT count(*) FROM public.cliente_playlist_itens WHERE biblioteca_media_id = OLD.id) INTO v_usos;
        IF v_usos > 0 THEN
            RAISE EXCEPTION 'midia_em_uso: a mídia da Biblioteca está em % item(ns) de playlist', v_usos USING ERRCODE = '23503';
        END IF;
    END IF;
    RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS tr_media_biblioteca_protege ON public.media;
CREATE TRIGGER tr_media_biblioteca_protege BEFORE DELETE ON public.media
    FOR EACH ROW EXECUTE FUNCTION public.fn_media_biblioteca_protege();

-- ============================================================ leitura (RLS decide)
CREATE OR REPLACE FUNCTION public.biblioteca_listar_pastas()
RETURNS TABLE (id uuid, nome text, descricao text, ordem integer, total bigint, videos bigint, imagens bigint, capa_url text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
    SELECT p.id, p.nome, p.descricao, p.ordem,
           count(i.id), count(i.id) FILTER (WHERE m.file_type = 'video'), count(i.id) FILTER (WHERE m.file_type = 'image'),
           (array_agg(coalesce(m.thumbnail_url, CASE WHEN m.file_type = 'image' THEN m.file_url END) ORDER BY i.ordem, i.created_at)
               FILTER (WHERE m.thumbnail_url IS NOT NULL OR m.file_type = 'image'))[1]
    FROM public.biblioteca_pastas p
    LEFT JOIN public.biblioteca_itens i ON i.pasta_id = p.id AND i.deleted_at IS NULL
    LEFT JOIN public.media m ON m.id = i.media_id
    WHERE p.deleted_at IS NULL
    GROUP BY p.id
    ORDER BY p.ordem, lower(p.nome);
$$;

-- Busca global ou dentro da pasta: nome da mídia, pasta, tags, descrição e tipo. Mostra a origem (pasta).
CREATE OR REPLACE FUNCTION public.biblioteca_buscar(p_busca text DEFAULT NULL, p_tipo text DEFAULT NULL, p_pasta_id uuid DEFAULT NULL,
                                                   p_limite integer DEFAULT 60, p_offset integer DEFAULT 0)
RETURNS TABLE (item_id uuid, media_id uuid, nome text, file_type text, file_url text, thumbnail_url text, duration_ms integer,
               mime_type text, file_size bigint, aspect_ratio text, pasta_id uuid, pasta_nome text, tags text[], descricao text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
    SELECT i.id, m.id, m.name, m.file_type, m.file_url, m.thumbnail_url, m.duration_ms, m.mime_type, m.file_size, m.aspect_ratio,
           p.id, p.nome, i.tags, i.descricao, i.created_at
    FROM public.biblioteca_itens i
    JOIN public.biblioteca_pastas p ON p.id = i.pasta_id
    JOIN public.media m ON m.id = i.media_id
    WHERE i.deleted_at IS NULL AND p.deleted_at IS NULL
      AND (p_pasta_id IS NULL OR p.id = p_pasta_id)
      AND (p_tipo IS NULL OR p_tipo = '' OR m.file_type = p_tipo)
      AND (coalesce(btrim(p_busca), '') = '' OR (
            m.name ILIKE '%' || btrim(p_busca) || '%' OR p.nome ILIKE '%' || btrim(p_busca) || '%'
            OR coalesce(i.descricao, '') ILIKE '%' || btrim(p_busca) || '%' OR m.file_type ILIKE btrim(p_busca)
            OR EXISTS (SELECT 1 FROM unnest(i.tags) t WHERE t ILIKE '%' || btrim(p_busca) || '%')))
    ORDER BY p.ordem, lower(p.nome), i.ordem, lower(m.name)
    LIMIT LEAST(GREATEST(coalesce(p_limite, 60), 1), 200) OFFSET GREATEST(coalesce(p_offset, 0), 0);
$$;

-- ============================================================ administração (OWNER/ADMIN do tenant; checagem explícita)
CREATE OR REPLACE FUNCTION public.fn_biblioteca_exigir_admin()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_tenant();
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
    IF v_tenant IS NULL OR NOT public.fn_biblioteca_admin() THEN
        RAISE EXCEPTION 'sem_permissao: apenas Owner/ADM administram a Biblioteca' USING ERRCODE = '42501';
    END IF;
    RETURN v_tenant;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_biblioteca_nome_valido(p_nome text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
BEGIN
    IF v = '' THEN RAISE EXCEPTION 'nome_vazio: informe o nome da pasta' USING ERRCODE = '22023'; END IF;
    IF char_length(v) > 80 THEN RAISE EXCEPTION 'nome_longo: use até 80 caracteres' USING ERRCODE = '22023'; END IF;
    IF v ~ '[\\/<>:"|?*[:cntrl:]]' THEN RAISE EXCEPTION 'nome_invalido: não use \ / < > : " | ? *' USING ERRCODE = '22023'; END IF;
    RETURN v;
END;
$$;

-- nome livre no tenant: "Nome", "Nome (2)", "Nome (3)"...
CREATE OR REPLACE FUNCTION public.fn_biblioteca_nome_livre(p_tenant uuid, p_nome text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v text := p_nome; n integer := 1;
BEGIN
    WHILE EXISTS (SELECT 1 FROM public.biblioteca_pastas WHERE empresa_operadora_id = p_tenant AND deleted_at IS NULL
                  AND lower(btrim(nome)) = lower(btrim(v))) LOOP
        n := n + 1; v := left(p_nome, 74) || ' (' || n || ')';
    END LOOP;
    RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.biblioteca_criar_pasta(p_nome text, p_descricao text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_exigir_admin(); v_nome text := public.fn_biblioteca_nome_valido(p_nome); v_id uuid;
BEGIN
    IF EXISTS (SELECT 1 FROM public.biblioteca_pastas WHERE empresa_operadora_id = v_tenant AND deleted_at IS NULL
               AND lower(btrim(nome)) = lower(v_nome)) THEN
        RAISE EXCEPTION 'nome_duplicado: já existe uma pasta com esse nome' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.biblioteca_pastas (empresa_operadora_id, nome, descricao, ordem, created_by)
    VALUES (v_tenant, v_nome, nullif(btrim(coalesce(p_descricao, '')), ''),
            coalesce((SELECT max(ordem) + 1 FROM public.biblioteca_pastas WHERE empresa_operadora_id = v_tenant), 0), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.biblioteca_renomear_pasta(p_pasta_id uuid, p_nome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_exigir_admin(); v_nome text := public.fn_biblioteca_nome_valido(p_nome);
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.biblioteca_pastas WHERE id = p_pasta_id AND empresa_operadora_id = v_tenant AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'pasta_nao_encontrada' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM public.biblioteca_pastas WHERE empresa_operadora_id = v_tenant AND deleted_at IS NULL AND id <> p_pasta_id
               AND lower(btrim(nome)) = lower(v_nome)) THEN
        RAISE EXCEPTION 'nome_duplicado: já existe uma pasta com esse nome' USING ERRCODE = '23505';
    END IF;
    UPDATE public.biblioteca_pastas SET nome = v_nome, updated_at = now() WHERE id = p_pasta_id;
END;
$$;

-- Duplicar = nova pasta + NOVAS REFERÊNCIAS às mesmas mídias (nenhum arquivo copiado). Tudo numa transação.
CREATE OR REPLACE FUNCTION public.biblioteca_duplicar_pasta(p_pasta_id uuid, p_nome text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_exigir_admin(); v_origem public.biblioteca_pastas; v_nome text; v_id uuid;
BEGIN
    SELECT * INTO v_origem FROM public.biblioteca_pastas WHERE id = p_pasta_id AND empresa_operadora_id = v_tenant AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'pasta_nao_encontrada' USING ERRCODE = 'P0002'; END IF;
    IF p_nome IS NOT NULL AND btrim(p_nome) <> '' THEN
        v_nome := public.fn_biblioteca_nome_valido(p_nome);
        IF EXISTS (SELECT 1 FROM public.biblioteca_pastas WHERE empresa_operadora_id = v_tenant AND deleted_at IS NULL
                   AND lower(btrim(nome)) = lower(v_nome)) THEN
            RAISE EXCEPTION 'nome_duplicado: já existe uma pasta com esse nome' USING ERRCODE = '23505';
        END IF;
    ELSE
        v_nome := public.fn_biblioteca_nome_livre(v_tenant, left(v_origem.nome, 72) || ' - Cópia');
    END IF;
    INSERT INTO public.biblioteca_pastas (empresa_operadora_id, nome, descricao, ordem, created_by)
    VALUES (v_tenant, v_nome, v_origem.descricao, v_origem.ordem, auth.uid()) RETURNING id INTO v_id;
    INSERT INTO public.biblioteca_itens (pasta_id, media_id, ordem, descricao, tags, created_by)
    SELECT v_id, media_id, ordem, descricao, tags, auth.uid() FROM public.biblioteca_itens
    WHERE pasta_id = p_pasta_id AND deleted_at IS NULL;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.biblioteca_excluir_pasta(p_pasta_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_exigir_admin();
BEGIN
    UPDATE public.biblioteca_pastas SET deleted_at = now(), deleted_by = auth.uid(), updated_at = now()
    WHERE id = p_pasta_id AND empresa_operadora_id = v_tenant AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'pasta_nao_encontrada' USING ERRCODE = 'P0002'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.biblioteca_restaurar_pasta(p_pasta_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_exigir_admin(); v_p public.biblioteca_pastas; v_nome text;
BEGIN
    SELECT * INTO v_p FROM public.biblioteca_pastas WHERE id = p_pasta_id AND empresa_operadora_id = v_tenant AND deleted_at IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'pasta_nao_encontrada_na_lixeira' USING ERRCODE = 'P0002'; END IF;
    v_nome := public.fn_biblioteca_nome_livre(v_tenant, v_p.nome);  -- nome em uso por outra pasta: "Nome (2)"
    UPDATE public.biblioteca_pastas SET deleted_at = NULL, deleted_by = NULL, nome = v_nome, updated_at = now() WHERE id = p_pasta_id;
    RETURN v_nome;
END;
$$;

-- Remove de vez as referências apagadas e as mídias que ficaram órfãs e sem uso (devolve as chaves para limpar no R2).
CREATE OR REPLACE FUNCTION public.fn_biblioteca_purgar_midias(p_media_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_m record; v_chaves text[] := '{}'; v_em_uso integer := 0;
BEGIN
    FOR v_m IN SELECT m.id, m.file_path, m.thumbnail_url FROM public.media m WHERE m.id = ANY (p_media_ids) AND m.biblioteca LOOP
        IF EXISTS (SELECT 1 FROM public.biblioteca_itens WHERE media_id = v_m.id) THEN CONTINUE; END IF;  -- ainda em outra pasta
        IF EXISTS (SELECT 1 FROM public.playlist_items WHERE media_id = v_m.id)
           OR EXISTS (SELECT 1 FROM public.cliente_playlist_itens WHERE biblioteca_media_id = v_m.id) THEN
            v_em_uso := v_em_uso + 1; CONTINUE;  -- preservada: playlists continuam tocando
        END IF;
        DELETE FROM public.media WHERE id = v_m.id;
        v_chaves := v_chaves || v_m.file_path;
        IF v_m.thumbnail_url IS NOT NULL AND v_m.thumbnail_url ~ '/thumbnails/' THEN
            v_chaves := v_chaves || ('thumbnails/' || split_part(v_m.thumbnail_url, '/thumbnails/', 2));
        END IF;
    END LOOP;
    RETURN jsonb_build_object('chaves_r2', to_jsonb(v_chaves), 'preservadas_em_uso', v_em_uso);
END;
$$;

CREATE OR REPLACE FUNCTION public.biblioteca_excluir_pasta_definitivo(p_pasta_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_exigir_admin(); v_midias uuid[];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.biblioteca_pastas WHERE id = p_pasta_id AND empresa_operadora_id = v_tenant AND deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'pasta_nao_esta_na_lixeira' USING ERRCODE = 'P0002';
    END IF;
    SELECT coalesce(array_agg(media_id), '{}') INTO v_midias FROM public.biblioteca_itens WHERE pasta_id = p_pasta_id;
    DELETE FROM public.biblioteca_pastas WHERE id = p_pasta_id;  -- itens vão junto (cascade)
    RETURN public.fn_biblioteca_purgar_midias(v_midias);
END;
$$;

-- Envio: as mídias recém-enviadas pelo admin (upload normal, mesmo R2) passam a ser da Biblioteca e entram na pasta.
CREATE OR REPLACE FUNCTION public.biblioteca_vincular_midias(p_pasta_id uuid, p_media_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_exigir_admin(); v_id uuid; v_n integer := 0; v_ordem integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.biblioteca_pastas WHERE id = p_pasta_id AND empresa_operadora_id = v_tenant AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'pasta_nao_encontrada' USING ERRCODE = 'P0002';
    END IF;
    SELECT coalesce(max(ordem) + 1, 0) INTO v_ordem FROM public.biblioteca_itens WHERE pasta_id = p_pasta_id;
    FOREACH v_id IN ARRAY coalesce(p_media_ids, '{}') LOOP
        -- só a própria mídia (acabou de enviar) ou uma que já é da Biblioteca deste tenant
        IF NOT EXISTS (SELECT 1 FROM public.media m WHERE m.id = v_id
                       AND (m.user_id = auth.uid() OR (m.biblioteca AND public.fn_media_biblioteca_visivel(m.id)))) THEN
            RAISE EXCEPTION 'midia_fora_do_escopo: %', v_id USING ERRCODE = '42501';
        END IF;
        UPDATE public.media SET biblioteca = true, updated_at = now() WHERE id = v_id AND NOT biblioteca;
        IF NOT EXISTS (SELECT 1 FROM public.biblioteca_itens WHERE pasta_id = p_pasta_id AND media_id = v_id AND deleted_at IS NULL) THEN
            INSERT INTO public.biblioteca_itens (pasta_id, media_id, ordem, created_by) VALUES (p_pasta_id, v_id, v_ordem, auth.uid());
            v_ordem := v_ordem + 1; v_n := v_n + 1;
        END IF;
    END LOOP;
    RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_biblioteca_item_do_tenant(p_item_id uuid, p_tenant uuid, p_na_lixeira boolean)
RETURNS public.biblioteca_itens LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.biblioteca_itens;
BEGIN
    SELECT i.* INTO v FROM public.biblioteca_itens i JOIN public.biblioteca_pastas p ON p.id = i.pasta_id
    WHERE i.id = p_item_id AND p.empresa_operadora_id = p_tenant
      AND ((p_na_lixeira AND i.deleted_at IS NOT NULL) OR (NOT p_na_lixeira AND i.deleted_at IS NULL));
    IF NOT FOUND THEN RAISE EXCEPTION 'midia_nao_encontrada' USING ERRCODE = 'P0002'; END IF;
    RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.biblioteca_editar_item(p_item_id uuid, p_titulo text, p_descricao text DEFAULT NULL, p_tags text[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_exigir_admin(); v public.biblioteca_itens;
BEGIN
    v := public.fn_biblioteca_item_do_tenant(p_item_id, v_tenant, false);
    IF p_titulo IS NOT NULL THEN
        IF btrim(p_titulo) = '' THEN RAISE EXCEPTION 'titulo_vazio' USING ERRCODE = '22023'; END IF;
        UPDATE public.media SET name = left(btrim(p_titulo), 200), updated_at = now() WHERE id = v.media_id AND biblioteca;
    END IF;
    UPDATE public.biblioteca_itens SET
        descricao = CASE WHEN p_descricao IS NULL THEN descricao ELSE nullif(btrim(p_descricao), '') END,
        tags = CASE WHEN p_tags IS NULL THEN tags
                    ELSE ARRAY(SELECT DISTINCT lower(btrim(t)) FROM unnest(p_tags) t WHERE btrim(t) <> '') END,
        updated_at = now()
    WHERE id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.biblioteca_mover_item(p_item_id uuid, p_pasta_destino uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_exigir_admin(); v public.biblioteca_itens;
BEGIN
    v := public.fn_biblioteca_item_do_tenant(p_item_id, v_tenant, false);
    IF NOT EXISTS (SELECT 1 FROM public.biblioteca_pastas WHERE id = p_pasta_destino AND empresa_operadora_id = v_tenant AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'pasta_destino_nao_encontrada' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM public.biblioteca_itens WHERE pasta_id = p_pasta_destino AND media_id = v.media_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'ja_existe_no_destino: a mídia já está nessa pasta' USING ERRCODE = '23505';
    END IF;
    UPDATE public.biblioteca_itens SET pasta_id = p_pasta_destino,
        ordem = coalesce((SELECT max(ordem) + 1 FROM public.biblioteca_itens WHERE pasta_id = p_pasta_destino), 0), updated_at = now()
    WHERE id = p_item_id;
END;
$$;

-- "Duplicar mídia" = a mesma mídia referenciada em outra pasta (sem copiar o arquivo).
CREATE OR REPLACE FUNCTION public.biblioteca_copiar_item(p_item_id uuid, p_pasta_destino uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_exigir_admin(); v public.biblioteca_itens; v_id uuid;
BEGIN
    v := public.fn_biblioteca_item_do_tenant(p_item_id, v_tenant, false);
    IF NOT EXISTS (SELECT 1 FROM public.biblioteca_pastas WHERE id = p_pasta_destino AND empresa_operadora_id = v_tenant AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'pasta_destino_nao_encontrada' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM public.biblioteca_itens WHERE pasta_id = p_pasta_destino AND media_id = v.media_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'ja_existe_no_destino: a mídia já está nessa pasta' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.biblioteca_itens (pasta_id, media_id, ordem, descricao, tags, created_by)
    VALUES (p_pasta_destino, v.media_id, coalesce((SELECT max(ordem) + 1 FROM public.biblioteca_itens WHERE pasta_id = p_pasta_destino), 0),
            v.descricao, v.tags, auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.biblioteca_excluir_item(p_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_exigir_admin(); v public.biblioteca_itens;
BEGIN
    v := public.fn_biblioteca_item_do_tenant(p_item_id, v_tenant, false);
    UPDATE public.biblioteca_itens SET deleted_at = now(), deleted_by = auth.uid(), updated_at = now() WHERE id = v.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.biblioteca_restaurar_item(p_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_exigir_admin(); v public.biblioteca_itens;
BEGIN
    v := public.fn_biblioteca_item_do_tenant(p_item_id, v_tenant, true);
    IF EXISTS (SELECT 1 FROM public.biblioteca_pastas WHERE id = v.pasta_id AND deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'pasta_na_lixeira: restaure primeiro a pasta' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.biblioteca_itens WHERE pasta_id = v.pasta_id AND media_id = v.media_id AND deleted_at IS NULL) THEN
        DELETE FROM public.biblioteca_itens WHERE id = v.id;  -- a mesma mídia já voltou para a pasta
        RETURN;
    END IF;
    UPDATE public.biblioteca_itens SET deleted_at = NULL, deleted_by = NULL, updated_at = now() WHERE id = v.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.biblioteca_excluir_item_definitivo(p_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_exigir_admin(); v public.biblioteca_itens;
BEGIN
    v := public.fn_biblioteca_item_do_tenant(p_item_id, v_tenant, true);
    DELETE FROM public.biblioteca_itens WHERE id = v.id;
    RETURN public.fn_biblioteca_purgar_midias(ARRAY[v.media_id]);
END;
$$;

CREATE OR REPLACE FUNCTION public.biblioteca_lixeira()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_exigir_admin();
BEGIN
    RETURN jsonb_build_object(
        'pastas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'deleted_at', p.deleted_at,
                  'total', (SELECT count(*) FROM public.biblioteca_itens i WHERE i.pasta_id = p.id AND i.deleted_at IS NULL)) ORDER BY p.deleted_at DESC)
                  FROM public.biblioteca_pastas p WHERE p.empresa_operadora_id = v_tenant AND p.deleted_at IS NOT NULL), '[]'::jsonb),
        'midias', coalesce((SELECT jsonb_agg(jsonb_build_object('item_id', i.id, 'nome', m.name, 'file_type', m.file_type,
                  'thumbnail_url', m.thumbnail_url, 'file_url', m.file_url, 'pasta_id', p.id, 'pasta_nome', p.nome,
                  'pasta_na_lixeira', p.deleted_at IS NOT NULL, 'deleted_at', i.deleted_at,
                  'usos', (SELECT count(*) FROM public.playlist_items pi WHERE pi.media_id = m.id)
                        + (SELECT count(*) FROM public.cliente_playlist_itens c WHERE c.biblioteca_media_id = m.id)) ORDER BY i.deleted_at DESC)
                  FROM public.biblioteca_itens i JOIN public.biblioteca_pastas p ON p.id = i.pasta_id JOIN public.media m ON m.id = i.media_id
                  WHERE p.empresa_operadora_id = v_tenant AND i.deleted_at IS NOT NULL), '[]'::jsonb)
    );
END;
$$;

-- ============================================================ consumo — painel (Gestor/Owner/ADM): playlists e telas PRÓPRIAS
-- SECURITY INVOKER: a RLS existente de playlists/playlist_items/screens decide; aqui só se restringe ainda mais.
CREATE OR REPLACE FUNCTION public.biblioteca_minhas_playlists(p_busca text DEFAULT NULL, p_limite integer DEFAULT 20)
RETURNS TABLE (id uuid, nome text, itens bigint, telas bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
    SELECT p.id, p.name, (SELECT count(*) FROM public.playlist_items i WHERE i.playlist_id = p.id),
           (SELECT count(*) FROM public.screens s WHERE s.playlist_id = p.id)
    FROM public.playlists p
    WHERE p.user_id = auth.uid() AND (coalesce(btrim(p_busca), '') = '' OR p.name ILIKE '%' || btrim(p_busca) || '%')
    ORDER BY lower(p.name)
    LIMIT LEAST(GREATEST(coalesce(p_limite, 20), 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.biblioteca_adicionar_playlists(p_media_id uuid, p_playlist_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_pid uuid; v_dur integer; v_ok integer := 0; v_recusadas jsonb := '[]'::jsonb;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
    IF NOT public.fn_media_biblioteca_disponivel(p_media_id) THEN
        RAISE EXCEPTION 'midia_indisponivel: mídia da Biblioteca indisponível' USING ERRCODE = '42501';
    END IF;
    v_dur := public.fn_media_duracao_item(p_media_id);
    FOREACH v_pid IN ARRAY coalesce(p_playlist_ids, '{}') LOOP
        IF NOT EXISTS (SELECT 1 FROM public.playlists WHERE id = v_pid AND user_id = auth.uid()) THEN
            v_recusadas := v_recusadas || jsonb_build_object('id', v_pid, 'motivo', 'sem permissão nesta playlist');
            CONTINUE;
        END IF;
        INSERT INTO public.playlist_items (playlist_id, media_id, position, duration)
        VALUES (v_pid, p_media_id, coalesce((SELECT max(position) + 1 FROM public.playlist_items WHERE playlist_id = v_pid), 0), v_dur);
        UPDATE public.playlists SET updated_at = now() WHERE id = v_pid;  -- Realtime -> Player ressincroniza
        v_ok := v_ok + 1;
    END LOOP;
    RETURN jsonb_build_object('adicionadas', v_ok, 'recusadas', v_recusadas);
END;
$$;

-- Telas que o usuário pode abastecer: as próprias (Owner/ADM: as do tenant). Mostra se a tela aceita a mídia.
CREATE OR REPLACE FUNCTION public.biblioteca_minhas_telas(p_busca text DEFAULT NULL, p_limite integer DEFAULT 30)
RETURNS TABLE (id uuid, nome text, ativa boolean, playlist_id uuid, playlist_nome text, pode_adicionar boolean, motivo text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
    SELECT s.id, s.name, s.is_active, s.playlist_id, pl.name,
           (s.playlist_id IS NULL OR pl.user_id = auth.uid()),
           CASE WHEN s.playlist_id IS NULL THEN 'Sem playlist: será criada uma playlist para esta tela'
                WHEN pl.user_id = auth.uid() THEN NULL
                ELSE 'A tela usa a playlist de outro responsável' END
    FROM public.screens s
    LEFT JOIN public.playlists pl ON pl.id = s.playlist_id
    WHERE (s.user_id = auth.uid() OR (public.fn_biblioteca_admin() AND s.empresa_operadora_id = public.fn_biblioteca_tenant()))
      AND (coalesce(btrim(p_busca), '') = '' OR s.name ILIKE '%' || btrim(p_busca) || '%')
    ORDER BY lower(s.name)
    LIMIT LEAST(GREATEST(coalesce(p_limite, 30), 1), 60);
$$;

-- "Adicionar à Tela" pelo mecanismo EXISTENTE: entra na playlist da tela (se for sua) ou numa playlist nova ligada à tela.
CREATE OR REPLACE FUNCTION public.biblioteca_adicionar_telas(p_media_id uuid, p_screen_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_sid uuid; v_s record; v_pid uuid; v_dur integer; v_ok integer := 0; v_recusadas jsonb := '[]'::jsonb; v_detalhe jsonb := '[]'::jsonb;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
    IF NOT public.fn_media_biblioteca_disponivel(p_media_id) THEN
        RAISE EXCEPTION 'midia_indisponivel: mídia da Biblioteca indisponível' USING ERRCODE = '42501';
    END IF;
    v_dur := public.fn_media_duracao_item(p_media_id);
    FOREACH v_sid IN ARRAY coalesce(p_screen_ids, '{}') LOOP
        SELECT s.id, s.name, s.playlist_id, pl.user_id AS dono INTO v_s
        FROM public.screens s LEFT JOIN public.playlists pl ON pl.id = s.playlist_id
        WHERE s.id = v_sid AND (s.user_id = auth.uid() OR (public.fn_biblioteca_admin() AND s.empresa_operadora_id = public.fn_biblioteca_tenant()));
        IF NOT FOUND THEN
            v_recusadas := v_recusadas || jsonb_build_object('id', v_sid, 'motivo', 'tela fora do seu acesso'); CONTINUE;
        END IF;
        IF v_s.playlist_id IS NULL THEN
            INSERT INTO public.playlists (user_id, name, description, is_active)
            VALUES (auth.uid(), 'Tela ' || v_s.name, 'Criada pela Biblioteca de Mídias', true) RETURNING id INTO v_pid;
            UPDATE public.screens SET playlist_id = v_pid WHERE id = v_sid;
            IF NOT FOUND THEN RAISE EXCEPTION 'sem_permissao_tela: %', v_s.name USING ERRCODE = '42501'; END IF;
            v_detalhe := v_detalhe || jsonb_build_object('tela', v_s.name, 'acao', 'playlist criada e ligada à tela');
        ELSIF v_s.dono = auth.uid() THEN
            v_pid := v_s.playlist_id;
            v_detalhe := v_detalhe || jsonb_build_object('tela', v_s.name, 'acao', 'adicionada à playlist da tela');
        ELSE
            v_recusadas := v_recusadas || jsonb_build_object('id', v_sid, 'tela', v_s.name, 'motivo', 'a tela usa a playlist de outro responsável');
            CONTINUE;
        END IF;
        INSERT INTO public.playlist_items (playlist_id, media_id, position, duration)
        VALUES (v_pid, p_media_id, coalesce((SELECT max(position) + 1 FROM public.playlist_items WHERE playlist_id = v_pid), 0), v_dur);
        UPDATE public.playlists SET updated_at = now() WHERE id = v_pid;
        v_ok := v_ok + 1;
    END LOOP;
    RETURN jsonb_build_object('adicionadas', v_ok, 'recusadas', v_recusadas, 'detalhe', v_detalhe);
END;
$$;

-- ============================================================ consumo — portal do Anunciante (playlists do portal)
CREATE OR REPLACE FUNCTION public.biblioteca_playlists_cliente(p_busca text DEFAULT NULL, p_limite integer DEFAULT 20)
RETURNS TABLE (id uuid, nome text, status text, itens bigint, publicada boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT p.id, p.nome, p.status, (SELECT count(*) FROM public.cliente_playlist_itens i WHERE i.playlist_id = p.id),
           EXISTS (SELECT 1 FROM public.playlist_publicacoes pp WHERE pp.playlist_cliente_id = p.id AND pp.status = 'PUBLICADA')
    FROM public.playlists_cliente p
    WHERE p.cliente_id = public.get_user_cliente_id() AND public.get_user_cliente_id() IS NOT NULL
      AND p.empresa_operadora_id = public.fn_biblioteca_tenant()
      AND (coalesce(btrim(p_busca), '') = '' OR p.nome ILIKE '%' || btrim(p_busca) || '%')
    ORDER BY lower(p.nome)
    LIMIT LEAST(GREATEST(coalesce(p_limite, 20), 1), 50);
$$;

-- Referência à mídia da Biblioteca (sem virar mídia própria). Conteúdo oficial não gera cobrança de "vídeo adicional".
CREATE OR REPLACE FUNCTION public.fn_biblioteca_item_playlist_cliente(p_playlist_id uuid, p_media_id uuid, p_cliente uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid;
BEGIN
    SELECT empresa_operadora_id INTO v_tenant FROM public.playlists_cliente WHERE id = p_playlist_id AND cliente_id = p_cliente;
    IF NOT FOUND THEN RETURN false; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.cliente_playlist_itens WHERE playlist_id = p_playlist_id AND biblioteca_media_id = p_media_id) THEN
        INSERT INTO public.cliente_playlist_itens (playlist_id, biblioteca_media_id, ordem, duracao_segundos)
        VALUES (p_playlist_id, p_media_id,
                coalesce((SELECT max(ordem) + 1 FROM public.cliente_playlist_itens WHERE playlist_id = p_playlist_id), 1),
                public.fn_media_duracao_item(p_media_id));
        INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
        VALUES (v_tenant, auth.uid(), 'PLAYLIST_CLIENTE', p_playlist_id, 'ITEM_ADICIONADO', 'ATIVO',
                'Mídia da Biblioteca ' || p_media_id::text || ' (conteúdo oficial, sem cobrança).');
    END IF;
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.biblioteca_adicionar_playlist_cliente(p_media_id uuid, p_playlist_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_cliente uuid := public.get_user_cliente_id(); v_pid uuid; v_ok integer := 0; v_recusadas jsonb := '[]'::jsonb; v_publicadas integer := 0;
BEGIN
    IF v_cliente IS NULL THEN RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501'; END IF;
    IF NOT public.fn_media_biblioteca_disponivel(p_media_id) THEN
        RAISE EXCEPTION 'midia_indisponivel: mídia da Biblioteca indisponível' USING ERRCODE = '42501';
    END IF;
    FOREACH v_pid IN ARRAY coalesce(p_playlist_ids, '{}') LOOP
        IF public.fn_biblioteca_item_playlist_cliente(v_pid, p_media_id, v_cliente) THEN
            v_ok := v_ok + 1;
            IF EXISTS (SELECT 1 FROM public.playlist_publicacoes WHERE playlist_cliente_id = v_pid AND status = 'PUBLICADA') THEN
                v_publicadas := v_publicadas + 1;
            END IF;
        ELSE
            v_recusadas := v_recusadas || jsonb_build_object('id', v_pid, 'motivo', 'playlist fora do seu escopo');
        END IF;
    END LOOP;
    RETURN jsonb_build_object('adicionadas', v_ok, 'recusadas', v_recusadas, 'playlists_publicadas', v_publicadas);
END;
$$;

-- Telas do Anunciante = telas onde ele JÁ tem playlist publicada (contrato/cobrança já validados na publicação).
CREATE OR REPLACE FUNCTION public.biblioteca_telas_cliente(p_busca text DEFAULT NULL, p_limite integer DEFAULT 30)
RETURNS TABLE (id uuid, nome text, ponto_nome text, playlist_cliente_id uuid, playlist_nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT DISTINCT ON (lower(s.name), s.id) s.id, s.name, po.nome, pc.id, pc.nome
    FROM public.playlist_publicacoes pp
    JOIN public.screens s ON s.id = pp.screen_id
    JOIN public.playlists_cliente pc ON pc.id = pp.playlist_cliente_id
    LEFT JOIN public.pontos po ON po.id = pp.ponto_id
    WHERE pp.status = 'PUBLICADA' AND pp.cliente_id = public.get_user_cliente_id() AND public.get_user_cliente_id() IS NOT NULL
      AND s.playlist_id = pp.playlist_player_id
      AND (coalesce(btrim(p_busca), '') = '' OR s.name ILIKE '%' || btrim(p_busca) || '%' OR coalesce(po.nome, '') ILIKE '%' || btrim(p_busca) || '%')
    ORDER BY lower(s.name), s.id
    LIMIT LEAST(GREATEST(coalesce(p_limite, 30), 1), 60);
$$;

-- "Adicionar à Tela" do Anunciante: entra na playlist do portal publicada naquela tela e republica (mesmo caminho do portal).
CREATE OR REPLACE FUNCTION public.biblioteca_adicionar_telas_cliente(p_media_id uuid, p_screen_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_cliente uuid := public.get_user_cliente_id(); v_sid uuid; v_pc uuid; v_telas jsonb := '{}'::jsonb; v_ok integer := 0;
        v_recusadas jsonb := '[]'::jsonb; v_detalhe jsonb := '[]'::jsonb; v_n integer;
BEGIN
    IF v_cliente IS NULL THEN RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501'; END IF;
    IF NOT public.fn_media_biblioteca_disponivel(p_media_id) THEN
        RAISE EXCEPTION 'midia_indisponivel: mídia da Biblioteca indisponível' USING ERRCODE = '42501';
    END IF;
    FOREACH v_sid IN ARRAY coalesce(p_screen_ids, '{}') LOOP
        v_pc := NULL;
        SELECT pp.playlist_cliente_id INTO v_pc FROM public.playlist_publicacoes pp JOIN public.screens s ON s.id = pp.screen_id
        WHERE pp.screen_id = v_sid AND pp.cliente_id = v_cliente AND pp.status = 'PUBLICADA' AND s.playlist_id = pp.playlist_player_id
        ORDER BY pp.updated_at DESC LIMIT 1;
        IF v_pc IS NULL THEN
            v_recusadas := v_recusadas || jsonb_build_object('id', v_sid, 'motivo', 'sem playlist sua publicada nesta tela'); CONTINUE;
        END IF;
        v_telas := jsonb_set(v_telas, ARRAY[v_pc::text], coalesce(v_telas -> v_pc::text, '[]'::jsonb) || to_jsonb(v_sid));
    END LOOP;
    FOR v_pc IN SELECT k::uuid FROM jsonb_object_keys(v_telas) k LOOP
        v_n := jsonb_array_length(v_telas -> v_pc::text);
        BEGIN
            PERFORM public.fn_biblioteca_item_playlist_cliente(v_pc, p_media_id, v_cliente);
            PERFORM public.publicar_playlist_cliente(v_pc);  -- regrava a playlist canônica do Player (telas já apontam para ela)
            v_ok := v_ok + v_n;
            v_detalhe := v_detalhe || jsonb_build_object('playlist_cliente_id', v_pc, 'acao', 'publicada', 'telas', v_n);
        EXCEPTION WHEN OTHERS THEN  -- subtransação: o item também volta atrás
            v_detalhe := v_detalhe || jsonb_build_object('playlist_cliente_id', v_pc, 'acao', 'nao_publicada', 'erro', SQLERRM, 'telas', v_n);
        END;
    END LOOP;
    RETURN jsonb_build_object('adicionadas', v_ok, 'recusadas', v_recusadas, 'detalhe', v_detalhe);
END;
$$;

-- ============================================================ publicar_playlist_cliente: definição em produção + itens da Biblioteca
CREATE OR REPLACE FUNCTION public.publicar_playlist_cliente(p_playlist_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_cliente UUID;
    v_tenant UUID;
    v_pl RECORD;
    v_total INT;
    v_nao_liberados INT;
    v_canal UUID;
    v_media_id UUID;
    v_pos INT := 0;
    v_item RECORD;
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_pl
    FROM public.playlists_cliente
    WHERE id = p_playlist_id AND cliente_id = v_cliente;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Playlist inexistente ou fora do seu escopo.' USING ERRCODE = '42501';
    END IF;
    v_tenant := v_pl.empresa_operadora_id;

    SELECT COUNT(*) INTO v_total
    FROM public.cliente_playlist_itens WHERE playlist_id = p_playlist_id;
    IF v_total = 0 THEN
        RAISE EXCEPTION 'Playlist sem mídias — adicione ao menos o vídeo gratuito antes de publicar.';
    END IF;

    -- Defesa em profundidade: nenhum vídeo pode estar pendente de cobrança.
    -- Itens diretos via REST já exigem cobrança PAGA (policy cpi_insert_com_cobranca);
    -- aqui bloqueamos qualquer item órfão sem cobranca que não seja liberação gratuita.
    SELECT COUNT(*) INTO v_nao_liberados
    FROM public.cliente_playlist_itens i
    JOIN public.cliente_assets a ON a.id = i.asset_id
    WHERE i.playlist_id = p_playlist_id
      AND a.tipo = 'video'
      AND i.cobranca_id IS NULL
      AND i.ordem <> (
            SELECT MIN(i2.ordem) FROM public.cliente_playlist_itens i2
            JOIN public.cliente_assets a2 ON a2.id = i2.asset_id
            WHERE i2.playlist_id = p_playlist_id AND a2.tipo = 'video'
      );
    IF v_nao_liberados > 0 THEN
        RAISE EXCEPTION 'Existem vídeos adicionais sem cobrança quitada — publicação bloqueada.';
    END IF;

    -- Playlist canônica do player (1:1 por usuário+nome, idempotente)
    SELECT id INTO v_canal
    FROM public.playlists
    WHERE user_id = auth.uid() AND name = v_pl.nome
    ORDER BY created_at
    LIMIT 1;

    IF v_canal IS NULL THEN
        INSERT INTO public.playlists (user_id, name, description, is_active, audio_enabled)
        VALUES (auth.uid(), v_pl.nome, v_pl.descricao, true, false)
        RETURNING id INTO v_canal;
    ELSE
        UPDATE public.playlists
        SET description = COALESCE(v_pl.descricao, description),
            is_active   = true,
            updated_at  = now()
        WHERE id = v_canal;

        DELETE FROM public.playlist_items WHERE playlist_id = v_canal;
    END IF;

    FOR v_item IN
        SELECT i.duracao_segundos,
               COALESCE(a.duracao, i.duracao_segundos) AS duracao_final,
               a.nome, a.object_url, a.tipo, a.mime_type,
               COALESCE(a.tamanho, 0) AS tamanho, a.id AS asset_id,
               i.biblioteca_media_id
        FROM public.cliente_playlist_itens i
        LEFT JOIN public.cliente_assets a ON a.id = i.asset_id
        WHERE i.playlist_id = p_playlist_id
          AND (a.id IS NOT NULL OR i.biblioteca_media_id IS NOT NULL)
        ORDER BY i.ordem
    LOOP
        -- Biblioteca: a MESMA linha de media (sem espelho, sem cópia do arquivo)
        IF v_item.biblioteca_media_id IS NOT NULL THEN
            v_pos := v_pos + 1;
            INSERT INTO public.playlist_items (playlist_id, media_id, position, duration)
            VALUES (v_canal, v_item.biblioteca_media_id, v_pos,
                    GREATEST(COALESCE(v_item.duracao_segundos, public.fn_media_duracao_item(v_item.biblioteca_media_id)), 1)::int);
            CONTINUE;
        END IF;

        -- Espelho do asset na tabela `media` do player (idempotente)
        SELECT id INTO v_media_id
        FROM public.media
        WHERE user_id = auth.uid() AND file_path = 'portal/' || v_item.asset_id::text
        LIMIT 1;

        IF v_media_id IS NULL THEN
            INSERT INTO public.media
                (user_id, name, file_path, file_url, file_type, file_size, mime_type)
            VALUES
                (auth.uid(),
                 v_item.nome,
                 'portal/' || v_item.asset_id::text,
                 v_item.object_url,
                 CASE WHEN v_item.tipo = 'video' THEN 'video' ELSE 'image' END,
                 v_item.tamanho,
                 COALESCE(v_item.mime_type, 'application/octet-stream'))
            RETURNING id INTO v_media_id;
        END IF;

        v_pos := v_pos + 1;
        INSERT INTO public.playlist_items (playlist_id, media_id, position, duration)
        VALUES (
            v_canal,
            v_media_id,
            v_pos,
            GREATEST(COALESCE(v_item.duracao_final, CASE WHEN v_item.tipo = 'video' THEN 15 ELSE 10 END), 1)::int
        );
    END LOOP;

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_tenant, auth.uid(), 'PLAYLIST_CLIENTE', p_playlist_id, 'PLAYLIST_PUBLICADA_PLAYER',
         'ATIVA', 'Playlist espelhada no Player (' || v_pos || ' itens, canal ' || v_canal::text || ').');

    RETURN json_build_object(
        'playlist_player_id', v_canal,
        'nome', v_pl.nome,
        'itens', v_pos
    );
END;
$function$;

-- ============================================================ permissões
DO $g$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'fn_biblioteca_tenant()', 'fn_biblioteca_admin()', 'fn_media_biblioteca_visivel(uuid)', 'fn_media_biblioteca_disponivel(uuid)',
        'fn_media_duracao_item(uuid)',
        'biblioteca_listar_pastas()', 'biblioteca_buscar(text, text, uuid, integer, integer)',
        'biblioteca_criar_pasta(text, text)', 'biblioteca_renomear_pasta(uuid, text)', 'biblioteca_duplicar_pasta(uuid, text)',
        'biblioteca_excluir_pasta(uuid)', 'biblioteca_restaurar_pasta(uuid)', 'biblioteca_excluir_pasta_definitivo(uuid)',
        'biblioteca_vincular_midias(uuid, uuid[])', 'biblioteca_editar_item(uuid, text, text, text[])', 'biblioteca_mover_item(uuid, uuid)',
        'biblioteca_copiar_item(uuid, uuid)', 'biblioteca_excluir_item(uuid)', 'biblioteca_restaurar_item(uuid)',
        'biblioteca_excluir_item_definitivo(uuid)', 'biblioteca_lixeira()',
        'biblioteca_minhas_playlists(text, integer)', 'biblioteca_adicionar_playlists(uuid, uuid[])',
        'biblioteca_minhas_telas(text, integer)', 'biblioteca_adicionar_telas(uuid, uuid[])',
        'biblioteca_playlists_cliente(text, integer)', 'biblioteca_adicionar_playlist_cliente(uuid, uuid[])',
        'biblioteca_telas_cliente(text, integer)', 'biblioteca_adicionar_telas_cliente(uuid, uuid[])'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
    END LOOP;
    -- internas: só chamadas por outras funções (dono)
    FOREACH f IN ARRAY ARRAY[
        'fn_biblioteca_exigir_admin()', 'fn_biblioteca_nome_valido(text)', 'fn_biblioteca_nome_livre(uuid, text)',
        'fn_biblioteca_purgar_midias(uuid[])', 'fn_biblioteca_item_do_tenant(uuid, uuid, boolean)',
        'fn_biblioteca_item_playlist_cliente(uuid, uuid, uuid)', 'fn_media_biblioteca_protege()'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    END LOOP;
END $g$;

-- ============================================================ estrutura editorial inicial (nomes editáveis; sem dependência de marca)
INSERT INTO public.biblioteca_pastas (empresa_operadora_id, nome, ordem)
SELECT e.id, v.nome, v.ordem
FROM public.empresa_operadora e
CROSS JOIN (VALUES ('Vídeos Cinema', 0), ('Vídeos Humor', 1), ('Vídeos Esporte', 2), ('Vídeos Incrível', 3),
                   ('Vídeos Nostalgia', 4), ('Memes', 5), ('Charadas', 6), ('Vídeos Turismo', 7)) AS v(nome, ordem)
WHERE NOT EXISTS (SELECT 1 FROM public.biblioteca_pastas p WHERE p.empresa_operadora_id = e.id AND lower(p.nome) = lower(v.nome));
