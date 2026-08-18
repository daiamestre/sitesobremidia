-- ======================================================================
-- SOBRE MÍDIA ERP — MIGRATION 20260826: MÓDULO REPRESENTANTES + DESEMPENHO
-- ======================================================================
-- Objetivo: entregar o backend oficial do módulo de Representantes
-- (gestão + carteira + desempenho + indicadores + ranking), integrado à
-- Central de Acessos já certificada (44/44 RED TEAM).
--
-- PRINCÍPIOS:
--   1. NÃO recria tabelas de usuários, RBAC ou permissões existentes.
--   2. Expande a Central de Acessos SOMENTE naquilo que o módulo exige:
--      novas chaves de permissão representantes.* (padrão permissoes_usuarios).
--   3. Toda operação é servida por RPC SECURITY DEFINER que deriva
--      tenant/perfil/permissão do contexto autenticado (auth.uid()).
--      Nenhum tenant_id/representante_id/escopo é confiado ao cliente.
--   4. RLS de public.representantes: endurecido com isolamento de tenant
--      (o módulo expõe essa tabela amplamente ao OWNER; a política legada
--      permitia ADMIN de qualquer tenant ler/editar representantes de todos).
--   5. Auditoria obrigatória das operações administrativas em auditoria_logs.
--   6. Nenhum dado fictício: indicadores derivados de tabelas oficiais
--      (clientes, propostas, contratos, metas_representantes, comissoes).
--
-- Idempotente: pode ser executada múltiplas vezes sem efeito colateral.
-- ======================================================================

-- ======================================================================
-- 1. PERMISSÕES DO MÓDULO REPRESENTANTES (expansão mínima da Central)
-- ======================================================================
-- Chaves novas (mesmo padrão users.* da Central):
--   representantes.view            → listar representantes do tenant
--   representantes.edit            → editar dados comerciais do representante
--   representantes.activate        → ativar representante
--   representantes.deactivate      → desativar representante
--   representantes.edit_clients    → alterar representante responsável de cliente
--   representantes.view_performance→ consultar desempenho/indicadores/ranking
-- OWNER recebe todas implicitamente; ADMIN e demais perfis só com delegação
-- explícita via Central de Acessos (gerenciar_autonomia).

CREATE OR REPLACE FUNCTION public.get_my_admin_permissions()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN (SELECT COALESCE(is_owner, false) FROM public.usuarios WHERE id = auth.uid())
      THEN ARRAY['users.view','users.create','users.edit','users.activate',
                 'users.deactivate','users.create_admin','users.manage_permissions',
                 'representantes.view','representantes.edit','representantes.activate',
                 'representantes.deactivate','representantes.edit_clients',
                 'representantes.view_performance']::text[]
    ELSE COALESCE(
      (SELECT array_agg(p.permissao) FROM public.permissoes_usuarios p WHERE p.usuario_id = auth.uid()),
      ARRAY[]::text[])
  END;
$$;

-- Guarda genérica do módulo: OWNER tem precedência; demais perfis exigem
-- delegação explícita da chave (ADMIN NÃO equivale a OWNER por padrão).
CREATE OR REPLACE FUNCTION public.pode_gerenciar_representantes(p_permissao text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT COALESCE(is_owner, false) FROM public.usuarios WHERE id = auth.uid()),
    false
  )
  OR p_permissao = ANY (public.get_my_admin_permissions());
$$;

-- ======================================================================
-- 2. RLS DE public.representantes — ISOLAMENTO DE TENANT (necessário)
-- ======================================================================
-- Motivo da alteração: o módulo expõe a tabela de representantes para a
-- gestão do OWNER; a política legada (p_representantes_self_or_admin)
-- permitia a qualquer ADMIN ler/editar representantes de TODOS os tenants.
-- Nova regra: o representante vê o próprio registro; OWNER/ADMIN/GESTOR/
-- GERENTE/SUPERVISOR/FINANCEIRO veem e administram SOMENTE representantes
-- do PRÓPRIO tenant (auth.uid() → usuarios.empresa_operadora_id).
--
-- CORREÇÃO (auditoria de homologação 2026-08-26): a política é FOR SELECT
-- e não FOR ALL. Com FOR ALL, o ramo `usuario_id = auth.uid()` concederia
-- ao próprio representante INSERT/UPDATE/DELETE na própria linha via REST
-- (comissão, chave_pix, ativo) sem passar pelo RPC auditado, afrouxando o
-- endurecimento de escrita da Central (rep_update_tenant: OWNER/ADMIN do
-- mesmo tenant). Escrita continua restrita a rep_update_tenant/rep_insert_
-- tenant/rep_delete_tenant (20260825).

DROP POLICY IF EXISTS p_representantes_self_or_admin ON public.representantes;
CREATE POLICY p_representantes_self_or_admin ON public.representantes
FOR SELECT TO authenticated
USING (
  usuario_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid()
      AND u.empresa_operadora_id = representantes.empresa_operadora_id
      AND (
        u.is_owner = true
        OR p.nome IN ('ADMIN', 'GERENTE', 'GESTOR', 'SUPERVISOR')
      )
  )
);

-- ======================================================================
-- 3. ÍNDICES DE DESEMPENHO (evitar N+1 em volume alto)
-- ======================================================================
CREATE INDEX IF NOT EXISTS idx_clientes_rep_created ON public.clientes(representante_id, created_at);
CREATE INDEX IF NOT EXISTS idx_propostas_rep_created ON public.propostas(representante_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contratos_rep_created ON public.contratos(representante_id, created_at);

-- ======================================================================
-- 4. RPC: LISTAR REPRESENTANTES (gestão com indicadores agregados)
-- ======================================================================
-- Permissão: pode_gerenciar_representantes('representantes.view')
-- Escopo: tenant derivado de auth.uid() — p_empresa_operadora_id do cliente
-- é aceito somente quando coincide com o tenant autenticado.
CREATE OR REPLACE FUNCTION public.listar_representantes_gerencia(
  p_empresa_operadora_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_busca text DEFAULT NULL,
  p_representante_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_mes integer := EXTRACT(MONTH FROM CURRENT_DATE)::integer;
  v_ano integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso Negado: sessão inválida.' USING ERRCODE = '42501';
  END IF;

  SELECT empresa_operadora_id INTO v_tenant FROM public.usuarios WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso Negado: usuário não registrado.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.pode_gerenciar_representantes('representantes.view') THEN
    RAISE EXCEPTION 'Acesso Negado: permissão representantes.view não concedida.' USING ERRCODE = '42501';
  END IF;

  -- Empresa informada pelo cliente só é aceita se for o próprio tenant
  IF p_empresa_operadora_id IS NOT NULL AND p_empresa_operadora_id <> v_tenant THEN
    RAISE EXCEPTION 'Acesso Negado: empresa operadora fora do seu tenant.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(row_to_json(t) ORDER BY t.nome)
    INTO v_result
    FROM (
      SELECT
        r.id,
        r.codigo_representante,
        COALESCE(u.nome, 'Representante') AS nome,
        u.email,
        u.telefone,
        r.cpf_cnpj,
        r.razao_social,
        r.comissao_porcentagem,
        r.ativo,
        r.created_at,
        r.updated_at,
        u.ativo AS usuario_ativo,
        UPPER(COALESCE(p.nome, '')) AS perfil_nome,
        (SELECT count(*) FROM public.clientes c
          WHERE c.representante_id = r.id AND c.empresa_operadora_id = v_tenant
            AND c.status <> 'CANCELED') AS total_clientes,
        (SELECT count(*) FROM public.clientes c
          WHERE c.representante_id = r.id AND c.empresa_operadora_id = v_tenant
            AND c.status = 'ACTIVE') AS clientes_ativos,
        (SELECT count(*) FROM public.propostas pr
          WHERE pr.representante_id = r.id AND pr.empresa_operadora_id = v_tenant) AS total_propostas,
        (SELECT count(*) FROM public.contratos ct
          WHERE ct.representante_id = r.id AND ct.empresa_operadora_id = v_tenant
            AND ct.status_workflow NOT IN ('CANCELADO', 'CAMPANHA_FINALIZADA')) AS total_contratos,
        (SELECT COALESCE(sum(ct.valor_mensal), 0) FROM public.contratos ct
          WHERE ct.representante_id = r.id AND ct.empresa_operadora_id = v_tenant
            AND ct.status_workflow NOT IN ('CANCELADO', 'CAMPANHA_FINALIZADA')) AS receita_mensal,
        (SELECT COALESCE(mr.valor_meta, 0) FROM public.metas_representantes mr
          WHERE mr.representante_id = r.id AND mr.empresa_operadora_id = v_tenant
            AND mr.ano = v_ano AND mr.mes = v_mes) AS meta_mensal,
        (SELECT COALESCE(mr.valor_realizado, 0) FROM public.metas_representantes mr
          WHERE mr.representante_id = r.id AND mr.empresa_operadora_id = v_tenant
            AND mr.ano = v_ano AND mr.mes = v_mes) AS meta_realizado
      FROM public.representantes r
      JOIN public.usuarios u ON u.id = r.usuario_id
      LEFT JOIN public.perfis p ON p.id = u.perfil_id
      WHERE r.empresa_operadora_id = v_tenant
        AND r.deleted_at IS NULL
        AND (p_representante_id IS NULL OR r.id = p_representante_id)
        AND (p_status IS NULL OR UPPER(r.ativo::text) = UPPER(p_status)
             OR (UPPER(p_status) = 'ATIVO' AND r.ativo = true)
             OR (UPPER(p_status) IN ('INATIVO','INACTIVE') AND r.ativo = false))
        AND (
          p_busca IS NULL OR p_busca = ''
          OR u.nome ILIKE '%' || p_busca || '%'
          OR u.email ILIKE '%' || p_busca || '%'
          OR r.cpf_cnpj ILIKE '%' || p_busca || '%'
          OR r.razao_social ILIKE '%' || p_busca || '%'
        )
    ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.listar_representantes_gerencia(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_representantes_gerencia(uuid, text, text, uuid) TO authenticated;

-- ======================================================================
-- 5. RPC: GERENCIAR REPRESENTANTE (editar / ativar / desativar)
-- ======================================================================
-- Criação de representante continua sendo feita pela Central de Acessos
-- (NOVO ACESSO → perfil REPRESENTANTE → registro oficial em representantes),
-- sem duplicação de fluxo. Este RPC cobre os dados comerciais e o status.
CREATE OR REPLACE FUNCTION public.gerenciar_representante(
  p_acao text,
  p_representante_id uuid,
  p_cpf_cnpj text DEFAULT NULL,
  p_razao_social text DEFAULT NULL,
  p_comissao_porcentagem numeric DEFAULT NULL,
  p_chave_pix text DEFAULT NULL,
  p_banco_nome text DEFAULT NULL,
  p_banco_agencia text DEFAULT NULL,
  p_banco_conta text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_role text;
  v_permissao text;
  v_status_antigo boolean;
  v_status_novo boolean;
  v_obs text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso Negado: sessão inválida.' USING ERRCODE = '42501';
  END IF;

  SELECT u.empresa_operadora_id, UPPER(COALESCE(p.nome, ''))
    INTO v_tenant, v_role
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso Negado: usuário não registrado.' USING ERRCODE = '42501';
  END IF;

  -- Autorização por ação (regras da Central: OWNER sempre; demais com delegação)
  CASE UPPER(p_acao)
    WHEN 'EDITAR' THEN v_permissao := 'representantes.edit';
    WHEN 'ATIVAR' THEN v_permissao := 'representantes.activate';
    WHEN 'DESATIVAR' THEN v_permissao := 'representantes.deactivate';
    ELSE RAISE EXCEPTION 'Ação inválida. Use EDITAR, ATIVAR ou DESATIVAR.' USING ERRCODE = '22023';
  END CASE;

  IF NOT public.pode_gerenciar_representantes(v_permissao) THEN
    RAISE EXCEPTION 'Acesso Negado: permissão % não concedida.', v_permissao USING ERRCODE = '42501';
  END IF;

  -- Representante alvo deve existir e pertencer ao tenant do chamador
  SELECT ativo INTO v_status_antigo
    FROM public.representantes
    WHERE id = p_representante_id AND empresa_operadora_id = v_tenant AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso Negado: representante fora do seu tenant.' USING ERRCODE = '42501';
  END IF;

  IF UPPER(p_acao) = 'EDITAR' THEN
    UPDATE public.representantes SET
      cpf_cnpj = COALESCE(NULLIF(p_cpf_cnpj, ''), cpf_cnpj),
      razao_social = COALESCE(NULLIF(p_razao_social, ''), razao_social),
      comissao_porcentagem = CASE WHEN p_comissao_porcentagem IS NULL THEN comissao_porcentagem
                                  ELSE GREATEST(p_comissao_porcentagem, 0) END,
      chave_pix = COALESCE(p_chave_pix, chave_pix),
      banco_nome = COALESCE(p_banco_nome, banco_nome),
      banco_agencia = COALESCE(p_banco_agencia, banco_agencia),
      banco_conta = COALESCE(p_banco_conta, banco_conta),
      updated_by = v_uid,
      updated_at = now()
    WHERE id = p_representante_id AND empresa_operadora_id = v_tenant;
    v_obs := 'Dados comerciais atualizados via módulo Representantes.';
    INSERT INTO public.auditoria_logs
      (empresa_operadora_id, usuario_id, usuario_email, usuario_role, entidade_tipo, entidade_id,
       acao, status_novo, observacoes)
    VALUES
      (v_tenant, v_uid, (SELECT email FROM public.usuarios WHERE id = v_uid), v_role,
       'REPRESENTANTE', p_representante_id, 'REPRESENTANTE_UPDATED', 'UPDATED', v_obs);
    RETURN jsonb_build_object('success', true, 'acao', 'EDITAR');

  ELSIF UPPER(p_acao) IN ('ATIVAR', 'DESATIVAR') THEN
    v_status_novo := (UPPER(p_acao) = 'ATIVAR');
    UPDATE public.representantes SET
      ativo = v_status_novo,
      updated_by = v_uid,
      updated_at = now()
    WHERE id = p_representante_id AND empresa_operadora_id = v_tenant;
    v_obs := CASE WHEN v_status_novo THEN 'Representante ativado.' ELSE 'Representante desativado.' END;
    INSERT INTO public.auditoria_logs
      (empresa_operadora_id, usuario_id, usuario_email, usuario_role, entidade_tipo, entidade_id,
       acao, status_anterior, status_novo, observacoes)
    VALUES
      (v_tenant, v_uid, (SELECT email FROM public.usuarios WHERE id = v_uid), v_role,
       'REPRESENTANTE', p_representante_id,
       CASE WHEN v_status_novo THEN 'REPRESENTANTE_ACTIVATED' ELSE 'REPRESENTANTE_DEACTIVATED' END,
       CASE WHEN v_status_antigo THEN 'ATIVO' ELSE 'INATIVO' END,
       CASE WHEN v_status_novo THEN 'ATIVO' ELSE 'INATIVO' END,
       v_obs);
    INSERT INTO public.notificacoes_central
      (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato, titulo, mensagem,
       prioridade, severidade, status_envio, lida, status_notificacao)
    SELECT v_tenant, r.usuario_id, 'REPRESENTANTE_STATUS', 'IN_APP', r.usuario_id,
           CASE WHEN v_status_novo THEN 'Seu acesso comercial foi ativado' ELSE 'Seu acesso comercial foi desativado' END,
           v_obs, 'SUCESSO', 'INFO', 'SENT', false, 'NAO_LIDA'
      FROM public.representantes r WHERE r.id = p_representante_id;
    RETURN jsonb_build_object('success', true, 'acao', CASE WHEN v_status_novo THEN 'ATIVAR' ELSE 'DESATIVAR' END);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gerenciar_representante(text, uuid, text, text, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerenciar_representante(text, uuid, text, text, numeric, text, text, text, text) TO authenticated;

-- ======================================================================
-- 6. RPC: DESEMPENHO DOS REPRESENTANTES (indicadores + ranking reais)
-- ======================================================================
-- Fonte dos indicadores: tabelas oficiais (clientes, propostas, contratos,
-- metas_representantes). Nenhum número é inventado — dados ausentes
-- retornam 0 de forma coerente.
CREATE OR REPLACE FUNCTION public.get_desempenho_representantes(
  p_periodo_inicio date DEFAULT NULL,
  p_periodo_fim date DEFAULT NULL,
  p_representante_id uuid DEFAULT NULL,
  p_empresa_operadora_id uuid DEFAULT NULL,
  p_ordenar text DEFAULT 'receita'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_inicio date := COALESCE(p_periodo_inicio, (CURRENT_DATE - INTERVAL '30 days')::date);
  v_fim date := COALESCE(p_periodo_fim, CURRENT_DATE);
  v_mes integer := EXTRACT(MONTH FROM CURRENT_DATE)::integer;
  v_ano integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso Negado: sessão inválida.' USING ERRCODE = '42501';
  END IF;

  SELECT empresa_operadora_id INTO v_tenant FROM public.usuarios WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso Negado: usuário não registrado.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.pode_gerenciar_representantes('representantes.view_performance') THEN
    RAISE EXCEPTION 'Acesso Negado: permissão representantes.view_performance não concedida.' USING ERRCODE = '42501';
  END IF;

  IF p_empresa_operadora_id IS NOT NULL AND p_empresa_operadora_id <> v_tenant THEN
    RAISE EXCEPTION 'Acesso Negado: empresa operadora fora do seu tenant.' USING ERRCODE = '42501';
  END IF;

  IF v_fim < v_inicio THEN
    v_fim := v_inicio;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.receita_mensal DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        r.id AS representante_id,
        r.codigo_representante,
        COALESCE(u.nome, 'Representante') AS nome,
        u.email,
        r.razao_social,
        r.cpf_cnpj,
        r.ativo,
        r.comissao_porcentagem,
        (SELECT count(*) FROM public.clientes c
          WHERE c.representante_id = r.id AND c.empresa_operadora_id = v_tenant
            AND c.status <> 'CANCELED') AS total_clientes,
        (SELECT count(*) FROM public.clientes c
          WHERE c.representante_id = r.id AND c.empresa_operadora_id = v_tenant
            AND c.status = 'ACTIVE') AS clientes_ativos,
        (SELECT count(*) FROM public.clientes c
          WHERE c.representante_id = r.id AND c.empresa_operadora_id = v_tenant
            AND c.status IN ('INACTIVE', 'CANCELED')) AS clientes_inativos,
        (SELECT count(*) FROM public.clientes c
          WHERE c.representante_id = r.id AND c.empresa_operadora_id = v_tenant
            AND c.created_at::date >= v_inicio AND c.created_at::date <= v_fim) AS clientes_novos,
        (SELECT count(*) FROM public.propostas pr
          WHERE pr.representante_id = r.id AND pr.empresa_operadora_id = v_tenant
            AND pr.created_at::date >= v_inicio AND pr.created_at::date <= v_fim) AS propostas_criadas,
        (SELECT count(*) FROM public.propostas pr
          WHERE pr.representante_id = r.id AND pr.empresa_operadora_id = v_tenant
            AND pr.status IN ('APROVADA', 'APPROVED')
            AND pr.created_at::date >= v_inicio AND pr.created_at::date <= v_fim) AS propostas_aprovadas,
        (SELECT count(*) FROM public.contratos ct
          WHERE ct.representante_id = r.id AND ct.empresa_operadora_id = v_tenant
            AND ct.created_at::date >= v_inicio AND ct.created_at::date <= v_fim) AS contratos_fechados,
        (SELECT count(*) FROM public.contratos ct
          WHERE ct.representante_id = r.id AND ct.empresa_operadora_id = v_tenant
            AND ct.status_workflow NOT IN ('CANCELADO', 'CAMPANHA_FINALIZADA')) AS contratos_ativos,
        (SELECT COALESCE(sum(ct.valor_mensal), 0) FROM public.contratos ct
          WHERE ct.representante_id = r.id AND ct.empresa_operadora_id = v_tenant
            AND ct.status_workflow NOT IN ('CANCELADO', 'CAMPANHA_FINALIZADA')) AS receita_mensal,
        (SELECT COALESCE(mr.valor_meta, 0) FROM public.metas_representantes mr
          WHERE mr.representante_id = r.id AND mr.empresa_operadora_id = v_tenant
            AND mr.ano = v_ano AND mr.mes = v_mes) AS meta_mensal,
        (SELECT COALESCE(mr.valor_realizado, 0) FROM public.metas_representantes mr
          WHERE mr.representante_id = r.id AND mr.empresa_operadora_id = v_tenant
            AND mr.ano = v_ano AND mr.mes = v_mes) AS meta_realizado
      FROM public.representantes r
      JOIN public.usuarios u ON u.id = r.usuario_id
      WHERE r.empresa_operadora_id = v_tenant
        AND r.deleted_at IS NULL
        AND (p_representante_id IS NULL OR r.id = p_representante_id)
    ) t;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_desempenho_representantes(date, date, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_desempenho_representantes(date, date, uuid, uuid, text) TO authenticated;

-- ======================================================================
-- 7. RPC: DESEMPENHO INDIVIDUAL (drill-down do representante)
-- ======================================================================
-- Permissão: OWNER/permissão view_performance OU o próprio representante
-- consultando o próprio desempenho ("Meu desempenho").
CREATE OR REPLACE FUNCTION public.get_desempenho_representante_detalhe(
  p_representante_id uuid,
  p_periodo_inicio date DEFAULT NULL,
  p_periodo_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_own_rep uuid;
  v_inicio date := COALESCE(p_periodo_inicio, (CURRENT_DATE - INTERVAL '3 months')::date);
  v_fim date := COALESCE(p_periodo_fim, CURRENT_DATE);
  v_periodo_inicio date := COALESCE(p_periodo_inicio, (CURRENT_DATE - INTERVAL '30 days')::date);
  v_mes integer := EXTRACT(MONTH FROM CURRENT_DATE)::integer;
  v_ano integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso Negado: sessão inválida.' USING ERRCODE = '42501';
  END IF;

  SELECT u.empresa_operadora_id, r.id
    INTO v_tenant, v_own_rep
    FROM public.usuarios u
    LEFT JOIN public.representantes r ON r.usuario_id = u.id
    WHERE u.id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso Negado: usuário não registrado.' USING ERRCODE = '42501';
  END IF;

  -- Autorização: gestão (OWNER/permissão) ou o próprio representante
  IF p_representante_id <> v_own_rep
     AND NOT public.pode_gerenciar_representantes('representantes.view_performance') THEN
    RAISE EXCEPTION 'Acesso Negado: permissão representantes.view_performance não concedida.' USING ERRCODE = '42501';
  END IF;

  -- Representante alvo dentro do tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.representantes
    WHERE id = p_representante_id AND empresa_operadora_id = v_tenant AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Acesso Negado: representante fora do seu tenant.' USING ERRCODE = '42501';
  END IF;

  IF v_fim < v_inicio THEN v_fim := v_inicio; END IF;

  SELECT jsonb_build_object(
    'representante', (SELECT row_to_json(x) FROM (
      SELECT r.id, r.codigo_representante, COALESCE(u.nome, 'Representante') AS nome,
             u.email, u.telefone, r.razao_social, r.cpf_cnpj, r.comissao_porcentagem,
             r.ativo, r.created_at, UPPER(COALESCE(p.nome, '')) AS perfil_nome
      FROM public.representantes r
      JOIN public.usuarios u ON u.id = r.usuario_id
      LEFT JOIN public.perfis p ON p.id = u.perfil_id
      WHERE r.id = p_representante_id
    ) x),
    'resumo', (SELECT row_to_json(y) FROM (
      SELECT
        (SELECT count(*) FROM public.clientes c
          WHERE c.representante_id = p_representante_id AND c.empresa_operadora_id = v_tenant
            AND c.status <> 'CANCELED') AS total_clientes,
        (SELECT count(*) FROM public.clientes c
          WHERE c.representante_id = p_representante_id AND c.empresa_operadora_id = v_tenant
            AND c.status = 'ACTIVE') AS clientes_ativos,
        (SELECT count(*) FROM public.clientes c
          WHERE c.representante_id = p_representante_id AND c.empresa_operadora_id = v_tenant
            AND c.created_at::date >= v_periodo_inicio AND c.created_at::date <= v_fim) AS clientes_novos,
        (SELECT count(*) FROM public.propostas pr
          WHERE pr.representante_id = p_representante_id AND pr.empresa_operadora_id = v_tenant
            AND pr.created_at::date >= v_periodo_inicio AND pr.created_at::date <= v_fim) AS propostas_criadas,
        (SELECT count(*) FROM public.propostas pr
          WHERE pr.representante_id = p_representante_id AND pr.empresa_operadora_id = v_tenant
            AND pr.status IN ('APROVADA', 'APPROVED')
            AND pr.created_at::date >= v_periodo_inicio AND pr.created_at::date <= v_fim) AS propostas_aprovadas,
        (SELECT count(*) FROM public.contratos ct
          WHERE ct.representante_id = p_representante_id AND ct.empresa_operadora_id = v_tenant
            AND ct.created_at::date >= v_periodo_inicio AND ct.created_at::date <= v_fim) AS contratos_fechados,
        (SELECT COALESCE(sum(ct.valor_mensal), 0) FROM public.contratos ct
          WHERE ct.representante_id = p_representante_id AND ct.empresa_operadora_id = v_tenant
            AND ct.status_workflow NOT IN ('CANCELADO', 'CAMPANHA_FINALIZADA')) AS receita_mensal,
        CASE WHEN (
          SELECT count(*) FROM public.contratos ct
            WHERE ct.representante_id = p_representante_id AND ct.empresa_operadora_id = v_tenant
              AND ct.status_workflow NOT IN ('CANCELADO', 'CAMPANHA_FINALIZADA')
        ) > 0 THEN (
          SELECT COALESCE(sum(ct.valor_mensal), 0) FROM public.contratos ct
            WHERE ct.representante_id = p_representante_id AND ct.empresa_operadora_id = v_tenant
              AND ct.status_workflow NOT IN ('CANCELADO', 'CAMPANHA_FINALIZADA')
        ) / (
          SELECT count(*) FROM public.contratos ct
            WHERE ct.representante_id = p_representante_id AND ct.empresa_operadora_id = v_tenant
              AND ct.status_workflow NOT IN ('CANCELADO', 'CAMPANHA_FINALIZADA')
        ) ELSE 0 END AS ticket_medio,
        (SELECT COALESCE(mr.valor_meta, 0) FROM public.metas_representantes mr
          WHERE mr.representante_id = p_representante_id AND mr.empresa_operadora_id = v_tenant
            AND mr.ano = v_ano AND mr.mes = v_mes) AS meta_mensal,
        (SELECT COALESCE(mr.valor_realizado, 0) FROM public.metas_representantes mr
          WHERE mr.representante_id = p_representante_id AND mr.empresa_operadora_id = v_tenant
            AND mr.ano = v_ano AND mr.mes = v_mes) AS meta_realizado
    ) y),
    'evolucao', COALESCE((
      SELECT jsonb_agg(row_to_json(m) ORDER BY m.mes) FROM (
        SELECT
          to_char(g, 'YYYY-MM') AS mes,
          to_char(g, 'TMMonth') AS mes_nome,
          (SELECT count(*) FROM public.propostas pr
            WHERE pr.representante_id = p_representante_id
              AND pr.empresa_operadora_id = v_tenant
              AND date_trunc('month', pr.created_at) = g) AS propostas,
          (SELECT count(*) FROM public.contratos ct
            WHERE ct.representante_id = p_representante_id
              AND ct.empresa_operadora_id = v_tenant
              AND date_trunc('month', ct.created_at) = g) AS contratos,
          (SELECT COALESCE(sum(ct.valor_mensal), 0) FROM public.contratos ct
            WHERE ct.representante_id = p_representante_id
              AND ct.empresa_operadora_id = v_tenant
              AND date_trunc('month', ct.created_at) = g) AS receita
        FROM generate_series(date_trunc('month', v_inicio), date_trunc('month', v_fim), '1 month') AS g
      ) m
    ), '[]'::jsonb),
    'clientes', COALESCE((
      SELECT jsonb_agg(row_to_json(cl) ORDER BY cl.criado_em DESC) FROM (
        SELECT c.id, c.codigo_cliente,
               COALESCE(e.razao_social, e.nome_fantasia, 'Cliente sem cadastro') AS razao_social,
               e.nome_fantasia, c.status, e.cidade, c.created_at AS criado_em,
               (SELECT count(*) FROM public.propostas pr WHERE pr.cliente_id = c.id) AS propostas,
               (SELECT count(*) FROM public.contratos ct WHERE ct.cliente_id = c.id) AS contratos
        FROM public.clientes c
        LEFT JOIN public.empresas e ON e.cliente_id = c.id
        WHERE c.representante_id = p_representante_id AND c.empresa_operadora_id = v_tenant
      ) cl
    ), '[]'::jsonb),
    'propostas', COALESCE((
      SELECT jsonb_agg(row_to_json(pr) ORDER BY pr.criado_em DESC) FROM (
        SELECT pr.id, pr.numero_proposta, pr.titulo_campanha, pr.valor_total, pr.status,
               COALESCE(e.razao_social, e.nome_fantasia, '') AS cliente_nome,
               pr.created_at AS criado_em
        FROM public.propostas pr
        LEFT JOIN public.clientes c ON c.id = pr.cliente_id
        LEFT JOIN public.empresas e ON e.cliente_id = c.id
        WHERE pr.representante_id = p_representante_id AND pr.empresa_operadora_id = v_tenant
          AND pr.created_at::date >= v_inicio AND pr.created_at::date <= v_fim
      ) pr
    ), '[]'::jsonb),
    'contratos', COALESCE((
      SELECT jsonb_agg(row_to_json(ct) ORDER BY ct.criado_em DESC) FROM (
        SELECT ct.id, ct.numero_contrato, ct.valor_mensal, ct.status_workflow, ct.data_inicio,
               COALESCE(e.razao_social, e.nome_fantasia, '') AS cliente_nome,
               ct.created_at AS criado_em
        FROM public.contratos ct
        LEFT JOIN public.clientes c ON c.id = ct.cliente_id
        LEFT JOIN public.empresas e ON e.cliente_id = c.id
        WHERE ct.representante_id = p_representante_id AND ct.empresa_operadora_id = v_tenant
          AND ct.created_at::date >= v_inicio AND ct.created_at::date <= v_fim
      ) ct
    ), '[]'::jsonb),
    'metas', COALESCE((
      SELECT jsonb_agg(row_to_json(mr) ORDER BY mr.ano, mr.mes) FROM (
        SELECT mr.ano, mr.mes, mr.valor_meta, mr.valor_realizado, mr.status,
               CASE WHEN mr.valor_meta > 0
                    THEN round((mr.valor_realizado / mr.valor_meta * 100)::numeric, 1)
                    ELSE 0 END AS percentual
        FROM public.metas_representantes mr
        WHERE mr.representante_id = p_representante_id AND mr.empresa_operadora_id = v_tenant
      ) mr
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_desempenho_representante_detalhe(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_desempenho_representante_detalhe(uuid, date, date) TO authenticated;

-- ======================================================================
-- 8. RPC: REASSINAR CLIENTE → REPRESENTANTE (controle de carteira auditado)
-- ======================================================================
-- Mudança do representante responsável de um cliente é operação
-- administrativa: exige permissão representantes.edit_clients e é
-- registrada em auditoria_logs (alteração antigo → novo).
CREATE OR REPLACE FUNCTION public.reassinar_cliente_representante(
  p_cliente_id uuid,
  p_representante_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_role text;
  v_email text;
  v_rep_antigo uuid;
  v_rep_novo_nome text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso Negado: sessão inválida.' USING ERRCODE = '42501';
  END IF;

  SELECT u.empresa_operadora_id, UPPER(COALESCE(p.nome, '')), u.email
    INTO v_tenant, v_role, v_email
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso Negado: usuário não registrado.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.pode_gerenciar_representantes('representantes.edit_clients') THEN
    RAISE EXCEPTION 'Acesso Negado: permissão representantes.edit_clients não concedida.' USING ERRCODE = '42501';
  END IF;

  -- Cliente deve pertencer ao tenant do chamador
  SELECT representante_id INTO v_rep_antigo
    FROM public.clientes
    WHERE id = p_cliente_id AND empresa_operadora_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso Negado: cliente fora do seu tenant.' USING ERRCODE = '42501';
  END IF;

  -- Novo representante (quando informado) deve existir, estar ativo e ser do tenant
  IF p_representante_id IS NOT NULL THEN
    SELECT COALESCE(u.nome, 'Representante')
      INTO v_rep_novo_nome
      FROM public.representantes r
      JOIN public.usuarios u ON u.id = r.usuario_id
      WHERE r.id = p_representante_id
        AND r.empresa_operadora_id = v_tenant
        AND r.ativo = true
        AND r.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Acesso Negado: representante inválido ou fora do seu tenant.' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.clientes
    SET representante_id = p_representante_id,
        updated_at = now()
    WHERE id = p_cliente_id AND empresa_operadora_id = v_tenant;

  INSERT INTO public.auditoria_logs
    (empresa_operadora_id, usuario_id, usuario_email, usuario_role, entidade_tipo, entidade_id,
     acao, status_anterior, status_novo, observacoes)
  VALUES
    (v_tenant, v_uid, v_email, v_role, 'CLIENTE', p_cliente_id,
     'CLIENTE_REPRESENTANTE_CHANGED',
     CASE WHEN v_rep_antigo IS NULL THEN 'NULL' ELSE v_rep_antigo::text END,
     CASE WHEN p_representante_id IS NULL THEN 'NULL' ELSE p_representante_id::text END,
     'Representante responsável alterado de ' ||
     COALESCE(v_rep_antigo::text, 'NULL') || ' para ' ||
     COALESCE(p_representante_id::text, 'NULL') ||
     CASE WHEN v_rep_novo_nome IS NOT NULL THEN ' (' || v_rep_novo_nome || ')' ELSE '' END);

  RETURN jsonb_build_object('success', true, 'cliente_id', p_cliente_id, 'representante_id', p_representante_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reassinar_cliente_representante(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassinar_cliente_representante(uuid, uuid) TO authenticated;

-- ======================================================================
-- 9. EXTENSÃO DO CHECK DE AÇÕES DE AUDITORIA (padrão já usado pela Central)
-- ======================================================================
ALTER TABLE public.auditoria_logs DROP CONSTRAINT IF EXISTS auditoria_logs_acao_check;
ALTER TABLE public.auditoria_logs ADD CONSTRAINT auditoria_logs_acao_check CHECK (
  acao IN ('INSERT','UPDATE','DELETE','STATUS_CHANGE','LOGIN',
           'USER_CREATED','USER_UPDATED','USER_ACTIVATED','USER_DEACTIVATED',
           'USER_ROLE_CHANGED','USER_PERMISSIONS_CHANGED','USER_INVITE_SENT',
           'USER_INVITE_RESENT','USER_ACCESS_REVOKED','AUTONOMY_GRANTED','AUTONOMY_REVOKED',
           'REPRESENTANTE_UPDATED','REPRESENTANTE_ACTIVATED','REPRESENTANTE_DEACTIVATED',
           'CLIENTE_REPRESENTANTE_CHANGED')
);

-- ======================================================================
-- 10. RESUMO DE PRIVILÉGIOS (segurança explícita)
-- ======================================================================
REVOKE ALL ON FUNCTION public.get_my_admin_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_admin_permissions() TO authenticated;
