-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20260826: GESTOR DE MÍDIAS — TELA PAGA R$22,99
-- Foto de capa + criação de tela condicionada a pagamento confirmado.
-- Idempotente; reutiliza contas_receber + conciliação existentes.
-- ======================================================================

ALTER TABLE public.screens ADD COLUMN IF NOT EXISTS capa_url TEXT;
ALTER TABLE public.screens ADD COLUMN IF NOT EXISTS criada_por_gestor BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.screens.capa_url IS 'Foto de capa do local/tela (storage público existente)';

-- Cobrança única por tela (1:1) — webhook duplicado nunca gera duas telas
ALTER TABLE public.screens ADD COLUMN IF NOT EXISTS cobranca_id UUID
  REFERENCES public.contas_receber(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uk_screens_cobranca ON public.screens (cobranca_id) WHERE cobranca_id IS NOT NULL;

-- ======================================================================
-- RPC 1: gerar a cobrança da tela (R$ 22,99, PIX) — idempotente por gestor/dia? Não:
-- cada clique intencional cria UMA cobrança nova; a idempotência forte está na tela.
-- ======================================================================

CREATE OR REPLACE FUNCTION public.criar_cobranca_tela(p_empresa_operadora_id UUID, p_gestor_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta UUID;
  v_codigo VARCHAR(24);
BEGIN
  IF p_empresa_operadora_id IS NULL THEN
    RAISE EXCEPTION 'tenant obrigatorio';
  END IF;

  INSERT INTO public.contas_receber (
    empresa_operadora_id, cliente_id, contrato_id, valor,
    data_vencimento, status, metodo_cobranca, recorrencia, notes
  ) VALUES (
    p_empresa_operadora_id, NULL, NULL, 22.99,
    CURRENT_DATE, 'PENDENTE', 'PIX', 'AVULSA',
    'Criacao de tela — Gestor de Midias (user ' || coalesce(p_gestor_user_id::text,'') || ')'
  ) RETURNING id INTO v_conta;

  SELECT codigo_operacional INTO v_codigo FROM public.contas_receber WHERE id = v_conta;

  RETURN json_build_object('cobranca_id', v_conta, 'codigo', v_codigo, 'valor', 22.99);
END;
$$;

-- ======================================================================
-- RPC 2: criar a tela SOMENTE após pagamento confirmado (conciliação real).
-- Idempotência: cobranca_id UNIQUE — segundo insert falha, nunca duplica tela.
-- ======================================================================

CREATE OR REPLACE FUNCTION public.criar_tela_gestor(
  p_empresa_operadora_id UUID,
  p_cobranca_id UUID,
  p_nome VARCHAR,
  p_localizacao VARCHAR DEFAULT NULL,
  p_orientacao VARCHAR DEFAULT 'horizontal',
  p_capa_url TEXT DEFAULT NULL,
  p_usuario_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_valor NUMERIC;
  v_tela UUID;
BEGIN
  -- Gate server-side: pagamento REAL confirmado pela conciliação
  SELECT status, valor INTO v_status, v_valor
  FROM public.contas_receber WHERE id = p_cobranca_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'cobranca nao encontrada'; END IF;
  IF v_status NOT IN ('PAGA','PAGO') THEN
    RAISE EXCEPTION 'pagamento pendente (status %) — tela bloqueada', v_status;
  END IF;

  -- Idempotência: cobrança já utilizada por outra tela?
  IF EXISTS (SELECT 1 FROM public.screens WHERE cobranca_id = p_cobranca_id) THEN
    RAISE EXCEPTION 'cobranca ja utilizada em outra tela';
  END IF;

  INSERT INTO public.screens (
    empresa_operadora_id, user_id, name, location, orientation,
    status, is_active, capa_url, cobranca_id, criada_por_gestor
  ) VALUES (
    p_empresa_operadora_id, p_usuario_id, p_nome, p_localizacao,
    NULLIF(p_orientacao,''), 'offline', FALSE, p_capa_url, p_cobranca_id, TRUE
  ) RETURNING id INTO v_tela;

  INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
  VALUES (p_empresa_operadora_id, 'TELA_CRIADA_POS_PAGAMENTO', p_usuario_id,
          jsonb_build_object('tela_id', v_tela, 'cobranca_id', p_cobranca_id, 'valor', v_valor));

  RETURN json_build_object('ok', true, 'tela_id', v_tela);
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_cobranca_tela(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_tela_gestor(UUID,UUID,VARCHAR,VARCHAR,VARCHAR,TEXT,UUID) TO authenticated;

SELECT 'Migration 20260826_gestor_tela_paga aplicada' AS status;
