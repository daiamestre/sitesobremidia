-- Migration MICRO-GATE P0.3.7: Enforce Single Official Default Contract Template
-- Date: 2026-12-27
-- Purpose: Unify default templates across all contract types (ANUNCIANTE, GESTOR, PARCEIRO) to reference official rich templates exclusively.

BEGIN;

-- 1. Reset all templates to not default
UPDATE public.contrato_templates
SET is_default = false;

-- 2. Mark canonical official rich templates as default and active
UPDATE public.contrato_templates
SET is_default = true, ativo = true
WHERE id IN (
  'bf42418d-9988-4bfd-beec-ecac2210b791', -- ANUNCIANTE (v2, 14,227 bytes)
  '585a076c-3485-4bed-b892-374788e6d7a2', -- PARCEIRO (v1, 12,513 bytes)
  'd9b01aa9-abaa-40ae-86f4-08636d2c0dbe'  -- GESTOR (v2, 6,241 bytes)
);

COMMIT;
