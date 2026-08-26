-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261035
-- FASE 17: PLAYLIST DO ANUNCIANTE → PLAYER → EXIBIÇÃO
--
-- Completa a ponte (iniciada em publicar_playlist_cliente) com o elo
-- comercial PONTO ↔ TELAS e a automação do anunciante, SEM alterar a
-- arquitetura/RLS/runtime existentes do Player:
--
--   1. screens.ponto_id            — vínculo operacional tela↔ponto
--   2. playlist_publicacoes        — registro auditável das publicações
--   3. publicar_playlist_no_ponto  — anunciante publica p/ telas do ponto
--                                    (espelha itens → media/playlists/
--                                     playlist_items já existentes e
--                                     aponta screens.playlist_id apenas
--                                     quando livre ou já desta playlist;
--                                     NUNCA rouba conteúdo de outra
--                                     playlist atribuída pelo Gestor)
--   4. despublicar_playlist_do_ponto — remoção limpa e auditável
--
-- O Player continua consumindo get_player_playlist_for_screen intacto.
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. VÍNCULO TELA ↔ PONTO (aditivo)
-- ----------------------------------------------------------------------
ALTER TABLE public.screens
    ADD COLUMN IF NOT EXISTS ponto_id UUID REFERENCES public.pontos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_screens_ponto ON public.screens(ponto_id) WHERE ponto_id IS NOT NULL;

-- ----------------------------------------------------------------------
-- 2. REGISTRO DE PUBLICAÇÕES
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.playlist_publicacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    playlist_cliente_id UUID NOT NULL REFERENCES public.playlists_cliente(id) ON DELETE CASCADE,
    ponto_id UUID NOT NULL REFERENCES public.pontos(id) ON DELETE CASCADE,
    screen_id UUID NOT NULL REFERENCES public.screens(id) ON DELETE CASCADE,
    playlist_player_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PUBLICADA' CHECK (status IN ('PUBLICADA','REMOVIDA')),
    published_by UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_publicacao_playlist_screen UNIQUE (playlist_cliente_id, screen_id)
);

CREATE INDEX IF NOT EXISTS idx_pub_ponto ON public.playlist_publicacoes(ponto_id);
CREATE INDEX IF NOT EXISTS idx_pub_playlist ON public.playlist_publicacoes(playlist_cliente_id);

ALTER TABLE public.playlist_publicacoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- Leitura: dono (cliente) ou privilegiados do tenant. Escrita somente via RPC.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='playlist_publicacoes' AND policyname='pub_select') THEN
        CREATE POLICY pub_select ON public.playlist_publicacoes FOR SELECT TO authenticated
        USING (
            empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
            AND (
                public.is_central_privileged()
                OR cliente_id = public.get_user_cliente_id()
            )
        );
    END IF;
END $$;

-- ----------------------------------------------------------------------
-- 3. PUBLICAR NO PONTO
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publicar_playlist_no_ponto(
    p_playlist_id UUID,
    p_ponto_id UUID
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_cliente UUID;
    v_tenant UUID;
    v_ponto RECORD;
    v_canal UUID;
    v_screen RECORD;
    v_vinculadas INT := 0;
    v_ignoradas INT := 0;
    v_detalhe JSONB := '[]'::jsonb;
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;

    -- Playlist pertence ao anunciante
    SELECT empresa_operadora_id INTO v_tenant
    FROM public.playlists_cliente
    WHERE id = p_playlist_id AND cliente_id = v_cliente;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Playlist inexistente ou fora do seu escopo.' USING ERRCODE = '42501';
    END IF;

    -- Ponto válido, ativo e do mesmo tenant
    SELECT * INTO v_ponto FROM public.pontos
    WHERE id = p_ponto_id AND empresa_operadora_id = v_tenant AND ativo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ponto inexistente ou indisponível.' USING ERRCODE = '42501';
    END IF;

    -- Ponto deve estar CONTRATADO e ativo para este cliente (mesma régua da vinculação)
    IF NOT EXISTS (
        SELECT 1
        FROM public.pontos po
        JOIN public.contrato_estabelecimentos ce ON ce.unidade_id = po.unidade_id
        JOIN public.contratos k ON k.id = ce.contrato_id
        WHERE po.id = p_ponto_id
          AND po.ativo
          AND k.cliente_id = v_cliente
          AND k.status_workflow IN ('EM_PRODUCAO','AGUARDANDO_APROVACAO','CAMPANHA_APROVADA','CAMPANHA_ATIVA')
    ) THEN
        RAISE EXCEPTION 'Ponto não está contratado/ativo para o seu cliente.' USING ERRCODE = '42501';
    END IF;

    -- 1º passo: espelhar conteúdo atual na camada canônica do Player
    -- (idempotente: reconstrói media/playlists/playlist_items liberados)
    v_canal := (public.publicar_playlist_cliente(p_playlist_id))->>'playlist_player_id';

    -- 2º passo: apontar as TELAS ATIVAS DO PONTO para o canal espelhado.
    -- Regra de não-invasão: tela ocupada por OUTRA playlist é reportada e
    -- preservada (atribuição do Gestor prevalece até desocupação).
    FOR v_screen IN
        SELECT id, name, playlist_id
        FROM public.screens
        WHERE ponto_id = p_ponto_id
          AND empresa_operadora_id = v_tenant
          AND is_active
        ORDER BY created_at
    LOOP
        IF v_screen.playlist_id IS NULL OR v_screen.playlist_id = v_canal THEN
            UPDATE public.screens SET playlist_id = v_canal WHERE id = v_screen.id;

            INSERT INTO public.playlist_publicacoes
                (empresa_operadora_id, cliente_id, playlist_cliente_id, ponto_id,
                 screen_id, playlist_player_id, status, published_by)
            VALUES
                (v_tenant, v_cliente, p_playlist_id, p_ponto_id,
                 v_screen.id, v_canal, 'PUBLICADA', auth.uid())
            ON CONFLICT (playlist_cliente_id, screen_id) DO UPDATE
                SET status = 'PUBLICADA',
                    playlist_player_id = EXCLUDED.playlist_player_id,
                    updated_at = NOW();

            v_vinculadas := v_vinculadas + 1;
            v_detalhe := v_detalhe || jsonb_build_object('screen', v_screen.id, 'acao', 'vinculada');
        ELSE
            v_ignoradas := v_ignoradas + 1;
            v_detalhe := v_detalhe || jsonb_build_object('screen', v_screen.id, 'acao', 'ocupada_outra_playlist');
        END IF;
    END LOOP;

    IF v_vinculadas = 0 THEN
        RAISE EXCEPTION 'Nenhuma tela ativa disponível neste ponto (% ocupadas por outras playlists). Vincule telas ao ponto ou libere-as.', v_ignoradas;
    END IF;

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_tenant, auth.uid(), 'PLAYLIST_CLIENTE', p_playlist_id, 'PLAYLIST_PUBLICADA_PONTO', 'ATIVA',
         'Ponto: ' || v_ponto.nome || ' | Telas vinculadas: ' || v_vinculadas ||
         ' | Ignoradas (ocupadas): ' || v_ignoradas || ' | Canal: ' || v_canal::text);

    RETURN json_build_object(
        'ok', true,
        'ponto_id', p_ponto_id,
        'playlist_player_id', v_canal,
        'telas_vinculadas', v_vinculadas,
        'telas_ignoradas', v_ignoradas,
        'detalhe', v_detalhe
    );
END;
$$;

REVOKE ALL ON FUNCTION public.publicar_playlist_no_ponto(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publicar_playlist_no_ponto(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------
-- 4. DESPUBLICAR
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.despublicar_playlist_do_ponto(
    p_playlist_id UUID,
    p_ponto_id UUID
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_cliente UUID;
    v_count INT := 0;
    v_rec RECORD;
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.playlists_cliente
        WHERE id = p_playlist_id AND cliente_id = v_cliente
    ) THEN
        RAISE EXCEPTION 'Playlist fora do seu escopo.' USING ERRCODE = '42501';
    END IF;

    FOR v_rec IN
        SELECT pub.*, s.playlist_id AS tela_atual
        FROM public.playlist_publicacoes pub
        JOIN public.screens s ON s.id = pub.screen_id
        WHERE pub.playlist_cliente_id = p_playlist_id
          AND pub.ponto_id = p_ponto_id
          AND pub.status = 'PUBLICADA'
        FOR UPDATE OF pub
    LOOP
        IF v_rec.tela_atual = v_rec.playlist_player_id THEN
            UPDATE public.screens SET playlist_id = NULL WHERE id = v_rec.screen_id;
        END IF;

        UPDATE public.playlist_publicacoes
        SET status = 'REMOVIDA', updated_at = NOW()
        WHERE id = v_rec.id;

        v_count := v_count + 1;
    END LOOP;

    IF v_count > 0 THEN
        INSERT INTO public.auditoria_logs
            (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
        SELECT empresa_operadora_id, auth.uid(), 'PLAYLIST_CLIENTE', p_playlist_id,
               'PLAYLIST_DESPUBLICADA_PONTO', 'REMOVIDA',
               'Telas liberadas: ' || v_count
        FROM public.playlists_cliente WHERE id = p_playlist_id;
    END IF;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.despublicar_playlist_do_ponto(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.despublicar_playlist_do_ponto(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------
-- GATES
-- ----------------------------------------------------------------------
DO $$
DECLARE n INT;
BEGIN
    SELECT COUNT(*) INTO n FROM information_schema.columns
    WHERE table_schema='public' AND table_name='screens' AND column_name='ponto_id';
    IF n <> 1 THEN RAISE EXCEPTION 'GATE: screens.ponto_id ausente.'; END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='playlist_publicacoes') THEN
        RAISE EXCEPTION 'GATE: playlist_publicacoes ausente.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
        WHERE ns.nspname='public'
          AND p.proname IN ('publicar_playlist_no_ponto','despublicar_playlist_do_ponto','publicar_playlist_cliente')
    ) THEN
        RAISE EXCEPTION 'GATE: RPCs de publicação incompletas.';
    END IF;
END $$;
