-- F-135 — Exclusões que existiam no painel mas não funcionavam.
-- Achados:
--   * screen_schedules (agenda de horários da tela): proteção ligada e NENHUMA regra → criar, listar e apagar horário
--     nunca funcionou para ninguém pelo painel.
--   * ADMIN não conseguia apagar mídias, playlists, widgets e links da empresa (as regras só deixavam o próprio autor);
--     o painel dizia "excluído" e nada acontecia.
--   * Vínculos que travavam a exclusão com erro: playlist em uso num aparelho, tela citada num pedido de inserção e
--     produto dentro de uma oferta.

-- 1) Agenda da tela: quem enxerga a tela gerencia os horários dela; perfil sem gestão das telas da empresa só nas próprias.
DROP POLICY IF EXISTS agenda_da_tela ON public.screen_schedules;
CREATE POLICY agenda_da_tela ON public.screen_schedules FOR ALL TO authenticated
  USING (public.fn_player_can_access_screen(screen_id)
         AND (NOT public.fn_perfil_sem_gestao_de_telas()
              OR EXISTS (SELECT 1 FROM public.screens s WHERE s.id = screen_schedules.screen_id AND s.user_id = auth.uid())))
  WITH CHECK (public.fn_player_can_access_screen(screen_id)
         AND (NOT public.fn_perfil_sem_gestao_de_telas()
              OR EXISTS (SELECT 1 FROM public.screens s WHERE s.id = screen_schedules.screen_id AND s.user_id = auth.uid())));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.screen_schedules TO authenticated;

-- 2) Dono/administrador apagam (e alteram) o conteúdo da própria empresa.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['media', 'playlists', 'widgets', 'external_links']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS empresa_admin_delete ON public.%I', t);
    EXECUTE format('CREATE POLICY empresa_admin_delete ON public.%I FOR DELETE TO authenticated USING (public.fn_admin_da_empresa_do_usuario(user_id))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['media', 'widgets', 'external_links']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS empresa_admin_update ON public.%I', t);
    EXECUTE format('CREATE POLICY empresa_admin_update ON public.%I FOR UPDATE TO authenticated USING (public.fn_admin_da_empresa_do_usuario(user_id)) WITH CHECK (public.fn_admin_da_empresa_do_usuario(user_id))', t);
  END LOOP;
END $$;

-- 3) Vínculos que travavam a exclusão.
--    Playlist apagada: o aparelho só fica sem "playlist atual" (o Player recebe a programação pela consulta de sempre).
ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_current_playlist_id_fkey;
ALTER TABLE public.devices ADD CONSTRAINT devices_current_playlist_id_fkey
  FOREIGN KEY (current_playlist_id) REFERENCES public.playlists(id) ON DELETE SET NULL;
--    Tela apagada: o local do pedido de inserção continua, sem a tela.
ALTER TABLE public.pi_locais DROP CONSTRAINT IF EXISTS pi_locais_tela_id_fkey;
ALTER TABLE public.pi_locais ADD CONSTRAINT pi_locais_tela_id_fkey
  FOREIGN KEY (tela_id) REFERENCES public.screens(id) ON DELETE SET NULL;
--    Produto apagado: sai das ofertas em que estava.
ALTER TABLE public.oferta_itens DROP CONSTRAINT IF EXISTS oferta_itens_produto_id_fkey;
ALTER TABLE public.oferta_itens ADD CONSTRAINT oferta_itens_produto_id_fkey
  FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE CASCADE;
