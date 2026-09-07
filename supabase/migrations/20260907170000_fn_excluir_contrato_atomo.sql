-- ============================================================================
-- Migration: fn_excluir_contrato_atomo
-- Micro-Gate: AR-03.2 — Implementação Atômica da Exclusão de Contratos
-- Governança: SOBRE MÍDIA (AGENTS.md)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_excluir_contrato_atomo(
  p_contrato_id UUID,
  p_motivo TEXT
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
  v_user_email VARCHAR;
  v_user_role VARCHAR;
  v_contrato RECORD;
  
  -- Indicadores de Bloqueadores de Retenção
  v_is_assinado BOOLEAN := FALSE;
  v_has_nf_emitida BOOLEAN := FALSE;
  v_has_pagamentos BOOLEAN := FALSE;
  v_has_contas_receber_pagas BOOLEAN := FALSE;
  v_has_lancamento_quitado BOOLEAN := FALSE;
  v_has_comissao_paga BOOLEAN := FALSE;
  v_has_op_aprovada BOOLEAN := FALSE;
  v_has_repasse_pago BOOLEAN := FALSE;
  
  -- Coleta de chaves R2
  v_r2_keys JSONB := '[]'::jsonb;
  v_versao_keys JSONB;
  v_assinatura_orig_keys JSONB;
  v_assinatura_ass_keys JSONB;
BEGIN
  -- 1. Autenticação
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso não autenticado.');
  END IF;

  -- 2. Autorização (OWNER ou ADMIN)
  SELECT u.is_owner, u.empresa_operadora_id, u.email, COALESCE(p.nome, 'SEM_PERFIL'),
         (UPPER(COALESCE(p.nome, '')) = 'ADMIN')
  INTO v_is_owner, v_user_tenant, v_user_email, v_user_role, v_is_admin
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON p.id = u.perfil_id
  WHERE u.id = v_user_id LIMIT 1;

  IF NOT COALESCE(v_is_owner, false) AND NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: Somente OWNER ou ADMIN podem excluir contratos.');
  END IF;

  -- 3. Advisory Lock atômico para serialização e concorrência
  PERFORM pg_advisory_xact_lock(hashtext('contrato_delete_lock_' || p_contrato_id::text));

  -- 4. Busca contrato
  SELECT * INTO v_contrato FROM public.contratos WHERE id = p_contrato_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_deleted', true, 'message', 'Contrato já excluído ou não encontrado.');
  END IF;

  IF v_contrato.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_deleted', true, 'message', 'Contrato já se encontra cancelado/excluído.');
  END IF;

  -- Validação de Tenant para ADMIN (não OWNER)
  IF v_contrato.empresa_operadora_id IS NOT NULL 
     AND v_user_tenant IS NOT NULL 
     AND v_contrato.empresa_operadora_id <> v_user_tenant 
     AND NOT COALESCE(v_is_owner, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: Contrato pertence a outro tenant.');
  END IF;

  -- 5. Avaliação Canônica dos Bloqueadores de Retenção
  -- A. Assinatura Jurídica
  v_is_assinado := (
    v_contrato.status_documento = 'ASSINADO'
    OR v_contrato.pdf_assinado_key IS NOT NULL
    OR v_contrato.documento_assinado_em IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.assinaturas
      WHERE contrato_id = p_contrato_id
        AND (status = 'ASSINADO' OR pdf_assinado_key IS NOT NULL OR assinado_em IS NOT NULL)
    )
  );

  -- B. Nota Fiscal Emitida ou Cancelada
  SELECT EXISTS(
    SELECT 1 FROM public.notas_fiscais
    WHERE contrato_id = p_contrato_id AND status IN ('EMITIDA', 'CANCELADA')
  ) INTO v_has_nf_emitida;

  -- C. Pagamentos Bancários Confirmados
  SELECT EXISTS(
    SELECT 1 FROM public.pagamentos
    WHERE (contrato_id = p_contrato_id OR conta_receber_id IN (SELECT id FROM public.contas_receber WHERE contrato_id = p_contrato_id))
      AND valor_pago > 0
  ) INTO v_has_pagamentos;

  -- D. Contas a Receber Pagas ou Conciliadas
  SELECT EXISTS(
    SELECT 1 FROM public.contas_receber
    WHERE contrato_id = p_contrato_id
      AND (
        status IN ('PAGO', 'PAGA', 'PARCIAL', 'PARCIAL_PAGA', 'CONCILIADA')
        OR COALESCE(valor_pago, 0) > 0
        OR data_recebimento IS NOT NULL
        OR payment_date IS NOT NULL
        OR inter_status IN ('PAGO', 'RECEBIDO')
      )
  ) INTO v_has_contas_receber_pagas;

  -- E. Lançamento Contábil Quitado no DRE
  SELECT EXISTS(
    SELECT 1 FROM public.financeiro_lancamentos fl
    LEFT JOIN public.cobrancas c ON c.financeiro_lancamento_id = fl.id
    WHERE fl.contrato_id = p_contrato_id 
      AND (fl.status_geral IN ('PAID', 'PARTIALLY_PAID') OR c.status_pagamento = 'PAID')
  ) INTO v_has_lancamento_quitado;

  -- F. Comissão Paga ao Representante
  SELECT (
    EXISTS(SELECT 1 FROM public.comissoes_representantes WHERE contrato_id = p_contrato_id AND status = 'PAGA')
    OR
    EXISTS(SELECT 1 FROM public.comissoes WHERE contrato_id = p_contrato_id AND status = 'PAGA')
  ) INTO v_has_comissao_paga;

  -- G. Ordem de Produção Aprovada ou Publicada
  SELECT EXISTS(
    SELECT 1 FROM public.ordens_producao
    WHERE contrato_id = p_contrato_id AND status IN ('APROVADA', 'LIBERADA', 'PUBLICADA', 'FINALIZADA')
  ) INTO v_has_op_aprovada;

  -- H. Repasse a Parceiro Pago
  SELECT EXISTS(
    SELECT 1 FROM public.repasses_parceiros
    WHERE contrato_parceiro_id = p_contrato_id AND status IN ('APROVADO', 'PAGO')
  ) INTO v_has_repasse_pago;

  -- =========================================================================
  -- DECISÃO 1: SOFT DELETE (Preservação Integral de Histórico)
  -- =========================================================================
  IF v_is_assinado OR v_has_nf_emitida OR v_has_pagamentos OR v_has_contas_receber_pagas
     OR v_has_lancamento_quitado OR v_has_comissao_paga OR v_has_op_aprovada OR v_has_repasse_pago THEN

    UPDATE public.contratos
    SET deleted_at = NOW(),
        deleted_by = v_user_id,
        delete_reason = p_motivo,
        status_workflow = 'CANCELADO',
        status_documento = 'CANCELADO',
        updated_at = NOW()
    WHERE id = p_contrato_id;

    -- Cancela cobranças futuras ainda em aberto (sem valor pago)
    UPDATE public.contas_receber
    SET status = 'CANCELADO', updated_at = NOW()
    WHERE contrato_id = p_contrato_id
      AND status IN ('PENDENTE', 'ATRASADO', 'ATRASADA', 'VENCIDO', 'ABERTA', 'AGENDADA', 'VENCENDO_HOJE')
      AND COALESCE(valor_pago, 0) = 0;

    -- Desativa agendamentos vinculados
    UPDATE public.agendamentos
    SET status = 'CANCELADO', updated_at = NOW()
    WHERE contrato_id = p_contrato_id;

    -- Auditoria Permanente Central (acao = 'STATUS_CHANGE')
    INSERT INTO public.auditoria_logs (
      empresa_operadora_id, usuario_id, usuario_email, usuario_role,
      entidade_tipo, entidade_id, acao, status_anterior, status_novo, observacoes, valor_antigo
    ) VALUES (
      v_contrato.empresa_operadora_id, v_user_id, v_user_email, v_user_role,
      'CONTRATO', p_contrato_id, 'STATUS_CHANGE', v_contrato.status_workflow, 'CANCELADO',
      '[SOFT_DELETE] Preservação fiscal/jurídica/contábil aplicada. Motivo: ' || COALESCE(p_motivo, 'Sem motivo informado'),
      row_to_json(v_contrato)
    );

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'SOFT_DELETE',
      'contrato_id', p_contrato_id,
      'message', 'Contrato desativado e cancelado com preservação integral do histórico fiscal e contábil.'
    );
  END IF;

  -- =========================================================================
  -- DECISÃO 2: HARD DELETE (Exclusão Física Definitiva)
  -- =========================================================================
  -- Coleta todas as chaves R2 antes da exclusão física
  IF v_contrato.pdf_object_key IS NOT NULL THEN
    v_r2_keys := v_r2_keys || jsonb_build_array(v_contrato.pdf_object_key);
  END IF;

  IF v_contrato.pdf_assinado_key IS NOT NULL THEN
    v_r2_keys := v_r2_keys || jsonb_build_array(v_contrato.pdf_assinado_key);
  END IF;

  SELECT COALESCE(jsonb_agg(pdf_url), '[]'::jsonb)
  INTO v_versao_keys
  FROM public.contrato_versoes
  WHERE contrato_id = p_contrato_id AND pdf_url IS NOT NULL;
  v_r2_keys := v_r2_keys || v_versao_keys;

  SELECT COALESCE(jsonb_agg(pdf_original_key), '[]'::jsonb)
  INTO v_assinatura_orig_keys
  FROM public.assinaturas
  WHERE contrato_id = p_contrato_id AND pdf_original_key IS NOT NULL;
  v_r2_keys := v_r2_keys || v_assinatura_orig_keys;

  SELECT COALESCE(jsonb_agg(pdf_assinado_key), '[]'::jsonb)
  INTO v_assinatura_ass_keys
  FROM public.assinaturas
  WHERE contrato_id = p_contrato_id AND pdf_assinado_key IS NOT NULL;
  v_r2_keys := v_r2_keys || v_assinatura_ass_keys;

  -- Desvinculação e limpeza de Bloqueadores Relacionais na mesma transação
  UPDATE public.agendamentos SET contrato_id = NULL, status = 'CANCELADO', updated_at = NOW() WHERE contrato_id = p_contrato_id;
  UPDATE public.repasses_parceiros SET contrato_parceiro_id = NULL WHERE contrato_parceiro_id = p_contrato_id;
  DELETE FROM public.comissoes_representantes WHERE contrato_id = p_contrato_id;
  DELETE FROM public.ordens_producao WHERE contrato_id = p_contrato_id;
  DELETE FROM public.financeiro_lancamentos WHERE contrato_id = p_contrato_id;

  -- Auditoria Permanente Central ANTES do DELETE físico (acao = 'DELETE')
  INSERT INTO public.auditoria_logs (
    empresa_operadora_id, usuario_id, usuario_email, usuario_role,
    entidade_tipo, entidade_id, acao, status_anterior, status_novo, observacoes, valor_antigo
  ) VALUES (
    v_contrato.empresa_operadora_id, v_user_id, v_user_email, v_user_role,
    'CONTRATO', p_contrato_id, 'DELETE', v_contrato.status_workflow, 'EXCLUIDO',
    '[HARD_DELETE] Exclusão física definitiva realizada. Motivo: ' || COALESCE(p_motivo, 'Sem motivo informado'),
    row_to_json(v_contrato)
  );

  -- Exclusão Física no PostgreSQL (CASCADE automático limpa versoes, assinaturas, itens, contas_receber)
  DELETE FROM public.contratos WHERE id = p_contrato_id;

  RETURN jsonb_build_object(
    'success', true,
    'mode', 'HARD_DELETE',
    'contrato_id', p_contrato_id,
    'r2_keys_to_delete', v_r2_keys,
    'message', 'Contrato e dependências excluídos definitivamente com sucesso.'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_excluir_contrato_atomo(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_excluir_contrato_atomo(UUID, TEXT) TO service_role;
