-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261103
-- CONSOLIDAÇÃO provisionar_usuario_corporativo (paridade exata com o LIVE):
--   OWNER/ADMIN (permissões delegadas) | REPRESENTANTE: CLIENTE/ANUNCIANTE
--   da PRÓPRIA CARTEIRA + GESTOR | ANUNCIANTE: equipe própria.
--   Mantém p_dados_extra (metadados de prospecção), GUC sancionado,
--   must_change_password=TRUE, auditoria e boas-vindas na Central.
-- ======================================================================

CREATE OR REPLACE FUNCTION public.provisionar_usuario_corporativo(p_uid uuid, p_email text, p_nome text, p_telefone text DEFAULT NULL::text, p_perfil_id uuid DEFAULT NULL::uuid, p_cliente_id uuid DEFAULT NULL::uuid, p_dados_extra jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller uuid := auth.uid();
    v_caller_tenant uuid;
    v_caller_owner boolean;
    v_caller_admin boolean;
    v_caller_perfil text;
    v_caller_cliente uuid;
    v_caller_rep uuid;
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
           UPPER(COALESCE(p.nome, '')), u.cliente_id, r.id
      INTO v_caller_tenant, v_caller_owner, v_caller_admin, v_caller_perfil, v_caller_cliente, v_caller_rep
      FROM public.usuarios u
      LEFT JOIN public.perfis p ON p.id = u.perfil_id
      LEFT JOIN public.representantes r ON r.usuario_id = u.id
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
        -- CENTRAL DE PROSPECÇÃO — dois caminhos sancionados:
        --  a) FECHAMENTO COMERCIAL: CLIENTE/ANUNCIANTE de cliente da
        --     própria carteira (clientes.representante_id → rep).
        --  b) PROSPECÇÃO GESTOR DE MÍDIAS: perfil GESTOR, SEM cliente.
        -- Role derivada do fluxo — nunca escolhida livremente.
        -- ============================================================
        IF v_caller_rep IS NULL THEN
            RAISE EXCEPTION 'Acesso Negado: representante não registrado.' USING ERRCODE = '42501';
        END IF;

        IF v_perfil_nome IN ('CLIENTE','ANUNCIANTE') THEN
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

        ELSIF v_perfil_nome = 'GESTOR' THEN
            IF p_cliente_id IS NOT NULL THEN
                RAISE EXCEPTION 'Acesso Negado: GESTOR de prospecção não pode nascer vinculado a cliente.' USING ERRCODE = '42501';
            END IF;
            v_cliente_final := NULL;

        ELSE
            RAISE EXCEPTION 'Acesso Negado: representante provisiona apenas CLIENTE/ANUNCIANTE da carteira ou GESTOR.' USING ERRCODE = '42501';
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
         jsonb_build_object(
             'criado_via',
             CASE v_caller_perfil WHEN 'REPRESENTANTE' THEN 'FECHAMENTO_COMERCIAL' ELSE 'PROVISIONAMENTO_DIRETO' END,
             'perfil_nome', v_perfil_nome,
             'cliente_id', v_cliente_final
         )
         || COALESCE(p_dados_extra, '{}'::jsonb),
         'APPROVED', v_caller, NOW(), 'CRIACAO_CORPORATIVA_PROVISIONADA', p_perfil_id, v_caller);

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_caller_tenant, v_caller, 'USUARIO', p_uid, 'USER_PROVISIONED', 'ACTIVE',
         'Usuário provisionado com acesso imediato e troca obrigatória de senha. Perfil: '
         || v_perfil_nome || '. Cliente: ' || coalesce(v_cliente_final::text,'—')
         || CASE WHEN v_caller_perfil = 'REPRESENTANTE' THEN ' (prospecção/fechamento comercial)' ELSE '' END);

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
$function$

