-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261217 (MICRO-GATE 5.3.2.3)
-- REDEFINIÇÃO DA REGRA DE NEGÓCIO E ENGINE DE REPASSE DO PONTO PARCEIRO
-- ======================================================================
-- 1. Colunas Estruturadas de Modelo Comercial (PERMUTA / COMISSIONADO_5)
-- 2. Tabela Canônica de Repasses do Ponto Parceiro (public.repasses_parceiros)
-- 3. Atualização da RPC fn_cadastrar_ponto_parceiro_com_contrato (Gravação de Modelo + 5%)
-- 4. RPC de Apuração Atômica de Repasse por Confirmação Financeira (fn_apurar_repasse_parceiro)
-- 5. RPC de Extrato RLS-Safe para o Portal do Hospedador (listar_repasses_parceiro)
-- 6. Reconciliação do Trigger trg_concilia_pagamento com a apuração de repasse
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. ADICIONAR COLUNAS ESTRUTURADAS EM PONTOS E CONTRATOS
-- ----------------------------------------------------------------------
ALTER TABLE public.pontos
  ADD COLUMN IF NOT EXISTS modelo_comercial VARCHAR(20) NOT NULL DEFAULT 'PERMUTA',
  ADD COLUMN IF NOT EXISTS percentual_comissao NUMERIC(5,2) DEFAULT NULL;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS modelo_comercial VARCHAR(20) NOT NULL DEFAULT 'PERMUTA',
  ADD COLUMN IF NOT EXISTS percentual_comissao NUMERIC(5,2) DEFAULT NULL;

-- ----------------------------------------------------------------------
-- 2. TABELA CANÔNICA DE REPASSES A PONTOS PARCEIROS (public.repasses_parceiros)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.repasses_parceiros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
    
    -- Origem Financeira (Recebimento do Anunciante)
    conta_receber_id UUID NOT NULL REFERENCES public.contas_receber(id) ON DELETE RESTRICT,
    pagamento_id UUID REFERENCES public.pagamentos(id) ON DELETE RESTRICT,
    contrato_estabelecimento_id UUID REFERENCES public.contrato_estabelecimentos(id) ON DELETE RESTRICT,
    
    -- Destino (Ponto / Parceiro)
    ponto_id UUID NOT NULL REFERENCES public.pontos(id) ON DELETE RESTRICT,
    unidade_id UUID REFERENCES public.unidades(id) ON DELETE RESTRICT,
    contrato_parceiro_id UUID REFERENCES public.contratos(id) ON DELETE RESTRICT,
    
    -- Snapshots Imutáveis
    modelo_comercial_snapshot VARCHAR(20) NOT NULL CHECK (modelo_comercial_snapshot IN ('PERMUTA', 'COMISSIONADO_5')),
    percentual_snapshot NUMERIC(5,2) NOT NULL DEFAULT 5.00,
    anuncios_distintos_count INT NOT NULL DEFAULT 1 CHECK (anuncios_distintos_count >= 1),
    valor_base_anuncio_snapshot NUMERIC(12,2) NOT NULL CHECK (valor_base_anuncio_snapshot >= 0),
    valor_repasse NUMERIC(12,2) NOT NULL CHECK (valor_repasse >= 0),
    
    -- Ciclo de Vida
    status VARCHAR(20) NOT NULL DEFAULT 'DEVIDO' CHECK (status IN ('DEVIDO', 'APROVADO', 'PAGO', 'CANCELADO', 'ESTORNADO')),
    competencia_mes_ano VARCHAR(7) NOT NULL,
    data_liquidacao_recebimento TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_pagamento_parceiro TIMESTAMPTZ,
    
    -- Idempotência e Auditoria
    idempotency_key VARCHAR(150) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de Performance
CREATE INDEX IF NOT EXISTS idx_repasses_parceiros_tenant ON public.repasses_parceiros(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_repasses_parceiros_ponto ON public.repasses_parceiros(ponto_id);
CREATE INDEX IF NOT EXISTS idx_repasses_parceiros_competencia ON public.repasses_parceiros(empresa_operadora_id, competencia_mes_ano);
CREATE INDEX IF NOT EXISTS idx_repasses_parceiros_status ON public.repasses_parceiros(empresa_operadora_id, status);

-- Habilitar RLS
ALTER TABLE public.repasses_parceiros ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'repasses_parceiros' AND policyname = 'p_select_repasses_parceiros') THEN
        CREATE POLICY p_select_repasses_parceiros ON public.repasses_parceiros FOR SELECT TO authenticated
        USING (
            empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
            OR EXISTS (
                SELECT 1 FROM public.pontos p
                WHERE p.id = repasses_parceiros.ponto_id
                  AND (p.created_by = auth.uid() OR p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()))
            )
        );
    END IF;
END $$;

-- ----------------------------------------------------------------------
-- 3. ATUALIZAÇÃO DA RPC DE CADASTRO ATÔMICO DO PONTO PARCEIRO
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cadastrar_ponto_parceiro_com_contrato(
  p_dados JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_tenant UUID;
  v_nome TEXT;
  v_ponto_id UUID;
  v_codigo_publico TEXT;
  v_contrato_id UUID;
  v_numero_contrato VARCHAR(40);
  v_tpl_id UUID;
  v_tpl_nome VARCHAR(255);
  v_tpl_versao INT;
  v_modelo_raw TEXT;
  v_modelo_final VARCHAR(20);
  v_percentual NUMERIC(5,2);
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso não autenticado.');
  END IF;

  v_user_tenant := public.get_user_tenant_id();
  IF v_user_tenant IS NULL THEN
    SELECT empresa_operadora_id INTO v_user_tenant FROM public.usuarios WHERE id = v_user_id LIMIT 1;
  END IF;

  IF v_user_tenant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tenant não localizado para o usuário.');
  END IF;

  v_nome := (p_dados->>'nome');
  IF v_nome IS NULL OR trim(v_nome) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome do ponto parceiro é obrigatório.');
  END IF;

  v_modelo_raw := COALESCE(p_dados->>'modelo_comercial', 'PERMUTA');
  IF v_modelo_raw IN ('COMISSIONADO', 'COMISSIONADO_5', 'COMISSIONADO 5%') THEN
    v_modelo_final := 'COMISSIONADO_5';
    v_percentual := 5.00;
  ELSE
    v_modelo_final := 'PERMUTA';
    v_percentual := NULL;
  END IF;

  INSERT INTO public.pontos (
    empresa_operadora_id, nome, categoria, descricao, foto_url, galeria,
    cep, logradouro, numero, complemento, bairro, cidade, estado,
    quantidade_telas, disponibilidade, status_operacional, regras_comerciais,
    modelo_comercial, percentual_comissao, ativo, created_by
  ) VALUES (
    v_user_tenant, v_nome, p_dados->>'categoria', p_dados->>'descricao', p_dados->>'foto_capa_url',
    COALESCE(p_dados->'fotos_urls', '[]'::jsonb), p_dados->>'cep', p_dados->>'logradouro',
    p_dados->>'numero', p_dados->>'complemento', p_dados->>'bairro', p_dados->>'cidade', p_dados->>'estado',
    COALESCE((p_dados->>'quantidade_telas')::INT, 1), 'DISPONIVEL', 'ATIVO', p_dados->>'regras_comerciais',
    v_modelo_final, v_percentual, TRUE, v_user_id
  ) RETURNING id, codigo_publico INTO v_ponto_id, v_codigo_publico;

  -- Resolução do Template Padrão (Gate 5.1 / Micro-Gate 5.1.2)
  SELECT t.id, t.nome, t.versao INTO v_tpl_id, v_tpl_nome, v_tpl_versao
  FROM public.fn_obter_template_padrao(v_user_tenant, 'PARCEIRO') t;

  v_numero_contrato := public.fn_gerar_numero_contrato_atomo(v_user_tenant);

  INSERT INTO public.contratos (
    empresa_operadora_id, ponto_id,
    template_id, template_nome, template_versao, versao_atual,
    numero_contrato, tipo_contrato, modelo_comercial, percentual_comissao, valor_mensal, forma_pagamento,
    data_inicio, data_fim, status_documento, status_workflow
  ) VALUES (
    v_user_tenant, v_ponto_id,
    v_tpl_id, v_tpl_nome, COALESCE(v_tpl_versao, 1), COALESCE(v_tpl_versao, 1),
    v_numero_contrato, 'PARCEIRO', v_modelo_final, v_percentual, 0.00, 'PIX',
    CURRENT_DATE, (CURRENT_DATE + INTERVAL '1 year')::DATE,
    'RASCUNHO', 'AGUARDANDO_ASSINATURA'
  ) RETURNING id INTO v_contrato_id;

  IF v_contrato_id IS NULL THEN
    RAISE EXCEPTION 'Falha ao criar o contrato atômico do ponto parceiro.';
  END IF;

  INSERT INTO public.auditoria_logs (
    empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes
  ) VALUES (
    v_user_tenant, v_user_id, 'PONTO', v_ponto_id, 'INSERT', 'ATIVO',
    'PONTO PARCEIRO cadastrado com contrato (Código: ' || COALESCE(v_codigo_publico, '?') || ', Modelo: ' || v_modelo_final || ')'
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', v_ponto_id,
    'codigo_publico', v_codigo_publico,
    'contrato_id', v_contrato_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ----------------------------------------------------------------------
-- 4. RPC DE APURAÇÃO ATÔMICA DE REPASSE (fn_apurar_repasse_parceiro)
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_apurar_repasse_parceiro(
  p_conta_receber_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conta RECORD;
  v_item RECORD;
  v_ponto RECORD;
  v_contrato_parceiro_id UUID;
  v_anuncios_distintos INT;
  v_valor_base NUMERIC(12,2);
  v_valor_repasse NUMERIC(12,2);
  v_idempotency_key VARCHAR(150);
  v_competencia VARCHAR(7);
  v_repasses_criados INT := 0;
  v_pagamento_id UUID;
BEGIN
  -- Apenas faturas quitadas geram apuração de repasse
  SELECT * INTO v_conta
  FROM public.contas_receber
  WHERE id = p_conta_receber_id;

  IF NOT FOUND OR v_conta.status NOT IN ('PAGA', 'PAGO') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Conta não encontrada ou não quitada');
  END IF;

  -- Obter pagamento atrelado mais recente
  SELECT id INTO v_pagamento_id
  FROM public.pagamentos
  WHERE conta_receber_id = p_conta_receber_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_competencia := TO_CHAR(COALESCE(v_conta.payment_date, CURRENT_DATE), 'YYYY-MM');

  -- Processar itens de composição comercial da cobrança (contrato_estabelecimentos)
  FOR v_item IN
    SELECT ce.id AS ce_id, ce.ponto_id, ce.unidade_id, ce.quantidade_telas, ce.valor_unitario
    FROM public.contrato_estabelecimentos ce
    WHERE ce.contrato_id = v_conta.contrato_id
       OR (v_conta.expansao_id IS NOT NULL AND ce.expansao_id = v_conta.expansao_id)
  LOOP
    IF v_item.ponto_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Buscar modelo comercial do ponto e seu contrato de parceria
    SELECT id, modelo_comercial, percentual_comissao, unidade_id INTO v_ponto
    FROM public.pontos
    WHERE id = v_item.ponto_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- REGRA DE NEGÓCIO SUPREMA: PERMUTA = REPASSE FINANCEIRO NÃO (0 registros financeiros)
    IF COALESCE(v_ponto.modelo_comercial, 'PERMUTA') = 'PERMUTA' THEN
      CONTINUE;
    END IF;

    -- REGRA COMISSIONADO 5%: Apenas se o modelo for COMISSIONADO_5
    SELECT id INTO v_contrato_parceiro_id
    FROM public.contratos
    WHERE ponto_id = v_item.ponto_id AND tipo_contrato = 'PARCEIRO'
    ORDER BY created_at DESC
    LIMIT 1;

    -- Contabilidade de Anúncios Distintos (Deduplicação estrita por ponto)
    SELECT COUNT(DISTINCT media_asset_id)::INT INTO v_anuncios_distintos
    FROM (
      SELECT cpi.asset_id AS media_asset_id
      FROM public.cliente_playlist_pontos cpp
      JOIN public.cliente_playlist_itens cpi ON cpi.playlist_id = cpp.playlist_id
      WHERE cpp.ponto_id = v_item.ponto_id
      UNION
      SELECT cm.id AS media_asset_id
      FROM public.campanha_telas ct
      JOIN public.campanha_midias cm ON cm.campanha_id = ct.campanha_id
      WHERE ct.ponto_id = v_item.ponto_id
    ) sub;

    IF v_anuncios_distintos IS NULL OR v_anuncios_distintos = 0 THEN
      v_anuncios_distintos := 1;
    END IF;

    -- Base Econômica do Anúncio/Ponto e aplicação exata de 5%
    v_valor_base := COALESCE(v_item.valor_unitario, 0) * GREATEST(COALESCE(v_item.quantidade_telas, 1), 1);
    v_valor_repasse := ROUND(v_valor_base * 0.05, 2);

    -- Idempotência atômica estrita
    v_idempotency_key := v_conta.empresa_operadora_id::text || ':' || p_conta_receber_id::text || ':' || v_item.ce_id::text || ':' || v_item.ponto_id::text;

    INSERT INTO public.repasses_parceiros (
      empresa_operadora_id, conta_receber_id, pagamento_id, contrato_estabelecimento_id,
      ponto_id, unidade_id, contrato_parceiro_id, modelo_comercial_snapshot,
      percentual_snapshot, anuncios_distintos_count, valor_base_anuncio_snapshot,
      valor_repasse, status, competencia_mes_ano, data_liquidacao_recebimento, idempotency_key
    ) VALUES (
      v_conta.empresa_operadora_id, p_conta_receber_id, v_pagamento_id, v_item.ce_id,
      v_item.ponto_id, COALESCE(v_item.unidade_id, v_ponto.unidade_id), COALESCE(v_contrato_parceiro_id, v_conta.contrato_id),
      'COMISSIONADO_5', 5.00, v_anuncios_distintos, v_valor_base,
      v_valor_repasse, 'DEVIDO', v_competencia, COALESCE(v_conta.payment_date, NOW()), v_idempotency_key
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    IF FOUND THEN
      v_repasses_criados := v_repasses_criados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'conta_receber_id', p_conta_receber_id,
    'repasses_criados', v_repasses_criados
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ----------------------------------------------------------------------
-- 5. RPC DE EXTRATO RLS-SAFE PARA O PORTAL DO HOSPEDADOR
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_repasses_parceiro()
RETURNS TABLE (
  id UUID,
  competencia VARCHAR(7),
  ponto_nome TEXT,
  modelo_comercial VARCHAR(20),
  percentual_aplicado NUMERIC(5,2),
  anuncios_distintos INT,
  valor_base NUMERIC(12,2),
  valor_liquido NUMERIC(12,2),
  status VARCHAR(20),
  data_liquidacao TIMESTAMPTZ,
  data_pagamento TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rp.id,
    rp.competencia_mes_ano AS competencia,
    COALESCE(p.nome, 'Ponto Parceiro') AS ponto_nome,
    rp.modelo_comercial_snapshot AS modelo_comercial,
    rp.percentual_snapshot AS percentual_aplicado,
    rp.anuncios_distintos_count AS anuncios_distintos,
    rp.valor_base_anuncio_snapshot AS valor_base,
    rp.valor_repasse AS valor_liquido,
    rp.status,
    rp.data_liquidacao_recebimento AS data_liquidacao,
    rp.data_pagamento_parceiro AS data_pagamento
  FROM public.repasses_parceiros rp
  JOIN public.pontos p ON p.id = rp.ponto_id
  WHERE rp.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
     OR p.created_by = auth.uid()
  ORDER BY rp.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_repasses_parceiro() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_repasses_parceiro() TO authenticated;

-- ----------------------------------------------------------------------
-- 6. INTEGRAÇÃO NO TRIGGER DE CONCILIAÇÃO FINANCEIRA
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_concilia_pagamento_com_repasse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res JSONB;
BEGIN
  -- Executa primeiro a conciliação principal
  PERFORM public.trg_concilia_pagamento();

  -- Se a conta transicionou para PAGA, apura repasse atômico
  IF NEW.conta_receber_id IS NOT NULL THEN
    PERFORM public.fn_apurar_repasse_parceiro(NEW.conta_receber_id);
  END IF;

  RETURN NEW;
END;
$$;
