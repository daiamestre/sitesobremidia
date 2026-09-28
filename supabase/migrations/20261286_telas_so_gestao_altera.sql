-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261286 — F-115 (continuação)
-- Causa: scr_update_own / scr_delete_own (fn_player_can_access_screen) liberam alterar/apagar QUALQUER tela
--   da mesma empresa para QUALQUER usuário da empresa — inclusive anunciante e representante. Ao preencher a
--   empresa das telas do dono (20261285), essas telas também ficariam expostas. As telas LED sem dono já estavam.
-- Correção (RESTRICTIVE, só UPDATE/DELETE): anunciante, cliente, parceiro, representante e gestor só alteram/apagam
--   telas que são deles mesmos (user_id = auth.uid()). OWNER, ADMIN e demais perfis internos: sem
--   mudança. Player Android usa RPC SECURITY DEFINER (não passa por esta regra); o Player web grava o sinal
--   da própria tela (user_id do usuário logado).
-- ROLLBACK: DROP POLICY scr_update_so_gestao, scr_delete_so_gestao ON public.screens;
--   DROP FUNCTION public.fn_perfil_sem_gestao_de_telas().
-- ======================================================================
CREATE OR REPLACE FUNCTION public.fn_perfil_sem_gestao_de_telas()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id
                  WHERE u.id = auth.uid() AND NOT coalesce(u.is_owner, false)
                    AND upper(coalesce(p.nome, '')) IN ('ANUNCIANTE', 'CLIENTE', 'PARCEIRO', 'REPRESENTANTE', 'GESTOR'));
$$;
REVOKE ALL ON FUNCTION public.fn_perfil_sem_gestao_de_telas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_perfil_sem_gestao_de_telas() TO authenticated;

DROP POLICY IF EXISTS scr_update_so_gestao ON public.screens;
CREATE POLICY scr_update_so_gestao ON public.screens AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR NOT public.fn_perfil_sem_gestao_de_telas())
  WITH CHECK (user_id = auth.uid() OR NOT public.fn_perfil_sem_gestao_de_telas());
DROP POLICY IF EXISTS scr_delete_so_gestao ON public.screens;
CREATE POLICY scr_delete_so_gestao ON public.screens AS RESTRICTIVE FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR NOT public.fn_perfil_sem_gestao_de_telas());
