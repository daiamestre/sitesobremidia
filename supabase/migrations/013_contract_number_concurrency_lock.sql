-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 013: ADVISORY LOCK & SERIALIZAÇÃO DE NUMERO_CONTRATO (FASE 7.4-B)
-- ======================================================================

-- Função atômica com pg_advisory_xact_lock por tenant para geração de numero_contrato
CREATE OR REPLACE FUNCTION public.fn_gerar_numero_contrato_atomo(
  p_empresa_operadora_id UUID
)
RETURNS VARCHAR(40)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock_key BIGINT;
  v_last_num INT;
  v_next_num INT;
  v_year VARCHAR(4);
  v_numero_contrato VARCHAR(40);
BEGIN
  -- 1. Garante trava de concorrência exclusiva do tenant (Transaction Advisory Lock)
  v_lock_key := hashtext('contrato_code_' || p_empresa_operadora_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_year := TO_CHAR(NOW(), 'YYYY');

  -- 2. Busca último número comercial do ano sob advisory lock do tenant
  SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(numero_contrato, '\D', '', 'g') AS INT)), 0)
  INTO v_last_num
  FROM public.contratos
  WHERE empresa_operadora_id = p_empresa_operadora_id;

  v_next_num := v_last_num + 1;
  v_numero_contrato := 'CTR-' || v_year || '-' || LPAD(v_next_num::text, 4, '0');

  RETURN v_numero_contrato;
END;
$$;
