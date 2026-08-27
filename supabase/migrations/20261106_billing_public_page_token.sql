-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20261106: PÁGINA PÚBLICA DE COBRANÇA
-- Adiciona token público seguro e garante idempotência do scheduler.
-- ======================================================================

-- 1. Adicionar colunas de controle para página pública
ALTER TABLE public.contas_receber 
ADD COLUMN IF NOT EXISTS public_token UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS public_enabled BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_contas_receber_public_token ON public.contas_receber(public_token);

-- 2. Garantir idempotência de geração (1 cobrança por contrato por competência)
-- Usamos um índice único parcial para ignorar contas avulsas (sem contrato)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unq_contas_receber_competencia 
ON public.contas_receber(empresa_operadora_id, contrato_id, competencia)
WHERE contrato_id IS NOT NULL;

-- 3. Atualizar a view `vw_cobranca_completa` para expor o token público e competência
DROP VIEW IF EXISTS public.vw_cobranca_completa;
CREATE OR REPLACE VIEW public.vw_cobranca_completa AS
SELECT
  c.id,
  c.empresa_operadora_id,
  c.cliente_id,
  c.contrato_id,
  c.numero_documento,
  c.competencia,
  c.vencimento,
  c.valor_original,
  c.desconto,
  c.juros,
  c.multa,
  c.valor_pago,
  c.saldo,
  c.status AS status_conta_receber,
  c.public_token,
  c.public_enabled,
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
  fa.created_at AS ultima_atualizacao
FROM public.contas_receber c
LEFT JOIN public.regras_cobranca rc ON rc.empresa_operadora_id = c.empresa_operadora_id AND rc.ativo = TRUE
LEFT JOIN public.financeiro_auditoria fa ON fa.empresa_operadora_id = c.empresa_operadora_id AND fa.evento IN ('CONTA_CRIADA', 'PARCELA_GERADA', 'PAGAMENTO')
ORDER BY c.vencimento ASC;

-- 4. Função RPC segura para leitura pública (Bypassing RLS apenas para acesso exato)
CREATE OR REPLACE FUNCTION public.rpc_get_public_billing(
  p_codigo VARCHAR(40),
  p_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', c.id,
    'numero_documento', c.numero_documento,
    'competencia', c.competencia,
    'vencimento', c.vencimento,
    'valor_original', c.valor_original,
    'valor_pago', c.valor_pago,
    'desconto', c.desconto,
    'juros', c.juros,
    'multa', c.multa,
    'saldo', c.saldo,
    'status', c.status,
    'cliente_nome', cl.nome,
    'cliente_documento', COALESCE(cl.documento, cl.cpf, cl.cnpj),
    'empresa_nome', em.nome_fantasia,
    'empresa_documento', em.cnpj
  ) INTO v_result
  FROM public.contas_receber c
  JOIN public.clientes cl ON cl.id = c.cliente_id
  JOIN public.empresa_operadora em ON em.id = c.empresa_operadora_id
  WHERE c.numero_documento = p_codigo
    AND c.public_token = p_token
    AND c.public_enabled = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança não encontrada ou acesso negado.';
  END IF;

  RETURN v_result;
END;
$$;
