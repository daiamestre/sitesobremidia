-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261038
-- Correção de bug em vincular_pontos_playlist: FOREACH sobre array exige
-- variável escalar; RECORD causava "cannot assign non-composite value".
-- Semântica inalterada.
-- ======================================================================

CREATE OR REPLACE FUNCTION public.vincular_pontos_playlist(
    p_playlist_id UUID,
    p_ponto_ids UUID[]
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_cliente UUID;
    v_vinculados INT := 0;
    v_ponto_id UUID;
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.playlists_cliente WHERE id = p_playlist_id AND cliente_id = v_cliente
    ) THEN
        RAISE EXCEPTION 'Playlist fora do seu escopo.' USING ERRCODE = '42501';
    END IF;

    FOREACH v_ponto_id IN ARRAY p_ponto_ids LOOP
        -- Idempotente: já vinculado não reprocura
        IF EXISTS (
            SELECT 1 FROM public.cliente_playlist_pontos
            WHERE playlist_id = p_playlist_id AND ponto_id = v_ponto_id
        ) THEN
            v_vinculados := v_vinculados + 1;
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.pontos po
            JOIN public.contrato_estabelecimentos ce ON ce.unidade_id = po.unidade_id
            JOIN public.contratos k ON k.id = ce.contrato_id
            WHERE po.id = v_ponto_id
              AND po.ativo
              AND k.cliente_id = v_cliente
              AND k.status_workflow IN ('EM_PRODUCAO','AGUARDANDO_APROVACAO','CAMPANHA_APROVADA','CAMPANHA_ATIVA')
        ) THEN
            RAISE EXCEPTION 'Ponto % não está contratado/ativo para o seu cliente.', v_ponto_id;
        END IF;

        INSERT INTO public.cliente_playlist_pontos (playlist_id, ponto_id)
        VALUES (p_playlist_id, v_ponto_id)
        ON CONFLICT (playlist_id, ponto_id) DO NOTHING;
        v_vinculados := v_vinculados + 1;
    END LOOP;

    RETURN v_vinculados;
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_pontos_playlist(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vincular_pontos_playlist(UUID, UUID[]) TO authenticated;
