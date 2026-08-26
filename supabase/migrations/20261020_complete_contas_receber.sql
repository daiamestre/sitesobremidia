-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20261020: COMPLETE COB. CENTRAL - contas_receber
-- Adiciona campos faltantes e expande estados conforme especificação da Central
-- Esta migration adapta-se ao esquema existente do banco (data_vencimento, valor, etc.)
-- ======================================================================

-- ======================================================================
-- ETAPA 1 — Adicionar campos faltantes em contas_receber
-- O banco já tem: data_vencimento, valor, numero_parcela, total_parcelas, status
-- Vamos adicionar os campos novos da central de cobranças
-- ======================================================================

-- competence_date: data de competência/período de referência
ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS competence_date DATE;

-- issue_date: data de emissão da cobrança
ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS issue_date DATE;

-- payment_date: data do pagamento registrado (usa data_recebimento do pagamentos ou novo campo)
ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ;

-- currency: moeda da cobrança
ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'BRL'
  CHECK (currency IN ('BRL', 'USD', 'EUR', 'GBP'));

-- notes: observações livres
ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ======================================================================
-- ETAPA 2 — Expandir valores de status conforme machine de estados
-- O banco já tem: PENDENTE, PAGO, PARCIAL, VENCIDO, CANCELADO
-- Vamos adicionar os novos estados da central mantendo retrocompatibilidade
-- ======================================================================

-- Novo constraint de status com todos os estados da central de cobrança
-- Inclui tanto os valores antigos quanto os novos para compatibilidade
DO $$
BEGIN
  -- Remover constraint antiga se existir e adicionar nova com todos os estados
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'contas_receber_status_check'
  ) THEN
    ALTER TABLE public.contas_receber DROP CONSTRAINT contas_receber_status_check;
  END IF;

  ALTER TABLE public.contas_receber ADD CONSTRAINT contas_receber_status_check
    CHECK (status IN (
      -- Valores antigos (já existentes no banco)
      'PENDENTE',       -- Em aberto / pending
      'PAGO',           -- Pago
      'PARCIAL',        -- Parcial
      'VENCIDO',        -- Vencido / overdue
      'CANCELADO',      -- Cancelled
      -- Novos valores (Central de Cobranças)
      'RASCUNHO',       -- DRAFT
      'ABERTA',         -- OPEN
      'AGENDADA',       -- SCHEDULED
      'VENCENDO_HOJE',  -- DUE_TODAY
      'ATRASADA',       -- OVERDUE
      'PARCIAL_PAGA',   -- PARTIALLY_PAID
      'PAGA',           -- PAID (duplicate para explicitidade)
      'CANCELADA',      -- CANCELLED (duplicate para explicitidade)
      'EM_DISPUTA',     -- DISPUTED
      'CONCILIADA'      -- WRITTEN_OFF (ou escrita off)
    ));
END $$;

-- ======================================================================
-- ETAPA 3 - Mapear status antigos para novos e preencher dados
-- ======================================================================

-- Atualizar status antigos para novos valores (já existentes serão migrados)
UPDATE public.contas_receber SET status = 'ABERTA' WHERE status = 'PENDENTE';
UPDATE public.contas_receber SET status = 'PAGA' WHERE status = 'PAGO';
UPDATE public.contas_receber SET status = 'PARCIAL_PAGA' WHERE status = 'PARCIAL';
UPDATE public.contas_receber SET status = 'ATRASADA' WHERE status = 'VENCIDO';
UPDATE public.contas_receber SET status = 'CANCELADA' WHERE status = 'CANCELADO';

-- Notes: para novas cobranças, pode ser preenchido pela aplicação
-- Já para existentes, fica NULL até ser preenchido

-- ======================================================================
-- ETAPA 4 - Atualizar view vw_cobranca_completa para o schema existente
-- ======================================================================

CREATE OR REPLACE VIEW public.vw_cobranca_completa AS
SELECT
  c.id,
  c.empresa_operadora_id,
  c.cliente_id,
  c.contrato_id,
  c.numero_documento,
  c.data_vencimento AS vencimento,
  c.competence_date,
  c.issue_date,
  c.valor AS valor_original,
  c.desconto,
  c.juros,
  c.multa,
  COALESCE(SUM(p.valor), 0) AS valor_pago,
  (c.valor - COALESCE(SUM(p.valor), 0)) AS saldo,
  c.currency,
  c.notes,
  c.status AS status_conta_receber,
  CASE
    WHEN c.data_vencimento IS NOT NULL THEN
      (SELECT EXTRACT(DAY FROM (c.data_vencimento AT TIME ZONE tz.timezone - INTERVAL '1 day'))::INT
       FROM (SELECT timezone FROM public.empresa_operadora WHERE id = c.empresa_operadora_id) AS tz(timezone)
      )
    ELSE NULL
  END AS dias_para_vencimento,
  rc.trigger_dias AS regra_trigger_dias,
  rc.canais_habilitados AS regra_canais,
  rc.prioridade AS regra_prioridade,
  fa.evento,
  fa.created_at AS ultima_atualizacao
FROM public.contas_receber c
LEFT JOIN public.pagamentos p ON p.conta_receber_id = c.id
LEFT JOIN public.regras_cobranca rc ON rc.empresa_operadora_id = c.empresa_operadora_id AND rc.ativo = TRUE
LEFT JOIN public.financeiro_auditoria fa ON fa.empresa_operadora_id = c.empresa_operadora_id AND fa.evento IN ('CONTA_CRIADA', 'PARCELA_GERADA', 'PAGAMENTO')
GROUP BY
  c.id, c.empresa_operadora_id, c.cliente_id, c.contrato_id,
  c.numero_documento, c.data_vencimento, c.competence_date, c.issue_date,
  c.valor, c.desconto, c.juros, c.multa, c.currency, c.notes, c.status,
  rc.trigger_dias, rc.canais_habilitados, rc.prioridade,
  fa.evento, fa.created_at
ORDER BY c.data_vencimento ASC;

CREATE INDEX IF NOT EXISTS idx_vw_cobranca_tenant ON public.vw_cobranca_completa(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_vw_cobranca_vencimento ON public.vw_cobranca_completa(data_vencimento);

-- ======================================================================
-- COMENTÁRIO FINAL
-- ======================================================================

SELECT 'Migration 20261020: Complete contas_receber schema + status expansion completed' AS status;