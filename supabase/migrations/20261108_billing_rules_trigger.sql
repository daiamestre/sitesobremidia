-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20261108: BILLING RULES TRIGGER
-- Integração entre financeiro e operacional (Suspensão/Reativação)
-- ======================================================================

-- 1. Adicionar o status SUSPENSO_FINANCEIRO no check de contratos
ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS contratos_status_workflow_check;
ALTER TABLE public.contratos ADD CONSTRAINT contratos_status_workflow_check CHECK (
  status_workflow IN (
    'PROSPECT', 'PROPOSTA_GERADA', 'AGUARDANDO_ASSINATURA', 'AGUARDANDO_PAGAMENTO', 
    'PAGAMENTO_CONFIRMADO', 'EM_PRODUCAO', 'AGUARDANDO_APROVACAO', 'CAMPANHA_APROVADA', 
    'CAMPANHA_ATIVA', 'CAMPANHA_FINALIZADA', 'CANCELADO', 'SUSPENSO_FINANCEIRO'
  )
);

-- 2. Função da trigger para observar pagamento e inadimplência
CREATE OR REPLACE FUNCTION public.trg_fn_regras_financeiras_operacionais()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dias_atraso INT;
BEGIN
  -- Regra 1: Reativação
  -- Se o pagamento for registrado e o contrato estava suspenso por inadimplência, volta para CAMPANHA_ATIVA
  IF NEW.status IN ('PAGO', 'PAGA', 'CONCILIADA') AND OLD.status NOT IN ('PAGO', 'PAGA', 'CONCILIADA') THEN
    UPDATE public.contratos 
    SET status_workflow = 'CAMPANHA_ATIVA', updated_at = NOW()
    WHERE id = NEW.contrato_id 
      AND status_workflow = 'SUSPENSO_FINANCEIRO';
  END IF;

  -- Regra 2: Suspensão (pode ser disparada por um update diário que marque a conta como VENCIDA)
  IF NEW.status IN ('VENCIDO', 'VENCIDA', 'PENDENTE') AND NEW.vencimento < CURRENT_DATE THEN
    v_dias_atraso := CURRENT_DATE - NEW.vencimento;
    IF v_dias_atraso >= 5 THEN
      UPDATE public.contratos 
      SET status_workflow = 'SUSPENSO_FINANCEIRO', updated_at = NOW()
      WHERE id = NEW.contrato_id 
        AND status_workflow IN ('CAMPANHA_ATIVA', 'EM_PRODUCAO');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Trigger na tabela contas_receber
DROP TRIGGER IF EXISTS trg_regras_financeiras_operacionais ON public.contas_receber;
CREATE TRIGGER trg_regras_financeiras_operacionais
AFTER UPDATE OF status, vencimento
ON public.contas_receber
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_regras_financeiras_operacionais();
