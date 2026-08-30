-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261121: INTEGRIDADE FINANCEIRA E ANTI-DUPLA BAIXA
-- Bloqueio transacional com SELECT ... FOR UPDATE antes de inserir pagamentos.
-- Impede saldo negativo, excesso de pagamento e dupla liquidação entre PIX e Boleto.
-- ======================================================================

-- 1. Limpeza de trigger duplicado legado de debug
DROP TRIGGER IF EXISTS trg_debug2_ins ON public.pagamentos;
DROP FUNCTION IF EXISTS public.trg_concilia_debug2();

-- 2. Função de validação de integridade com bloqueio pessimista
CREATE OR REPLACE FUNCTION public.trg_valida_integridade_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conta RECORD;
BEGIN
  IF NEW.conta_receber_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1. Lock pessimista de linha na conta a receber (mesma transação)
  SELECT id, empresa_operadora_id, valor, valor_pago, saldo, status
  INTO v_conta
  FROM public.contas_receber
  WHERE id = NEW.conta_receber_id
  FOR UPDATE;

  IF v_conta.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Bloqueio se cobrança estiver cancelada
  IF v_conta.status IN ('CANCELADO', 'CANCELADA') THEN
    RAISE EXCEPTION 'ERR_COBRANCA_CANCELADA: Cobrança % está cancelada. Pagamento rejeitado.', NEW.conta_receber_id
      USING ERRCODE = '23514';
  END IF;

  -- 3. Bloqueio se cobrança já estiver integralmente liquidada
  IF v_conta.status IN ('PAGA', 'PAGO') OR COALESCE(v_conta.saldo, 0) <= 0.009 THEN
    -- Registra evento de auditoria da tentativa bloqueada
    INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
    VALUES (
      COALESCE(NEW.empresa_operadora_id, v_conta.empresa_operadora_id),
      'TENTATIVA_PAGAMENTO_DUPLICADO_BLOQUEADA',
      NEW.created_by,
      jsonb_build_object(
        'conta_receber_id', NEW.conta_receber_id,
        'meio_pagamento', NEW.meio_pagamento,
        'transacao_id_externo', NEW.transacao_id_externo,
        'valor_tentado', NEW.valor_pago,
        'motivo', 'ALREADY_SETTLED',
        'status_anterior', v_conta.status,
        'saldo_anterior', v_conta.saldo,
        'timestamp', NOW()
      )
    );

    RAISE EXCEPTION 'ERR_COBRANCA_JA_PAGA: Cobrança % já liquidada integralmente (status: %, saldo: %). Pagamento rejeitado.',
      NEW.conta_receber_id, v_conta.status, v_conta.saldo
      USING ERRCODE = '23514';
  END IF;

  -- 4. Bloqueio de valor excedente para evitar saldo negativo
  IF NEW.valor_pago > (v_conta.saldo + 0.009) THEN
    INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
    VALUES (
      COALESCE(NEW.empresa_operadora_id, v_conta.empresa_operadora_id),
      'PAGAMENTO_EXCEDENTE_BLOQUEADO',
      NEW.created_by,
      jsonb_build_object(
        'conta_receber_id', NEW.conta_receber_id,
        'meio_pagamento', NEW.meio_pagamento,
        'transacao_id_externo', NEW.transacao_id_externo,
        'valor_tentado', NEW.valor_pago,
        'saldo_restante', v_conta.saldo,
        'timestamp', NOW()
      )
    );

    RAISE EXCEPTION 'ERR_VALOR_EXCEDENTE: Valor do pagamento (R$ %) excede o saldo restante da cobrança (R$ %).',
      NEW.valor_pago, v_conta.saldo
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Instalação do trigger BEFORE INSERT
DROP TRIGGER IF EXISTS trg_valida_integridade_pgto_ins ON public.pagamentos;
CREATE TRIGGER trg_valida_integridade_pgto_ins
  BEFORE INSERT ON public.pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_valida_integridade_pagamento();

COMMENT ON FUNCTION public.trg_valida_integridade_pagamento IS 'Validação transacional atômica anti-dupla baixa com FOR UPDATE em contas_receber';
