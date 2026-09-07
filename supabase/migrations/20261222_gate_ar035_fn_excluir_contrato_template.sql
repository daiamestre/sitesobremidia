-- ==============================================================================
-- MIGRATION: 20261222_gate_ar035_fn_excluir_contrato_template.sql
-- OBJETIVO: RPC Segura para Exclusão de Modelos de Contrato (contrato_templates)
-- AUTORIZAÇÃO: OWNER, ADMIN ou permissão contracts.manage
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_excluir_contrato_template(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
  v_user_tenant UUID;
  v_is_owner BOOLEAN;
  v_is_admin BOOLEAN;
  v_tpl RECORD;
BEGIN
  -- 1. Validação de Autenticação
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão inválida ou não autenticada.');
  END IF;

  -- 2. Recuperação de Perfil e Tenant
  SELECT u.is_owner, u.empresa_operadora_id,
         (UPPER(COALESCE(p.nome, '')) = 'ADMIN')
  INTO v_is_owner, v_user_tenant, v_is_admin
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON p.id = u.perfil_id
  WHERE u.id = v_user_id LIMIT 1;

  -- 3. Validação Server-side de Autorização (Somente OWNER, ADMIN ou contracts.manage)
  IF NOT COALESCE(v_is_owner, false) AND NOT COALESCE(v_is_admin, false) THEN
    IF NOT public.has_admin_permission('contracts.manage') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: Requer perfil OWNER, ADMIN ou permissão contracts.manage.');
    END IF;
  END IF;

  -- 4. Busca do Template
  SELECT * INTO v_tpl FROM public.contrato_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Modelo de contrato não encontrado.');
  END IF;

  -- 5. Validação de Isolamento Multi-Tenant
  IF v_tpl.empresa_operadora_id IS NOT NULL AND v_tpl.empresa_operadora_id <> v_user_tenant AND NOT COALESCE(v_is_owner, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: O modelo pertence a outro tenant.');
  END IF;

  -- 6. Validação de Escopo Global
  IF v_tpl.empresa_operadora_id IS NULL AND NOT COALESCE(v_is_owner, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: Apenas o OWNER pode excluir modelos globais.');
  END IF;

  -- 7. Desassociação atômica de is_default caso esteja marcado como padrão
  IF v_tpl.is_default THEN
    UPDATE public.contrato_templates
    SET is_default = false
    WHERE id = p_template_id;
  END IF;

  -- 8. Exclusão do Modelo (a FK em contratos.template_id possui ON DELETE SET NULL)
  DELETE FROM public.contrato_templates WHERE id = p_template_id;

  -- 9. Retorno Estruturado
  RETURN jsonb_build_object(
    'success', true,
    'template_id', p_template_id,
    'nome', v_tpl.nome,
    'codigo_template', v_tpl.codigo_template,
    'versao', v_tpl.versao
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_excluir_contrato_template(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_excluir_contrato_template(uuid) TO service_role;
