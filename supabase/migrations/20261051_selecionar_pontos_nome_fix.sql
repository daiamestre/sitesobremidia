-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261051
-- CORRETIVA: selecionar_pontos_prospeccao referencia campos inexistentes
--
-- A função (20261045/20261101) lia v_cliente.nome_fantasia /
-- v_cliente.razao_social, mas public.clientes NÃO possui colunas de nome —
-- a identificação comercial vive em public.empresas (cliente_id → razao_social/
-- nome_fantasia). Resultado: 42703 "record v_cliente has no field
-- nome_fantasia" no fechamento anunciante↔pontos.
--
-- Gerada a partir da DEFINIÇÃO VIVA no Cloud (pg_get_functiondef); único
-- delta: a expressão do nome passa a buscar via empresas (fallback seguro).
-- ======================================================================
CREATE OR REPLACE FUNCTION public.selecionar_pontos_prospeccao(p_cliente_id uuid, p_ponto_ids uuid[])
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
        RAISE EXCEPTION 'SessÃ£o invÃ¡lida.' USING ERRCODE = '42501';
    END IF;

    v_tenant := public.get_user_empresa_operadora_id(v_caller);
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'UsuÃ¡rio sem tenant.' USING ERRCODE = '42501';
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

    -- AUTORIZAÃÃO: representante DONO do cliente, papel interno, ou o prÃ³prio anunciante
    IF v_perfil = 'REPRESENTANTE' THEN
        IF v_rep_id IS NULL OR v_cliente.representante_id IS DISTINCT FROM v_rep_id THEN
            RAISE EXCEPTION 'Cliente nÃ£o pertence Ã  sua carteira.' USING ERRCODE = '42501';
        END IF;
    ELSIF NOT public.is_internal_role() THEN
        IF public.get_user_cliente_id() IS DISTINCT FROM p_cliente_id THEN
            RAISE EXCEPTION 'Sem permissÃ£o sobre este cliente.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Pontos vÃ¡lidos: mesmo tenant, ativos e DISPONÃVEIS (nunca fora do escopo)
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
        RAISE EXCEPTION '% ponto(s) invÃ¡lido(s): fora do tenant, inativos ou indisponÃ­veis.', v_invalidos
          USING ERRCODE = '42501';
    END IF;

    -- Sincroniza a seleÃ§Ã£o de prospecÃ§Ã£o (permite desmarcar; nÃ£o toca em
    -- vÃ­nculos de origem CONTRATO/EXPANSAO)
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
         'Pontos de prospecÃ§Ã£o sincronizados: ' || COALESCE(array_length(v_validos,1)::text,'0') ||
         ' Â· total ativo: ' || v_vinculados::text || '.');

    -- Workflow na Central para OWNER/ADMIN (sem duplicar para o mesmo cliente)
    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, titulo, mensagem,
         prioridade, severidade, rota_destino, entidade_relacionada_tipo, entidade_relacionada_id)
    SELECT v_tenant, u.id, 'PROSPECCAO_REGISTRADA', 'IN_APP',
           'Nova prospecÃ§Ã£o com pontos selecionados',
           'O cliente "' || COALESCE((SELECT e.nome_fantasia FROM public.empresas e WHERE e.cliente_id = p_cliente_id AND e.deleted_at IS NULL ORDER BY e.created_at DESC LIMIT 1), 'Cliente ' || left(p_cliente_id::text,8)) ||
           '" teve ' || v_vinculados::text || ' ponto(s) selecionado(s) na prospecÃ§Ã£o.',
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
REVOKE ALL ON FUNCTION public.selecionar_pontos_prospeccao(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.selecionar_pontos_prospeccao(UUID, UUID[]) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261051','selecionar_pontos_prospeccao_nome_fix','{}')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

NOTIFY pgrst, 'reload schema';