-- ======================================================================
-- SOBRE MÍDIA - MIGRATION: CONTRATOS REAIS + PDF + ASSINATURA + DOWNLOAD
-- Conecta o fluxo de contratos ao documento real:
--   template -> documento gerado (R2) -> assinatura -> documento assinado (R2)
-- ======================================================================

-- 1. Identidade do cliente no portal (usuarios.cliente_id)
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_usuarios_cliente ON public.usuarios(cliente_id);

-- 2. Ciclo de vida do documento no contrato
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS pdf_assinado_key TEXT,
  ADD COLUMN IF NOT EXISTS documento_enviado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS documento_assinado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assinatura_envelope_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS assinado_por UUID REFERENCES public.usuarios(id);

-- 3. Referência ao PDF oficial anexo do template (ex.: contrato de parceria oficial)
ALTER TABLE public.contrato_templates
  ADD COLUMN IF NOT EXISTS pdf_anexo_key TEXT;

-- 4. Envelopes de Assinatura Digital (FASE 9.4 / 024)
CREATE TABLE IF NOT EXISTS public.assinaturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  provedor VARCHAR(50) NOT NULL DEFAULT 'ASSINADOR_INTERNO' CHECK (
    provedor IN ('CLICKSIGN', 'DOCUSIGN', 'ADOBESIGN', 'ASSINAFY', 'ZAPSIGN', 'ASSINADOR_INTERNO')
  ),
  status VARCHAR(30) NOT NULL DEFAULT 'ENVIADO' CHECK (
    status IN ('RASCUNHO', 'ENVIADO', 'VISUALIZADO', 'ASSINADO', 'RECUSADO', 'EXPIRADO', 'CANCELADO')
  ),
  envelope_id VARCHAR(100) NOT NULL,
  document_hash VARCHAR(100),
  pdf_original_key TEXT,
  pdf_assinado_key TEXT,
  signatario_nome VARCHAR(150),
  signatario_email VARCHAR(255),
  signatario_cpf_cnpj VARCHAR(20),
  assinado_por_usuario_id UUID REFERENCES public.usuarios(id),
  visualizado_em TIMESTAMPTZ,
  assinado_em TIMESTAMPTZ,
  expira_em TIMESTAMPTZ,
  cancelado_em TIMESTAMPTZ,
  ip_assinatura VARCHAR(45),
  user_agent_assinatura TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_tenant ON public.assinaturas(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_contrato ON public.assinaturas(contrato_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_envelope ON public.assinaturas(envelope_id);

CREATE TABLE IF NOT EXISTS public.assinatura_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assinatura_id UUID NOT NULL REFERENCES public.assinaturas(id) ON DELETE CASCADE,
  evento VARCHAR(30) NOT NULL CHECK (
    evento IN ('ENVIADO', 'VISUALIZADO', 'ASSINADO', 'RECUSADO', 'EXPIRADO', 'CANCELADO', 'WEBHOOK_RECEBIDO', 'VALIDADO')
  ),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assinatura_eventos_assinatura ON public.assinatura_eventos(assinatura_id);

CREATE TABLE IF NOT EXISTS public.assinatura_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  evento VARCHAR(50) NOT NULL,
  usuario_id UUID REFERENCES public.usuarios(id),
  ip VARCHAR(45),
  user_agent TEXT,
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assinatura_auditoria_tenant ON public.assinatura_auditoria(empresa_operadora_id);

-- 5. RLS Multi-Tenant para assinaturas
ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_auditoria ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT: equipe do tenant OU cliente dono do contrato
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assinaturas' AND policyname = 'p_read_assinaturas') THEN
    CREATE POLICY p_read_assinaturas ON public.assinaturas FOR SELECT TO authenticated
    USING (
      (
        empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1)
        AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO', 'REPRESENTANTE')
      )
      OR (
        public.get_user_role() = 'CLIENTE'
        AND contrato_id IN (
          SELECT c.id FROM public.contratos c
          WHERE c.cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1)
        )
      )
    );
  END IF;

  -- INSERT: apenas equipe do tenant (representante responsável incluso)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assinaturas' AND policyname = 'p_insert_assinaturas') THEN
    CREATE POLICY p_insert_assinaturas ON public.assinaturas FOR INSERT TO authenticated
    WITH CHECK (
      empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1)
      AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO', 'REPRESENTANTE')
    );
  END IF;

  -- SELECT eventos: equipe do tenant OU cliente dono
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assinatura_eventos' AND policyname = 'p_read_assinatura_eventos') THEN
    CREATE POLICY p_read_assinatura_eventos ON public.assinatura_eventos FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.assinaturas a
        WHERE a.id = assinatura_id
        AND (
          (
            a.empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1)
            AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO', 'REPRESENTANTE')
          )
          OR (
            public.get_user_role() = 'CLIENTE'
            AND a.contrato_id IN (
              SELECT c.id FROM public.contratos c
              WHERE c.cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1)
            )
          )
        )
      )
    );
  END IF;

  -- INSERT eventos: equipe do tenant (o cliente assina via RPC SECURITY DEFINER)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assinatura_eventos' AND policyname = 'p_insert_assinatura_eventos') THEN
    CREATE POLICY p_insert_assinatura_eventos ON public.assinatura_eventos FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.assinaturas a
        WHERE a.id = assinatura_id
        AND a.empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1)
        AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO', 'REPRESENTANTE')
      )
    );
  END IF;

  -- Auditoria de assinatura: insert para equipe, select para equipe
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assinatura_auditoria' AND policyname = 'p_insert_assinatura_auditoria') THEN
    CREATE POLICY p_insert_assinatura_auditoria ON public.assinatura_auditoria FOR INSERT TO authenticated
    WITH CHECK (
      empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1)
      AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO', 'REPRESENTANTE')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assinatura_auditoria' AND policyname = 'p_read_assinatura_auditoria') THEN
    CREATE POLICY p_read_assinatura_auditoria ON public.assinatura_auditoria FOR SELECT TO authenticated
    USING (
      empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1)
      AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO', 'REPRESENTANTE')
    );
  END IF;
END $$;

-- 6. Amplia o CHECK de eventos da auditoria de contratos
ALTER TABLE public.contrato_auditoria DROP CONSTRAINT IF EXISTS contrato_auditoria_evento_check;
ALTER TABLE public.contrato_auditoria ADD CONSTRAINT contrato_auditoria_evento_check CHECK (
  evento IN (
    'CONTRATO_SELECIONADO',
    'CONTRATO_PDF_GERADO',
    'CONTRATO_REENVIADO',
    'CONTRATO_CANCELADO',
    'CONTRATO_DOCUMENTO_GERADO',
    'CONTRATO_DOCUMENTO_ARMAZENADO',
    'CONTRATO_ENVIADO_ASSINATURA',
    'CONTRATO_VISUALIZADO',
    'CONTRATO_ASSINADO',
    'DOCUMENTO_BAIXADO',
    'CONTRATO_SUBSTITUIDO',
    'CONTRATO_VERSIONADO'
  )
);

-- 7. RLS contratos: habilita o CLIENTE a ler APENAS os próprios contratos
DROP POLICY IF EXISTS "ctr_select_policy" ON public.contratos;
CREATE POLICY "ctr_select_policy" ON public.contratos
  FOR SELECT
  USING (
    (
      empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1)
      AND (
        public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO')
        OR representante_id = public.get_user_representante_id()
      )
    )
    OR (
      public.get_user_role() = 'CLIENTE'
      AND cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1)
      AND cliente_id IS NOT NULL
    )
  );

-- 8. RPC: registrar visualização da assinatura (cliente ou equipe autenticados)
CREATE OR REPLACE FUNCTION public.fn_registrar_visualizacao_assinatura(
  p_assinatura_id UUID,
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
  v_cliente_id uuid;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado.');
  END IF;

  SELECT * INTO v_assinatura FROM public.assinaturas WHERE id = p_assinatura_id;
  IF v_assinatura.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assinatura não encontrada.');
  END IF;

  SELECT c.cliente_id INTO v_cliente_id FROM public.contratos c WHERE c.id = v_assinatura.contrato_id;
  v_role := public.get_user_role();

  IF NOT (
    v_assinatura.empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = v_uid LIMIT 1)
    OR (v_role = 'CLIENTE' AND (SELECT cliente_id FROM public.usuarios WHERE id = v_uid LIMIT 1) = v_cliente_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado a este envelope.');
  END IF;

  UPDATE public.assinaturas
  SET status = CASE WHEN status = 'ENVIADO' THEN 'VISUALIZADO' ELSE status END,
      visualizado_em = COALESCE(visualizado_em, NOW()),
      updated_at = NOW()
  WHERE id = p_assinatura_id;

  INSERT INTO public.assinatura_eventos (assinatura_id, evento, detalhes)
  VALUES (p_assinatura_id, 'VISUALIZADO', jsonb_build_object('usuario_id', v_uid, 'ip', p_ip, 'user_agent', p_user_agent));

  INSERT INTO public.contrato_auditoria (contrato_id, evento, usuario_id, tipo_contrato, detalhes)
  SELECT v_assinatura.contrato_id, 'CONTRATO_VISUALIZADO', v_uid, c.tipo_contrato,
         jsonb_build_object('envelope_id', v_assinatura.envelope_id)
  FROM public.contratos c WHERE c.id = v_assinatura.contrato_id;

  RETURN jsonb_build_object('success', true, 'status', 'VISUALIZADO');
END;
$$;

-- 9. RPC: assinatura real do contrato (valida propriedade, registra evento,
--    grava o documento assinado, atualiza o contrato e libera o PI)
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

  SELECT * INTO v_assinatura FROM public.assinaturas WHERE id = p_assinatura_id;
  IF v_assinatura.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assinatura não encontrada.');
  END IF;

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

  -- Valida a chave do documento assinado (deve pertencer a este contrato no R2)
  IF p_pdf_assinado_key IS NOT NULL AND p_pdf_assinado_key <> '' THEN
    v_key_ok := p_pdf_assinado_key LIKE 'tenants/' || v_contrato.empresa_operadora_id::text || '/contratos/' || v_contrato.id::text || '/%';
  END IF;
  IF NOT v_key_ok THEN
    RETURN jsonb_build_object('success', false, 'error', 'Chave do documento assinado inválida para este contrato.');
  END IF;

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
  WHERE id = p_assinatura_id;

  INSERT INTO public.assinatura_eventos (assinatura_id, evento, detalhes)
  VALUES (p_assinatura_id, 'ASSINADO', jsonb_build_object(
    'usuario_id', v_uid,
    'signatario_nome', p_signatario_nome,
    'signatario_email', p_signatario_email,
    'pdf_assinado_key', p_pdf_assinado_key,
    'ip', p_ip,
    'user_agent', p_user_agent
  ));

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

  -- Libera automaticamente os PIs do contrato assinado para a fila de aprovação
  -- (transição válida do enum real: EM_ELABORACAO -> AGUARDANDO_APROVACAO)
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