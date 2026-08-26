-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261039
-- CENTRAL DE PROSPECÇÃO DO REPRESENTANTE
--
-- 1. cliente_pontos — relacionamento oficial ANUNCIANTE ↔ PONTO PARCEIRO
--    (N:N, compatível com Fase 17: pontos → unidade → telas/screens).
-- 2. RPC selecionar_pontos_prospeccao — seleção server-side com validação
--    de escopo (tenant + representante dono do cliente + disponibilidade).
-- 3. provisionar_usuario_corporativo + anti-forgery: REPRESENTANTE passa a
--    poder provisionar APENAS o perfil GESTOR (Gestor de Mídias), sem
--    cliente vinculado, mantendo todas as demais garantias.
-- 4. RPC get_kpis_prospeccao_representante — indicadores do dashboard.
--
-- IDENTIFICAÇÃO AMIGÁVEL (matriz já existente — preservada):
--   ANUNCIANTE      → clientes.codigo_publico     ANU-NNNNNN
--   PONTO PARCEIRO  → pontos.codigo_publico       EST-NNNNNN (trigger)
--   GESTOR DE MÍDIAS→ identificado pelo acesso provisionado (e-mail);
--                     código próprio de usuário NÃO existe na arquitetura.
-- ======================================================================

-- ──────────────────────────────────────────────────────────────────────
-- 1. RELACIONAMENTO ANUNCIANTE ↔ PONTO PARCEIRO
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cliente_pontos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    ponto_id UUID NOT NULL REFERENCES public.pontos(id) ON DELETE CASCADE,
    origem TEXT NOT NULL DEFAULT 'PROSPECCAO'
        CHECK (origem IN ('PROSPECCAO','CONTRATO','EXPANSAO')),
    selecionado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cliente_id, ponto_id)
);

CREATE INDEX IF NOT EXISTS idx_cp_tenant ON public.cliente_pontos(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_cp_cliente ON public.cliente_pontos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cp_ponto ON public.cliente_pontos(ponto_id);

DO $$ BEGIN
    CREATE TRIGGER trg_cp_updated_at
    BEFORE UPDATE ON public.cliente_pontos
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.cliente_pontos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY cp_select ON public.cliente_pontos
        FOR SELECT TO authenticated
        USING (
            empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
            AND (
                public.is_internal_role()
                OR cliente_id = public.get_user_cliente_id()
                OR EXISTS (
                    SELECT 1 FROM public.clientes c
                    JOIN public.representantes r ON r.id = c.representante_id
                    WHERE c.id = cliente_pontos.cliente_id
                      AND r.usuario_id = auth.uid()
                )
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY cp_write ON public.cliente_pontos
        FOR ALL TO authenticated
        USING (
            empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
            AND (
                public.is_internal_role()
                OR cliente_id = public.get_user_cliente_id()
            )
        )
        WITH CHECK (
            empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
            AND (
                public.is_internal_role()
                OR cliente_id = public.get_user_cliente_id()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_pontos TO authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 2. SELEÇÃO DE PONTOS NA PROSPECÇÃO (server-side, à prova de IDOR)
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.selecionar_pontos_prospeccao(
    p_cliente_id uuid,
    p_ponto_ids uuid[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_tenant UUID;
    v_perfil TEXT;
    v_rep_id UUID;
    v_cliente RECORD;
    v_validos UUID[];
    v_invalidos INT;
    v_vinculados INT;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
    END IF;

    v_tenant := public.get_user_empresa_operadora_id(v_caller);
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'Usuário sem tenant.' USING ERRCODE = '42501';
    END IF;

    SELECT UPPER(COALESCE(p.nome, '')), r.id
      INTO v_perfil, v_rep_id
      FROM public.usuarios u
      LEFT JOIN public.perfis p ON p.id = u.perfil_id
      LEFT JOIN public.representantes r ON r.usuario_id = u.id
     WHERE u.id = v_caller;

    SELECT * INTO v_cliente
      FROM public.clientes
     WHERE id = p_cliente_id
       AND empresa_operadora_id = v_tenant
       AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cliente inexistente ou fora do seu escopo.' USING ERRCODE = '42501';
    END IF;

    -- AUTORIZAÇÃO: representante DONO do cliente, papel interno, ou o próprio anunciante
    IF v_perfil = 'REPRESENTANTE' THEN
        IF v_rep_id IS NULL OR v_cliente.representante_id IS DISTINCT FROM v_rep_id THEN
            RAISE EXCEPTION 'Cliente não pertence à sua carteira.' USING ERRCODE = '42501';
        END IF;
    ELSIF NOT public.is_internal_role() THEN
        IF public.get_user_cliente_id() IS DISTINCT FROM p_cliente_id THEN
            RAISE EXCEPTION 'Sem permissão sobre este cliente.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Pontos válidos: mesmo tenant, ativos e DISPONÍVEIS (nunca fora do escopo)
    SELECT COALESCE(array_agg(po.id), '{}') INTO v_validos
      FROM public.pontos po
     WHERE po.id = ANY(COALESCE(p_ponto_ids, '{}'))
       AND po.empresa_operadora_id = v_tenant
       AND po.ativo
       AND po.deleted_at IS NULL
       AND po.disponibilidade = 'DISPONIVEL';

    SELECT COUNT(*) INTO v_invalidos
      FROM unnest(COALESCE(p_ponto_ids, '{}')) AS pid
     WHERE NOT EXISTS (SELECT 1 FROM unnest(v_validos) AS v WHERE v = pid);

    IF v_invalidos > 0 THEN
        RAISE EXCEPTION '% ponto(s) inválido(s): fora do tenant, inativos ou indisponíveis.', v_invalidos
          USING ERRCODE = '42501';
    END IF;

    -- Sincroniza a seleção de prospecção (permite desmarcar; não toca em
    -- vínculos de origem CONTRATO/EXPANSAO)
    DELETE FROM public.cliente_pontos
     WHERE cliente_id = p_cliente_id
       AND origem = 'PROSPECCAO'
       AND NOT (ponto_id = ANY(v_validos));

    INSERT INTO public.cliente_pontos
        (empresa_operadora_id, cliente_id, ponto_id, origem, selecionado_por)
    SELECT v_tenant, p_cliente_id, pid, 'PROSPECCAO', v_caller
      FROM unnest(v_validos) AS pid
      ON CONFLICT (cliente_id, ponto_id)
      DO UPDATE SET origem = 'PROSPECCAO',
                    selecionado_por = EXCLUDED.selecionado_por,
                    updated_at = now();

    SELECT COUNT(*) INTO v_vinculados
      FROM public.cliente_pontos WHERE cliente_id = p_cliente_id AND origem = 'PROSPECCAO';

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_tenant, v_caller, 'CLIENTE_PONTOS', p_cliente_id, 'PROSPECCAO_PONTOS_SINCRONIZADOS', 'ATIVO',
         'Pontos de prospecção sincronizados: ' || COALESCE(array_length(v_validos,1)::text,'0') ||
         ' · total ativo: ' || v_vinculados::text || '.');

    -- Workflow na Central para OWNER/ADMIN (sem duplicar para o mesmo cliente)
    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, titulo, mensagem,
         prioridade, severidade, rota_destino, entidade_relacionada_tipo, entidade_relacionada_id)
    SELECT v_tenant, u.id, 'PROSPECCAO_REGISTRADA', 'IN_APP',
           'Nova prospecção com pontos selecionados',
           'O cliente "' || COALESCE(v_cliente.nome_fantasia, v_cliente.razao_social) ||
           '" teve ' || v_vinculados::text || ' ponto(s) selecionado(s) na prospecção.',
           'IMPORTANTE', 'INFO', '/workspace/pontos-parceiros',
           'cliente', p_cliente_id
    FROM public.usuarios u
    JOIN public.perfis pf ON pf.id = u.perfil_id
    WHERE u.empresa_operadora_id = v_tenant
      AND u.ativo
      AND pf.nome IN ('OWNER','ADMIN')
      AND NOT EXISTS (
            SELECT 1 FROM public.notificacoes_central nc
            WHERE nc.tipo_evento = 'PROSPECCAO_REGISTRADA'
              AND nc.entidade_relacionada_id = p_cliente_id
              AND nc.usuario_id = u.id
      );

    RETURN json_build_object('vinculados', v_vinculados, 'selecionados', COALESCE(array_length(v_validos,1),0));
END;
$$;

REVOKE ALL ON FUNCTION public.selecionar_pontos_prospeccao(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.selecionar_pontos_prospeccao(uuid, uuid[]) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 3. PROVISIONAMENTO: REPRESENTANTE → SOMENTE PERFIL GESTOR
--    (extensão aditiva da versão 20261032 — todas as outras garantias
--     permanecem: GUC sancionado, anti-forgery, sem OWNER, tenant fixo)
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provisionar_usuario_corporativo(
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
    ELSIF v_caller_perfil = 'ANUNCIANTE' THEN
        IF v_caller_cliente IS NULL THEN
            RAISE EXCEPTION 'Acesso Negado: anunciante sem vínculo comercial.' USING ERRCODE = '42501';
        END IF;
        IF v_perfil_nome NOT IN ('CLIENTE','ANUNCIANTE') THEN
            RAISE EXCEPTION 'Acesso Negado: equipe do anunciante aceita apenas perfis CLIENTE ou ANUNCIANTE.' USING ERRCODE = '42501';
        END IF;
        v_cliente_final := v_caller_cliente;
    ELSIF v_caller_perfil = 'REPRESENTANTE' THEN
        -- NOVO CAMINHO SANCTIONADO (Central de Prospecção): representante
        -- provisiona exclusivamente GESTOR DE MÍDIAS, sem cliente vinculado.
        IF v_caller_rep IS NULL THEN
            RAISE EXCEPTION 'Acesso Negado: representante não registrado.' USING ERRCODE = '42501';
        END IF;
        IF v_perfil_nome <> 'GESTOR' THEN
            RAISE EXCEPTION 'Acesso Negado: representante só pode provisionar o perfil GESTOR (Gestor de Mídias).' USING ERRCODE = '42501';
        END IF;
        v_cliente_final := NULL;
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
                            'cliente_id', v_cliente_final)
         || COALESCE(p_dados_extra, '{}'::jsonb),
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

REVOKE ALL ON FUNCTION public.provisionar_usuario_corporativo(UUID, TEXT, TEXT, TEXT, UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provisionar_usuario_corporativo(UUID, TEXT, TEXT, TEXT, UUID, UUID, JSONB) TO authenticated;

-- Anti-forgery: caminho sancionado aceita também REPRESENTANTE→GESTOR
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

  IF COALESCE(current_setting('app.sobremidia.provisioning', true), '') = 'on' THEN
    IF NOT v_caller_owner AND NOT v_caller_admin THEN
      IF v_caller_perfil = 'ANUNCIANTE' THEN
        IF v_perfil_nome IS NULL
           OR v_perfil_nome NOT IN ('CLIENTE', 'ANUNCIANTE')
           OR NEW.cliente_id IS NULL
           OR NEW.cliente_id IS DISTINCT FROM v_caller_cliente THEN
          RAISE EXCEPTION 'Acesso Negado: equipe do anunciante aceita apenas perfis CLIENTE/ANUNCIANTE do próprio cliente.' USING ERRCODE = '42501';
        END IF;
      ELSIF v_caller_perfil = 'REPRESENTANTE' THEN
        IF v_caller_rep IS NULL OR v_perfil_nome IS DISTINCT FROM 'GESTOR' OR NEW.cliente_id IS NOT NULL THEN
          RAISE EXCEPTION 'Acesso Negado: representante provisiona apenas GESTOR sem cliente vinculado.' USING ERRCODE = '42501';
        END IF;
      ELSE
        RAISE EXCEPTION 'Acesso Negado: provisão não sancionada para este perfil.' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF v_perfil_nome = 'ADMIN' AND NOT v_caller_owner THEN
      IF NOT public.has_admin_permission('users.create_admin') THEN
        RAISE EXCEPTION 'Acesso Negado: criar ADMIN requer users.create_admin.' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

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
-- 4. KPIs DA PROSPECÇÃO (dashboard do representante)
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_kpis_prospeccao_representante()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_tenant UUID;
    v_perfil TEXT;
    v_rep UUID;
    result JSON;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
    END IF;

    v_tenant := public.get_user_empresa_operadora_id(v_caller);
    SELECT UPPER(COALESCE(p.nome,'')), r.id INTO v_perfil, v_rep
      FROM public.usuarios u
      LEFT JOIN public.perfis p ON p.id = u.perfil_id
      LEFT JOIN public.representantes r ON r.usuario_id = u.id
     WHERE u.id = v_caller;

    SELECT json_build_object(
        'meus_anunciantes', (
            SELECT COUNT(*) FROM public.clientes c
             WHERE c.deleted_at IS NULL
               AND (CASE WHEN v_perfil = 'REPRESENTANTE' AND v_rep IS NOT NULL
                         THEN c.representante_id = v_rep
                         ELSE c.empresa_operadora_id = v_tenant END)
        ),
        'pontos_disponiveis', (
            SELECT COUNT(*) FROM public.pontos po
             WHERE po.empresa_operadora_id = v_tenant
               AND po.ativo AND po.deleted_at IS NULL
               AND po.disponibilidade = 'DISPONIVEL'
        ),
        'gestores_ativos', (
            SELECT COUNT(*) FROM public.usuarios u2
            JOIN public.perfis p2 ON p2.id = u2.perfil_id
             WHERE u2.empresa_operadora_id = v_tenant
               AND u2.ativo AND p2.nome = 'GESTOR'
        ),
        'pontos_vinculados', (
            SELECT COUNT(DISTINCT cp.ponto_id)
              FROM public.cliente_pontos cp
              JOIN public.clientes c3 ON c3.id = cp.cliente_id
             WHERE cp.empresa_operadora_id = v_tenant
               AND (CASE WHEN v_perfil = 'REPRESENTANTE' AND v_rep IS NOT NULL
                         THEN c3.representante_id = v_rep
                         ELSE TRUE END)
        )
    ) INTO result;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_kpis_prospeccao_representante() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kpis_prospeccao_representante() TO authenticated;
