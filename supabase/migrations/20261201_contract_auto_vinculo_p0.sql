-- ======================================================================
-- P0 — VÍNCULO AUTOMÁTICO DE CONTRATOS (ANUNCIANTE / PONTO PARCEIRO / GESTOR)
-- Preservação total: PIX/BOLETO/RLS/Owner/Player não tocados
-- ======================================================================

-- 1. Vincular contrato a ponto parceiro (opcional), tornar cliente_id nullable para PARCEIRO puro
--    Contratos ANUNCIANTE continuam exigindo cliente_id; PARCEIRO pode usar ponto_id
ALTER TABLE public.contratos ADD COLUMN IF NOT EXISTS ponto_id UUID REFERENCES public.pontos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contratos_ponto ON public.contratos(ponto_id);

-- Tornar cliente_id nullable (necessário para ponto puro sem cliente) — preserva dados existentes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='contratos' AND column_name='cliente_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.contratos ALTER COLUMN cliente_id DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='contratos' AND column_name='empresa_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.contratos ALTER COLUMN empresa_id DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='contratos' AND column_name='representante_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.contratos ALTER COLUMN representante_id DROP NOT NULL;
  END IF;
END $$;

-- Constraint: ao menos um vínculo (cliente ou ponto) ou proposta legada
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contratos_vinculo_check') THEN
    ALTER TABLE public.contratos ADD CONSTRAINT contratos_vinculo_check
      CHECK (cliente_id IS NOT NULL OR ponto_id IS NOT NULL OR proposta_id IS NOT NULL);
  END IF;
END $$;

-- 2. Garantir templates oficiais existem (ANUNCIANTE/PARCEIRO) — upsert idempotente
INSERT INTO public.contrato_templates (id, empresa_operadora_id, tipo_contrato, codigo_template, nome, descricao, versao, conteudo_html, ativo)
SELECT gen_random_uuid(), eo.id, 'ANUNCIANTE', 'TPL-ANUNCIANTE-OFICIAL', 'Contrato de Anunciante — Oficial', 'PDF oficial: CONTRATO SOBRE MIDIA ANUNCIANTE EXCLUSIVO', 1,
       '<p>Template oficial ANUNCIANTE — conteúdo em public/official-contracts/contrato-anunciante.pdf (preservado)</p>', true
FROM public.empresa_operadora eo
ON CONFLICT DO NOTHING;

INSERT INTO public.contrato_templates (id, empresa_operadora_id, tipo_contrato, codigo_template, nome, descricao, versao, conteudo_html, ativo)
SELECT gen_random_uuid(), eo.id, 'PARCEIRO', 'TPL-PARCEIRO-OFICIAL', 'Contrato de Parceria — Oficial', 'PDF oficial: CONTRATO DE PARCERIA DE MIDIA CORPORATIVA', 1,
       '<p>Template oficial PARCEIRO — conteúdo em public/official-contracts/contrato-parceria.pdf (preservado)</p>', true
FROM public.empresa_operadora eo
ON CONFLICT DO NOTHING;

-- Evitar duplicação por (empresa_operadora_id, codigo_template)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contrato_templates_codigo_unique') THEN
    -- índice único já existe em algumas instalações; criar se ausente
    CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_templates_codigo ON public.contrato_templates(empresa_operadora_id, codigo_template);
  END IF;
END $$;

SELECT 'Migration 20261201 P0 auto-vinculo completed' AS status;
