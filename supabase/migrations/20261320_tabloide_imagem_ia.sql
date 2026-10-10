-- F-174: Tabloide Digital — imagem criada por IA (Cloudflare Workers AI) quando não existe foto real do produto.
--  * a foto do catálogo pode ter fonte 'IA';
--  * contador diário por pessoa e por empresa, para a cota gratuita não acabar por uso exagerado de um só.

ALTER TABLE public.tabloide_catalogo DROP CONSTRAINT IF EXISTS tabloide_catalogo_fonte_check;
ALTER TABLE public.tabloide_catalogo ADD CONSTRAINT tabloide_catalogo_fonte_check
  CHECK (fonte IN ('OPENFOODFACTS', 'PEXELS', 'PIXABAY', 'UPLOAD', 'IA'));

CREATE TABLE IF NOT EXISTS public.tabloide_ia_uso (
  empresa_operadora_id uuid NOT NULL,
  user_id              uuid NOT NULL,
  dia                  date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  total                integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, dia)
);
ALTER TABLE public.tabloide_ia_uso ENABLE ROW LEVEL SECURITY;
-- sem políticas: ninguém lê nem grava direto; só a função abaixo mexe

-- Registra 1 geração e diz se pode. Limites: 25 por pessoa/dia e 120 por empresa/dia.
CREATE OR REPLACE FUNCTION public.tabloide_ia_registrar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid := public.get_user_tenant_id();
  v_dia date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_meu integer;
  v_empresa integer;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RETURN jsonb_build_object('liberado', false, 'motivo', 'Sessão inválida.');
  END IF;
  SELECT coalesce(sum(total), 0) INTO v_empresa FROM tabloide_ia_uso WHERE empresa_operadora_id = v_tenant AND dia = v_dia;
  SELECT coalesce(max(total), 0) INTO v_meu FROM tabloide_ia_uso WHERE user_id = v_uid AND dia = v_dia;
  IF v_meu >= 25 THEN
    RETURN jsonb_build_object('liberado', false, 'motivo', 'Você já criou 25 imagens por IA hoje. Amanhã libera de novo, ou envie a sua foto.');
  END IF;
  IF v_empresa >= 120 THEN
    RETURN jsonb_build_object('liberado', false, 'motivo', 'O limite diário de imagens por IA foi atingido. Amanhã libera de novo, ou envie a sua foto.');
  END IF;
  INSERT INTO tabloide_ia_uso (empresa_operadora_id, user_id, dia, total) VALUES (v_tenant, v_uid, v_dia, 1)
  ON CONFLICT (user_id, dia) DO UPDATE SET total = tabloide_ia_uso.total + 1;
  RETURN jsonb_build_object('liberado', true, 'usadas_hoje', v_meu + 1, 'limite', 25);
END $$;

REVOKE ALL ON FUNCTION public.tabloide_ia_registrar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tabloide_ia_registrar() TO authenticated;
