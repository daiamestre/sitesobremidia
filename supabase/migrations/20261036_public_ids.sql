-- ======================================================================
-- SOBRE MÃƒÂDIA Ã¢â‚¬â€ MIGRATION 20261036
-- PADRONIZAÃƒâ€¡ÃƒÆ’O GLOBAL DE IDENTIFICADORES PÃƒÅ¡BLICOS (public_id)
--
-- PadrÃƒÂ£o: PREFIXO-NNNNNN via SEQUENCE (seguro contra concorrÃƒÂªncia).
-- Entidades que JÃƒÂ possuem padrÃƒÂ£o oficial permanecem intocadas:
--   contratos.numero_contrato (CTR-), cobrancas.numero_documento (COB/REC-),
--   pedidos_insercao.numero_pi (PI-), screens.codigo_operacional (TEL-),
--   propostas.numero_proposta.
-- Novos cÃƒÂ³digos: REP/USU/ANU/EST/PLY/MID/CAM/WID/COM.
-- UUID, PK, FK, RLS, ÃƒÂ­ndices e RPCs: preservados.
-- ======================================================================

CREATE SEQUENCE IF NOT EXISTS seq_pub_representantes;
CREATE SEQUENCE IF NOT EXISTS seq_pub_usuarios;
CREATE SEQUENCE IF NOT EXISTS seq_pub_clientes;
CREATE SEQUENCE IF NOT EXISTS seq_pub_pontos;
CREATE SEQUENCE IF NOT EXISTS seq_pub_playlists;
CREATE SEQUENCE IF NOT EXISTS seq_pub_media;
CREATE SEQUENCE IF NOT EXISTS seq_pub_campanhas;
CREATE SEQUENCE IF NOT EXISTS seq_pub_widgets;
CREATE SEQUENCE IF NOT EXISTS seq_pub_comissoes;

ALTER TABLE public.representantes ADD COLUMN IF NOT EXISTS codigo_publico VARCHAR(24);
ALTER TABLE public.usuarios      ADD COLUMN IF NOT EXISTS codigo_publico VARCHAR(24);
ALTER TABLE public.clientes      ADD COLUMN IF NOT EXISTS codigo_publico VARCHAR(24);
ALTER TABLE public.pontos        ADD COLUMN IF NOT EXISTS codigo_publico VARCHAR(24);
ALTER TABLE public.playlists     ADD COLUMN IF NOT EXISTS codigo_publico VARCHAR(24);
ALTER TABLE public.media         ADD COLUMN IF NOT EXISTS codigo_publico VARCHAR(24);
ALTER TABLE public.campanhas     ADD COLUMN IF NOT EXISTS codigo_publico VARCHAR(24);
ALTER TABLE public.widgets       ADD COLUMN IF NOT EXISTS codigo_publico VARCHAR(24);
ALTER TABLE public.comissoes     ADD COLUMN IF NOT EXISTS codigo_publico VARCHAR(24);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['representantes','clientes','pontos','playlists','media','campanhas','widgets','comissoes']
  LOOP
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS uq_%s_codigo_publico ON public.%I(codigo_publico) WHERE codigo_publico IS NOT NULL', t, t);
  END LOOP;
END $$;

-- Gerador genÃƒÂ©rico: prefixo por tabela + sequence dedicada (concorrente-safe)
CREATE OR REPLACE FUNCTION public.fn_set_codigo_publico()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_seq regclass;
BEGIN
  IF NEW.codigo_publico IS NOT NULL THEN RETURN NEW; END IF;
  CASE TG_TABLE_NAME
    WHEN 'representantes' THEN v_prefix:='REP'; v_seq:='seq_pub_representantes'::regclass;
    -- usuarios tratado no bloco dedicado (proteÃ§Ã£o OWNER)
    WHEN 'clientes'       THEN v_prefix:='ANU'; v_seq:='seq_pub_clientes'::regclass;
    WHEN 'pontos'         THEN v_prefix:='EST'; v_seq:='seq_pub_pontos'::regclass;
    WHEN 'playlists'      THEN v_prefix:='PLY'; v_seq:='seq_pub_playlists'::regclass;
    WHEN 'media'          THEN v_prefix:='MID'; v_seq:='seq_pub_media'::regclass;
    WHEN 'campanhas'      THEN v_prefix:='CAM'; v_seq:='seq_pub_campanhas'::regclass;
    WHEN 'widgets'        THEN v_prefix:='WID'; v_seq:='seq_pub_widgets'::regclass;
    WHEN 'comissoes'      THEN v_prefix:='COM'; v_seq:='seq_pub_comissoes'::regclass;
    ELSE RETURN NEW;
  END CASE;
  NEW.codigo_publico := v_prefix || '-' || LPAD(nextval(v_seq)::text, 6, '0');
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['representantes','clientes','pontos','playlists','media','campanhas','widgets','comissoes']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_codigo_publico ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_codigo_publico BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_set_codigo_publico()', t, t);
  END LOOP;
END $$;

-- BACKFILL determinÃƒÂ­stico (created_at ASC) Ã¢â‚¬â€ transacional por tabela
DO $$
DECLARE t text; p text; s regclass; r record;
BEGIN
  FOREACH t IN ARRAY ARRAY['representantes','clientes','pontos','playlists','media','campanhas','widgets','comissoes']
  LOOP
    CASE t
      WHEN 'representantes' THEN p:='REP'; s:='seq_pub_representantes'::regclass;
      WHEN 'clientes'       THEN p:='ANU'; s:='seq_pub_clientes'::regclass;
      WHEN 'pontos'         THEN p:='EST'; s:='seq_pub_pontos'::regclass;
      WHEN 'playlists'      THEN p:='PLY'; s:='seq_pub_playlists'::regclass;
      WHEN 'media'          THEN p:='MID'; s:='seq_pub_media'::regclass;
      WHEN 'campanhas'      THEN p:='CAM'; s:='seq_pub_campanhas'::regclass;
      WHEN 'widgets'        THEN p:='WID'; s:='seq_pub_widgets'::regclass;
      WHEN 'comissoes'      THEN p:='COM'; s:='seq_pub_comissoes'::regclass;
    END CASE;
    FOR r IN EXECUTE format('SELECT id FROM public.%I WHERE codigo_publico IS NULL ORDER BY created_at ASC', t)
    LOOP
      EXECUTE format('UPDATE public.%I SET codigo_publico=%L WHERE id=$1 AND codigo_publico IS NULL', t, p||'-'||LPAD(nextval(s)::text,6,'0'))
      USING r.id;
    END LOOP;
  END LOOP;

  -- usuarios: triggers de proteÃƒÂ§ÃƒÂ£o do OWNER (prevent_owner_downgrade) disparam
  -- em qualquer UPDATE; backfill tÃƒÂ©cnico desativa APENAS esse trigger,
  -- reativando-o imediatamente (nenhuma lÃƒÂ³gica alterada).
  ALTER TABLE public.usuarios DISABLE TRIGGER trigger_prevent_owner_downgrade;
  FOR r IN SELECT id FROM public.usuarios WHERE codigo_publico IS NULL ORDER BY created_at ASC
  LOOP
    EXECUTE 'UPDATE public.usuarios SET codigo_publico=$2 WHERE id=$1 AND codigo_publico IS NULL'
    USING r.id, 'USU-'||LPAD(nextval('seq_pub_usuarios')::text,6,'0');
  END LOOP;
  ALTER TABLE public.usuarios ENABLE TRIGGER trigger_prevent_owner_downgrade;
END $$;
