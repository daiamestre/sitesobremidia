-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261044
-- PROVISIONAMENTO AUTOMÁTICO DE ACESSO PELO REPRESENTANTE
--
-- Caso real auditado (MERCADO TESTE 1, código 9014): wizard grava
-- cliente+proposta e ENCERRA sem criar Auth/perfil/acesso/credencial/
-- Central. Esta migration estende provisionar_usuario_corporativo para
-- que o REPRESENTANTE possa provisionar APENAS perfis CLIENTE/ANUNCIANTE
-- de clientes DA PRÓPRIA CARTEIRA (clientes.representante_id →
-- representantes.usuario_id = auth.uid()), mantendo todas as garantias:
-- senha inicial server-side, must_change_password, solicitação APPROVED,
-- auditoria e Central. Sem bypass, sem Owner manual.
-- ======================================================================

CREATE OR REPLACE FUNCTION public.provisionar_usuario_corporativo(
    p_uid UUID,
    p_email TEXT,
    p_nome TEXT,
    p_telefone TEXT DEFAULT NULL,
    p_perfil_id UUID DEFAULT NULL,
    p_cliente_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_caller_tenant uuid;
    v_caller_owner boolean;
    v_caller_admin boolean;
    v_caller_perfil text;
    v_caller_cliente uuid;
    v_representante_id uuid;
    v_perfil_nome text;
    v_perfil_ativo boolean;
    v_cliente_final uuid := NULL;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Acesso Negado: sessão inválida.' USING ERRCODE = '42501';
    END IF;

    -- Sanção oficial do caminho (lida pelo trigger anti-forgery)
    PERFORM set_config('app.sobremidia.provisioning', 'on', true);

    SELECT u.empresa_operadora_id, COALESCE(u.is_owner, false),
           (UPPER(COALESCE(p.nome, '')) = 'ADMIN'),
           UPPER(COALESCE(p.nome, '')), u.cliente_id
      INTO v_caller_tenant, v_caller_owner, v_caller_admin, v_caller_perfil, v_caller_cliente
      FROM public.usuarios u
      LEFT JOIN public.perfis p ON p.id = u.perfil_id
     WHERE u.id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Acesso Negado: usuário não registrado.' USING ERRCODE = '42501';
    END IF;

    SELECT p.nome, p.ativo INTO v_perfil_nome, v_perfil_ativo
      FROM public.perfis p WHERE p.id = p_perfil_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Perfil alvo inexistente.' USING ERRCODE = '22023'; END IF;
    IF NOT v_perfil_ativo THEN RAISE EXCEPTION 'Perfil alvo inativo.' USING ERRCODE = '22023'; END IF;
    IF v_perfil_nome = 'OWNER' THEN
        RAISE EXCEPTION 'Acesso Negado: não é possível criar contas OWNER.' USING ERRCODE = '42501';
    END IF;

    IF v_caller_owner OR v_caller_admin THEN
        IF NOT v_caller_owner THEN
            IF NOT public.has_admin_permission('users.create') THEN
                RAISE EXCEPTION 'Acesso Negado: permissão users.create não concedida.' USING ERRCODE = '42501';
            END IF;
            IF v_perfil_nome = 'ADMIN' AND NOT public.has_admin_permission('users.create_admin') THEN
                RAISE EXCEPTION 'Acesso Negado: criar ADMIN requer users.create_admin.' USING ERRCODE = '42501';
            END IF;
        END IF;
        IF p_cliente_id IS NOT NULL THEN
            SELECT c.id INTO v_cliente_final
              FROM public.clientes c
             WHERE c.id = p_cliente_id AND c.empresa_operadora_id = v_caller_tenant;
            IF v_cliente_final IS NULL THEN
                RAISE EXCEPTION 'Cliente informado não pertence à empresa operadora.' USING ERRCODE = '22023';
            END IF;
        END IF;

    ELSIF v_caller_perfil = 'REPRESENTANTE' THEN
        -- ============================================================
        -- PROVISIONAMENTO AUTOMÁTICO PELO REPRESENTANTE (fluxo comercial)
        -- Escopo estrito: apenas perfis CLIENTE/ANUNCIANTE de clientes
        -- DA PRÓPRIA CARTEIRA. Role derivada do fluxo — nunca escolhida.
        -- ============================================================
        IF v_perfil_nome NOT IN ('CLIENTE','ANUNCIANTE') THEN
            RAISE EXCEPTION 'Acesso Negado: representante só provisiona acesso do ANUNCIANTE/CLIENTE.' USING ERRCODE = '42501';
        END IF;

        SELECT c.id INTO v_cliente_final
          FROM public.clientes c
          JOIN public.representantes r ON r.id = c.representante_id
         WHERE c.id = p_cliente_id
           AND c.empresa_operadora_id = v_caller_tenant
           AND r.usuario_id = v_caller
           AND r.ativo;
        IF v_cliente_final IS NULL OR p_cliente_id IS NULL THEN
            RAISE EXCEPTION 'Acesso Negado: cliente inexistente ou fora da sua carteira.' USING ERRCODE = '42501';
        END IF;

    ELSIF v_caller_perfil = 'ANUNCIANTE' THEN
        -- Minha Equipe: anunciante provisiona somente membros da própria empresa
        IF v_caller_cliente IS NULL THEN
            RAISE EXCEPTION 'Acesso Negado: anunciante sem vínculo comercial.' USING ERRCODE = '42501';
        END IF;
        IF v_perfil_nome NOT IN ('CLIENTE','ANUNCIANTE') THEN
            RAISE EXCEPTION 'Acesso Negado: equipe do anunciante aceita apenas perfis CLIENTE ou ANUNCIANTE.' USING ERRCODE = '42501';
        END IF;
        v_cliente_final := v_caller_cliente;
    ELSE
        RAISE EXCEPTION 'Acesso Negado: provisionamento restrito a OWNER, ADMIN, REPRESENTANTE ou ANUNCIANTE.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.usuarios
        (id, empresa_operadora_id, perfil_id, nome, email, telefone, ativo, status,
         status_ciclo_vida, cliente_id, created_by, approved_by, must_change_password, version)
    VALUES
        (p_uid, v_caller_tenant, p_perfil_id, p_nome, p_email, p_telefone,
         true, 'ACTIVE', 'APPROVED', v_cliente_final, v_caller, v_caller, TRUE, 1);

    IF v_perfil_nome = 'REPRESENTANTE' THEN
        INSERT INTO public.representantes (empresa_operadora_id, usuario_id, cpf_cnpj, ativo)
        VALUES (v_caller_tenant, p_uid, '', true);
    END IF;

    INSERT INTO public.solicitacoes_acesso
        (id, empresa_operadora_id, auth_user_id, usuario_id, tipo_acesso,
         nome_usuario, email_usuario, telefone, dados_cadastro,
         status, approved_by, approved_at, origem, perfil_solicitado_id, criado_por)
    VALUES
        (gen_random_uuid(), v_caller_tenant, p_uid, p_uid,
         CASE v_perfil_nome
           WHEN 'REPRESENTANTE' THEN 'REPRESENTANTE'
           WHEN 'GESTOR'        THEN 'GESTOR_TELAS'
           WHEN 'ANUNCIANTE'    THEN 'ANUNCIANTE'
           WHEN 'PARCEIRO'      THEN 'PARCEIRO'
           ELSE 'FUNCIONARIO'
         END,
         p_nome, p_email, p_telefone,
         jsonb_build_object('criado_via', CASE v_caller_perfil WHEN 'REPRESENTANTE' THEN 'FECHAMENTO_COMERCIAL' ELSE 'PROVISIONAMENTO_DIRETO' END,
                            'perfil_nome', v_perfil_nome, 'cliente_id', v_cliente_final),
         'APPROVED', v_caller, NOW(), 'CRIACAO_CORPORATIVA_PROVISIONADA', p_perfil_id, v_caller);

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_caller_tenant, v_caller, 'USUARIO', p_uid, 'USER_PROVISIONED', 'ACTIVE',
         'Usuário provisionado com acesso imediato e troca obrigatória de senha. Perfil: '
         || v_perfil_nome || '. Cliente: ' || coalesce(v_cliente_final::text,'—')
         || CASE WHEN v_caller_perfil = 'REPRESENTANTE' THEN ' (fechamento comercial)' ELSE '' END);

    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato, titulo, mensagem,
         prioridade, severidade, status_envio, lida, status_notificacao)
    VALUES
        (v_caller_tenant, p_uid, 'USER_PROVISIONED', 'IN_APP', p_uid,
         'Bem-vindo(a) à SOBRE MÍDIA',
         'Seu acesso foi criado. Utilize a senha inicial fornecida pelo administrador/comercial e defina uma nova senha no primeiro login.',
         'SUCESSO', 'INFO', 'SENT', false, 'NAO_LIDA');

    RETURN p_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.provisionar_usuario_corporativo(UUID, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provisionar_usuario_corporativo(UUID, TEXT, TEXT, TEXT, UUID, UUID) TO authenticated;
