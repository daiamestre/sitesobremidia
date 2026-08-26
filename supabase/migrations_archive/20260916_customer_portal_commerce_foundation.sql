-- ======================================================================
-- SOBRE MÍDIA CUSTOMER PORTAL - MIGRATION 20260916
-- COMMERCE FOUNDATION: PRODUTOS, PREÇOS, OFERTAS, ONBOARDING & EXPANSÃO
-- ----------------------------------------------------------------------
-- Fases 5-10 do Plano Mestre Customer Portal:
--   FASE 5  Onboarding comercial (sessões self-service)
--   FASE 6  Contrato + assinatura (fluxo self-service no portal)
--   FASE 7  Estabelecimentos + preço (seleção, cálculo pela plataforma)
--   FASE 8  Produtos + preços (preço oficial com auditoria obrigatória)
--   FASE 9  Offers (Offer Center)
--   FASE 10 Campanhas (base: produtos/ofertas/estabelecimentos)
--
-- Princípios aplicados:
--   * ERP/Platform = system of record. O frontend NUNCA é autoridade de preço.
--   * Preço editável APENAS via RPC autorizada com justificativa + auditoria
--     (valor original, valor novo, responsável, data, motivo).
--   * Expansão calcula impacto financeiro na plataforma, exige aprovação e
--     registra aditivo (contrato_versoes imutável).
--   * Multi-tenant: RLS por empresa_operadora_id + cliente_id. Cliente vê
--     apenas os próprios registros; operadora vê o tenant inteiro.
--   * Idempotente e seguro para reexecução.
-- ======================================================================

-- ----------------------------------------------------------------------
-- 0. HELPERS DE IDENTIDADE E PERMISSÃO
-- ----------------------------------------------------------------------

-- cliente_id do usuário autenticado (identidade unificada - migration 031)
CREATE OR REPLACE FUNCTION public.get_user_cliente_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT cliente_id
  FROM public.usuarios
  WHERE id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_cliente_id() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_cliente_id() FROM anon;

-- Perfis internos da operadora (papéis com poder de gestão comercial)
CREATE OR REPLACE FUNCTION public.is_internal_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role() IN (
    'OWNER','ADMIN','GESTOR','GERENTE','SUPERVISOR','FINANCEIRO',
    'OPERACIONAL','FUNCIONARIO','DESIGNER','REPRESENTANTE','MARKETING'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_internal_role() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_internal_role() FROM anon;

-- ----------------------------------------------------------------------
-- 1. MODALIDADE DO CLIENTE (ANUNCIANTE / HOST / HÍBRIDO)
-- ----------------------------------------------------------------------

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS modalidade VARCHAR(20) DEFAULT 'ANUNCIANTE'
  CHECK (modalidade IN ('ANUNCIANTE', 'HOST', 'HIBRIDO'));

-- ----------------------------------------------------------------------
-- 2. SERVIÇO PADRÃO "PONTO DE MÍDIA" (base de cálculo de preço)
-- ----------------------------------------------------------------------

INSERT INTO public.catalogo_servicos (empresa_operadora_id, codigo_servico, nome, descricao, valor_tabela, ativo)
SELECT id, 'PONTO_MIDIA', 'Ponto de Mídia Digital', 'Veiculação de mídia digital em ponto da rede SOBRE MÍDIA (por tela/mês)', 0, true
FROM public.empresa_operadora
ON CONFLICT (empresa_operadora_id, codigo_servico) DO NOTHING;

-- ----------------------------------------------------------------------
-- 3. PRODUTOS (catálogo do cliente)
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  codigo VARCHAR(40),
  nome VARCHAR(200) NOT NULL,
  descricao TEXT,
  categoria VARCHAR(100),
  marca VARCHAR(100),
  unidade_medida VARCHAR(30) NOT NULL DEFAULT 'UN',
  imagem_url TEXT,
  preco_atual NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (preco_atual >= 0),
  preco_promocional NUMERIC(12,2) CHECK (preco_promocional IS NULL OR preco_promocional >= 0),
  promocao_inicio DATE,
  promocao_fim DATE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_produtos_tenant ON public.produtos(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_produtos_cliente ON public.produtos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON public.produtos(categoria);

-- GUARDIÃO DE PREÇO: nenhuma alteração de preço via UPDATE direto.
-- Preço é informação oficial; somente a RPC atualizar_preco_produto
-- (que grava produto_precos + preco_auditoria) pode alterá-lo.
CREATE OR REPLACE FUNCTION public.trg_produtos_preco_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    NEW.preco_atual IS DISTINCT FROM OLD.preco_atual
    OR NEW.preco_promocional IS DISTINCT FROM OLD.preco_promocional
    OR NEW.promocao_inicio IS DISTINCT FROM OLD.promocao_inicio
    OR NEW.promocao_fim IS DISTINCT FROM OLD.promocao_fim
  ) AND COALESCE(current_setting('app.preco_autorizado', true), '') <> NEW.id::text THEN
    RAISE EXCEPTION 'PRECO_BLOQUEADO: alteração de preço exige RPC autorizada com justificativa registrada em preco_auditoria.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_produtos_preco_guard ON public.produtos;
CREATE TRIGGER trg_produtos_preco_guard
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.trg_produtos_preco_guard();

-- ----------------------------------------------------------------------
-- 4. PRODUTO_PRECOS (histórico versionado de preços — imutável na prática)
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.produto_precos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  preco NUMERIC(12,2) NOT NULL CHECK (preco >= 0),
  preco_promocional NUMERIC(12,2) CHECK (preco_promocional IS NULL OR preco_promocional >= 0),
  promocao_inicio DATE,
  promocao_fim DATE,
  justificativa TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_produto_precos_produto ON public.produto_precos(produto_id, created_at DESC);

-- ----------------------------------------------------------------------
-- 5. PRECO_AUDITORIA (valor original, valor novo, responsável, data, motivo)
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.preco_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  valor_anterior NUMERIC(12,2) NOT NULL,
  valor_novo NUMERIC(12,2) NOT NULL,
  preco_promocional_anterior NUMERIC(12,2),
  preco_promocional_novo NUMERIC(12,2),
  tipo_alteracao VARCHAR(30) NOT NULL CHECK (tipo_alteracao IN ('PRECO_OFICIAL', 'PRECO_PROMOCIONAL', 'PERIODO_PROMOCAO', 'TODOS')),
  responsavel_id UUID REFERENCES public.usuarios(id),
  responsavel_nome VARCHAR(150),
  justificativa TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_preco_auditoria_produto ON public.preco_auditoria(produto_id, created_at DESC);

-- ----------------------------------------------------------------------
-- 6. OFERTAS (Offer Center) + ITENS
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ofertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (
    status IN ('DRAFT','GENERATING','GENERATED','REVIEW','APPROVED',
               'REJECTED','SCHEDULED','PUBLISHED','ARCHIVED')
  ),
  canal VARCHAR(30) NOT NULL DEFAULT 'TODOS' CHECK (
    canal IN ('TODOS','WEB','WHATSAPP','TELA','LED','TV','INSTAGRAM','PORTAL')
  ),
  destaque BOOLEAN NOT NULL DEFAULT FALSE,
  criada_por_ia BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id),
  CHECK (data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_ofertas_tenant ON public.ofertas(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_ofertas_cliente ON public.ofertas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ofertas_status ON public.ofertas(status);

CREATE TABLE IF NOT EXISTS public.oferta_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oferta_id UUID NOT NULL REFERENCES public.ofertas(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  preco_original NUMERIC(12,2) NOT NULL CHECK (preco_original >= 0),
  preco_oferta NUMERIC(12,2) NOT NULL CHECK (preco_oferta >= 0),
  desconto_porcentagem NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (desconto_porcentagem >= 0),
  destaque BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (oferta_id, produto_id),
  CHECK (preco_oferta <= preco_original)
);

CREATE INDEX IF NOT EXISTS idx_oferta_itens_oferta ON public.oferta_itens(oferta_id);
CREATE INDEX IF NOT EXISTS idx_oferta_itens_produto ON public.oferta_itens(produto_id);

-- ----------------------------------------------------------------------
-- 7. CONTRATO_ESTABELECIMENTOS (estabelecimentos contratados)
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contrato_estabelecimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  quantidade_telas INT NOT NULL DEFAULT 1 CHECK (quantidade_telas > 0),
  valor_unitario NUMERIC(12,2) NOT NULL CHECK (valor_unitario >= 0),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  UNIQUE (contrato_id, unidade_id)
);

CREATE INDEX IF NOT EXISTS idx_contrato_estab_contrato ON public.contrato_estabelecimentos(contrato_id);
CREATE INDEX IF NOT EXISTS idx_contrato_estab_unidade ON public.contrato_estabelecimentos(unidade_id);

-- ----------------------------------------------------------------------
-- 8. EXPANSÕES (adicionar estabelecimentos + impacto financeiro + aprovação)
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.expansoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  solicitado_por UUID REFERENCES public.usuarios(id),
  status VARCHAR(30) NOT NULL DEFAULT 'SOLICITADA' CHECK (
    status IN ('SOLICITADA','APROVADA','REJEITADA','CANCELADA')
  ),
  valor_contrato_atual NUMERIC(12,2) NOT NULL CHECK (valor_contrato_atual >= 0),
  valor_novo_contrato NUMERIC(12,2) NOT NULL CHECK (valor_novo_contrato >= valor_contrato_atual),
  justificativa TEXT,
  aprovado_por UUID REFERENCES public.usuarios(id),
  aprovado_em TIMESTAMPTZ,
  motivo_rejeicao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expansoes_tenant ON public.expansoes(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_expansoes_contrato ON public.expansoes(contrato_id);
CREATE INDEX IF NOT EXISTS idx_expansoes_status ON public.expansoes(status);

CREATE TABLE IF NOT EXISTS public.expansao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expansao_id UUID NOT NULL REFERENCES public.expansoes(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  quantidade_telas INT NOT NULL DEFAULT 1 CHECK (quantidade_telas > 0),
  valor_unitario NUMERIC(12,2) NOT NULL CHECK (valor_unitario >= 0),
  valor_total NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expansao_itens_expansao ON public.expansao_itens(expansao_id);

-- ----------------------------------------------------------------------
-- 9. ONBOARDING_SESSOES (jornada comercial self-service)
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.onboarding_sessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  modalidade VARCHAR(20) CHECK (modalidade IN ('ANUNCIANTE','HOST','HIBRIDO')),
  step VARCHAR(40) NOT NULL DEFAULT 'SOLUCAO',
  status VARCHAR(30) NOT NULL DEFAULT 'EM_ANDAMENTO' CHECK (
    status IN ('EM_ANDAMENTO','CONCLUIDO','ABANDONADO','CONVERTIDO')
  ),
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tenant ON public.onboarding_sessoes(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_usuario ON public.onboarding_sessoes(usuario_id);

-- ======================================================================
-- RLS MULTI-TENANT
-- ======================================================================

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_precos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preco_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ofertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oferta_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_estabelecimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expansoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expansao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_sessoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- ================= PRODUTOS =================
  -- SELECT: cliente dono OU operadora do tenant
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'produtos' AND policyname = 'prd_select') THEN
    CREATE POLICY prd_select ON public.produtos FOR SELECT TO authenticated
    USING (
      cliente_id = public.get_user_cliente_id()
      OR empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'produtos' AND policyname = 'prd_insert') THEN
    CREATE POLICY prd_insert ON public.produtos FOR INSERT TO authenticated
    WITH CHECK (
      (
        cliente_id = public.get_user_cliente_id()
        AND cliente_id IS NOT NULL
        AND empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      )
      OR (
        empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
        AND public.is_internal_role()
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'produtos' AND policyname = 'prd_update') THEN
    CREATE POLICY prd_update ON public.produtos FOR UPDATE TO authenticated
    USING (
      cliente_id = public.get_user_cliente_id()
      OR (
        empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
        AND public.is_internal_role()
      )
    )
    WITH CHECK (
      cliente_id = public.get_user_cliente_id()
      OR (
        empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
        AND public.is_internal_role()
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'produtos' AND policyname = 'prd_delete') THEN
    CREATE POLICY prd_delete ON public.produtos FOR DELETE TO authenticated
    USING (
      cliente_id = public.get_user_cliente_id()
      OR (
        empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
        AND public.is_internal_role()
      )
    );
  END IF;

  -- ================= PRODUTO_PRECOS =================
  -- SELECT via produto acessível; INSERT somente via RPC autorizada
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'produto_precos' AND policyname = 'pp_select') THEN
    CREATE POLICY pp_select ON public.produto_precos FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.produtos p
        WHERE p.id = produto_precos.produto_id
          AND (
            p.cliente_id = public.get_user_cliente_id()
            OR p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          )
      )
    );
  END IF;

  -- ================= PRECO_AUDITORIA =================
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'preco_auditoria' AND policyname = 'pa_select') THEN
    CREATE POLICY pa_select ON public.preco_auditoria FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.produtos p
        WHERE p.id = preco_auditoria.produto_id
          AND (
            p.cliente_id = public.get_user_cliente_id()
            OR p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          )
      )
    );
  END IF;

  -- ================= OFERTAS =================
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ofertas' AND policyname = 'ofr_select') THEN
    CREATE POLICY ofr_select ON public.ofertas FOR SELECT TO authenticated
    USING (
      cliente_id = public.get_user_cliente_id()
      OR empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ofertas' AND policyname = 'ofr_insert') THEN
    CREATE POLICY ofr_insert ON public.ofertas FOR INSERT TO authenticated
    WITH CHECK (
      (
        cliente_id = public.get_user_cliente_id()
        AND cliente_id IS NOT NULL
        AND empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      )
      OR (
        empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
        AND public.is_internal_role()
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ofertas' AND policyname = 'ofr_update') THEN
    CREATE POLICY ofr_update ON public.ofertas FOR UPDATE TO authenticated
    USING (
      cliente_id = public.get_user_cliente_id()
      OR (
        empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
        AND public.is_internal_role()
      )
    )
    WITH CHECK (
      cliente_id = public.get_user_cliente_id()
      OR (
        empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
        AND public.is_internal_role()
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ofertas' AND policyname = 'ofr_delete') THEN
    CREATE POLICY ofr_delete ON public.ofertas FOR DELETE TO authenticated
    USING (
      cliente_id = public.get_user_cliente_id()
      OR (
        empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
        AND public.is_internal_role()
      )
    );
  END IF;

  -- ================= OFERTA_ITENS =================
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'oferta_itens' AND policyname = 'oi_select') THEN
    CREATE POLICY oi_select ON public.oferta_itens FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.ofertas o
        WHERE o.id = oferta_itens.oferta_id
          AND (
            o.cliente_id = public.get_user_cliente_id()
            OR o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          )
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'oferta_itens' AND policyname = 'oi_insert') THEN
    CREATE POLICY oi_insert ON public.oferta_itens FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.ofertas o
        WHERE o.id = oferta_itens.oferta_id
          AND (
            o.cliente_id = public.get_user_cliente_id()
            OR (
              o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
              AND public.is_internal_role()
            )
          )
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'oferta_itens' AND policyname = 'oi_update') THEN
    CREATE POLICY oi_update ON public.oferta_itens FOR UPDATE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.ofertas o
        WHERE o.id = oferta_itens.oferta_id
          AND (
            o.cliente_id = public.get_user_cliente_id()
            OR (
              o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
              AND public.is_internal_role()
            )
          )
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.ofertas o
        WHERE o.id = oferta_itens.oferta_id
          AND (
            o.cliente_id = public.get_user_cliente_id()
            OR (
              o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
              AND public.is_internal_role()
            )
          )
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'oferta_itens' AND policyname = 'oi_delete') THEN
    CREATE POLICY oi_delete ON public.oferta_itens FOR DELETE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.ofertas o
        WHERE o.id = oferta_itens.oferta_id
          AND (
            o.cliente_id = public.get_user_cliente_id()
            OR (
              o.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
              AND public.is_internal_role()
            )
          )
      )
    );
  END IF;

  -- ================= CONTRATO_ESTABELECIMENTOS =================
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contrato_estabelecimentos' AND policyname = 'ce_select') THEN
    CREATE POLICY ce_select ON public.contrato_estabelecimentos FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.contratos c
        WHERE c.id = contrato_estabelecimentos.contrato_id
          AND (
            c.cliente_id = public.get_user_cliente_id()
            OR c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          )
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contrato_estabelecimentos' AND policyname = 'ce_insert') THEN
    CREATE POLICY ce_insert ON public.contrato_estabelecimentos FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.contratos c
        WHERE c.id = contrato_estabelecimentos.contrato_id
          AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          AND public.is_internal_role()
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contrato_estabelecimentos' AND policyname = 'ce_update') THEN
    CREATE POLICY ce_update ON public.contrato_estabelecimentos FOR UPDATE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.contratos c
        WHERE c.id = contrato_estabelecimentos.contrato_id
          AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          AND public.is_internal_role()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.contratos c
        WHERE c.id = contrato_estabelecimentos.contrato_id
          AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          AND public.is_internal_role()
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contrato_estabelecimentos' AND policyname = 'ce_delete') THEN
    CREATE POLICY ce_delete ON public.contrato_estabelecimentos FOR DELETE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.contratos c
        WHERE c.id = contrato_estabelecimentos.contrato_id
          AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          AND public.is_internal_role()
      )
    );
  END IF;

  -- ================= EXPANSÕES =================
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expansoes' AND policyname = 'exp_select') THEN
    CREATE POLICY exp_select ON public.expansoes FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.contratos c
        WHERE c.id = expansoes.contrato_id
          AND (
            c.cliente_id = public.get_user_cliente_id()
            OR c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          )
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expansoes' AND policyname = 'exp_insert') THEN
    CREATE POLICY exp_insert ON public.expansoes FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.contratos c
        WHERE c.id = expansoes.contrato_id
          AND c.cliente_id = public.get_user_cliente_id()
          AND c.cliente_id IS NOT NULL
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expansoes' AND policyname = 'exp_update') THEN
    CREATE POLICY exp_update ON public.expansoes FOR UPDATE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.contratos c
        WHERE c.id = expansoes.contrato_id
          AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          AND public.is_internal_role()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.contratos c
        WHERE c.id = expansoes.contrato_id
          AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          AND public.is_internal_role()
      )
    );
  END IF;

  -- ================= EXPANSAO_ITENS =================
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expansao_itens' AND policyname = 'ei_select') THEN
    CREATE POLICY ei_select ON public.expansao_itens FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.expansoes e
        JOIN public.contratos c ON c.id = e.contrato_id
        WHERE e.id = expansao_itens.expansao_id
          AND (
            c.cliente_id = public.get_user_cliente_id()
            OR c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          )
      )
    );
  END IF;

  -- ================= ONBOARDING_SESSOES =================
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_sessoes' AND policyname = 'onb_select') THEN
    CREATE POLICY onb_select ON public.onboarding_sessoes FOR SELECT TO authenticated
    USING (
      usuario_id = auth.uid()
      OR empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_sessoes' AND policyname = 'onb_insert') THEN
    CREATE POLICY onb_insert ON public.onboarding_sessoes FOR INSERT TO authenticated
    WITH CHECK (
      usuario_id = auth.uid()
      AND empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_sessoes' AND policyname = 'onb_update') THEN
    CREATE POLICY onb_update ON public.onboarding_sessoes FOR UPDATE TO authenticated
    USING (
      usuario_id = auth.uid()
      OR (
        empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
        AND public.is_internal_role()
      )
    )
    WITH CHECK (
      usuario_id = auth.uid()
      OR (
        empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
        AND public.is_internal_role()
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_sessoes' AND policyname = 'onb_delete') THEN
    CREATE POLICY onb_delete ON public.onboarding_sessoes FOR DELETE TO authenticated
    USING (
      usuario_id = auth.uid()
      OR (
        empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
        AND public.is_internal_role()
      )
    );
  END IF;
END $$;

-- ======================================================================
-- RPCs (regras de negócio executadas na plataforma — nunca no frontend)
-- ======================================================================

-- ----------------------------------------------------------------------
-- 10. RPC: ATUALIZAR_PRECO_PRODUTO
-- Único caminho autorizado para alteração de preço.
-- Regras: permissão (operadora OU cliente dono), justificativa obrigatória,
-- histórico em produto_precos e auditoria completa em preco_auditoria.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_preco_produto(
  p_produto_id uuid,
  p_novo_preco numeric,
  p_justificativa text,
  p_preco_promocional numeric DEFAULT NULL,
  p_promocao_inicio date DEFAULT NULL,
  p_promocao_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_produto public.produtos%ROWTYPE;
  v_cliente uuid := public.get_user_cliente_id();
  v_tenant uuid := public.get_user_empresa_operadora_id(auth.uid());
  v_role text := public.get_user_role();
  v_autorizado boolean;
  v_tipo_alteracao varchar(30);
BEGIN
  SELECT * INTO v_produto FROM public.produtos WHERE id = p_produto_id;
  IF v_produto.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Produto não encontrado.');
  END IF;

  -- Autorização: operadora interna OU cliente dono do produto
  v_autorizado := (
    v_tenant = v_produto.empresa_operadora_id
    AND v_role IN ('OWNER','ADMIN','GESTOR','GERENTE','SUPERVISOR','FINANCEIRO','OPERACIONAL','FUNCIONARIO','DESIGNER','MARKETING')
  ) OR (
    v_cliente IS NOT NULL
    AND v_cliente = v_produto.cliente_id
  );

  IF NOT v_autorizado THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: usuário sem permissão para alterar preço deste produto.');
  END IF;

  IF p_novo_preco IS NULL OR p_novo_preco < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Preço inválido.');
  END IF;

  IF p_preco_promocional IS NOT NULL AND p_preco_promocional > p_novo_preco THEN
    RETURN jsonb_build_object('success', false, 'error', 'Preço promocional não pode ser maior que o preço oficial.');
  END IF;

  IF p_justificativa IS NULL OR length(trim(p_justificativa)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Justificativa obrigatória (mínimo 3 caracteres) para alteração de preço.');
  END IF;

  -- Tipo de alteração (auditoria)
  v_tipo_alteracao := CASE
    WHEN p_preco_promocional IS DISTINCT FROM v_produto.preco_promocional
      OR p_promocao_inicio IS DISTINCT FROM v_produto.promocao_inicio
      OR p_promocao_fim IS DISTINCT FROM v_produto.promocao_fim
    THEN 'TODOS'
    ELSE 'PRECO_OFICIAL'
  END;

  -- 1. Histórico versionado
  INSERT INTO public.produto_precos (produto_id, preco, preco_promocional, promocao_inicio, promocao_fim, justificativa, created_by)
  VALUES (p_produto_id, p_novo_preco, p_preco_promocional, p_promocao_inicio, p_promocao_fim, p_justificativa, auth.uid());

  -- 2. Auditoria imutável (valor original, valor novo, responsável, data, motivo)
  INSERT INTO public.preco_auditoria (
    produto_id, valor_anterior, valor_novo,
    preco_promocional_anterior, preco_promocional_novo,
    tipo_alteracao, responsavel_id, responsavel_nome, justificativa
  )
  VALUES (
    p_produto_id, v_produto.preco_atual, p_novo_preco,
    v_produto.preco_promocional, p_preco_promocional,
    v_tipo_alteracao, auth.uid(),
    (SELECT nome FROM public.usuarios WHERE id = auth.uid()),
    p_justificativa
  );

  -- 3. Atualização com autorização do trigger guardião
  PERFORM set_config('app.preco_autorizado', p_produto_id::text, true);
  UPDATE public.produtos
  SET preco_atual = p_novo_preco,
      preco_promocional = p_preco_promocional,
      promocao_inicio = p_promocao_inicio,
      promocao_fim = p_promocao_fim,
      updated_at = NOW(),
      updated_by = auth.uid()
  WHERE id = p_produto_id;
  PERFORM set_config('app.preco_autorizado', '', true);

  RETURN jsonb_build_object(
    'success', true,
    'produto_id', p_produto_id,
    'preco_anterior', v_produto.preco_atual,
    'preco_novo', p_novo_preco,
    'auditado', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_preco_produto(uuid, numeric, text, numeric, date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.atualizar_preco_produto(uuid, numeric, text, numeric, date, date) FROM anon;

-- ----------------------------------------------------------------------
-- 11. RPC: LISTAR_ESTABELECIMENTOS_DISPONIVEIS
-- Estabelecimentos (unidades) do tenant com telas ativas e valor unitário
-- oficial (catalogo_servicos.PONTO_MIDIA). O preço vem da plataforma.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_estabelecimentos_disponiveis()
RETURNS TABLE (
  unidade_id uuid,
  nome text,
  cidade text,
  estado text,
  endereco text,
  rede_nome text,
  quantidade_telas bigint,
  valor_unitario numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    u.id,
    u.nome,
    u.cidade,
    u.estado,
    COALESCE(u.endereco, ''),
    r.nome,
    COUNT(t.id),
    COALESCE(cs.valor_tabela, 0)
  FROM public.unidades u
  JOIN public.redes r ON r.id = u.rede_id
  JOIN public.locais l ON l.unidade_id = u.id
  JOIN public.telas t ON t.local_id = l.id AND t.ativo = true
  LEFT JOIN public.catalogo_servicos cs
    ON cs.empresa_operadora_id = r.empresa_operadora_id
    AND cs.codigo_servico = 'PONTO_MIDIA'
  WHERE r.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND u.ativo = true
  GROUP BY u.id, u.nome, u.cidade, u.estado, u.endereco, r.nome, cs.valor_tabela
  ORDER BY u.nome;
$$;

GRANT EXECUTE ON FUNCTION public.listar_estabelecimentos_disponiveis() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.listar_estabelecimentos_disponiveis() FROM anon;

-- ----------------------------------------------------------------------
-- 12. RPC: CALCULAR_PRECO_ONBOARDING
-- O preço é calculado pela plataforma (nunca pelo frontend).
-- Total = Σ (telas do estabelecimento × valor_unitario PONTO_MIDIA) × período.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_preco_onboarding(
  p_unidade_ids uuid[],
  p_duracao_meses int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := public.get_user_empresa_operadora_id(auth.uid());
  v_servico public.catalogo_servicos%ROWTYPE;
  v_total_telas bigint := 0;
  v_valor_mensal numeric := 0;
  v_itens jsonb := '[]'::jsonb;
  v_unidade record;
BEGIN
  IF p_unidade_ids IS NULL OR array_length(p_unidade_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Selecione ao menos um estabelecimento.');
  END IF;

  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tenant não resolvido para o usuário.');
  END IF;

  IF p_duracao_meses IS NULL OR p_duracao_meses < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contrato inicial mínimo de 3 meses.');
  END IF;

  SELECT * INTO v_servico
  FROM public.catalogo_servicos
  WHERE empresa_operadora_id = v_tenant AND codigo_servico = 'PONTO_MIDIA'
  LIMIT 1;

  FOR v_unidade IN
    SELECT
      u.id AS unidade_id,
      u.nome AS nome,
      u.cidade AS cidade,
      u.estado AS estado,
      COUNT(t.id) AS quantidade_telas
    FROM public.unidades u
    JOIN public.redes r ON r.id = u.rede_id
    JOIN public.locais l ON l.unidade_id = u.id
    JOIN public.telas t ON t.local_id = l.id AND t.ativo = true
    WHERE r.empresa_operadora_id = v_tenant
      AND u.ativo = true
      AND u.id = ANY(p_unidade_ids)
    GROUP BY u.id, u.nome, u.cidade, u.estado
  LOOP
    v_total_telas := v_total_telas + v_unidade.quantidade_telas;
    v_itens := v_itens || jsonb_build_object(
      'unidade_id', v_unidade.unidade_id,
      'nome', v_unidade.nome,
      'cidade', v_unidade.cidade,
      'estado', v_unidade.estado,
      'quantidade_telas', v_unidade.quantidade_telas,
      'valor_unitario', COALESCE(v_servico.valor_tabela, 0),
      'valor_total', COALESCE(v_servico.valor_tabela, 0) * v_unidade.quantidade_telas
    );
  END LOOP;

  v_valor_mensal := COALESCE(v_servico.valor_tabela, 0) * v_total_telas;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant,
    'duracao_meses', p_duracao_meses,
    'total_telas', v_total_telas,
    'valor_unitario', COALESCE(v_servico.valor_tabela, 0),
    'valor_mensal', v_valor_mensal,
    'valor_total_periodo', v_valor_mensal * p_duracao_meses,
    'itens', v_itens
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calcular_preco_onboarding(uuid[], int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.calcular_preco_onboarding(uuid[], int) FROM anon;

-- ----------------------------------------------------------------------
-- 13. RPC: CRIAR_CONTRATO_ONBOARDING
-- Cria contrato (período mínimo 3 meses) + itens + estabelecimentos
-- + versão snapshot imutável + notificação ao cliente.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_contrato_onboarding(
  p_sessao_id uuid,
  p_unidade_ids uuid[],
  p_duracao_meses int DEFAULT 3,
  p_forma_pagamento text DEFAULT 'PIX',
  p_data_inicio date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sessao public.onboarding_sessoes%ROWTYPE;
  v_tenant uuid := public.get_user_empresa_operadora_id(auth.uid());
  v_preco jsonb;
  v_cliente_id uuid;
  v_empresa_id uuid;
  v_representante_id uuid;
  v_servico_id uuid;
  v_contrato_id uuid;
  v_numero varchar(40);
  v_item record;
  v_total_telas bigint;
  v_valor_mensal numeric;
  v_data_fim date;
BEGIN
  SELECT * INTO v_sessao FROM public.onboarding_sessoes WHERE id = p_sessao_id;
  IF v_sessao.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão de onboarding não encontrada.');
  END IF;

  IF v_sessao.usuario_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: a sessão pertence a outro usuário.');
  END IF;

  IF v_sessao.status IN ('CONVERTIDO', 'CONCLUIDO') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta sessão já foi convertida em contrato.');
  END IF;

  -- Preço calculado pela plataforma (autoridade)
  v_preco := public.calcular_preco_onboarding(p_unidade_ids, p_duracao_meses);
  IF NOT (v_preco->>'success')::boolean THEN
    RETURN v_preco;
  END IF;

  v_total_telas := (v_preco->>'total_telas')::bigint;
  v_valor_mensal := (v_preco->>'valor_mensal')::numeric;
  v_data_fim := p_data_inicio + make_interval(months => p_duracao_meses) - interval '1 day';

  -- Cliente: usa o cliente da sessão (identidade unificada) ou cria a partir
  -- dos dados coletados no wizard (dados.empresa_cliente)
  v_cliente_id := v_sessao.cliente_id;
  IF v_cliente_id IS NULL THEN
    IF v_sessao.dados IS NULL OR v_sessao.dados->'empresa_cliente' IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Dados da empresa não informados no onboarding.');
    END IF;
    INSERT INTO public.clientes (empresa_operadora_id, representante_id, codigo_cliente, status, modalidade, created_by)
    VALUES (
      v_tenant,
      COALESCE(v_sessao.dados->'empresa_cliente'->>'representante_id', '')::uuid,
      (COALESCE((SELECT MAX(codigo_cliente) FROM public.clientes WHERE empresa_operadora_id = v_tenant), 0) + 1),
      'ACTIVE',
      COALESCE(v_sessao.modalidade, 'ANUNCIANTE'),
      auth.uid()
    )
    RETURNING id INTO v_cliente_id;
  END IF;

  -- Empresa (CNPJ obrigatório no cadastro)
  SELECT id INTO v_empresa_id FROM public.empresas WHERE cliente_id = v_cliente_id LIMIT 1;
  IF v_empresa_id IS NULL THEN
    IF v_sessao.dados IS NULL OR v_sessao.dados->'empresa_cliente' IS NULL
       OR NULLIF(v_sessao.dados->'empresa_cliente'->>'cnpj', '') IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Dados cadastrais (CNPJ) da empresa não informados.');
    END IF;
    INSERT INTO public.empresas (
      cliente_id, razao_social, nome_fantasia, cnpj, segmento, telefone,
      whatsapp, email, cep, logradouro, numero, complemento, bairro, cidade, estado,
      representante_legal, cargo_representante, created_by
    )
    VALUES (
      v_cliente_id,
      v_sessao.dados->'empresa_cliente'->>'razao_social',
      COALESCE(v_sessao.dados->'empresa_cliente'->>'nome_fantasia', v_sessao.dados->'empresa_cliente'->>'razao_social'),
      v_sessao.dados->'empresa_cliente'->>'cnpj',
      v_sessao.dados->'empresa_cliente'->>'segmento',
      v_sessao.dados->'empresa_cliente'->>'telefone',
      COALESCE(v_sessao.dados->'empresa_cliente'->>'whatsapp', v_sessao.dados->'empresa_cliente'->>'telefone'),
      v_sessao.dados->'empresa_cliente'->>'email',
      v_sessao.dados->'empresa_cliente'->>'cep',
      v_sessao.dados->'empresa_cliente'->>'logradouro',
      v_sessao.dados->'empresa_cliente'->>'numero',
      v_sessao.dados->'empresa_cliente'->>'complemento',
      v_sessao.dados->'empresa_cliente'->>'bairro',
      v_sessao.dados->'empresa_cliente'->>'cidade',
      v_sessao.dados->'empresa_cliente'->>'estado',
      v_sessao.dados->'empresa_cliente'->>'representante_legal',
      v_sessao.dados->'empresa_cliente'->>'cargo_representante',
      auth.uid()
    )
    RETURNING id INTO v_empresa_id;
  END IF;

  -- Representante: o do cliente ou fallback (primeiro do tenant)
  SELECT representante_id INTO v_representante_id FROM public.clientes WHERE id = v_cliente_id;
  IF v_representante_id IS NULL THEN
    SELECT id INTO v_representante_id FROM public.representantes
    WHERE empresa_operadora_id = v_tenant ORDER BY created_at LIMIT 1;
  END IF;

  -- Serviço PONTO_MIDIA
  SELECT id INTO v_servico_id FROM public.catalogo_servicos
  WHERE empresa_operadora_id = v_tenant AND codigo_servico = 'PONTO_MIDIA' LIMIT 1;

  -- Número do contrato legível
  v_numero := 'CT-' || to_char(NOW(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  -- Contrato (período mínimo 3 meses — regra comercial)
  INSERT INTO public.contratos (
    empresa_operadora_id, numero_contrato, numero_contrato_legivel, cliente_id, empresa_id,
    representante_id, versao_atual, status_workflow, valor_mensal, forma_pagamento,
    data_inicio, data_fim, tipo_contrato, status_documento, created_by
  )
  VALUES (
    v_tenant, v_numero, v_numero, v_cliente_id, v_empresa_id,
    v_representante_id, 1, 'AGUARDANDO_ASSINATURA', v_valor_mensal,
    p_forma_pagamento, p_data_inicio, v_data_fim,
    COALESCE(v_sessao.modalidade, 'ANUNCIANTE'), 'RASCUNHO', auth.uid()
  )
  RETURNING id INTO v_contrato_id;

  -- Itens do contrato (um por estabelecimento — PONTO_MIDIA)
  FOR v_item IN SELECT * FROM jsonb_to_recordset(v_preco->'itens') AS x(
    unidade_id uuid, nome text, cidade text, estado text,
    quantidade_telas bigint, valor_unitario numeric, valor_total numeric
  )
  LOOP
    INSERT INTO public.itens_contrato (contrato_id, servico_id, quantidade, valor_unitario, desconto, valor_total)
    VALUES (v_contrato_id, v_servico_id, v_item.quantidade_telas, v_item.valor_unitario, 0, v_item.valor_total);

    INSERT INTO public.contrato_estabelecimentos (contrato_id, unidade_id, quantidade_telas, valor_unitario, created_by)
    VALUES (v_contrato_id, v_item.unidade_id, v_item.quantidade_telas, v_item.valor_unitario, auth.uid());
  END LOOP;

  -- Versão imutável (snapshot) — aditivo/fundacional
  INSERT INTO public.contrato_versoes (contrato_id, numero_versao, snapshot_dados, motivo_alteracao, created_by)
  VALUES (
    v_contrato_id, 1,
    jsonb_build_object(
      'modalidade', v_sessao.modalidade,
      'valor_mensal', v_valor_mensal,
      'data_inicio', p_data_inicio,
      'data_fim', v_data_fim,
      'duracao_meses', p_duracao_meses,
      'total_telas', v_total_telas,
      'forma_pagamento', p_forma_pagamento,
      'estabelecimentos', v_preco->'itens',
      'origem', 'ONBOARDING_SELF_SERVICE'
    ),
    'Contrato inicial gerado via onboarding self-service (período mínimo de 3 meses)',
    auth.uid()
  );

  -- Sessão convertida
  UPDATE public.onboarding_sessoes
  SET status = 'CONVERTIDO',
      step = 'CONTRATO_CRIADO',
      dados = v_sessao.dados || jsonb_build_object('contrato_id', v_contrato_id),
      updated_at = NOW()
  WHERE id = p_sessao_id;

  -- Notificação ao cliente
  INSERT INTO public.portal_notificacoes (empresa_operadora_id, cliente_id, titulo, mensagem, tipo, prioridade)
  VALUES (
    v_tenant, v_cliente_id,
    'Contrato gerado pelo onboarding',
    'Seu contrato ' || v_numero || ' foi gerado e aguarda assinatura. Período: ' ||
    to_char(p_data_inicio, 'DD/MM/YYYY') || ' a ' || to_char(v_data_fim, 'DD/MM/YYYY') || '.',
    'CONTRATO', 'ALTA'
  );

  RETURN jsonb_build_object(
    'success', true,
    'contrato_id', v_contrato_id,
    'numero_contrato', v_numero,
    'valor_mensal', v_valor_mensal,
    'data_inicio', p_data_inicio,
    'data_fim', v_data_fim,
    'cliente_id', v_cliente_id,
    'empresa_id', v_empresa_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_contrato_onboarding(uuid, uuid[], int, text, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.criar_contrato_onboarding(uuid, uuid[], int, text, date) FROM anon;

-- ----------------------------------------------------------------------
-- 14. RPC: SOLICITAR_EXPANSAO
-- Cliente solicita adicionar estabelecimentos: o sistema identifica os
-- pontos, calcula o impacto financeiro com o preço oficial da plataforma
-- e registra a solicitação para aprovação. Nunca altera valores sozinho.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.solicitar_expansao(
  p_contrato_id uuid,
  p_unidade_ids uuid[],
  p_justificativa text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contrato public.contratos%ROWTYPE;
  v_cliente uuid := public.get_user_cliente_id();
  v_tenant uuid := public.get_user_empresa_operadora_id(auth.uid());
  v_preco jsonb;
  v_expansao_id uuid;
  v_item record;
BEGIN
  SELECT * INTO v_contrato FROM public.contratos WHERE id = p_contrato_id;
  IF v_contrato.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contrato não encontrado.');
  END IF;

  IF v_cliente IS NULL OR v_contrato.cliente_id <> v_cliente THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: contrato não pertence ao cliente logado.');
  END IF;

  IF v_contrato.status_workflow NOT IN ('EM_PRODUCAO','CAMPANHA_APROVADA','CAMPANHA_ATIVA') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expansão disponível apenas para contratos ativos.');
  END IF;

  -- Remove unidades já contratadas
  SELECT array_agg(u) INTO p_unidade_ids FROM unnest(p_unidade_ids) u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contrato_estabelecimentos ce
    WHERE ce.contrato_id = p_contrato_id AND ce.unidade_id = u
  );

  IF p_unidade_ids IS NULL OR array_length(p_unidade_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Todos os estabelecimentos selecionados já fazem parte do contrato.');
  END IF;

  -- Impacto financeiro calculado pela plataforma
  v_preco := public.calcular_preco_onboarding(p_unidade_ids, 1);
  IF NOT (v_preco->>'success')::boolean THEN
    RETURN v_preco;
  END IF;

  INSERT INTO public.expansoes (
    empresa_operadora_id, contrato_id, solicitado_por, status,
    valor_contrato_atual, valor_novo_contrato, justificativa
  )
  VALUES (
    v_contrato.empresa_operadora_id, p_contrato_id, auth.uid(), 'SOLICITADA',
    v_contrato.valor_mensal, v_contrato.valor_mensal + (v_preco->>'valor_mensal')::numeric,
    p_justificativa
  )
  RETURNING id INTO v_expansao_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(v_preco->'itens') AS x(
    unidade_id uuid, nome text, cidade text, estado text,
    quantidade_telas bigint, valor_unitario numeric, valor_total numeric
  )
  LOOP
    INSERT INTO public.expansao_itens (expansao_id, unidade_id, quantidade_telas, valor_unitario, valor_total)
    VALUES (v_expansao_id, v_item.unidade_id, v_item.quantidade_telas, v_item.valor_unitario, v_item.valor_total);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'expansao_id', v_expansao_id,
    'valor_contrato_atual', v_contrato.valor_mensal,
    'valor_adicional_mensal', v_preco->>'valor_mensal',
    'valor_novo_contrato', v_contrato.valor_mensal + (v_preco->>'valor_mensal')::numeric,
    'total_telas_adicionais', v_preco->>'total_telas',
    'itens', v_preco->'itens'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.solicitar_expansao(uuid, uuid[], text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.solicitar_expansao(uuid, uuid[], text) FROM anon;

-- ----------------------------------------------------------------------
-- 15. RPC: APROVAR_EXPANSAO
-- Somente papéis internos autorizados. Aprovação gera: estabelecimentos no
-- contrato (contrato_estabelecimentos), itens_contrato (cobrança adicional),
-- aditivo imutável (contrato_versoes), atualização do valor no contrato e
-- notificação ao cliente. O ERP é o system of record.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aprovar_expansao(p_expansao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exp public.expansoes%ROWTYPE;
  v_tenant uuid := public.get_user_empresa_operadora_id(auth.uid());
  v_role text := public.get_user_role();
  v_servico_id uuid;
  v_versao int;
  v_item record;
  v_contrato public.contratos%ROWTYPE;
  v_numero_versao int;
BEGIN
  SELECT * INTO v_exp FROM public.expansoes WHERE id = p_expansao_id;
  IF v_exp.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação de expansão não encontrada.');
  END IF;

  IF v_tenant <> v_exp.empresa_operadora_id
     OR v_role NOT IN ('OWNER','ADMIN','GESTOR','GERENTE','SUPERVISOR','FINANCEIRO','OPERACIONAL','FUNCIONARIO','DESIGNER','MARKETING') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: apenas usuários internos autorizados podem aprovar expansões.');
  END IF;

  IF v_exp.status <> 'SOLICITADA' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expansão já foi ' || lower(v_exp.status) || '.');
  END IF;

  SELECT * INTO v_contrato FROM public.contratos WHERE id = v_exp.contrato_id;
  IF v_contrato.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contrato não encontrado.');
  END IF;

  SELECT id INTO v_servico_id FROM public.catalogo_servicos
  WHERE empresa_operadora_id = v_tenant AND codigo_servico = 'PONTO_MIDIA' LIMIT 1;

  -- 1. Estabelecimentos adicionados ao contrato + itens (cobrança adicional)
  FOR v_item IN
    SELECT ei.unidade_id, ei.quantidade_telas, ei.valor_unitario, ei.valor_total
    FROM public.expansao_itens ei
    WHERE ei.expansao_id = p_expansao_id
  LOOP
    INSERT INTO public.contrato_estabelecimentos (contrato_id, unidade_id, quantidade_telas, valor_unitario, created_by)
    VALUES (v_exp.contrato_id, v_item.unidade_id, v_item.quantidade_telas, v_item.valor_unitario, auth.uid())
    ON CONFLICT (contrato_id, unidade_id) DO UPDATE
      SET quantidade_telas = EXCLUDED.quantidade_telas, valor_unitario = EXCLUDED.valor_unitario;

    INSERT INTO public.itens_contrato (contrato_id, servico_id, quantidade, valor_unitario, desconto, valor_total)
    VALUES (v_exp.contrato_id, v_servico_id, v_item.quantidade_telas, v_item.valor_unitario, 0, v_item.valor_total);
  END LOOP;

  -- 2. Novo valor do contrato (aprovado pela operadora)
  UPDATE public.contratos
  SET valor_mensal = v_exp.valor_novo_contrato, updated_at = NOW(), updated_by = auth.uid()
  WHERE id = v_exp.contrato_id;

  -- 3. Aditivo imutável (snapshot)
  SELECT COALESCE(MAX(numero_versao), 0) + 1 INTO v_numero_versao
  FROM public.contrato_versoes WHERE contrato_id = v_exp.contrato_id;

  INSERT INTO public.contrato_versoes (contrato_id, numero_versao, snapshot_dados, motivo_alteracao, created_by)
  VALUES (
    v_exp.contrato_id, v_numero_versao,
    jsonb_build_object(
      'tipo', 'ADITIVO_EXPANSAO',
      'expansao_id', p_expansao_id,
      'valor_anterior', v_exp.valor_contrato_atual,
      'valor_novo', v_exp.valor_novo_contrato,
      'justificativa', v_exp.justificativa,
      'aprovado_por', auth.uid(),
      'aprovado_em', NOW()
    ),
    'Aditivo por expansão de estabelecimentos (aprovação interna)',
    auth.uid()
  );

  -- 4. Status + trilha de decisão
  UPDATE public.expansoes
  SET status = 'APROVADA', aprovado_por = auth.uid(), aprovado_em = NOW(), updated_at = NOW()
  WHERE id = p_expansao_id;

  -- 5. Notificação ao cliente
  INSERT INTO public.portal_notificacoes (empresa_operadora_id, cliente_id, titulo, mensagem, tipo, prioridade)
  VALUES (
    v_contrato.empresa_operadora_id, v_contrato.cliente_id,
    'Expansão aprovada',
    'Sua solicitação de expansão foi APROVADA. Novo valor mensal do contrato ' ||
    v_contrato.numero_contrato || ': R$ ' || to_char(v_exp.valor_novo_contrato, 'FM999G999G999D90') || '.',
    'EXPANSAO', 'ALTA'
  );

  RETURN jsonb_build_object(
    'success', true,
    'expansao_id', p_expansao_id,
    'valor_anterior', v_exp.valor_contrato_atual,
    'valor_novo', v_exp.valor_novo_contrato,
    'numero_versao', v_numero_versao
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aprovar_expansao(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.aprovar_expansao(uuid) FROM anon;

-- ----------------------------------------------------------------------
-- 16. RPC: REJEITAR_EXPANSAO
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rejeitar_expansao(p_expansao_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exp public.expansoes%ROWTYPE;
  v_tenant uuid := public.get_user_empresa_operadora_id(auth.uid());
  v_role text := public.get_user_role();
BEGIN
  SELECT * INTO v_exp FROM public.expansoes WHERE id = p_expansao_id;
  IF v_exp.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação de expansão não encontrada.');
  END IF;

  IF v_tenant <> v_exp.empresa_operadora_id
     OR v_role NOT IN ('OWNER','ADMIN','GESTOR','GERENTE','SUPERVISOR','FINANCEIRO','OPERACIONAL','FUNCIONARIO','DESIGNER','MARKETING') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: apenas usuários internos autorizados podem rejeitar expansões.');
  END IF;

  IF v_exp.status <> 'SOLICITADA' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expansão já foi ' || lower(v_exp.status) || '.');
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Motivo da rejeição é obrigatório (mínimo 3 caracteres).');
  END IF;

  UPDATE public.expansoes
  SET status = 'REJEITADA', motivo_rejeicao = p_motivo, updated_at = NOW()
  WHERE id = p_expansao_id;

  RETURN jsonb_build_object('success', true, 'expansao_id', p_expansao_id, 'status', 'REJEITADA');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rejeitar_expansao(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rejeitar_expansao(uuid, text) FROM anon;