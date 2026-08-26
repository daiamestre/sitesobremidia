-- ======================================================================
-- SOBRE MÍDIA - MIGRATION: IDENTIFICADORES OPERACIONAIS PARA TELAS
-- Camada de apresentação sobre a identidade técnica (UUID PK preservado).
-- Padrão do projeto: codigo_* (codigo_cliente, codigo_servico, ...)
-- Formato: TEL-<ANO>-NNNNNN via SEQUENCE (race-safe, sem MAX+1).
-- Idempotente. Nenhuma PK/FK alterada.
-- ======================================================================

-- 1. Sequence para geração de códigos operacionais de tela
CREATE SEQUENCE IF NOT EXISTS seq_codigo_screens START 1;

-- 2. Coluna codigo_operacional na tabela screens
ALTER TABLE public.screens ADD COLUMN IF NOT EXISTS codigo_operacional VARCHAR(24);

-- 3. Gerador único-fonte (sequence atômica; ano = ano de criação da linha)
CREATE OR REPLACE FUNCTION public.gerar_codigo_tela(p_id UUID)
RETURNS VARCHAR(24)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo VARCHAR(24);
BEGIN
  SELECT 'TEL-' || to_char(EXTRACT(YEAR FROM created_at), 'FM0000') || '-' ||
         lpad(nextval('seq_codigo_screens')::text, 6, '0')
  INTO v_codigo
  FROM public.screens WHERE id = p_id;

  RETURN v_codigo;
END;
$$;

-- 4. Trigger: toda nova tela nasce com código operacional
CREATE OR REPLACE FUNCTION public.trg_codigo_operacional_tela()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo_operacional IS NULL OR NEW.codigo_operacional = '' THEN
    NEW.codigo_operacional := 'TEL-' || to_char(EXTRACT(YEAR FROM COALESCE(NEW.created_at, NOW())), 'FM0000') || '-' ||
                              lpad(nextval('seq_codigo_screens')::text, 6, '0');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'codigo operacional tela falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_codigo_op_tela_ins ON public.screens;
CREATE TRIGGER trg_codigo_op_tela_ins
  BEFORE INSERT ON public.screens
  FOR EACH ROW EXECUTE FUNCTION public.trg_codigo_operacional_tela();

-- 5. Backfill determinístico (ordem de criação) usando o mesmo gerador
DO $$
DECLARE
  r RECORD;
  v_total INT := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.screens
    WHERE codigo_operacional IS NULL OR codigo_operacional = ''
    ORDER BY created_at ASC, id ASC
  LOOP
    UPDATE public.screens
    SET codigo_operacional = public.gerar_codigo_tela(r.id)
    WHERE id = r.id AND (codigo_operacional IS NULL OR codigo_operacional = '');
    v_total := v_total + 1;
  END LOOP;
  RAISE NOTICE 'backfill codigos tela: % linhas', v_total;
END $$;

ALTER TABLE public.screens ALTER COLUMN codigo_operacional SET NOT NULL;

-- 6. Default atômico: inserts de qualquer origem já nascem com código
CREATE OR REPLACE FUNCTION public.gerar_codigo_tela_novo()
RETURNS VARCHAR(24)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'TEL-' || to_char(EXTRACT(YEAR FROM NOW()), 'FM0000') || '-' ||
         lpad(nextval('seq_codigo_screens')::text, 6, '0');
$$;

ALTER TABLE public.screens
  ALTER COLUMN codigo_operacional SET DEFAULT public.gerar_codigo_tela_novo();

-- 7. Índices únicos e de busca
CREATE UNIQUE INDEX IF NOT EXISTS uk_screens_codigo_operacional
  ON public.screens (codigo_operacional);

CREATE INDEX IF NOT EXISTS idx_screens_codigo_tenant
  ON public.screens (empresa_operadora_id, codigo_operacional);

-- 8. Função de busca por código operacional (para webhooks, APIs, etc.)
CREATE OR REPLACE FUNCTION public.buscar_tela_por_codigo(p_codigo TEXT)
RETURNS SETOF public.screens
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM public.screens
  WHERE codigo_operacional = upper(p_codigo)
  ORDER BY created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_tela_por_codigo(TEXT) TO authenticated, service_role;

-- 9. Sincronizar custom_id com codigo_operacional se custom_id estiver vazio
-- (custom_id continua sendo usado pelo player para URLs amigáveis)
UPDATE public.screens
SET custom_id = codigo_operacional
WHERE custom_id IS NULL OR custom_id = '';

SELECT 'Migration: Screen operational codes (TEL-YYYY-NNNNNN) applied' AS status;