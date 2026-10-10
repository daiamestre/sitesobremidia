-- F-179: Cartaz Digital — um caminho só para logos e temas, perfil da loja, cartazes publicados no portal.
--  * A biblioteca (tabloide_selos) passa a guardar também a LOGO DA MARCA e os TEMAS (fotos de fundo);
--    os selos simples desenhados em código saem de vez (pedido do dono). JPG entra (tema é foto, não precisa de transparência).
--  * tabloide_perfil: os dados da loja (telefone, endereço, redes...), fontes e logo valem para os próximos cartazes
--    e alimentam o portal público de ofertas (endereço próprio, só o que o dono mandar mostrar).
--  * tabloides: marca de "publicado no portal" com as imagens já prontas.

-- 1) biblioteca ---------------------------------------------------------------
DELETE FROM public.tabloide_selos WHERE tipo = 'SELO';

ALTER TABLE public.tabloide_selos DROP CONSTRAINT IF EXISTS tabloide_selos_tipo_check;
ALTER TABLE public.tabloide_selos ADD CONSTRAINT tabloide_selos_tipo_check CHECK (tipo IN ('LOGO_CABECALHO', 'LOGO_MARCA', 'TEMA'));
ALTER TABLE public.tabloide_selos ALTER COLUMN tipo SET DEFAULT 'LOGO_CABECALHO';
ALTER TABLE public.tabloide_selos DROP CONSTRAINT IF EXISTS tabloide_selos_mime_check;
ALTER TABLE public.tabloide_selos ADD CONSTRAINT tabloide_selos_mime_check CHECK (mime IN ('image/png', 'image/webp', 'image/jpeg'));

-- quem não é anunciante nem da central (ex.: funcionário) também guarda as próprias logos/temas: dono = quem enviou
ALTER TABLE public.tabloide_selos ADD COLUMN IF NOT EXISTS dono_id uuid;

DROP POLICY IF EXISTS tabloide_selos_select ON public.tabloide_selos;
CREATE POLICY tabloide_selos_select ON public.tabloide_selos FOR SELECT TO authenticated
  USING (empresa_operadora_id = public.get_user_tenant_id()
         AND (public.is_central_privileged()
              OR (cliente_id IS NULL AND dono_id IS NULL AND estado = 'APROVADO')
              OR dono_id = auth.uid()
              OR cliente_id = (SELECT u.cliente_id FROM public.usuarios u WHERE u.id = auth.uid())));

DROP POLICY IF EXISTS tabloide_selos_insert ON public.tabloide_selos;
CREATE POLICY tabloide_selos_insert ON public.tabloide_selos FOR INSERT TO authenticated
  WITH CHECK (empresa_operadora_id = public.get_user_tenant_id()
              AND estado IN ('APROVADO', 'REVISAO')
              AND ((cliente_id IS NULL AND dono_id IS NULL AND public.is_central_privileged())
                   OR (dono_id = auth.uid() AND (cliente_id IS NULL OR cliente_id = (SELECT u.cliente_id FROM public.usuarios u WHERE u.id = auth.uid())))));

DROP POLICY IF EXISTS tabloide_selos_update ON public.tabloide_selos;
CREATE POLICY tabloide_selos_update ON public.tabloide_selos FOR UPDATE TO authenticated
  USING (empresa_operadora_id = public.get_user_tenant_id()
         AND ((cliente_id IS NULL AND dono_id IS NULL AND public.is_central_privileged()) OR dono_id = auth.uid()))
  WITH CHECK (empresa_operadora_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS tabloide_selos_delete ON public.tabloide_selos;
CREATE POLICY tabloide_selos_delete ON public.tabloide_selos FOR DELETE TO authenticated
  USING (empresa_operadora_id = public.get_user_tenant_id()
         AND ((cliente_id IS NULL AND dono_id IS NULL AND public.is_central_privileged()) OR dono_id = auth.uid()));

DROP INDEX IF EXISTS public.tabloide_selos_unico;
CREATE UNIQUE INDEX tabloide_selos_unico ON public.tabloide_selos
  (empresa_operadora_id, coalesce(dono_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

-- 2) perfil da loja -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tabloide_perfil (
  user_id              uuid PRIMARY KEY DEFAULT auth.uid(),
  empresa_operadora_id uuid NOT NULL DEFAULT public.get_user_tenant_id(),
  cliente_id           uuid,
  dados                jsonb NOT NULL DEFAULT '{}'::jsonb,
  slug                 text UNIQUE CHECK (slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  cep                  text CHECK (cep IS NULL OR cep ~ '^[0-9]{5}-?[0-9]{3}$'),
  segmentos            text[] NOT NULL DEFAULT '{}' CHECK (coalesce(array_length(segmentos, 1), 0) <= 3),
  visivel              boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tabloide_perfil ENABLE ROW LEVEL SECURITY;
CREATE POLICY tabloide_perfil_dono ON public.tabloide_perfil FOR ALL TO authenticated
  USING (user_id = auth.uid() AND empresa_operadora_id = public.get_user_tenant_id())
  WITH CHECK (user_id = auth.uid() AND empresa_operadora_id = public.get_user_tenant_id());
CREATE TRIGGER tabloide_perfil_atualizado BEFORE UPDATE ON public.tabloide_perfil FOR EACH ROW EXECUTE FUNCTION public.tg_tabloide_atualizado();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tabloide_perfil TO authenticated;

-- 3) cartaz publicado no portal ----------------------------------------------
ALTER TABLE public.tabloides
  ADD COLUMN IF NOT EXISTS publicado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS imagens_publicadas text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS publicado_em timestamptz;

-- Portal público: devolve a loja (só os campos que o dono mandou mostrar) e os cartazes publicados e ainda válidos.
-- Loja oculta, endereço inexistente ou cartaz não publicado => nada.
CREATE OR REPLACE FUNCTION public.tabloide_portal(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.tabloide_perfil%ROWTYPE;
  v_empresa jsonb;
  v_cartazes jsonb;
BEGIN
  IF p_slug IS NULL OR lower(p_slug) !~ '^[a-z0-9][a-z0-9-]{2,40}$' THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.tabloide_perfil WHERE slug = lower(p_slug) AND visivel;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_object_agg(e.k, e.v), '{}'::jsonb) INTO v_empresa
    FROM jsonb_each_text(coalesce(p.dados -> 'empresa', '{}'::jsonb)) AS e(k, v)
   WHERE e.v <> '' AND coalesce((p.dados -> 'mostrar' ->> e.k)::boolean, false);

  SELECT coalesce(jsonb_agg(c ORDER BY (c ->> 'publicado_em') DESC), '[]'::jsonb) INTO v_cartazes
    FROM (
      SELECT jsonb_build_object(
               'id', t.id, 'nome', t.nome, 'imagens', to_jsonb(t.imagens_publicadas),
               'inicio', t.config -> 'regras' ->> 'inicio', 'fim', t.config -> 'regras' ->> 'fim',
               'publicado_em', t.publicado_em) AS c
        FROM public.tabloides t
       WHERE t.user_id = p.user_id AND t.publicado AND t.deleted_at IS NULL
         AND coalesce(array_length(t.imagens_publicadas, 1), 0) > 0
         AND (coalesce(t.config -> 'regras' ->> 'fim', '') !~ '^\d{4}-\d{2}-\d{2}$'
              OR (t.config -> 'regras' ->> 'fim')::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
       ORDER BY t.publicado_em DESC NULLS LAST
       LIMIT 30
    ) x;

  RETURN jsonb_build_object(
    'slug', p.slug, 'segmentos', to_jsonb(p.segmentos), 'empresa', v_empresa,
    'logo', CASE WHEN coalesce((p.dados ->> 'mostrarLogo')::boolean, true) THEN p.dados ->> 'logoMarcaUrl' ELSE NULL END,
    'cartazes', v_cartazes);
END $$;

REVOKE ALL ON FUNCTION public.tabloide_portal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tabloide_portal(text) TO anon, authenticated;
