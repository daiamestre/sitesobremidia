-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261285 — F-115
-- Pedido e autorização explícita do proprietário (29/09/2026): "Autorizo o ADMIN a ver e editar as playlists e
-- mídias da empresa" — neste assunto o ADMIN tem as mesmas permissões do OWNER.
--
-- Causa: (1) telas antigas foram criadas sem empresa_operadora_id → só o próprio dono as enxergava;
--        (2) playlists, itens, mídias, widgets e links são estritamente "do próprio usuário" → o ADMIN
--            não conseguia montar a programação das telas do dono.
-- Mudanças (ADITIVAS; nenhuma permissão existente é removida):
--   * preenche a empresa das telas sem empresa com a empresa do dono da tela (sem disparar o gatilho de
--     "sinal", para não marcar telas como online);
--   * telas novas nascem com a empresa do dono (gatilho BEFORE INSERT, só quando vier vazia);
--   * fn_admin_da_empresa_do_usuario(p_user): o chamador é OWNER/ADMIN e p_user é da MESMA empresa;
--   * políticas novas para OWNER/ADMIN da mesma empresa: playlists (ver/editar), playlist_items (tudo),
--     media/widgets/external_links (ver).
-- Player: get_player_playlist_for_screen usa a empresa da tela só na trava de expansão de telas com ponto
--   (as telas preenchidas não têm ponto) e na checagem de dono (o dono já é da mesma empresa) → sem efeito.
-- ROLLBACK: DROP POLICY dos nomes "empresa_admin_*"; DROP TRIGGER trg_screens_empresa_padrao ON screens;
--   DROP FUNCTION fn_admin_da_empresa_do_usuario, trg_fn_screens_empresa_padrao;
--   UPDATE screens SET empresa_operadora_id = NULL WHERE id IN (lista em docs/engineering/evidence/F-115/).
-- ======================================================================

-- 1) Empresa nas telas antigas (sem disparar o gatilho que marca "visto agora")
ALTER TABLE public.screens DISABLE TRIGGER tr_screens_universal_heartbeat;
UPDATE public.screens s
   SET empresa_operadora_id = u.empresa_operadora_id
  FROM public.usuarios u
 WHERE s.user_id = u.id AND s.empresa_operadora_id IS NULL AND u.empresa_operadora_id IS NOT NULL;
ALTER TABLE public.screens ENABLE TRIGGER tr_screens_universal_heartbeat;

-- 2) Telas novas nascem com a empresa do dono
CREATE OR REPLACE FUNCTION public.trg_fn_screens_empresa_padrao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.empresa_operadora_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT u.empresa_operadora_id INTO NEW.empresa_operadora_id FROM public.usuarios u WHERE u.id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_screens_empresa_padrao ON public.screens;
CREATE TRIGGER trg_screens_empresa_padrao BEFORE INSERT ON public.screens
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_screens_empresa_padrao();

-- 3) OWNER/ADMIN do chamador sobre conteúdo de usuários da mesma empresa
CREATE OR REPLACE FUNCTION public.fn_admin_da_empresa_do_usuario(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_user IS NOT NULL AND public.fn_eh_owner_ou_admin() AND EXISTS (
    SELECT 1 FROM public.usuarios alvo
     WHERE alvo.id = p_user
       AND alvo.empresa_operadora_id IS NOT NULL
       AND alvo.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.fn_admin_da_empresa_do_usuario(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_admin_da_empresa_do_usuario(uuid) TO authenticated;

DROP POLICY IF EXISTS empresa_admin_select ON public.playlists;
CREATE POLICY empresa_admin_select ON public.playlists FOR SELECT TO authenticated
  USING (public.fn_admin_da_empresa_do_usuario(user_id));
DROP POLICY IF EXISTS empresa_admin_update ON public.playlists;
CREATE POLICY empresa_admin_update ON public.playlists FOR UPDATE TO authenticated
  USING (public.fn_admin_da_empresa_do_usuario(user_id)) WITH CHECK (public.fn_admin_da_empresa_do_usuario(user_id));

DROP POLICY IF EXISTS empresa_admin_all ON public.playlist_items;
CREATE POLICY empresa_admin_all ON public.playlist_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND public.fn_admin_da_empresa_do_usuario(p.user_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND public.fn_admin_da_empresa_do_usuario(p.user_id)));

DROP POLICY IF EXISTS empresa_admin_select ON public.media;
CREATE POLICY empresa_admin_select ON public.media FOR SELECT TO authenticated
  USING (public.fn_admin_da_empresa_do_usuario(user_id));
DROP POLICY IF EXISTS empresa_admin_select ON public.widgets;
CREATE POLICY empresa_admin_select ON public.widgets FOR SELECT TO authenticated
  USING (public.fn_admin_da_empresa_do_usuario(user_id));
DROP POLICY IF EXISTS empresa_admin_select ON public.external_links;
CREATE POLICY empresa_admin_select ON public.external_links FOR SELECT TO authenticated
  USING (public.fn_admin_da_empresa_do_usuario(user_id));
