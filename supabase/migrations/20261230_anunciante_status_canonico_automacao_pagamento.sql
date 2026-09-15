-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261230
-- STATUS CANÔNICO DO ANUNCIANTE + AUTOMAÇÃO ATÔMICA POR PAGAMENTO
-- ======================================================================

-- 1. Atualização do trigger de conciliação de pagamentos em public.pagamentos
CREATE OR REPLACE FUNCTION public.trg_concilia_pagamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta_receber_id UUID;
  v_total NUMERIC(14,2);
  v_valor NUMERIC(14,2);
  v_cliente_id UUID;
  v_contrato_id UUID;
  v_documento TEXT;
  v_restam_abertas INT;
  v_liq TIMESTAMPTZ;
  v_usuario UUID;
  v_tenant UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_conta_receber_id := OLD.conta_receber_id;
    v_liq := NULL;
    v_usuario := NULL;
    v_tenant := OLD.empresa_operadora_id;
  ELSE
    v_conta_receber_id := NEW.conta_receber_id;
    v_liq := NEW.data_liquidacao;
    v_usuario := NEW.created_by;
    v_tenant := NEW.empresa_operadora_id;
  END IF;

  IF v_conta_receber_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT valor, cliente_id, contrato_id, empresa_operadora_id
  INTO v_valor, v_cliente_id, v_contrato_id, v_tenant
  FROM public.contas_receber
  WHERE id = v_conta_receber_id;

  IF v_valor IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Resolução de cliente_id via contrato se necessário
  IF v_cliente_id IS NULL AND v_contrato_id IS NOT NULL THEN
    SELECT cliente_id INTO v_cliente_id
    FROM public.contratos
    WHERE id = v_contrato_id;
  END IF;

  SELECT COALESCE(SUM(valor_pago), 0) INTO v_total
  FROM public.pagamentos
  WHERE conta_receber_id = v_conta_receber_id;

  -- Atualização dos saldos e status da conta a receber
  UPDATE public.contas_receber
  SET valor_pago = v_total,
      saldo = v_valor - v_total,
      payment_date = CASE WHEN v_valor - v_total <= 0 THEN COALESCE(v_liq, NOW()) ELSE payment_date END,
      data_recebimento = CASE WHEN v_valor - v_total <= 0 THEN COALESCE(v_liq::date, CURRENT_DATE) ELSE NULL END,
      situacao_cobranca = CASE WHEN v_valor - v_total <= 0 THEN 'NENHUMA' ELSE situacao_cobranca END,
      status = CASE
        WHEN v_total <= 0 AND status IN ('PAGA','PARCIAL_PAGA')
          THEN CASE WHEN data_vencimento < CURRENT_DATE THEN 'ATRASADO' ELSE 'PENDENTE' END
        WHEN v_valor - v_total <= 0 THEN 'PAGA'
        WHEN v_total > 0 THEN 'PARCIAL_PAGA'
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = v_conta_receber_id;

  IF TG_OP = 'INSERT' THEN
    -- Registro da auditoria de pagamento confirmado
    INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
    VALUES (
      v_tenant,
      'PAGAMENTO_CONFIRMADO',
      v_usuario,
      jsonb_build_object(
        'conta_receber_id', v_conta_receber_id,
        'valor_pago', NEW.valor_pago,
        'meio', NEW.meio_pagamento,
        'transacao_id_externo', NEW.transacao_id_externo
      )
    );

    -- Cancelamento de jobs de cobrança pendentes desta conta
    UPDATE public.jobs
    SET status = 'CANCELLED',
        processed_at = NOW()
    WHERE empresa_operadora_id = v_tenant
      AND status IN ('PENDING', 'PROCESSING')
      AND payload->>'conta_receber_id' = v_conta_receber_id::text
      AND tipo_job LIKE 'COLECTION%';

    -- Confirmação ao cliente (idempotente)
    SELECT c.cliente_id, c.numero_documento, c.valor
    INTO v_cliente_id, v_documento, v_valor
    FROM public.contas_receber c
    WHERE c.id = v_conta_receber_id;

    PERFORM public.enfileirar_job(
      v_tenant,
      'COLECTION_PAID',
      jsonb_build_object(
        'conta_receber_id', v_conta_receber_id,
        'cliente_id', v_cliente_id,
        'numero_documento', v_documento,
        'valor', v_valor,
        'valor_pago', NEW.valor_pago,
        'origem', 'conciliacao'
      ),
      v_tenant::text || ':' || v_conta_receber_id::text || ':COLECTION_PAID:' || COALESCE(NEW.transacao_id_externo, NEW.id::text),
      'ALTO',
      NULL,
      2
    );

    -- ======================================================================
    -- PROMOÇÃO AUTOMÁTICA CANÔNICA DO ANUNCIANTE PARA ACTIVE
    -- ======================================================================
    IF v_cliente_id IS NOT NULL AND NEW.valor_pago > 0 THEN
      UPDATE public.clientes
      SET status = 'ACTIVE',
          bloqueio_financeiro = FALSE,
          bloqueio_motivo = NULL,
          bloqueado_em = NULL,
          updated_at = NOW()
      WHERE id = v_cliente_id
        AND empresa_operadora_id = v_tenant
        AND deleted_at IS NULL
        AND status <> 'ACTIVE';

      IF FOUND THEN
        INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
        VALUES (
          v_tenant,
          'CLIENTE_PROMOVIDO_ACTIVE_PAGAMENTO',
          v_usuario,
          jsonb_build_object(
            'cliente_id', v_cliente_id,
            'conta_receber_id', v_conta_receber_id,
            'valor_pago', NEW.valor_pago,
            'meio_pagamento', NEW.meio_pagamento,
            'transacao_id_externo', NEW.transacao_id_externo,
            'motivo', 'pagamento_confirmado'
          )
        );
      END IF;
    END IF;
  END IF;

  -- REATIVAÇÃO: sem dívida aberta -> remove bloqueio
  IF v_cliente_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_restam_abertas
    FROM public.contas_receber
    WHERE cliente_id = v_cliente_id
      AND status IN ('PENDENTE','ABERTA','AGENDADA','VENCENDO_HOJE','ATRASADA','ATRASADO','PARCIAL_PAGA','PARCIAL');

    IF v_restam_abertas = 0 THEN
      UPDATE public.clientes
      SET bloqueio_financeiro = FALSE,
          bloqueio_motivo = NULL,
          bloqueado_em = NULL
      WHERE id = v_cliente_id
        AND empresa_operadora_id = v_tenant
        AND bloqueio_financeiro = TRUE;

      IF FOUND AND TG_OP = 'INSERT' THEN
        INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
        VALUES (
          v_tenant,
          'CLIENTE_REATIVADO',
          v_usuario,
          jsonb_build_object('cliente_id', v_cliente_id, 'motivo', 'todas_cobrancas_liquidadas')
        );
      END IF;
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_concilia_pagamento falhou: %', SQLERRM;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_concilia_pgto_ins ON public.pagamentos;
CREATE TRIGGER trg_concilia_pgto_ins
  AFTER INSERT ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_concilia_pagamento();

DROP TRIGGER IF EXISTS trg_concilia_pgto_del ON public.pagamentos;
CREATE TRIGGER trg_concilia_pgto_del
  AFTER DELETE ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_concilia_pagamento();


-- 2. Atualização do trigger em public.contas_receber para garantir reativação e promoção
CREATE OR REPLACE FUNCTION public.trg_fn_regras_financeiras_operacionais()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dias_atraso INT;
BEGIN
  -- Regra 1: Reativação e Promoção para ACTIVE
  IF NEW.status IN ('PAGO', 'PAGA', 'CONCILIADA') AND OLD.status NOT IN ('PAGO', 'PAGA', 'CONCILIADA') THEN
    -- Desbloqueia contrato suspenso por inadimplência
    UPDATE public.contratos 
    SET status_workflow = 'CAMPANHA_ATIVA',
        updated_at = NOW()
    WHERE id = NEW.contrato_id 
      AND status_workflow = 'SUSPENSO_FINANCEIRO';

    -- Promove o anunciante para ACTIVE na confirmação do pagamento
    IF NEW.cliente_id IS NOT NULL THEN
      UPDATE public.clientes
      SET status = 'ACTIVE',
          bloqueio_financeiro = FALSE,
          bloqueio_motivo = NULL,
          bloqueado_em = NULL,
          updated_at = NOW()
      WHERE id = NEW.cliente_id
        AND empresa_operadora_id = NEW.empresa_operadora_id
        AND deleted_at IS NULL
        AND status <> 'ACTIVE';
    ELSIF NEW.contrato_id IS NOT NULL THEN
      UPDATE public.clientes c
      SET status = 'ACTIVE',
          bloqueio_financeiro = FALSE,
          bloqueio_motivo = NULL,
          bloqueado_em = NULL,
          updated_at = NOW()
      FROM public.contratos ct
      WHERE ct.id = NEW.contrato_id
        AND c.id = ct.cliente_id
        AND c.empresa_operadora_id = NEW.empresa_operadora_id
        AND c.deleted_at IS NULL
        AND c.status <> 'ACTIVE';
    END IF;
  END IF;

  -- Regra 2: Suspensão por inadimplência
  IF NEW.status IN ('VENCIDO', 'VENCIDA', 'PENDENTE') AND NEW.data_vencimento < CURRENT_DATE THEN
    v_dias_atraso := CURRENT_DATE - NEW.data_vencimento;
    IF v_dias_atraso >= 5 AND NEW.contrato_id IS NOT NULL THEN
      UPDATE public.contratos 
      SET status_workflow = 'SUSPENSO_FINANCEIRO',
          updated_at = NOW()
      WHERE id = NEW.contrato_id 
        AND status_workflow IN ('CAMPANHA_ATIVA', 'EM_PRODUCAO');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_regras_financeiras_operacionais ON public.contas_receber;
CREATE TRIGGER trg_regras_financeiras_operacionais
  AFTER UPDATE OF status, data_vencimento
  ON public.contas_receber
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_regras_financeiras_operacionais();
