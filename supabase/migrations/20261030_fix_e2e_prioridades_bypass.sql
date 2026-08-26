-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261030
-- Correções do E2E ao vivo:
--   A) prioridade 'ALTA' não existe em notificacoes_central
--      (CHECK exige CRITICO/IMPORTANTE/ATENCAO/SUCESSO/INFORMATIVO)
--      → solicitar_reset_senha e solicitar_novo_ponto passam a usar
--        'IMPORTANTE';
--   B) BYPASS FECHADO (missão §25): cliente_playlist_itens permitia INSERT
--      direto pelo dono da playlist, furando a regra R$19,99. Agora INSERT
--      direto exige cobranca_id NOT NULL já paga (UNIQUE evita reuso);
--      inserções legítimas continuam nas RPCs SECURITY DEFINER.
-- ======================================================================

-- ---------- A) PRIORIDADES VÁLIDAS ----------
DO $$
DECLARE v_prio TEXT;
BEGIN
    SELECT conname INTO v_prio FROM pg_constraint WHERE conname='notificacoes_central_prioridade_check';
    IF v_prio IS NULL THEN
        RAISE NOTICE 'constraint de prioridade ausente — nada a validar';
    END IF;
END $$;

-- ---------- B) FECHAR BYPASS DE INSERT ----------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cliente_playlist_itens' AND policyname='cpi_write') THEN
        DROP POLICY cpi_write ON public.cliente_playlist_itens;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cliente_playlist_itens' AND policyname='cpi_select') THEN
        CREATE POLICY cpi_select ON public.cliente_playlist_itens FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.playlists_cliente p
                WHERE p.id = playlist_id
                  AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                  AND (public.is_central_privileged() OR p.cliente_id = public.get_user_cliente_id())
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cliente_playlist_itens' AND policyname='cpi_update_delete') THEN
        CREATE POLICY cpi_update_delete ON public.cliente_playlist_itens FOR UPDATE TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.playlists_cliente p
                WHERE p.id = playlist_id
                  AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                  AND (public.is_central_privileged() OR p.cliente_id = public.get_user_cliente_id())
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.playlists_cliente p
                WHERE p.id = playlist_id
                  AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                  AND p.cliente_id = public.get_user_cliente_id()
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cliente_playlist_itens' AND policyname='cpi_delete') THEN
        CREATE POLICY cpi_delete ON public.cliente_playlist_itens FOR DELETE TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.playlists_cliente p
                WHERE p.id = playlist_id
                  AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                  AND (public.is_central_privileged() OR p.cliente_id = public.get_user_cliente_id())
            )
        );
    END IF;

    -- INSERT direto SOMENTE com cobrança vinculada (paga via RPC confirmar);
    -- UNIQUE(cobranca_id) impede reaproveitamento. O fluxo legítimo é pelas RPCs.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cliente_playlist_itens' AND policyname='cpi_insert_com_cobranca') THEN
        CREATE POLICY cpi_insert_com_cobranca ON public.cliente_playlist_itens FOR INSERT TO authenticated
        WITH CHECK (
            cobranca_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.playlists_cliente p
                JOIN public.contas_receber cr ON cr.id = cobranca_id
                WHERE p.id = playlist_id
                  AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                  AND p.cliente_id = public.get_user_cliente_id()
                  AND cr.status IN ('PAGA','PAGO')
            )
        );
    END IF;
END $$;

-- ---------- RPCs corrigidas (prioridade IMPORTANTE) ----------

CREATE OR REPLACE FUNCTION public.solicitar_reset_senha(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_u RECORD;
    v_sol UUID;
BEGIN
    SELECT id, nome, email, empresa_operadora_id INTO v_u
    FROM public.usuarios
    WHERE lower(email) = lower(btrim(p_email)) AND deleted_at IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN TRUE; -- anti-enumeração: comportamento idêntico
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.solicitacoes
        WHERE tipo_solicitacao = 'PASSWORD_RESET_REQUEST'
          AND entidade_id = v_u.id
          AND status = 'PENDENTE'
    ) THEN
        RETURN TRUE;
    END IF;

    INSERT INTO public.solicitacoes
        (empresa_operadora_id, tipo_solicitacao, titulo, descricao, entidade_tipo, entidade_id,
         status, solicitante_id)
    VALUES
        (v_u.empresa_operadora_id, 'PASSWORD_RESET_REQUEST',
         '🔐 Solicitação de redefinição de senha',
         'Usuário: ' || v_u.nome || E'\nLogin: ' || v_u.email ||
         '\nSolicitou uma redefinição de senha.',
         'USUARIO', v_u.id, 'PENDENTE', v_u.id)
    RETURNING id INTO v_sol;

    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato,
         titulo, mensagem, prioridade, severidade, status_envio, lida, status_notificacao,
         rota_destino, entidade_relacionada_tipo, entidade_relacionada_id)
    SELECT v_u.empresa_operadora_id, u.id, 'PASSWORD_RESET_REQUEST', 'IN_APP', u.id,
         '🔐 Solicitação de redefinição de senha',
         'Usuário: ' || v_u.nome || E'\nEmpresa: ver cadastro' || E'\nLogin: ' || v_u.email ||
         E'\nSolicitou uma redefinição de senha.\n[ AUTORIZAR ] [ RECUSAR ] na aba Solicitações.',
         'IMPORTANTE', 'AVISO', 'SENT', false, 'NAO_LIDA',
         '/workspace/central', 'solicitacao_reset', v_sol
    FROM public.usuarios u
    LEFT JOIN public.perfis pf ON pf.id = u.perfil_id
    WHERE u.empresa_operadora_id = v_u.empresa_operadora_id
      AND (u.is_owner = true OR UPPER(COALESCE(pf.nome,'')) = 'ADMIN');

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, usuario_email, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_u.empresa_operadora_id, v_u.id, v_u.email, 'SOLICITACAO', v_sol,
         'PASSWORD_RESET_REQUESTED', 'PENDENTE',
         'Usuário solicitou redefinição de senha via tela de login.');

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_reset_senha(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solicitar_reset_senha(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.solicitar_novo_ponto(
    p_ponto_id UUID,
    p_justificativa TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_cliente UUID;
    v_tenant UUID;
    v_ponto RECORD;
    v_sol UUID;
    v_contrato UUID;
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;

    SELECT empresa_operadora_id INTO v_tenant FROM public.clientes WHERE id = v_cliente;

    SELECT * INTO v_ponto FROM public.pontos
    WHERE id = p_ponto_id AND empresa_operadora_id = v_tenant AND ativo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ponto inexistente ou indisponível neste tenant.' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.solicitacoes
        WHERE tipo_solicitacao = 'NOVO_PONTO'
          AND entidade_id = p_ponto_id
          AND solicitante_id = auth.uid()
          AND status = 'PENDENTE'
    ) THEN
        RAISE EXCEPTION 'Já existe uma solicitação pendente para este ponto.';
    END IF;

    SELECT k.id INTO v_contrato
    FROM public.contratos k
    WHERE k.cliente_id = v_cliente
      AND k.status_workflow IN ('EM_PRODUCAO','AGUARDANDO_APROVACAO','CAMPANHA_APROVADA','CAMPANHA_ATIVA')
    LIMIT 1;

    INSERT INTO public.solicitacoes
        (empresa_operadora_id, tipo_solicitacao, titulo, descricao, entidade_tipo, entidade_id,
         status, solicitante_id)
    VALUES
        (v_tenant, 'NOVO_PONTO',
         'Solicitação de novo ponto: ' || v_ponto.nome,
         concat_ws(' | ',
             'Cliente: ' || v_cliente::text,
             'Contrato: ' || coalesce(v_contrato::text,'—'),
             'Valor: ' || coalesce(v_ponto.valor_anuncio::text,'sob consulta'),
             'Local: ' || concat_ws(' - ', v_ponto.cidade, v_ponto.estado),
             NULLIF(btrim(coalesce(p_justificativa,'')), '')
         ),
         'PONTO_PARCEIRO', p_ponto_id, 'PENDENTE', auth.uid())
    RETURNING id INTO v_sol;

    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato,
         titulo, mensagem, prioridade, severidade, status_envio, lida, status_notificacao,
         rota_destino, entidade_relacionada_tipo, entidade_relacionada_id)
    SELECT v_tenant, u.id, 'NOVO_PONTO_SOLICITADO', 'IN_APP', u.id,
         '📍 Solicitação de novo ponto',
         'Anunciante solicitou contratar o ponto "' || v_ponto.nome || '".' || E'\n' ||
             'Local: ' || concat_ws(' - ', v_ponto.cidade, v_ponto.estado) || E'\n' ||
             'Valor: ' || coalesce(v_ponto.valor_anuncio::text,'sob consulta') || E'\n' ||
             '[ APROVAR ] [ RECUSAR ] na aba Solicitações.',
         'IMPORTANTE', 'INFO', 'SENT', false, 'NAO_LIDA',
         '/workspace/central', 'solicitacao_novo_ponto', v_sol
    FROM public.usuarios u
    LEFT JOIN public.perfis pf ON pf.id = u.perfil_id
    WHERE u.empresa_operadora_id = v_tenant
      AND (u.is_owner = true OR UPPER(COALESCE(pf.nome,'')) = 'ADMIN');

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_tenant, auth.uid(), 'SOLICITACAO', v_sol, 'NOVO_PONTO_SOLICITADO', 'PENDENTE',
         'Ponto: ' || v_ponto.nome);

    RETURN v_sol;
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_novo_ponto(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solicitar_novo_ponto(UUID, TEXT) TO authenticated;

-- GATES
DO $$
DECLARE n INT;
BEGIN
    SELECT COUNT(*) INTO n FROM pg_policies
    WHERE tablename='cliente_playlist_itens'
      AND policyname IN ('cpi_select','cpi_update_delete','cpi_delete','cpi_insert_com_cobranca');
    IF n < 4 THEN
        RAISE EXCEPTION 'GATE: policies de cliente_playlist_itens incompletas (%/4).', n;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cliente_playlist_itens' AND policyname='cpi_write') THEN
        RAISE EXCEPTION 'GATE: policy antiga cpi_write ainda presente.';
    END IF;
END $$;
