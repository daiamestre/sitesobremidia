-- ======================================================================
-- SOBRE MÃDIA â€” MIGRATION 20261029
-- Portal do Anunciante: integraÃ§Ãµes e hardening (ADITIVA + IDEMPOTENTE)
--
-- 1. RPC publicar_playlist_cliente â€” ponte playlists_cliente â†’ Player
--    (tabelas canÃ´nicas media/playlists/playlist_items), sem alterar a
--    arquitetura do Player. Gate: itens sÃ³ existem se livres/pagos.
-- 2. get_kpis_portal_anunciante: KPI "insercoes" real (playback_logs).
-- 3. submit_campanha_to_review: posse/tenant derivados server-side +
--    CORREÃ‡ÃƒO DE REGRESSÃƒO â€” chamada enfileirar_job usava assinatura antiga
--    (canal 'EMAIL' como 3Âº arg) e FALHAVA EM RUNTIME contra a assinatura
--    atual (uuid,text,jsonb,...). Agora usa payload jsonb + idempotÃªncia e
--    tambÃ©m notifica a Central de ComunicaÃ§Ã£o (missÃ£o Â§40).
-- 4. adicionar_midia_playlist: status de cobranÃ§a 'ABERTA' (vocabulÃ¡rio
--    canÃ´nico de 20261020; 'PENDENTE' segue vÃ¡lido, mas padroniza).
--
-- NOTA (senha): o par legado password_reset_tokens/send|handle-password-reset
-- NÃƒO estÃ¡ aplicado neste banco (tabela ausente) â€” fluxo vigente Ã© o da
-- Central (solicitar_reset_senha â†’ decisão de reset privilegiada â†’ authorize-password-
-- reset). Nenhum cron Ã© necessÃ¡rio aqui.
-- ======================================================================

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 1. PONTE PLAYLIST DO ANUNCIANTE â†’ PLAYER (missÃ£o Â§43 â€” sem tocar Player)
-- Cria/atualiza uma playlist canÃ´nica do prÃ³prio usuÃ¡rio espelhando os
-- itens liberados da playlist comercial. A atribuiÃ§Ã£o em telas continua
-- sendo operaÃ§Ã£o do Gestor/Owner pela UI existente (screens.playlist_id).
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION public.publicar_playlist_cliente(p_playlist_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
        RAISE EXCEPTION 'UsuÃ¡rio sem vÃ­nculo comercial (cliente).' USING ERRCODE = '42501';
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
        RAISE EXCEPTION 'Playlist sem mÃ­dias â€” adicione ao menos o vÃ­deo gratuito antes de publicar.';
    END IF;

    -- Defesa em profundidade: nenhum vÃ­deo pode estar pendente de cobranÃ§a.
    -- Itens diretos via REST jÃ¡ exigem cobranÃ§a PAGA (policy cpi_insert_com_cobranca);
    -- aqui bloqueamos qualquer item Ã³rfÃ£o sem cobranca que nÃ£o seja liberaÃ§Ã£o gratuita.
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
        RAISE EXCEPTION 'Existem vÃ­deos adicionais sem cobranÃ§a quitada â€” publicaÃ§Ã£o bloqueada.';
    END IF;

    -- Playlist canÃ´nica do player (1:1 por usuÃ¡rio+nome, idempotente)
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
               COALESCE(a.tamanho, 0) AS tamanho, a.id AS asset_id
        FROM public.cliente_playlist_itens i
        JOIN public.cliente_assets a ON a.id = i.asset_id
        WHERE i.playlist_id = p_playlist_id
        ORDER BY i.ordem
    LOOP
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
$$;

REVOKE ALL ON FUNCTION public.publicar_playlist_cliente(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publicar_playlist_cliente(uuid) TO authenticated;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 2. KPI "insercoes" real para o dashboard do anunciante (missÃ£o Â§18)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION public.get_kpis_portal_anunciante()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_cliente UUID := public.get_user_cliente_id();
    v_tenant UUID;
    result JSON;
BEGIN
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'UsuÃ¡rio sem vÃ­nculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;
    SELECT empresa_operadora_id INTO v_tenant FROM public.clientes WHERE id = v_cliente;

    SELECT json_build_object(
        'meus_pontos', (
            SELECT COUNT(*)
            FROM public.pontos po
            JOIN public.contrato_estabelecimentos ce ON ce.unidade_id = po.unidade_id
            JOIN public.contratos k ON k.id = ce.contrato_id
            WHERE k.cliente_id = v_cliente
              AND po.ativo
              AND k.status_workflow IN ('EM_PRODUCAO','AGUARDANDO_APROVACAO','CAMPANHA_APROVADA','CAMPANHA_ATIVA')
        ),
        'campanhas_ativas', (
            SELECT COUNT(*) FROM public.campanhas
            WHERE cliente_id = v_cliente
              AND status IN ('APPROVED','ACTIVE','REVIEW')
        ),
        'midias_ativas', (
            SELECT COUNT(*) FROM public.cliente_assets
            WHERE cliente_id = v_cliente
        ),
        'playlists', (
            SELECT COUNT(*) FROM public.playlists_cliente
            WHERE cliente_id = v_cliente AND status = 'ATIVA'
        ),
        'pontos_para_anunciar', (
            SELECT COUNT(*) FROM public.pontos
            WHERE empresa_operadora_id = v_tenant
              AND ativo AND disponibilidade = 'DISPONIVEL' AND deleted_at IS NULL
        ),
        'insercoes', (
            SELECT COUNT(*)::int
            FROM public.playback_logs pl
            JOIN public.contratos k ON k.id = pl.contrato_id
            WHERE k.cliente_id = v_cliente
        ),
        'contratos_vigentes', (
            SELECT COUNT(*) FROM public.contratos
            WHERE cliente_id = v_cliente
              AND status_workflow IN ('EM_PRODUCAO','AGUARDANDO_APROVACAO','CAMPANHA_APROVADA','CAMPANHA_ATIVA')
        )
    ) INTO result;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_kpis_portal_anunciante() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kpis_portal_anunciante() TO authenticated;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 3. submit_campanha_to_review â€” hardening (posse/tenant server-side).
-- MantÃ©m assinatura (p_tenant_id) para compatibilidade, mas passa a
-- validar contra o registro e exigir dono (cliente) ou papel interno.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION public.submit_campanha_to_review(p_campanha_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_campanha RECORD;
    v_cliente_nome TEXT;
BEGIN
    SELECT status, titulo, empresa_operadora_id, cliente_id
      INTO v_campanha
    FROM public.campanhas
    WHERE id = p_campanha_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campanha nÃ£o encontrada.';
    END IF;

    -- Tenant informado deve bater com o registro (anti-manipulaÃ§Ã£o)
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_campanha.empresa_operadora_id THEN
        RAISE EXCEPTION 'Tenant divergente da campanha.' USING ERRCODE = '42501';
    END IF;

    -- AutorizaÃ§Ã£o: papel interno OU dono da campanha (cliente vinculado)
    IF NOT public.is_internal_role()
       AND (public.get_user_cliente_id() IS NULL OR public.get_user_cliente_id() <> v_campanha.cliente_id) THEN
        RAISE EXCEPTION 'Sem permissÃ£o para submeter esta campanha.' USING ERRCODE = '42501';
    END IF;

    IF v_campanha.status != 'DRAFT' THEN
        RAISE EXCEPTION 'Apenas campanhas em DRAFT podem ser submetidas para revisÃ£o.';
    END IF;

    SELECT COALESCE(nome_fantasia, razao_social) INTO v_cliente_nome
    FROM public.clientes
    WHERE id = v_campanha.cliente_id;

    UPDATE public.campanhas
    SET status = 'REVIEW',
        updated_at = NOW()
    WHERE id = p_campanha_id;

    -- NotificaÃ§Ã£o operacional na Central (missÃ£o Â§40) â€” Owner/Admin/Gestor
    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, titulo, mensagem,
         prioridade, severidade, rota_destino, entidade_relacionada_tipo, entidade_relacionada_id)
    SELECT v_campanha.empresa_operadora_id,
           u.id,
           'CAMPANHA_ENVIADA_REVISAO',
           'IN_APP',
           'Campanha aguardando revisÃ£o',
           'A campanha "' || v_campanha.titulo || '" (' || COALESCE(v_cliente_nome,'cliente') ||
           ') foi enviada para revisÃ£o.',
           'IMPORTANTE', 'INFO',
           '/workspace/central',
           'campanha', p_campanha_id
    FROM public.usuarios u
    JOIN public.perfis pf ON pf.id = u.perfil_id
    WHERE u.empresa_operadora_id = v_campanha.empresa_operadora_id
      AND u.ativo
      AND pf.nome IN ('OWNER','ADMIN','GESTOR')
      AND NOT EXISTS (
            SELECT 1 FROM public.notificacoes_central nc
            WHERE nc.tipo_evento = 'CAMPANHA_ENVIADA_REVISAO'
              AND nc.entidade_relacionada_id = p_campanha_id
              AND nc.usuario_id = u.id
      );

    -- Communication Core â€” assinatura CORRETA (uuid,text,jsonb[,idem]) + idempotÃªncia.
    -- A versÃ£o anterior passava canal 'EMAIL' como payload e FALHAVA EM RUNTIME.
    PERFORM public.enfileirar_job(
        v_campanha.empresa_operadora_id,
        'campanha_enviada_revisao',
        jsonb_build_object(
            'campanha_id', p_campanha_id,
            'titulo', v_campanha.titulo,
            'anunciante', v_cliente_nome,
            'action_url', 'https://plataforma.sobremidia.com.br/workspace/campanhas/revisao/' || p_campanha_id
        ),
        'campanha_review_' || p_campanha_id::text
    );

    RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_campanha_to_review(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_campanha_to_review(uuid, uuid) TO authenticated;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 4. adicionar_midia_playlist â€” padroniza vocabulÃ¡rio de status ('ABERTA')
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION public.adicionar_midia_playlist(p_playlist_id uuid, p_asset_id uuid, p_duracao_segundos integer DEFAULT NULL::integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_cliente UUID;
    v_tenant UUID;
    v_videos INT;
    v_asset RECORD;
    v_conta UUID;
    v_codigo VARCHAR(24);
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'UsuÃ¡rio sem vÃ­nculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;

    SELECT empresa_operadora_id, cliente_id INTO v_tenant, v_cliente
    FROM public.playlists_cliente
    WHERE id = p_playlist_id AND cliente_id = v_cliente;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Playlist inexistente ou fora do seu escopo.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_asset FROM public.cliente_assets
    WHERE id = p_asset_id AND cliente_id = v_cliente;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MÃ­dia inexistente ou fora do seu escopo.' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (SELECT 1 FROM public.cliente_playlist_itens WHERE playlist_id = p_playlist_id AND asset_id = p_asset_id) THEN
        RAISE EXCEPTION 'MÃ­dia jÃ¡ presente nesta playlist.';
    END IF;

    SELECT COUNT(*) INTO v_videos
    FROM public.cliente_playlist_itens i
    JOIN public.cliente_assets a ON a.id = i.asset_id
    WHERE i.playlist_id = p_playlist_id AND a.tipo = 'video';

    IF v_asset.tipo <> 'video' OR v_videos = 0 THEN
        INSERT INTO public.cliente_playlist_itens (playlist_id, asset_id, duracao_segundos, ordem)
        VALUES (p_playlist_id, p_asset_id, p_duracao_segundos,
                COALESCE((SELECT MAX(ordem)+1 FROM public.cliente_playlist_itens WHERE playlist_id = p_playlist_id), 1));

        INSERT INTO public.auditoria_logs
            (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
        VALUES
            (v_tenant, auth.uid(), 'PLAYLIST_CLIENTE', p_playlist_id, 'ITEM_ADICIONADO', 'ATIVO',
             CASE WHEN v_asset.tipo = 'video' THEN 'Primeiro vÃ­deo gratuito.' ELSE 'Imagem adicionada (sem cobranÃ§a).' END);

        RETURN json_build_object('cobrado', false, 'valor', 0, 'item_liberado', true);
    END IF;

    INSERT INTO public.contas_receber (
        empresa_operadora_id, cliente_id, contrato_id, valor,
        data_vencimento, status, metodo_cobranca, recorrencia, notes
    ) VALUES (
        v_tenant, v_cliente, NULL, 19.99,
        CURRENT_DATE, 'ABERTA', 'PIX', 'AVULSA',
        'Video adicional de playlist (playlist ' || p_playlist_id::text ||
        ' / midia ' || p_asset_id::text || ')'
    ) RETURNING id INTO v_conta;

    SELECT codigo_operacional INTO v_codigo FROM public.contas_receber WHERE id = v_conta;

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_tenant, auth.uid(), 'PLAYLIST_CLIENTE', p_playlist_id, 'COBRANCA_VIDEO_GERADA', 'ABERTA',
         'Cobranca ' || coalesce(v_codigo,'') || ' (R$ 19,99) gerada para video adicional.');

    RETURN json_build_object('cobrado', true, 'valor', 19.99, 'cobranca_id', v_conta, 'codigo', v_codigo);
END;
$function$;

REVOKE ALL ON FUNCTION public.adicionar_midia_playlist(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adicionar_midia_playlist(uuid, uuid, integer) TO authenticated;
