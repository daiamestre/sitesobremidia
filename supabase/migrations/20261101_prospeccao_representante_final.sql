-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261101
-- CENTRAL DE PROSPECÇÃO DO REPRESENTANTE — CONSOLIDAÇÃO FINAL
--
-- Correções (auditadas ao vivo em produção):
--   P0. provisionar_usuario_corporativo possuía DUAS sobrecargas
--       (6 e 7 parâmetros, migrations 20261039_prospeccao e
--       20261039_provisionamento). PostgREST não resolvia NENHUMA
--       chamada (PGRST203) — quebrava OWNER/ADMIN/ANUNCIANTE e o novo
--       caminho do representante. Esta migration consolida UMA única
--       assinatura canônica de 7 parâmetros.
--   P1. prevent_usuario_insert_forgery (20261040) removeu o caminho
--       sancionado REPRESENTANTE→GESTOR; restaurado aqui com as mesmas
--       garantias (tenant fixo, sem cliente vinculado, anti-forgery).
--   P2. RPC criar_ponto_parceiro_prospeccao — cadastro de PONTO PARCEIRO
--       pelo REPRESENTANTE com validação server-side, auditoria,
--       código EST- (trigger existente) e notificação na Central.
--
-- PRESERVADO SEM ALTERAÇÃO DESTRUTIVA:
--   - tabela cliente_pontos + RLS (20261039)
--   - RPC selecionar_pontos_prospeccao / listar_pontos_para_anunciar /
--     get_kpis_prospeccao_representante
--   - matriz de identificação amigável ANU-/REP-/EST- (20261036)
--   - fluxo de fechamento comercial REPRESENTANTE→CLIENTE/ANUNCIANTE
-- ======================================================================

-- ──────────────────────────────────────────────────────────────────────
-- P0. CONSOLIDAÇÃO DA RPC DE PROVISIONAMENTO (assinatura única)
-- ──────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.provisionar_usuario_corporativo(UUID, TEXT, TEXT, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS public.provisionar_usuario_corporativo(UUID, TEXT, TEXT, TEXT, UUID, UUID, JSONB);

CREATE FUNCTION public.provisionar_usuario_corporativo(
    p_uid UUID,
    p_email TEXT,
    p_nome TEXT,
    p_telefone TEXT DEFAULT NULL,
    p_perfil_id UUID DEFAULT NULL,
    p_cliente_id UUID DEFAULT NULL,
    p_dados_extra JSONB DEFAULT NULL
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
$$;

REVOKE ALL ON FUNCTION public.provisionar_usuario_corporativo(UUID, TEXT, TEXT, TEXT, UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provisionar_usuario_corporativo(UUID, TEXT, TEXT, TEXT, UUID, UUID, JSONB) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- P1. TRIGGER ANTI-FORGERY — restaura caminho sancionado REPRESENTANTE:
--     a) CLIENTE/ANUNCIANTE de cliente da própria carteira;
--     b) GESTOR sem cliente vinculado (Central de Prospecção).
-- ──────────────────────────────────────────────────────────────────────
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
  v_caller_rep uuid;
  v_perfil_nome text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_caller_tenant := public.get_user_tenant_id();

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
         u.cliente_id,
         r.id
    INTO v_caller_owner, v_caller_admin, v_caller_perfil, v_caller_cliente, v_caller_rep
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
    LEFT JOIN public.representantes r ON r.usuario_id = u.id
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
      IF v_caller_perfil = 'ANUNCIANTE' THEN
        IF v_perfil_nome IS NULL OR v_perfil_nome NOT IN ('CLIENTE','ANUNCIANTE')
           OR NEW.cliente_id IS NULL OR NEW.cliente_id IS DISTINCT FROM v_caller_cliente THEN
          RAISE EXCEPTION 'Acesso Negado: equipe do anunciante aceita apenas perfis CLIENTE/ANUNCIANTE do próprio cliente.' USING ERRCODE = '42501';
        END IF;
      ELSIF v_caller_perfil = 'REPRESENTANTE' THEN
        IF v_caller_rep IS NULL THEN
          RAISE EXCEPTION 'Acesso Negado: representante não registrado.' USING ERRCODE = '42501';
        END IF;
        IF v_perfil_nome IN ('CLIENTE','ANUNCIANTE') THEN
          IF NEW.cliente_id IS NULL THEN
            RAISE EXCEPTION 'Acesso Negado: CLIENTE/ANUNCIANTE exige cliente vinculado.' USING ERRCODE = '42501';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM public.clientes c
            JOIN public.representantes r ON r.id = c.representante_id
            WHERE c.id = NEW.cliente_id
              AND c.empresa_operadora_id = v_caller_tenant
              AND r.usuario_id = auth.uid()
              AND r.ativo
          ) THEN
            RAISE EXCEPTION 'Acesso Negado: cliente fora da carteira do representante.' USING ERRCODE = '42501';
          END IF;
        ELSIF v_perfil_nome = 'GESTOR' THEN
          IF NEW.cliente_id IS NOT NULL THEN
            RAISE EXCEPTION 'Acesso Negado: GESTOR de prospecção não pode nascer vinculado a cliente.' USING ERRCODE = '42501';
          END IF;
        ELSE
          RAISE EXCEPTION 'Acesso Negado: representante provisiona apenas CLIENTE/ANUNCIANTE da carteira ou GESTOR.' USING ERRCODE = '42501';
        END IF;
      ELSE
        RAISE EXCEPTION 'Acesso Negado: criação de usuário não sancionada para este perfil.' USING ERRCODE = '42501';
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

-- ──────────────────────────────────────────────────────────────────────
-- P2. CADASTRO DE PONTO PARCEIRO NA PROSPECÇÃO (server-side completo)
--     Valida tenant+ator, insere em pontos (código EST- pelo trigger
--     existente), registra auditoria e notifica OWNER/ADMIN na Central.
--     A policy pontos_interno_insert permanece como segunda barreira.
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.criar_ponto_parceiro_prospeccao(
    p_dados JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_tenant UUID;
    v_perfil TEXT;
    v_rep UUID;
    v_nome TEXT;
    v_modelo TEXT;
    v_telas INT;
    v_uf TEXT;
    v_percentual NUMERIC;
    v_novo RECORD;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
    END IF;

    v_tenant := public.get_user_empresa_operadora_id(v_caller);
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'Usuário sem tenant.' USING ERRCODE = '42501';
    END IF;

    SELECT UPPER(COALESCE(p.nome, '')), r.id INTO v_perfil, v_rep
      FROM public.usuarios u
      LEFT JOIN public.perfis p ON p.id = u.perfil_id
      LEFT JOIN public.representantes r ON r.usuario_id = u.id
     WHERE u.id = v_caller;

    -- AUTORIZAÇÃO: representante ativo OU papel interno (OWNER/ADMIN etc.)
    IF v_perfil <> 'REPRESENTANTE' AND NOT public.is_internal_role() THEN
        RAISE EXCEPTION 'Acesso Negado: apenas representantes ou equipe interna cadastram pontos parceiros.' USING ERRCODE = '42501';
    END IF;

    -- VALIDAÇÃO server-side dos campos essenciais (missão §12–§18)
    v_nome := NULLIF(TRIM(COALESCE(p_dados->>'nome', '')), '');
    IF v_nome IS NULL OR CHAR_LENGTH(v_nome) < 2 THEN
        RAISE EXCEPTION 'Nome do ponto parceiro é obrigatório.' USING ERRCODE = '22023';
    END IF;

    v_telas := COALESCE((p_dados->>'quantidade_telas')::INT, 1);
    IF v_telas < 0 OR v_telas > 9999 THEN
        RAISE EXCEPTION 'Quantidade de telas inválida.' USING ERRCODE = '22023';
    END IF;

    v_modelo := UPPER(COALESCE(p_dados->>'modelo_comercial', 'PERMUTA'));
    IF v_modelo NOT IN ('PERMUTA','COMISSIONADO') THEN
        RAISE EXCEPTION 'Modelo comercial deve ser PERMUTA ou COMISSIONADO.' USING ERRCODE = '22023';
    END IF;

    IF v_modelo = 'COMISSIONADO' THEN
        BEGIN
            v_percentual := NULLIF(p_dados->>'percentual_comissao', '')::NUMERIC;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Percentual de comissão inválido.' USING ERRCODE = '22023';
        END;
        -- §18: NÃO fixar 8–10% automaticamente; apenas limites sanitários.
        IF v_percentual IS NOT NULL AND (v_percentual <= 0 OR v_percentual >= 100) THEN
            RAISE EXCEPTION 'Percentual de comissão deve estar entre 0 e 100 (exclusivos).' USING ERRCODE = '22023';
        END IF;
    END IF;

    v_uf := NULLIF(UPPER(TRIM(COALESCE(p_dados->>'estado', ''))), '');
    IF v_uf IS NOT NULL AND CHAR_LENGTH(v_uf) <> 2 THEN
        RAISE EXCEPTION 'UF deve ter 2 letras.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.pontos (
        empresa_operadora_id, nome, categoria, descricao, foto_url, galeria,
        cep, logradouro, numero, complemento, bairro, cidade, estado,
        quantidade_telas, disponibilidade, status_operacional,
        regras_comerciais, created_by
    ) VALUES (
        v_tenant,
        v_nome,
        NULLIF(TRIM(COALESCE(p_dados->>'categoria', '')), ''),
        NULLIF(TRIM(COALESCE(p_dados->>'descricao', '')), ''),
        NULLIF(TRIM(COALESCE(p_dados->>'foto_capa_url', '')), ''),
        COALESCE(p_dados->'fotos_urls', '[]'::jsonb),
        NULLIF(TRIM(COALESCE(p_dados->>'cep', '')), ''),
        NULLIF(TRIM(COALESCE(p_dados->>'logradouro', '')), ''),
        NULLIF(TRIM(COALESCE(p_dados->>'numero', '')), ''),
        NULLIF(TRIM(COALESCE(p_dados->>'complemento', '')), ''),
        NULLIF(TRIM(COALESCE(p_dados->>'bairro', '')), ''),
        NULLIF(TRIM(COALESCE(p_dados->>'cidade', '')), ''),
        v_uf,
        v_telas,
        'DISPONIVEL',
        'ATIVO',
        NULLIF(TRIM(COALESCE(p_dados->>'regras_comerciais', '')), ''),
        v_caller
    )
    RETURNING * INTO v_novo;

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_tenant, v_caller, 'PONTO', v_novo.id, 'INSERT', 'ATIVO',
         'PONTO PARCEIRO prospectado (' || v_modelo || ', ' || v_telas || ' tela(s)). Código: '
         || COALESCE(v_novo.codigo_publico, '—'));

    -- Workflow na Central para OWNER/ADMIN (sem duplicar por entidade)
    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, titulo, mensagem,
         prioridade, severidade, rota_destino, entidade_relacionada_tipo, entidade_relacionada_id)
    SELECT v_tenant, u.id, 'PROSPECCAO_REGISTRADA', 'IN_APP',
           'Novo ponto parceiro prospectado',
           'O ponto "' || v_nome || '" (' || COALESCE(v_novo.codigo_publico, '—') ||
           ') foi cadastrado na prospecção com ' || v_telas || ' tela(s). Modelo: ' || v_modelo || '.',
           'IMPORTANTE', 'INFO', '/workspace/pontos-parceiros',
           'ponto', v_novo.id
    FROM public.usuarios u
    JOIN public.perfis pf ON pf.id = u.perfil_id
    WHERE u.empresa_operadora_id = v_tenant
      AND u.ativo
      AND pf.nome IN ('OWNER','ADMIN')
      AND NOT EXISTS (
            SELECT 1 FROM public.notificacoes_central nc
            WHERE nc.tipo_evento = 'PROSPECCAO_REGISTRADA'
              AND nc.entidade_relacionada_id = v_novo.id
              AND nc.usuario_id = u.id
      );

    RETURN json_build_object(
        'id', v_novo.id,
        'codigo_publico', v_novo.codigo_publico,
        'nome', v_novo.nome,
        'disponibilidade', v_novo.disponibilidade
    );
END;
$$;

REVOKE ALL ON FUNCTION public.criar_ponto_parceiro_prospeccao(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_ponto_parceiro_prospeccao(JSONB) TO authenticated;
