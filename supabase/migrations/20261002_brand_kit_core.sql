-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20261002: BRAND KIT CORE
-- Adiciona campos de identidade visual modular (Brand Kit) na tabela clientes
-- ======================================================================

ALTER TABLE public.clientes 
ADD COLUMN IF NOT EXISTS brand_logo_url TEXT,
ADD COLUMN IF NOT EXISTS brand_cor_primaria VARCHAR(7) DEFAULT '#000000',
ADD COLUMN IF NOT EXISTS brand_cor_secundaria VARCHAR(7) DEFAULT '#FFFFFF',
ADD COLUMN IF NOT EXISTS brand_fonte_primaria VARCHAR(100) DEFAULT 'Inter',
ADD COLUMN IF NOT EXISTS brand_fonte_secundaria VARCHAR(100) DEFAULT 'Inter';

-- Como o RLS já isola clientes pelo `empresa_operadora_id`, 
-- não é necessário criar ou modificar RLS Policies específicas para as colunas.
-- Os comandos UPDATE tradicionais da aplicação já vão autorizar a escrita no próprio tenant.
