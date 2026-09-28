-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261278 — F-109
-- Telas de pontos parceiros criadas a partir do cadastro do ponto.
--
-- Regras do proprietário:
--   * representante, OWNER, ADMIN e gestor de mídia cadastram o ponto e CADA
--     tela (local, orientação, tamanho, foto, valor para anunciar);
--   * ao terminar, o sistema cria uma tela PARCEIRA por tela cadastrada,
--     status "AGUARDANDO_GRADE"; criada por gestor → identificação;
--   * só OWNER/ADMIN alteram telas parceiras (valor, grade, ponto...);
--     anunciantes e gestores só consomem.
--
-- Aditivo:
--   screens + tipo_tela ('PROPRIA'|'PARCEIRA', padrão PROPRIA), local_instalacao,
--   foto_local_url, tamanho_polegadas, valor_anuncio, status_grade,
--   cadastrada_por, cadastrada_por_papel.
--   Trava (gatilho) de configuração das telas PARCEIRAS para quem não é
--   OWNER/ADMIN — telemetria do Player (status, ping, memória...) segue livre.
--   Exclusão de tela PARCEIRA só por OWNER/ADMIN (policy RESTRICTIVE).
--   fn_criar_telas_do_ponto(ponto, telas jsonb): cria as telas (idempotente).
-- Player: get_player_playlist_for_screen inalterada; telas próprias idênticas.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS scr_parceira_delete_admin ON public.screens;
--   DROP TRIGGER IF EXISTS trg_screens_parceira_protegida ON public.screens;
--   DROP FUNCTION IF EXISTS public.fn_criar_telas_do_ponto(uuid, jsonb), public.trg_fn_screens_parceira_protegida(),
--     public.fn_eh_owner_ou_admin();
--   ALTER TABLE public.screens DROP COLUMN IF EXISTS tipo_tela, DROP COLUMN IF EXISTS local_instalacao,
--     DROP COLUMN IF EXISTS foto_local_url, DROP COLUMN IF EXISTS tamanho_polegadas, DROP COLUMN IF EXISTS valor_anuncio,
--     DROP COLUMN IF EXISTS status_grade, DROP COLUMN IF EXISTS cadastrada_por, DROP COLUMN IF EXISTS cadastrada_por_papel;
-- ======================================================================

ALTER TABLE public.screens
  ADD COLUMN IF NOT EXISTS tipo_tela text NOT NULL DEFAULT 'PROPRIA' CHECK (tipo_tela IN ('PROPRIA', 'PARCEIRA')),
  ADD COLUMN IF NOT EXISTS local_instalacao text,
  ADD COLUMN IF NOT EXISTS foto_local_url text,
  ADD COLUMN IF NOT EXISTS tamanho_polegadas integer CHECK (tamanho_polegadas IS NULL OR tamanho_polegadas BETWEEN 10 AND 200),
  ADD COLUMN IF NOT EXISTS valor_anuncio numeric(10,2) CHECK (valor_anuncio IS NULL OR valor_anuncio >= 0),
  ADD COLUMN IF NOT EXISTS status_grade text CHECK (status_grade IS NULL OR status_grade IN ('AGUARDANDO_GRADE', 'PRONTA')),
  ADD COLUMN IF NOT EXISTS cadastrada_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cadastrada_por_papel text;
CREATE INDEX IF NOT EXISTS screens_parceiras_idx ON public.screens (ponto_id) WHERE tipo_tela = 'PARCEIRA';

CREATE OR REPLACE FUNCTION public.fn_eh_owner_ou_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id
                  WHERE u.id = auth.uid() AND (u.is_owner OR upper(coalesce(p.nome, '')) IN ('OWNER', 'ADMIN')));
$$;
GRANT EXECUTE ON FUNCTION public.fn_eh_owner_ou_admin() TO authenticated;

-- Trava de configuração das telas parceiras (telemetria do Player continua livre)
CREATE OR REPLACE FUNCTION public.trg_fn_screens_parceira_protegida()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- grade pronta quando recebe playlist
  IF NEW.tipo_tela = 'PARCEIRA' AND NEW.playlist_id IS NOT NULL AND coalesce(NEW.status_grade, '') <> 'PRONTA' THEN
    NEW.status_grade := 'PRONTA';
  ELSIF NEW.tipo_tela = 'PARCEIRA' AND NEW.playlist_id IS NULL THEN
    NEW.status_grade := 'AGUARDANDO_GRADE';
  END IF;

  IF OLD.tipo_tela <> 'PARCEIRA' AND NEW.tipo_tela <> 'PARCEIRA' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR coalesce(current_setting('sobremidia.sistema', true), '') = 'on' OR public.fn_eh_owner_ou_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.ponto_id IS DISTINCT FROM OLD.ponto_id OR NEW.tipo_tela IS DISTINCT FROM OLD.tipo_tela
     OR NEW.valor_anuncio IS DISTINCT FROM OLD.valor_anuncio OR NEW.playlist_id IS DISTINCT FROM OLD.playlist_id
     OR NEW.local_instalacao IS DISTINCT FROM OLD.local_instalacao OR NEW.foto_local_url IS DISTINCT FROM OLD.foto_local_url
     OR NEW.orientation IS DISTINCT FROM OLD.orientation OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.empresa_operadora_id IS DISTINCT FROM OLD.empresa_operadora_id THEN
    RAISE EXCEPTION 'Tela de ponto parceiro: só o dono e os administradores podem alterar.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_screens_parceira_protegida ON public.screens;
CREATE TRIGGER trg_screens_parceira_protegida BEFORE UPDATE ON public.screens
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_screens_parceira_protegida();

DROP POLICY IF EXISTS scr_parceira_delete_admin ON public.screens;
CREATE POLICY scr_parceira_delete_admin ON public.screens AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tipo_tela <> 'PARCEIRA' OR public.fn_eh_owner_ou_admin());

-- Criação das telas do ponto (chamada ao terminar o cadastro)
CREATE OR REPLACE FUNCTION public.fn_criar_telas_do_ponto(p_ponto uuid, p_telas jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_u record;
  v_ponto record;
  v_dono uuid;
  v_t jsonb;
  v_i int := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_local text;
  v_orient text;
  v_valor numeric;
BEGIN
  SELECT u.id, u.nome, u.empresa_operadora_id,
         CASE WHEN u.is_owner THEN 'OWNER' ELSE upper(coalesce(p.nome, '')) END AS papel
    INTO v_u FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id WHERE u.id = auth.uid();
  IF v_u.id IS NULL OR v_u.papel NOT IN ('OWNER', 'ADMIN', 'REPRESENTANTE', 'GESTOR', 'GESTOR_MIDIAS') THEN
    RAISE EXCEPTION 'Sem permissão para cadastrar telas de ponto parceiro.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ponto FROM public.pontos WHERE id = p_ponto AND empresa_operadora_id = v_u.empresa_operadora_id AND deleted_at IS NULL;
  IF v_ponto.id IS NULL THEN RAISE EXCEPTION 'Ponto parceiro não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF jsonb_typeof(p_telas) <> 'array' OR jsonb_array_length(p_telas) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma tela.' USING ERRCODE = '22023';
  END IF;

  -- idempotente: o ponto já tem telas parceiras → devolve as existentes
  IF EXISTS (SELECT 1 FROM public.screens WHERE ponto_id = p_ponto AND tipo_tela = 'PARCEIRA') THEN
    RETURN jsonb_build_object('status', 'JA_EXISTIAM',
      'telas', (SELECT jsonb_agg(id) FROM public.screens WHERE ponto_id = p_ponto AND tipo_tela = 'PARCEIRA'));
  END IF;

  -- a tela pertence à empresa (dono do tenant), não a quem cadastrou
  SELECT id INTO v_dono FROM public.usuarios WHERE empresa_operadora_id = v_u.empresa_operadora_id AND is_owner ORDER BY created_at LIMIT 1;

  PERFORM set_config('sobremidia.sistema', 'on', true);
  FOR v_t IN SELECT * FROM jsonb_array_elements(p_telas) LOOP
    v_i := v_i + 1;
    v_local := nullif(btrim(coalesce(v_t->>'local', '')), '');
    v_orient := CASE WHEN lower(coalesce(v_t->>'orientacao', '')) IN ('portrait', 'vertical', 'em_pe') THEN 'portrait' ELSE 'landscape' END;
    v_valor := nullif(v_t->>'valor', '')::numeric;
    INSERT INTO public.screens (name, description, user_id, empresa_operadora_id, orientation, resolution, is_active,
                                ponto_id, tipo_tela, local_instalacao, foto_local_url, tamanho_polegadas, valor_anuncio,
                                status_grade, criada_por_gestor, cadastrada_por, cadastrada_por_papel,
                                endereco_instalacao, cidade, estado, capa_url, location)
    VALUES (left(v_ponto.nome || ' — Tela ' || v_i || coalesce(' · ' || v_local, ''), 120),
            'Tela do ponto parceiro ' || v_ponto.nome,
            coalesce(v_dono, auth.uid()), v_u.empresa_operadora_id, v_orient,
            CASE WHEN v_orient = 'portrait' THEN '1080x1920' ELSE '1920x1080' END, true,
            v_ponto.id, 'PARCEIRA', v_local, nullif(v_t->>'foto_url', ''), nullif(v_t->>'polegadas', '')::int, v_valor,
            'AGUARDANDO_GRADE', v_u.papel IN ('GESTOR', 'GESTOR_MIDIAS'), v_u.id, v_u.papel,
            concat_ws(', ', v_ponto.logradouro, v_ponto.numero, v_ponto.bairro), coalesce(v_ponto.cidade, ''), coalesce(v_ponto.estado, ''),
            nullif(v_t->>'foto_url', ''), v_local)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END LOOP;
  PERFORM set_config('sobremidia.sistema', '', true);

  -- ficha do ponto: quantidade, onde ficam as telas, valor "a partir de", fotos das telas na galeria
  UPDATE public.pontos po SET
    quantidade_telas = v_i,
    onde_ficam_as_telas = (SELECT jsonb_agg(jsonb_build_object('local', coalesce(nullif(t->>'local', ''), 'Tela ' || o),
                                                               'detalhe', nullif(t->>'detalhe', '')) ORDER BY o)
                             FROM jsonb_array_elements(p_telas) WITH ORDINALITY AS x(t, o)),
    valor_anuncio = coalesce((SELECT min(nullif(t->>'valor', '')::numeric) FROM jsonb_array_elements(p_telas) t), po.valor_anuncio),
    galeria = coalesce(po.galeria, '[]'::jsonb) || coalesce((
      SELECT jsonb_agg(jsonb_build_object('url', t->>'foto_url', 'legenda', coalesce(nullif(t->>'local', ''), 'Tela ' || o)))
        FROM jsonb_array_elements(p_telas) WITH ORDINALITY AS x(t, o) WHERE nullif(t->>'foto_url', '') IS NOT NULL), '[]'::jsonb),
    updated_at = now()
  WHERE po.id = v_ponto.id;

  RETURN jsonb_build_object('status', 'OK', 'telas', to_jsonb(v_ids), 'quantidade', v_i);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_criar_telas_do_ponto(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_criar_telas_do_ponto(uuid, jsonb) TO authenticated;
