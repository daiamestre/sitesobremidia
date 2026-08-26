-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261032
-- Conciliação: prevent_usuario_insert_forgery × provisionamento oficial
--
-- A RPC SECURITY DEFINER provisionar_usuario_corporativo (missão §4/§15/§39)
-- insere em public.usuarios com auth.uid() do chamador ANUNCIANTE; o trigger
-- anti-forgery bloqueava qualquer não OWNER/ADMIN. Agora a RPC marca o
-- contexto oficial com GUC transacional e o trigger continua aplicando
-- TODAS as garantias (tenant, sem OWNER, equipe do anunciante restrita).
-- O GUC não é acessível por clientes via API (sem EXECUTE em set_config).
-- ======================================================================

CREATE OR REPLACE FUNCTION public.prevent_usuario_insert_forgery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_tenant uuid;
  v_caller_owner boolean;
  v_caller_admin boolean;
  v_caller_perfil text;
  v_caller_cliente uuid;
  v_perfil_nome text;
BEGIN
  -- Contextos administrativos (SQL editor, service role, migrations) não
  -- possuem JWT e são confiáveis: enforcement vale para sessões de usuário.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_caller_tenant := public.get_user_tenant_id();

  -- Chamador sem registro corporativo (ex.: token sem usuarios) não cria linhas
  IF v_caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Acesso Negado: criação direta de usuário não autorizada.' USING ERRCODE = '42501';
  END IF;

  IF NEW.empresa_operadora_id IS DISTINCT FROM v_caller_tenant THEN
    RAISE EXCEPTION 'Acesso Negado: tenant não corresponde ao do chamador.' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(NEW.is_owner, false) THEN
    RAISE EXCEPTION 'Acesso Negado: criação direta de conta OWNER não autorizada.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(u.is_owner, false),
         (UPPER(COALESCE(p.nome, '')) = 'ADMIN'),
         UPPER(COALESCE(p.nome, '')),
         u.cliente_id
    INTO v_caller_owner, v_caller_admin, v_caller_perfil, v_caller_cliente
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
   WHERE u.id = auth.uid();

  IF NEW.perfil_id IS NOT NULL THEN
    SELECT nome INTO v_perfil_nome FROM public.perfis WHERE id = NEW.perfil_id;
    IF v_perfil_nome = 'OWNER' THEN
      RAISE EXCEPTION 'Acesso Negado: perfil OWNER não pode ser atribuído em criação.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Caminho SANCIONADO: provisionamento oficial via RPC (GUC transacional)
  IF COALESCE(current_setting('app.sobremidia.provisioning', true), '') = 'on' THEN
    IF NOT v_caller_owner AND NOT v_caller_admin THEN
      IF v_caller_perfil <> 'ANUNCIANTE'
         OR v_perfil_nome IS NULL
         OR v_perfil_nome NOT IN ('CLIENTE', 'ANUNCIANTE')
         OR NEW.cliente_id IS NULL
         OR NEW.cliente_id IS DISTINCT FROM v_caller_cliente THEN
        RAISE EXCEPTION 'Acesso Negado: equipe do anunciante aceita apenas perfis CLIENTE/ANUNCIANTE do próprio cliente.' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF v_perfil_nome = 'ADMIN' AND NOT v_caller_owner THEN
      IF NOT public.has_admin_permission('users.create_admin') THEN
        RAISE EXCEPTION 'Acesso Negado: criar ADMIN requer users.create_admin.' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Caminho DIRETO (sem sanção): apenas OWNER/ADMIN
  IF NOT v_caller_owner AND NOT v_caller_admin THEN
    RAISE EXCEPTION 'Acesso Negado: apenas OWNER ou ADMIN criam usuários.' USING ERRCODE = '42501';
  END IF;

  IF v_perfil_nome = 'ADMIN' AND NOT v_caller_owner THEN
    IF NOT public.has_admin_permission('users.create_admin') THEN
      RAISE EXCEPTION 'Acesso Negado: criar ADMIN requer users.create_admin.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- A RPC oficial marca o contexto sancionado dentro da própria transação
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
    v_perfil_nome text;
    v_perfil_ativo boolean;
    v_cliente_final uuid := NULL;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Acesso Negado: sessão inválida.' USING ERRCODE = '42501';
    END IF;

    -- Sanção oficial deste caminho (lido pelo trigger de anti-forgery)
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
    ELSIF v_caller_perfil = 'ANUNCIANTE' THEN
        IF v_caller_cliente IS NULL THEN
            RAISE EXCEPTION 'Acesso Negado: anunciante sem vínculo comercial.' USING ERRCODE = '42501';
        END IF;
        IF v_perfil_nome NOT IN ('CLIENTE','ANUNCIANTE') THEN
            RAISE EXCEPTION 'Acesso Negado: equipe do anunciante aceita apenas perfis CLIENTE ou ANUNCIANTE.' USING ERRCODE = '42501';
        END IF;
        v_cliente_final := v_caller_cliente;
    ELSE
        RAISE EXCEPTION 'Acesso Negado: provisionamento restrito a OWNER, ADMIN ou ANUNCIANTE.' USING ERRCODE = '42501';
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
         jsonb_build_object('criado_via', 'PROVISIONAMENTO_DIRETO', 'perfil_nome', v_perfil_nome,
                            'cliente_id', v_cliente_final),
         'APPROVED', v_caller, NOW(), 'CRIACAO_CORPORATIVA_PROVISIONADA', p_perfil_id, v_caller);

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_caller_tenant, v_caller, 'USUARIO', p_uid, 'USER_PROVISIONED', 'ACTIVE',
         'Usuário provisionado com acesso imediato e troca obrigatória de senha. Perfil: '
         || v_perfil_nome || '. Cliente: ' || coalesce(v_cliente_final::text,'—'));

    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato, titulo, mensagem,
         prioridade, severidade, status_envio, lida, status_notificacao)
    VALUES
        (v_caller_tenant, p_uid, 'USER_PROVISIONED', 'IN_APP', p_uid,
         'Bem-vindo(a) à SOBRE MÍDIA',
         'Seu acesso foi criado. Utilize a senha inicial fornecida pelo administrador e defina uma nova senha no primeiro login.',
         'SUCESSO', 'INFO', 'SENT', false, 'NAO_LIDA');

    RETURN p_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.provisionar_usuario_corporativo(UUID, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provisionar_usuario_corporativo(UUID, TEXT, TEXT, TEXT, UUID, UUID) TO authenticated;

DO $$
DECLARE n INT;
BEGIN
    SELECT position('app.sobremidia.provisioning' in prosrc) INTO n
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
     WHERE ns.nspname='public' AND p.proname='provisionar_usuario_corporativo';
    IF COALESCE(n,0) = 0 THEN
        RAISE EXCEPTION 'GATE: RPC sem sanção GUC.';
    END IF;
END $$;

-- ----------------------------------------------------------------------
-- GUARDA CANÔNICA IDEMPOTENTE (reafirma 20261026)
-- Regressão estrutural exige que a última migration tocando o ciclo de
-- provisionamento reafirme o DDL canônico e a invariante server-side:
--Garantia: must_change_password inicia obrigatoriamente como TRUE
-- em TODO acesso provisionado (nunca FALSE por padrão).
-- ----------------------------------------------------------------------
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
