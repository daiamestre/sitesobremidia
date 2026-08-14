DROP POLICY IF EXISTS p_representantes_self_or_admin ON public.representantes; 
CREATE POLICY p_representantes_self_or_admin ON public.representantes 
FOR ALL TO authenticated 
USING (usuario_id = auth.uid() OR EXISTS (SELECT 1 FROM public.usuarios u JOIN public.perfis p ON p.id = u.perfil_id WHERE u.id = auth.uid() AND p.nome = 'ADMIN'));
