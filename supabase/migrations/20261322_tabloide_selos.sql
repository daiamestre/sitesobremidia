-- F-177: Tabloide Digital — biblioteca PERMANENTE de selos promocionais 3D (PNG com transparência verdadeira).
--  * Um selo da biblioteca e a instância dele num tabloide são coisas diferentes: apagar a instância nunca apaga o selo
--    (as instâncias moram em tabloides.config.elementos e só guardam uma cópia do endereço da imagem).
--  * Cada selo guarda identificador estável, categoria, dimensões, se a transparência foi validada (canal alfa lido),
--    versão, estado de aprovação, origem e licença. Origem/licença desconhecidas => estado REVISAO, nunca "liberado".
--  * Biblioteca da empresa (cliente_id nulo) é gerida pela central; o anunciante só envia e vê os selos dele.

CREATE TABLE IF NOT EXISTS public.tabloide_selos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id uuid NOT NULL DEFAULT public.get_user_tenant_id(),
  cliente_id           uuid,
  slug                 text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  nome                 text NOT NULL,
  categoria            text NOT NULL,
  titulo               text NOT NULL,
  imagem_url           text NOT NULL CHECK (imagem_url ~ '^https://'),
  mime                 text NOT NULL DEFAULT 'image/png' CHECK (mime IN ('image/png', 'image/webp')),
  largura              integer NOT NULL CHECK (largura BETWEEN 16 AND 8000),
  altura               integer NOT NULL CHECK (altura BETWEEN 16 AND 8000),
  transparente         boolean NOT NULL DEFAULT false,
  versao               integer NOT NULL DEFAULT 1,
  estado               text NOT NULL DEFAULT 'REVISAO' CHECK (estado IN ('APROVADO', 'REVISAO', 'REPROVADO')),
  origem               text NOT NULL,
  licenca              text,
  criado_por           uuid DEFAULT auth.uid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tabloide_selos_unico
  ON public.tabloide_selos (empresa_operadora_id, coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
CREATE INDEX IF NOT EXISTS tabloide_selos_lista ON public.tabloide_selos (empresa_operadora_id, categoria, nome);

ALTER TABLE public.tabloide_selos ENABLE ROW LEVEL SECURITY;

CREATE POLICY tabloide_selos_select ON public.tabloide_selos FOR SELECT TO authenticated
  USING (empresa_operadora_id = public.get_user_tenant_id()
         AND (public.is_central_privileged()
              OR (cliente_id IS NULL AND estado = 'APROVADO')
              OR cliente_id = (SELECT u.cliente_id FROM public.usuarios u WHERE u.id = auth.uid())));

CREATE POLICY tabloide_selos_insert ON public.tabloide_selos FOR INSERT TO authenticated
  WITH CHECK (empresa_operadora_id = public.get_user_tenant_id()
              AND ((cliente_id IS NULL AND public.is_central_privileged())
                   OR (cliente_id = (SELECT u.cliente_id FROM public.usuarios u WHERE u.id = auth.uid()) AND estado IN ('APROVADO', 'REVISAO'))));

CREATE POLICY tabloide_selos_update ON public.tabloide_selos FOR UPDATE TO authenticated
  USING (empresa_operadora_id = public.get_user_tenant_id()
         AND ((cliente_id IS NULL AND public.is_central_privileged())
              OR cliente_id = (SELECT u.cliente_id FROM public.usuarios u WHERE u.id = auth.uid())))
  WITH CHECK (empresa_operadora_id = public.get_user_tenant_id());

CREATE POLICY tabloide_selos_delete ON public.tabloide_selos FOR DELETE TO authenticated
  USING (empresa_operadora_id = public.get_user_tenant_id()
         AND ((cliente_id IS NULL AND public.is_central_privileged())
              OR cliente_id = (SELECT u.cliente_id FROM public.usuarios u WHERE u.id = auth.uid())));

CREATE TRIGGER tabloide_selos_atualizado BEFORE UPDATE ON public.tabloide_selos FOR EACH ROW EXECUTE FUNCTION public.tg_tabloide_atualizado();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tabloide_selos TO authenticated;
