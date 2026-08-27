-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20261107: BILLING AUTOMATION ENGINE
-- RPC Idempotente para geração em massa de cobranças (Mensalidades).
-- ======================================================================

CREATE OR REPLACE FUNCTION public.rpc_generate_monthly_billing(
  p_competencia VARCHAR(7) -- Formato 'YYYY-MM'
)
RETURNS TABLE (
  total_processados INT,
  total_gerados INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_processados INT := 0;
  v_gerados INT := 0;
  v_contrato RECORD;
  v_vencimento DATE;
BEGIN
  -- Definir data de vencimento padrão (dia 10 do mês seguinte à competência)
  -- Para '2026-11', vencimento seria 10/12/2026.
  -- Pode ser parametrizado futuramente conforme regras de faturamento do cliente.
  v_vencimento := (TO_DATE(p_competencia || '-01', 'YYYY-MM-DD') + INTERVAL '1 month' + INTERVAL '9 days')::DATE;

  FOR v_contrato IN
    SELECT 
      c.id AS contrato_id,
      c.empresa_operadora_id,
      c.cliente_id,
      c.valor_mensal
    FROM public.contratos c
    WHERE c.status_workflow IN ('CAMPANHA_ATIVA', 'EM_PRODUCAO', 'AGUARDANDO_PAGAMENTO', 'PAGAMENTO_CONFIRMADO')
      AND c.valor_mensal > 0
      AND c.deleted_at IS NULL
  LOOP
    v_processados := v_processados + 1;

    -- Tentar inserir usando a constraint de idempotência (empresa_operadora_id, contrato_id, competencia)
    BEGIN
      INSERT INTO public.contas_receber (
        empresa_operadora_id,
        contrato_id,
        cliente_id,
        numero_documento,
        competencia,
        vencimento,
        valor_original,
        status,
        public_enabled
      ) VALUES (
        v_contrato.empresa_operadora_id,
        v_contrato.contrato_id,
        v_contrato.cliente_id,
        public.fn_gerar_numero_recebivel_atomo(v_contrato.empresa_operadora_id),
        p_competencia,
        v_vencimento,
        v_contrato.valor_mensal,
        'PENDENTE',
        TRUE
      );
      
      v_gerados := v_gerados + 1;
    EXCEPTION
      WHEN unique_violation THEN
        -- Já existe cobrança para este contrato nesta competência, ignorar silenciosamente
        NULL;
    END;
  END LOOP;

  RETURN QUERY SELECT v_processados, v_gerados;
END;
$$;
