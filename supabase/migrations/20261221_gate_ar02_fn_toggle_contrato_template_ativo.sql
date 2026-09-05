-- ==============================================================================
-- MICRO-GATE AR-02: RPC Segura para Ativar/Desativar Modelo de Contrato
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_toggle_contrato_template_ativo(
  p_template_id UUID,
  p_ativo BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_tenant UUID;
  v_is_owner BOOLEAN;
  v_is_admin BOOLEAN;
  v_tpl RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão inválida ou não autenticada.');
  END IF;

  SELECT u.is_owner, u.empresa_operadora_id,
         (UPPER(COALESCE(p.nome, '')) = 'ADMIN')
  INTO v_is_owner, v_user_tenant, v_is_admin
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON p.id = u.perfil_id
  WHERE u.id = v_user_id LIMIT 1;

  -- Validação Server-side de Autorização (Somente OWNER, ADMIN ou permissão contracts.manage)
  IF NOT COALESCE(v_is_owner, false) AND NOT COALESCE(v_is_admin, false) THEN
    IF NOT public.has_admin_permission('contracts.manage') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: Requer perfil OWNER, ADMIN ou permissão contracts.manage.');
    END IF;
  END IF;

  SELECT * INTO v_tpl FROM public.contrato_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template de contrato não encontrado.');
  END IF;

  -- Validação de isolamento multi-tenant
  IF v_tpl.empresa_operadora_id IS NOT NULL AND v_tpl.empresa_operadora_id <> v_user_tenant AND NOT COALESCE(v_is_owner, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: O template pertence a outro tenant.');
  END IF;

  -- Se o template for global (empresa_operadora_id IS NULL), apenas OWNER pode alterar status
  IF v_tpl.empresa_operadora_id IS NULL AND NOT COALESCE(v_is_owner, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: Apenas o OWNER pode alterar o status de templates globais.');
  END IF;

  IF NOT p_ativo THEN
    -- Desativar modelo: se for default, também desmarca is_default
    UPDATE public.contrato_templates
    SET ativo = false,
        is_default = false,
        updated_at = NOW()
    WHERE id = p_template_id;
  ELSE
    -- Ativar modelo
    UPDATE public.contrato_templates
    SET ativo = true,
        updated_at = NOW()
    WHERE id = p_template_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'template_id', p_template_id,
    'ativo', p_ativo,
    'nome', v_tpl.nome,
    'codigo_template', v_tpl.codigo_template,
    'tipo_contrato', v_tpl.tipo_contrato
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_toggle_contrato_template_ativo(UUID, BOOLEAN) TO authenticated;
