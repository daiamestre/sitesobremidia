-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261034
-- FASE 17 FIX (parte 2): scr_select_own com predicado INLINE
--
-- Prova empírica (bissecção): fn_player_can_access_screen(id) retorna TRUE
-- isolada e em SELECT pós-INSERT, MAS dentro da avaliação de RETURNING do
-- próprio INSERT a subquery interna (consulta à mesma tabela) não enxerga
-- a row nova → policy false → 42501 no INSERT..RETURNING do PostgREST
-- (quebra criação de telas pelo Dashboard autenticado).
--
-- CORREÇÃO: substituir o qual da policy de SELECT por predicado inline
-- sobre os campos da própria row (mesma semântica da INSERT policy),
-- eliminando a auto-consulta. RLS permanece ativa e restritiva.
-- fn_player_can_access_screen permanece DEFINER para usos server-side
-- (RPCs do player nativo continuam intactas).
-- ======================================================================
DROP POLICY IF EXISTS scr_select_own ON public.screens;
CREATE POLICY "scr_select_own" ON public.screens
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
