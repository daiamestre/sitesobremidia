-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261271 — F-103
-- Brand Kit do Gestor de Mídias ("Minha Marca") + marca no Player pelo login.
--
-- Regra do proprietário: o Brand Kit NÃO é do anunciante; é do Gestor de
-- Mídias, que trabalha como afiliado usando o sistema. Ele cadastra logo,
-- cores e nome da empresa dele; quando ELE faz login no Player Android, o
-- Player passa a mostrar a marca dele (abertura, seleção de tela,
-- sincronização, espera e bloqueio). Sem marca cadastrada → SOBRE MÍDIA.
--
-- Aditiva: tabela nova gestor_marcas (1 linha por usuário) + RPCs.
--   * o próprio usuário lê/grava a sua marca (RLS);
--   * OWNER/ADMIN do tenant leem (suporte);
--   * fn_player_minha_marca(): o Player (sessão do usuário que logou)
--     recebe a marca; status 'PADRAO' quando não houver.
-- Contrato do Player: JSON {status, nome_marca, logo_url, cor_primaria,
--   cor_secundaria, slogan, atualizado_em}. Campos opcionais; Player antigo
--   não chama esta função (sem impacto na frota atual).
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.fn_player_minha_marca();
--   DROP TABLE IF EXISTS public.gestor_marcas;
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.gestor_marcas (
  usuario_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa_operadora_id uuid NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  nome_marca text NOT NULL CHECK (length(btrim(nome_marca)) BETWEEN 2 AND 80),
  slogan text CHECK (slogan IS NULL OR length(slogan) <= 120),
  logo_url text CHECK (logo_url IS NULL OR logo_url ~ '^https://'),
  cor_primaria text NOT NULL DEFAULT '#7C3AED' CHECK (cor_primaria ~ '^#[0-9A-Fa-f]{6}$'),
  cor_secundaria text NOT NULL DEFAULT '#0F172A' CHECK (cor_secundaria ~ '^#[0-9A-Fa-f]{6}$'),
  usar_no_player boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gestor_marcas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gm_select ON public.gestor_marcas;
CREATE POLICY gm_select ON public.gestor_marcas FOR SELECT TO authenticated
  USING (
    usuario_id = auth.uid()
    OR (public.suporte_eh_atendente() AND empresa_operadora_id = public.get_user_tenant_id())
  );

DROP POLICY IF EXISTS gm_insert ON public.gestor_marcas;
CREATE POLICY gm_insert ON public.gestor_marcas FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid() AND empresa_operadora_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS gm_update ON public.gestor_marcas;
CREATE POLICY gm_update ON public.gestor_marcas FOR UPDATE TO authenticated
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid() AND empresa_operadora_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS gm_delete ON public.gestor_marcas;
CREATE POLICY gm_delete ON public.gestor_marcas FOR DELETE TO authenticated
  USING (usuario_id = auth.uid());

REVOKE ALL ON public.gestor_marcas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gestor_marcas TO authenticated;

CREATE OR REPLACE FUNCTION public.gestor_marcas_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS gestor_marcas_touch ON public.gestor_marcas;
CREATE TRIGGER gestor_marcas_touch BEFORE UPDATE ON public.gestor_marcas
  FOR EACH ROW EXECUTE FUNCTION public.gestor_marcas_touch();

-- Marca que o Player deve mostrar para quem está logado nele
CREATE OR REPLACE FUNCTION public.fn_player_minha_marca()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object(
              'status', 'OK',
              'nome_marca', m.nome_marca,
              'slogan', m.slogan,
              'logo_url', m.logo_url,
              'cor_primaria', m.cor_primaria,
              'cor_secundaria', m.cor_secundaria,
              'atualizado_em', m.updated_at)
       FROM public.gestor_marcas m
      WHERE m.usuario_id = auth.uid() AND m.usar_no_player),
    jsonb_build_object('status', 'PADRAO'));
$$;
REVOKE ALL ON FUNCTION public.fn_player_minha_marca() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_player_minha_marca() TO authenticated;
