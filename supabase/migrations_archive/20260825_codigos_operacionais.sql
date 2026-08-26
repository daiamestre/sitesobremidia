-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20260825: IDENTIFICADORES OPERACIONAIS
-- Camada de apresentação sobre a identidade técnica (UUID PK preservado).
-- Padrão do projeto: codigo_* (codigo_cliente, codigo_servico, ...)
-- Formato: COB-<ANO>-NNNNNN via SEQUENCE (race-safe, sem MAX+1).
-- Idempotente. Nenhuma PK/FK alterada.
-- ======================================================================

CREATE SEQUENCE IF NOT EXISTS seq_codigo_contas_receber START 1;

ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS codigo_operacional VARCHAR(24);

-- Gerador único-fonte (sequence atômica; ano = ano de criação da linha)
CREATE OR REPLACE FUNCTION public.gerar_codigo_conta(p_id UUID)
RETURNS VARCHAR(24)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo VARCHAR(24);
BEGIN
  SELECT 'COB-' || to_char(EXTRACT(YEAR FROM created_at), 'FM0000') || '-' ||
         lpad(nextval('seq_codigo_contas_receber')::text, 6, '0')
  INTO v_codigo
  FROM public.contas_receber WHERE id = p_id;

  RETURN v_codigo;
END;
$$;

-- Trigger: toda nova cobrança nasce com código operacional
CREATE OR REPLACE FUNCTION public.trg_codigo_operacional_conta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo_operacional IS NULL OR NEW.codigo_operacional = '' THEN
    NEW.codigo_operacional := 'COB-' || to_char(EXTRACT(YEAR FROM COALESCE(NEW.created_at, NOW())), 'FM0000') || '-' ||
                              lpad(nextval('seq_codigo_contas_receber')::text, 6, '0');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'codigo operacional falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_codigo_op_ins ON public.contas_receber;
CREATE TRIGGER trg_codigo_op_ins
  BEFORE INSERT ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.trg_codigo_operacional_conta();

-- Backfill determinístico (ordem de criação) usando o mesmo gerador
DO $$
DECLARE
  r RECORD;
  v_total INT := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.contas_receber
    WHERE codigo_operacional IS NULL OR codigo_operacional = ''
    ORDER BY created_at ASC, id ASC
  LOOP
    UPDATE public.contas_receber
    SET codigo_operacional = public.gerar_codigo_conta(r.id)
    WHERE id = r.id AND (codigo_operacional IS NULL OR codigo_operacional = '');
    v_total := v_total + 1;
  END LOOP;
  RAISE NOTICE 'backfill codigos: % linhas', v_total;
END $$;

ALTER TABLE public.contas_receber ALTER COLUMN codigo_operacional SET NOT NULL;

-- Default atômico: inserts de qualquer origem já nascem com código
CREATE OR REPLACE FUNCTION public.gerar_codigo_conta_novo()
RETURNS VARCHAR(24)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'COB-' || to_char(EXTRACT(YEAR FROM NOW()), 'FM0000') || '-' ||
         lpad(nextval('seq_codigo_contas_receber')::text, 6, '0');
$$;

ALTER TABLE public.contas_receber
  ALTER COLUMN codigo_operacional SET DEFAULT public.gerar_codigo_conta_novo();

CREATE UNIQUE INDEX IF NOT EXISTS uk_contas_codigo_operacional
  ON public.contas_receber (codigo_operacional);

CREATE INDEX IF NOT EXISTS idx_contas_codigo_tenant
  ON public.contas_receber (empresa_operadora_id, codigo_operacional);

-- Webhook passa a resolver também por código operacional
CREATE OR REPLACE FUNCTION public.buscar_conta_por_documento(p_doc TEXT)
RETURNS SETOF public.contas_receber
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM public.contas_receber
  WHERE numero_documento = p_doc OR codigo_operacional = upper(p_doc)
  ORDER BY created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_conta_por_documento(TEXT) TO service_role;

SELECT 'Migration 20260825_codigos_operacionais aplicada' AS status;
