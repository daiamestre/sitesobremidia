-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261228
-- MICRO-GATE P0.3.9: SINGLE SOURCE OF TRUTH — CONTRATO OFICIAL ÚNICO
-- ======================================================================
-- CAUSA RAIZ IDENTIFICADA:
--   1. Template ANUNCIANTE canônico bf42418d tinha empresa_operadora_id = '22345678-...'
--      (UUID fake) em vez de NULL. A RPC buscava IS NULL para global e nunca o encontrava.
--   2. Templates GESTOR e PARCEIRO tinham UUIDs específicos de tenant e stubs legados
--      ainda estavam marcados como ativo = true.
--   3. RPC fn_obter_template_padrao não tinha fallback limpo quando tenant não tem override.
--   4. Contratos em RASCUNHO/GERADO apontavam para stubs desatualizados.
--
-- ESTA MIGRATION:
--   1. Define os 3 templates CANÔNICOS como GLOBAIS (empresa_operadora_id = NULL),
--      is_default = true e ativo = true:
--        - ANUNCIANTE: bf42418d-9988-4bfd-beec-ecac2210b791 (v2, 14.227 chars)
--        - GESTOR:     d9b01aa9-abaa-40ae-86f4-08636d2c0dbe (v2, 6.241 chars)
--        - PARCEIRO:   585a076c-3485-4bed-b892-374788e6d7a2 (v1, 12.513 chars)
--   2. Desativa TODOS os templates paralelos, stubs e duplicatas (is_default = false, ativo = false)
--   3. Atualiza contratos em RASCUNHO / GERADO vinculados a stubs ou null para os canônicos
--   4. Atualiza RPC fn_obter_template_padrao para retornar sempre o canônico oficial
--   5. Adiciona coluna metodo à tabela assinaturas (se ausente)
--   6. Recria índices de unicidade de default global
-- ======================================================================

BEGIN;

-- Desabilitar triggers temporariamente para permitir atualização segura do empresa_operadora_id
SET session_replication_role = replica;

-- ======================================================================
-- PASSO 1: Configurar os 3 Templates Canônicos como Globais Oficiais
-- ======================================================================

-- 1.1 ANUNCIANTE Canônico (14.227 chars)
UPDATE public.contrato_templates
SET empresa_operadora_id = NULL,
    is_default = true,
    ativo = true
WHERE id = 'bf42418d-9988-4bfd-beec-ecac2210b791';

-- 1.2 GESTOR Canônico (6.241 chars)
UPDATE public.contrato_templates
SET empresa_operadora_id = NULL,
    is_default = true,
    ativo = true
WHERE id = 'd9b01aa9-abaa-40ae-86f4-08636d2c0dbe';

-- 1.3 PARCEIRO Canônico (12.513 chars)
UPDATE public.contrato_templates
SET empresa_operadora_id = NULL,
    is_default = true,
    ativo = true
WHERE id = '585a076c-3485-4bed-b892-374788e6d7a2';

-- ======================================================================
-- PASSO 2: Desativar TODOS os templates paralelos / stubs / duplicatas
-- Preservamos registros para integridade referencial histórica de contratos antigos
-- ======================================================================

-- Desativar todos os templates de ANUNCIANTE que não sejam o canônico bf42418d
UPDATE public.contrato_templates
SET is_default = false,
    ativo = false
WHERE tipo_contrato = 'ANUNCIANTE'
  AND id != 'bf42418d-9988-4bfd-beec-ecac2210b791';

-- Desativar todos os templates de GESTOR que não sejam o canônico d9b01aa9
UPDATE public.contrato_templates
SET is_default = false,
    ativo = false
WHERE tipo_contrato = 'GESTOR'
  AND id != 'd9b01aa9-abaa-40ae-86f4-08636d2c0dbe';

-- Desativar todos os templates de PARCEIRO que não sejam o canônico 585a076c
UPDATE public.contrato_templates
SET is_default = false,
    ativo = false
WHERE tipo_contrato = 'PARCEIRO'
  AND id != '585a076c-3485-4bed-b892-374788e6d7a2';

-- Reabilitar triggers normais
SET session_replication_role = DEFAULT;

-- ======================================================================
-- PASSO 3: Atualizar contratos em RASCUNHO / GERADO para os templates canônicos
-- (Contratos ASSINADOS mantêm seu vínculo original para auditoria)
-- ======================================================================

-- 3.1 ANUNCIANTE
UPDATE public.contratos
SET template_id = 'bf42418d-9988-4bfd-beec-ecac2210b791',
    updated_at = NOW()
WHERE (tipo_contrato = 'ANUNCIANTE' OR tipo_contrato IS NULL)
  AND (template_id IS NULL OR template_id != 'bf42418d-9988-4bfd-beec-ecac2210b791')
  AND status_documento IN ('RASCUNHO', 'GERADO')
  AND deleted_at IS NULL;

-- 3.2 GESTOR
UPDATE public.contratos
SET template_id = 'd9b01aa9-abaa-40ae-86f4-08636d2c0dbe',
    updated_at = NOW()
WHERE tipo_contrato IN ('GESTOR', 'GESTOR_MIDIA', 'GESTOR_MIDIAS')
  AND (template_id IS NULL OR template_id != 'd9b01aa9-abaa-40ae-86f4-08636d2c0dbe')
  AND status_documento IN ('RASCUNHO', 'GERADO')
  AND deleted_at IS NULL;

-- 3.3 PARCEIRO
UPDATE public.contratos
SET template_id = '585a076c-3485-4bed-b892-374788e6d7a2',
    updated_at = NOW()
WHERE tipo_contrato IN ('PARCEIRO', 'PONTO_PARCEIRO')
  AND (template_id IS NULL OR template_id != '585a076c-3485-4bed-b892-374788e6d7a2')
  AND status_documento IN ('RASCUNHO', 'GERADO')
  AND deleted_at IS NULL;

-- ======================================================================
-- PASSO 4: Recriar RPC fn_obter_template_padrao com robustez total
-- ======================================================================

CREATE OR REPLACE FUNCTION public.fn_obter_template_padrao(
  p_empresa_operadora_id UUID,
  p_tipo_contrato TEXT
)
RETURNS TABLE (
  id UUID,
  codigo_template VARCHAR,
  nome VARCHAR,
  versao INT,
  conteudo_html TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1º: Busca default do tenant específico (apenas quando p_empresa_operadora_id IS NOT NULL)
  IF p_empresa_operadora_id IS NOT NULL THEN
    RETURN QUERY
    SELECT t.id, t.codigo_template, t.nome, t.versao, t.conteudo_html
    FROM public.contrato_templates t
    WHERE t.tipo_contrato = p_tipo_contrato
      AND t.ativo = true
      AND t.is_default = true
      AND t.empresa_operadora_id = p_empresa_operadora_id
    ORDER BY t.versao DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- 2º: Busca default global (empresa_operadora_id IS NULL)
  -- Funciona para p_empresa_operadora_id = NULL e como fallback global
  RETURN QUERY
  SELECT t.id, t.codigo_template, t.nome, t.versao, t.conteudo_html
  FROM public.contrato_templates t
  WHERE t.tipo_contrato = p_tipo_contrato
    AND t.ativo = true
    AND t.is_default = true
    AND t.empresa_operadora_id IS NULL
  ORDER BY t.versao DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- 3º: Fallback de segurança para qualquer template ativo do tipo (ordenado por versão)
  RETURN QUERY
  SELECT t.id, t.codigo_template, t.nome, t.versao, t.conteudo_html
  FROM public.contrato_templates t
  WHERE t.tipo_contrato = p_tipo_contrato
    AND t.ativo = true
  ORDER BY t.is_default DESC, t.versao DESC
  LIMIT 1;

  RETURN;
END;
$$;

-- ======================================================================
-- PASSO 5: Adicionar coluna metodo e dados_assinatura à tabela assinaturas
-- ======================================================================

ALTER TABLE public.assinaturas
ADD COLUMN IF NOT EXISTS metodo VARCHAR(20) DEFAULT 'DRAWN';

ALTER TABLE public.assinaturas
ADD COLUMN IF NOT EXISTS dados_assinatura JSONB;

-- ======================================================================
-- PASSO 6: Garantir integridade dos índices de unicidade de default
-- ======================================================================

DROP INDEX IF EXISTS idx_contrato_templates_default_global;
CREATE UNIQUE INDEX idx_contrato_templates_default_global
ON public.contrato_templates (tipo_contrato)
WHERE (empresa_operadora_id IS NULL AND is_default = true AND ativo = true);

COMMIT;
