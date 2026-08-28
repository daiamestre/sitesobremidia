-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20261108: PUBLIC IDENTIFIER
-- Cria identificador público curto, único e legível para as cobranças.
-- Corrige a RPC rpc_get_public_billing para consultar corretamente a 
-- tabela public.empresas.
-- ======================================================================

ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS public_identifier VARCHAR(15);

-- Função geradora baseada num alfabeto restrito (sem letras ambíguas: 0,O,1,I,L)
CREATE OR REPLACE FUNCTION public.gerar_identificador_publico()
RETURNS VARCHAR(15)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  chars text[] := '{2,3,4,5,6,7,8,9,A,B,C,D,E,F,G,H,J,K,M,N,P,Q,R,S,T,U,V,W,X,Y,Z}';
  result text := '';
  i integer := 0;
  v_exists boolean;
BEGIN
  LOOP
    result := 'COB-';
    FOR i IN 1..8 LOOP
      result := result || chars[1+floor(random()*(array_length(chars, 1)))::int];
    END LOOP;
    
    -- Checa unicidade
    SELECT EXISTS(SELECT 1 FROM public.contas_receber WHERE public_identifier = result) INTO v_exists;
    IF NOT v_exists THEN
      RETURN result;
    END IF;
  END LOOP;
END;
$$;

-- Trigger para proteger criações de todas as origens
CREATE OR REPLACE FUNCTION public.trg_contas_receber_public_identifier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.public_identifier IS NULL OR NEW.public_identifier = '' THEN
    NEW.public_identifier := public.gerar_identificador_publico();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_public_id_ins ON public.contas_receber;
CREATE TRIGGER trg_public_id_ins
  BEFORE INSERT ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.trg_contas_receber_public_identifier();

-- Loop determinístico de Backfill
DO $$
DECLARE
  r RECORD;
  v_total INT := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.contas_receber
    WHERE public_identifier IS NULL OR public_identifier = ''
    ORDER BY created_at ASC
  LOOP
    UPDATE public.contas_receber
    SET public_identifier = public.gerar_identificador_publico()
    WHERE id = r.id;
    v_total := v_total + 1;
  END LOOP;
  RAISE NOTICE 'Backfill de public_identifier concluído: % linhas', v_total;
END $$;

ALTER TABLE public.contas_receber ALTER COLUMN public_identifier SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uk_contas_public_identifier ON public.contas_receber (public_identifier);

-- ======================================================================
-- CORREÇÃO DA RPC DE COBRANÇA PÚBLICA
-- Utiliza p_codigo e p_identifier simultaneamente por segurança.
-- Busca na tabela `public.empresas` em vez da extinta `cliente_empresas`
-- ======================================================================
DROP FUNCTION IF EXISTS public.rpc_get_public_billing(VARCHAR, UUID);
DROP FUNCTION IF EXISTS public.rpc_get_public_billing(VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION public.rpc_get_public_billing(p_codigo VARCHAR(40), p_identifier VARCHAR(15))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', c.id,
    'numero_documento', c.numero_documento,
    'codigo_operacional', c.codigo_operacional,
    'public_identifier', c.public_identifier,
    'competencia', c.competencia_date,
    'vencimento', c.data_vencimento,
    'valor_original', c.valor,
    'valor_pago', c.valor_pago,
    'saldo', c.saldo,
    'status', c.status,
    'numero_parcela', c.numero_parcela,
    'total_parcelas', c.total_parcelas,
    'metodo', c.metodo_cobranca,
    'recorrencia', c.recorrencia,
    'observacoes', c.notes,
    'cliente_nome', COALESCE((SELECT razao_social FROM public.empresas WHERE cliente_id = c.cliente_id LIMIT 1), 'Cliente'),
    'cliente_documento', (SELECT cnpj FROM public.empresas WHERE cliente_id = c.cliente_id LIMIT 1),
    'empresa_nome', em.nome_fantasia,
    'empresa_documento', em.cnpj,
    'contrato_codigo', ct.numero_contrato_legivel,
    'contrato_tipo', ct.tipo_contrato,
    'servico_faturado', c.notes,
    'pagamentos', (
       SELECT COALESCE(jsonb_agg(
         jsonb_build_object(
           'id', p.id,
           'valor_pago', p.valor_pago,
           'data_liquidacao', p.data_liquidacao,
           'meio_pagamento', p.meio_pagamento,
           'transacao_id_externo', p.transacao_id_externo
         ) ORDER BY p.data_liquidacao DESC
       ), '[]'::jsonb)
       FROM public.pagamentos p
       WHERE p.conta_receber_id = c.id
    )
  )
  INTO v_result
  FROM public.contas_receber c
  JOIN public.empresa_operadora em ON em.id = c.empresa_operadora_id
  LEFT JOIN public.contratos ct ON ct.id = c.contrato_id
  WHERE c.codigo_operacional = p_codigo
    AND c.public_identifier = p_identifier
    AND c.public_enabled = TRUE
  LIMIT 1;

  RETURN v_result;
END;
$$;
