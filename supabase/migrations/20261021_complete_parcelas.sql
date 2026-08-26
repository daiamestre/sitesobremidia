-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20261021: COMPLETE PARCELAS - adicionar campos financeiros
-- ======================================================================

-- ======================================================================
-- ETAPA 1 — Adicionar campos financeiros em parcelas
-- Desconto, juros e multa por parcela
-- ======================================================================

-- desconto: valor descontado nesta parcela
ALTER TABLE public.parcelas
  ADD COLUMN IF NOT EXISTS descricao TEXT;

-- juros: juros aplicados nesta parcela
ALTER TABLE public.parcelas
  ADD COLUMN IF NOT EXISTS juros NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (juros >= 0);

-- multa: multa aplicada nesta parcela
ALTER TABLE public.parcelas
  ADD COLUMN IF NOT EXISTS multa NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (multa >= 0);

-- valor_liquido: valor original menos desconto mais juros mais multa
ALTER TABLE public.parcelas
  ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (valor_liquido >= 0);

-- ======================================================================
-- ETAPA 2 - Atualizar view vw_cobranca_completa se necessário
-- ======================================================================

CREATE OR REPLACE VIEW public.vw_cobranca_completa AS
SELECT
  c.id,
  c.empresa_operadora_id,
  c.cliente_id,
  c.contrato_id,
  c.numero_documento,
  c.vencimento,
  c.competence_date,
  c.issue_date,
  c.valor_original,
  c.desconto,
  c.juros,
  c.multa,
  c.valor_pago,
  c.saldo,
  c.currency,
  c.notes,
  c.status AS status_conta_receber,
  CASE
    WHEN c.vencimento IS NOT NULL THEN
      (SELECT EXTRACT(DAY FROM (c.vencimento AT TIME ZONE tz.timezone - INTERVAL '1 day'))::INT
       FROM (SELECT timezone FROM public.empresa_operadora WHERE id = c.empresa_operadora_id) AS tz(timezone)
      )
    ELSE NULL
  END AS dias_para_vencimento,
  rc.trigger_dias AS regra_trigger_dias,
  rc.canais_habilitados AS regra_canais,
  rc.prioridade AS regra_prioridade,
  fa.evento,
  fa.created_at AS ultima_atualizacao,
  -- Dados das parcelas associadas
  json_agg(
    json_build_object(
      'id', p.id,
      'numero_parcela', p.numero_parcela,
      'vencimento', p.vencimento,
      'valor', p.valor,
      'juros', p.juros,
      'multa', p.multa,
      'descricao', p.descricao,
      'valor_liquido', p.valor_liquido,
      'status', p.status
    )
  ) AS parcelas
FROM public.contas_receber c
LEFT JOIN public.parcelas p ON p.conta_receber_id = c.id
LEFT JOIN public.regras_cobranca rc ON rc.empresa_operadora_id = c.empresa_operadora_id AND rc.ativo = TRUE
LEFT JOIN public.financeiro_auditoria fa ON fa.empresa_operadora_id = c.empresa_operadora_id AND fa.evento IN ('CONTA_CRIADA', 'PARCELA_GERADA', 'PAGAMENTO')
GROUP BY
  c.id, c.empresa_operadora_id, c.cliente_id, c.contrato_id,
  c.numero_documento, c.vencimento, c.competence_date, c.issue_date,
  c.valor_original, c.desconto, c.juros, c.multa, c.valor_pago, c.saldo,
  c.currency, c.notes, c.status,
  rc.trigger_dias, rc.canais_habilitados, rc.prioridade,
  fa.evento, fa.created_at
ORDER BY c.vencimento ASC;

CREATE INDEX IF NOT EXISTS idx_vw_cobranca_tenant ON public.vw_cobranca_completa(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_vw_cobranca_vencimento ON public.vw_cobranca_completa(vencimento);

-- ======================================================================
-- COMENTÁRIO FINAL
-- ======================================================================

SELECT 'Migration 20261021: Complete parcelas schema completed' AS status;