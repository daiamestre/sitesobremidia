-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261211 (MICRO-GATE 3.1)
-- CORREÇÃO ATÔMICA SERVER-SIDE DE CONCORRÊNCIA NA RPC fn_assinar_contrato
-- ======================================================================

CREATE OR REPLACE FUNCTION public.fn_assinar_contrato(
  p_assinatura_id UUID,
  p_signatario_nome TEXT DEFAULT NULL,
  p_signatario_email TEXT DEFAULT NULL,
  p_signatario_cpf_cnpj TEXT DEFAULT NULL,
  p_pdf_assinado_key TEXT DEFAULT NULL,
  p_document_hash TEXT DEFAULT NULL,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_assinatura public.assinaturas%ROWTYPE;
  v_contrato public.contratos%ROWTYPE;
  v_cliente_id uuid;
  v_role text;
  v_key_ok boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado.');
  END IF;

  -- 1. Trava Exclusiva de Linha (FOR UPDATE) para prevenir Race Condition
  SELECT * INTO v_assinatura 
  FROM public.assinaturas 
  WHERE id = p_assinatura_id 
  FOR UPDATE;

  IF v_assinatura.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assinatura não encontrada.');
  END IF;

  -- 2. Validação Estrita do Status do Envelope
  IF v_assinatura.status NOT IN ('ENVIADO', 'VISUALIZADO') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Envelope não está aberto para assinatura (status: ' || v_assinatura.status || ').');
  END IF;

  SELECT * INTO v_contrato FROM public.contratos WHERE id = v_assinatura.contrato_id;
  IF v_contrato.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contrato vinculado não encontrado.');
  END IF;

  v_role := public.get_user_role();

  IF NOT (
    v_assinatura.empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = v_uid LIMIT 1)
    OR (v_role = 'CLIENTE' AND v_contrato.cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = v_uid LIMIT 1))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: este contrato não pertence ao seu cliente.');
  END IF;

  -- 3. Validação de Chave do Documento Assinado no R2
  IF p_pdf_assinado_key IS NOT NULL AND p_pdf_assinado_key <> '' THEN
    v_key_ok := p_pdf_assinado_key LIKE 'tenants/' || v_contrato.empresa_operadora_id::text || '/contratos/' || v_contrato.id::text || '/%';
  END IF;
  IF NOT v_key_ok THEN
    RETURN jsonb_build_object('success', false, 'error', 'Chave do documento assinado inválida para este contrato.');
  END IF;

  -- 4. Transição Atômica Condicional (WHERE status IN ('ENVIADO', 'VISUALIZADO'))
  UPDATE public.assinaturas
  SET status = 'ASSINADO',
      assinado_em = NOW(),
      pdf_assinado_key = p_pdf_assinado_key,
      document_hash = COALESCE(p_document_hash, document_hash),
      signatario_nome = COALESCE(p_signatario_nome, signatario_nome),
      signatario_email = COALESCE(p_signatario_email, signatario_email),
      signatario_cpf_cnpj = COALESCE(p_signatario_cpf_cnpj, signatario_cpf_cnpj),
      assinado_por_usuario_id = v_uid,
      ip_assinatura = p_ip,
      user_agent_assinatura = p_user_agent,
      updated_at = NOW()
  WHERE id = p_assinatura_id
    AND status IN ('ENVIADO', 'VISUALIZADO');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Envelope não está aberto para assinatura (status: ' || v_assinatura.status || ').');
  END IF;

  -- 5. Registro do Evento
  INSERT INTO public.assinatura_eventos (assinatura_id, evento, detalhes)
  VALUES (p_assinatura_id, 'ASSINADO', jsonb_build_object(
    'usuario_id', v_uid,
    'signatario_nome', p_signatario_nome,
    'signatario_email', p_signatario_email,
    'pdf_assinado_key', p_pdf_assinado_key,
    'ip', p_ip,
    'user_agent', p_user_agent
  ));

  -- 6. Atualização do Contrato
  UPDATE public.contratos
  SET status_documento = 'ASSINADO',
      documento_assinado_em = NOW(),
      pdf_assinado_key = p_pdf_assinado_key,
      assinatura_envelope_id = v_assinatura.envelope_id,
      assinado_por = v_uid,
      status_workflow = CASE
        WHEN status_workflow = 'AGUARDANDO_ASSINATURA' THEN 'AGUARDANDO_PAGAMENTO'
        ELSE status_workflow
      END,
      updated_at = NOW()
  WHERE id = v_contrato.id;

  INSERT INTO public.contrato_auditoria (contrato_id, evento, usuario_id, tipo_contrato, versao, detalhes)
  VALUES (v_contrato.id, 'CONTRATO_ASSINADO', v_uid, v_contrato.tipo_contrato, v_contrato.versao_atual,
          jsonb_build_object('envelope_id', v_assinatura.envelope_id, 'pdf_assinado_key', p_pdf_assinado_key, 'hash', p_document_hash));

  INSERT INTO public.assinatura_auditoria (empresa_operadora_id, evento, usuario_id, ip, user_agent, detalhes)
  VALUES (v_assinatura.empresa_operadora_id, 'CONTRATO_ASSINADO_INTERNO', v_uid, p_ip, p_user_agent,
          jsonb_build_object('contrato_id', v_contrato.id, 'envelope_id', v_assinatura.envelope_id, 'assinatura_id', p_assinatura_id));

  UPDATE public.pedidos_insercao
  SET status = 'AGUARDANDO_APROVACAO', updated_at = NOW()
  WHERE contrato_id = v_contrato.id
    AND status = 'EM_ELABORACAO';

  RETURN jsonb_build_object(
    'success', true,
    'contrato_id', v_contrato.id,
    'status_documento', 'ASSINADO',
    'status_workflow', CASE WHEN v_contrato.status_workflow = 'AGUARDANDO_ASSINATURA' THEN 'AGUARDANDO_PAGAMENTO' ELSE v_contrato.status_workflow END,
    'pi_liberados', true
  );
END;
$$;

SELECT 'Migration 20261211 Micro-Gate 3.1 correcao atomica fn_assinar_contrato concluida' AS status;
