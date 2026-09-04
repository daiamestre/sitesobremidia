-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261209 (GATE 1A)
-- FUNDAÇÃO DE BANCO DE DADOS: MODELO COMERCIAL + CONTRATUAL
-- ======================================================================
-- 1. Matriz de Preços por Ponto (public.ponto_precos)
-- 2. Periodicidade BIMESTRAL em pontos
-- 3. Composição Comercial Enriquecida (public.contrato_estabelecimentos)
-- 4. Contrato do Gestor (tipo_contrato GESTOR + gestor_usuario_id)
-- 5. Template Oficial de Gestor (TPL-GESTOR-OFICIAL)
-- 6. Backfill Estrito e Idempotente a partir de dados existentes
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. PERIODICIDADE EM PONTOS (Adicionar BIMESTRAL de forma segura)
-- ----------------------------------------------------------------------
DO $$
DECLARE
    v_conname TEXT;
BEGIN
    SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.pontos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%periodicidade%';
    
    IF v_conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.pontos DROP CONSTRAINT %I', v_conname);
    END IF;

    ALTER TABLE public.pontos
        ADD CONSTRAINT pontos_periodicidade_check
        CHECK (periodicidade IN ('MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'UNICO'));
END $$;

-- ----------------------------------------------------------------------
-- 2. TABELA CANÔNICA DE MATRIZ DE PREÇOS (public.ponto_precos)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_precos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
    ponto_id UUID NOT NULL REFERENCES public.pontos(id) ON DELETE CASCADE,
    periodicidade VARCHAR(30) NOT NULL CHECK (periodicidade IN ('MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL')),
    preco NUMERIC(12,2) NOT NULL CHECK (preco >= 0),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    vigencia_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    vigencia_fim DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.usuarios(id) ON DELETE SET NULL
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_ponto_precos_tenant ON public.ponto_precos(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_ponto_precos_ponto ON public.ponto_precos(ponto_id);
CREATE INDEX IF NOT EXISTS idx_ponto_precos_periodicidade ON public.ponto_precos(periodicidade);

-- Unicidade estrita: no máximo 1 preço ativo por periodicidade por ponto
CREATE UNIQUE INDEX IF NOT EXISTS uq_ponto_precos_ativo 
ON public.ponto_precos (ponto_id, periodicidade) 
WHERE ativo = TRUE;

-- Trigger updated_at
DO $$ BEGIN
    CREATE TRIGGER trg_ponto_precos_updated_at
    BEFORE UPDATE ON public.ponto_precos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS Multi-Tenant para ponto_precos
ALTER TABLE public.ponto_precos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ponto_precos' AND policyname='policy_select_ponto_precos') THEN
        CREATE POLICY "policy_select_ponto_precos" ON public.ponto_precos
            FOR SELECT USING (
                empresa_operadora_id = public.get_user_tenant_id()
                OR public.is_central_privileged()
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ponto_precos' AND policyname='policy_insert_ponto_precos') THEN
        CREATE POLICY "policy_insert_ponto_precos" ON public.ponto_precos
            FOR INSERT WITH CHECK (
                empresa_operadora_id = public.get_user_tenant_id()
                AND public.is_central_privileged()
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ponto_precos' AND policyname='policy_update_ponto_precos') THEN
        CREATE POLICY "policy_update_ponto_precos" ON public.ponto_precos
            FOR UPDATE USING (
                empresa_operadora_id = public.get_user_tenant_id()
                AND public.is_central_privileged()
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ponto_precos' AND policyname='policy_delete_ponto_precos') THEN
        CREATE POLICY "policy_delete_ponto_precos" ON public.ponto_precos
            FOR DELETE USING (
                empresa_operadora_id = public.get_user_tenant_id()
                AND public.is_central_privileged()
            );
    END IF;
END $$;

-- ----------------------------------------------------------------------
-- 3. COMPOSIÇÃO COMERCIAL ENRIQUECIDA (public.contrato_estabelecimentos)
-- ----------------------------------------------------------------------
ALTER TABLE public.contrato_estabelecimentos
    ADD COLUMN IF NOT EXISTS ponto_id UUID REFERENCES public.pontos(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS periodicidade VARCHAR(30) DEFAULT 'MENSAL',
    ADD COLUMN IF NOT EXISTS valor_tabela NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS desconto NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS observacoes TEXT;

DO $$
DECLARE
    v_conname TEXT;
BEGIN
    SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.contrato_estabelecimentos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%periodicidade%';
    
    IF v_conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.contrato_estabelecimentos DROP CONSTRAINT %I', v_conname);
    END IF;

    ALTER TABLE public.contrato_estabelecimentos
        ADD CONSTRAINT contrato_estabelecimentos_periodicidade_check
        CHECK (periodicidade IS NULL OR periodicidade IN ('MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'));
END $$;

CREATE INDEX IF NOT EXISTS idx_contrato_estabelecimentos_ponto ON public.contrato_estabelecimentos(ponto_id);

-- ----------------------------------------------------------------------
-- 4. CONTRATOS: SUPORTE AO TIPO GESTOR & VÍNCULO DE USUÁRIO
-- ----------------------------------------------------------------------
-- Ampliação de tipo_contrato em contrato_templates
DO $$
DECLARE
    v_conname TEXT;
BEGIN
    SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.contrato_templates'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%tipo_contrato%';
    
    IF v_conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.contrato_templates DROP CONSTRAINT %I', v_conname);
    END IF;

    ALTER TABLE public.contrato_templates
        ADD CONSTRAINT contrato_templates_tipo_contrato_check
        CHECK (tipo_contrato IN ('ANUNCIANTE', 'PARCEIRO', 'GESTOR'));
END $$;

-- Ampliação de tipo_contrato em contratos
DO $$
DECLARE
    v_conname TEXT;
BEGIN
    SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.contratos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%tipo_contrato%';
    
    IF v_conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.contratos DROP CONSTRAINT %I', v_conname);
    END IF;

    ALTER TABLE public.contratos
        ADD CONSTRAINT contratos_tipo_contrato_check
        CHECK (tipo_contrato IN ('ANUNCIANTE', 'PARCEIRO', 'GESTOR'));
END $$;

-- Coluna gestor_usuario_id em contratos
ALTER TABLE public.contratos
    ADD COLUMN IF NOT EXISTS gestor_usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contratos_gestor_usuario ON public.contratos(gestor_usuario_id);

-- Atualização da regra de vínculo obrigatório de contratos
DO $$
BEGIN
    ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS contratos_vinculo_check;
    ALTER TABLE public.contratos ADD CONSTRAINT contratos_vinculo_check
        CHECK (cliente_id IS NOT NULL OR ponto_id IS NOT NULL OR proposta_id IS NOT NULL OR gestor_usuario_id IS NOT NULL OR tipo_contrato = 'GESTOR');
END $$;

-- ----------------------------------------------------------------------
-- 5. TEMPLATE OFICIAL DO GESTOR (TPL-GESTOR-OFICIAL)
-- ----------------------------------------------------------------------
INSERT INTO public.contrato_templates (id, empresa_operadora_id, tipo_contrato, codigo_template, nome, descricao, versao, conteudo_html, ativo)
SELECT 
    gen_random_uuid(), 
    eo.id, 
    'GESTOR', 
    'TPL-GESTOR-OFICIAL', 
    'Contrato de Gestão Operacional de Displays e Signage — Oficial', 
    'Instrumento contratual para operadores e gestores de rede de telas da SOBRE MÍDIA.', 
    1,
    '<h2>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE GESTÃO OPERACIONAL DE DISPLAYS</h2><p>Pelo presente instrumento particular, de um lado <strong>SOBRE MÍDIA PLATAFORMA DIGITAL</strong> e de outro lado o GESTOR OPERACIONAL <strong>{{NOME_GESTOR}}</strong>, portador do CPF/CNPJ sob o nº <strong>{{CPF_CNPJ}}</strong>, residente/estabelecido em {{CIDADE}}/{{ESTADO}}.</p><h3>1. DO OBJETO</h3><p>O presente contrato tem por objeto a prestação de serviços de gestão técnica, monitoramento operacional e operação de displays digitais e painéis conectados à plataforma SOBRE MÍDIA.</p><h3>2. DAS OBRIGAÇÕES DO GESTOR</h3><p>O GESTOR compromete-se a zelar pelo bom funcionamento dos equipamentos sob sua gestão, monitorar a conectividade dos dispositivos e seguir as diretrizes operacionais e de veiculação da plataforma.</p><h3>3. DAS VEDAÇÕES</h3><p>É terminantemente proibida a veiculação de conteúdos não autorizados, a alteração não homologada de hardwares ou o desvio de finalidade dos displays.</p><h3>4. DA VIGÊNCIA E RESCISÃO</h3><p>O presente instrumento vigorará de {{DATA_INICIO}} a {{DATA_FIM}}, podendo ser rescindido por descumprimento das normas operacionais.</p><p>Local: {{LOCAL_ASSINATURA}}, Data: {{DATA_ASSINATURA}}</p>', 
    TRUE
FROM public.empresa_operadora eo
WHERE NOT EXISTS (
    SELECT 1 FROM public.contrato_templates ct 
    WHERE ct.empresa_operadora_id = eo.id AND ct.codigo_template = 'TPL-GESTOR-OFICIAL'
);

-- ----------------------------------------------------------------------
-- 6. BACKFILL ESTRITO E IDEMPOTENTE
-- ----------------------------------------------------------------------
-- Cria 1 preço ativo para pontos existentes com valor_anuncio válido (> 0) e periodicidade compatível
INSERT INTO public.ponto_precos (
    empresa_operadora_id,
    ponto_id,
    periodicidade,
    preco,
    ativo,
    vigencia_inicio
)
SELECT 
    po.empresa_operadora_id,
    po.id,
    po.periodicidade,
    po.valor_anuncio,
    TRUE,
    CURRENT_DATE
FROM public.pontos po
WHERE po.valor_anuncio IS NOT NULL 
  AND po.valor_anuncio > 0
  AND po.periodicidade IN ('MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL')
  AND NOT EXISTS (
      SELECT 1 FROM public.ponto_precos pp
      WHERE pp.ponto_id = po.id 
        AND pp.periodicidade = po.periodicidade 
        AND pp.ativo = TRUE
  );

SELECT 'Migration 20261209 GATE 1A Foundation completed successfully' AS status;
