-- Fix P0: notificacoes_central.destinatario_contato NOT NULL violation in criar_ponto_parceiro_prospeccao
-- The function inserted without destinatario_contato, causing 23502. Make it nullable or provide value.
-- We do both: allow NULL temporarily and fix function to provide email.

ALTER TABLE public.notificacoes_central ALTER COLUMN destinatario_contato DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.criar_ponto_parceiro_prospeccao(p_dados jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF v_perfil <> 'REPRESENTANTE' AND NOT public.is_internal_role() THEN
        RAISE EXCEPTION 'Acesso Negado: apenas representantes ou equipe interna cadastram pontos parceiros.' USING ERRCODE = '42501';
    END IF;
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
         || COALESCE(v_novo.codigo_publico, '?'));
    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato, titulo, mensagem,
         prioridade, severidade, rota_destino, entidade_relacionada_tipo, entidade_relacionada_id)
    SELECT v_tenant, u.id, 'PROSPECCAO_REGISTRADA', 'IN_APP', COALESCE(u.email, u.id::text),
           'Novo ponto parceiro prospectado',
           'O ponto "' || v_nome || '" (' || COALESCE(v_novo.codigo_publico, '?') ||
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
$function$;
GRANT EXECUTE ON FUNCTION public.criar_ponto_parceiro_prospeccao(JSONB) TO authenticated;
SELECT '20261202 fix ponto notificacao' AS status;
