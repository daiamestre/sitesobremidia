-- F-172: Tabloide Digital — o cliente digita só "produto + preço" e o sistema monta o cartaz com a foto.
--  * tabloide_catalogo: memória de fotos já escolhidas (por anunciante, ou da empresa quando criado pela equipe).
--    A próxima vez que alguém digitar o mesmo produto, a foto já vem pronta, sem buscar de novo.
--  * tabloides: rascunhos dos cartazes (produtos, tema, formato, grade).
-- Segurança: mesmo padrão de cliente_assets (isolado por empresa; anunciante só vê o que é dele).

CREATE TABLE IF NOT EXISTS public.tabloide_catalogo (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id uuid NOT NULL DEFAULT public.get_user_tenant_id(),
  -- NULL = foto da empresa (escolhida pela equipe), vale para todos os anunciantes dela
  cliente_id           uuid,
  nome_norm            text NOT NULL,
  nome                 text NOT NULL,
  imagem_url           text NOT NULL,
  fonte                text NOT NULL DEFAULT 'UPLOAD'
                       CHECK (fonte IN ('OPENFOODFACTS', 'PEXELS', 'PIXABAY', 'UPLOAD')),
  credito              text,
  usos                 integer NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tabloide_catalogo_unico
  ON public.tabloide_catalogo (empresa_operadora_id, coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), nome_norm);
CREATE INDEX IF NOT EXISTS tabloide_catalogo_busca ON public.tabloide_catalogo (empresa_operadora_id, nome_norm);

ALTER TABLE public.tabloide_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY tabloide_catalogo_select ON public.tabloide_catalogo FOR SELECT TO authenticated
  USING (empresa_operadora_id = public.get_user_tenant_id()
         AND (cliente_id IS NULL OR public.is_central_privileged()
              OR cliente_id = (SELECT u.cliente_id FROM public.usuarios u WHERE u.id = auth.uid())));

CREATE POLICY tabloide_catalogo_insert ON public.tabloide_catalogo FOR INSERT TO authenticated
  WITH CHECK (empresa_operadora_id = public.get_user_tenant_id()
              AND ((cliente_id IS NULL AND public.is_central_privileged())
                   OR cliente_id = (SELECT u.cliente_id FROM public.usuarios u WHERE u.id = auth.uid())));

CREATE POLICY tabloide_catalogo_update ON public.tabloide_catalogo FOR UPDATE TO authenticated
  USING (empresa_operadora_id = public.get_user_tenant_id()
         AND ((cliente_id IS NULL AND public.is_central_privileged())
              OR cliente_id = (SELECT u.cliente_id FROM public.usuarios u WHERE u.id = auth.uid())))
  WITH CHECK (empresa_operadora_id = public.get_user_tenant_id());

CREATE POLICY tabloide_catalogo_delete ON public.tabloide_catalogo FOR DELETE TO authenticated
  USING (empresa_operadora_id = public.get_user_tenant_id()
         AND ((cliente_id IS NULL AND public.is_central_privileged())
              OR cliente_id = (SELECT u.cliente_id FROM public.usuarios u WHERE u.id = auth.uid())));

CREATE TABLE IF NOT EXISTS public.tabloides (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id uuid NOT NULL DEFAULT public.get_user_tenant_id(),
  cliente_id           uuid,
  user_id              uuid NOT NULL DEFAULT auth.uid(),
  nome                 text NOT NULL DEFAULT 'Meu tabloide',
  formato              text NOT NULL DEFAULT 'tv-h',
  tema                 text NOT NULL DEFAULT 'ofertao',
  segmento             text NOT NULL DEFAULT 'mercado',
  grade                text NOT NULL DEFAULT 'auto',
  produtos             jsonb NOT NULL DEFAULT '[]'::jsonb,
  config               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

CREATE INDEX IF NOT EXISTS tabloides_dono ON public.tabloides (empresa_operadora_id, user_id, updated_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE public.tabloides ENABLE ROW LEVEL SECURITY;

-- cada pessoa vê e mexe nos próprios; Owner/ADM/Gestor (central) enxergam os da empresa
CREATE POLICY tabloides_select ON public.tabloides FOR SELECT TO authenticated
  USING (empresa_operadora_id = public.get_user_tenant_id() AND (user_id = auth.uid() OR public.is_central_privileged()));
CREATE POLICY tabloides_insert ON public.tabloides FOR INSERT TO authenticated
  WITH CHECK (empresa_operadora_id = public.get_user_tenant_id() AND user_id = auth.uid());
CREATE POLICY tabloides_update ON public.tabloides FOR UPDATE TO authenticated
  USING (empresa_operadora_id = public.get_user_tenant_id() AND (user_id = auth.uid() OR public.is_central_privileged()))
  WITH CHECK (empresa_operadora_id = public.get_user_tenant_id());
CREATE POLICY tabloides_delete ON public.tabloides FOR DELETE TO authenticated
  USING (empresa_operadora_id = public.get_user_tenant_id() AND (user_id = auth.uid() OR public.is_central_privileged()));

CREATE OR REPLACE FUNCTION public.tg_tabloide_atualizado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER tabloides_atualizado BEFORE UPDATE ON public.tabloides FOR EACH ROW EXECUTE FUNCTION public.tg_tabloide_atualizado();
CREATE TRIGGER tabloide_catalogo_atualizado BEFORE UPDATE ON public.tabloide_catalogo FOR EACH ROW EXECUTE FUNCTION public.tg_tabloide_atualizado();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tabloide_catalogo, public.tabloides TO authenticated;
