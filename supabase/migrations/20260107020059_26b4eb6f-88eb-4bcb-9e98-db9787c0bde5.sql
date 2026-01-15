-- Bloquear acesso anônimo à tabela profiles
CREATE POLICY "Block anonymous access to profiles"
ON public.profiles FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Bloquear acesso anônimo à tabela user_roles
CREATE POLICY "Block anonymous access to user_roles"
ON public.user_roles FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Bloquear acesso anônimo à tabela media
CREATE POLICY "Block anonymous access to media"
ON public.media FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Bloquear acesso anônimo à tabela playlists
CREATE POLICY "Block anonymous access to playlists"
ON public.playlists FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Bloquear acesso anônimo à tabela playlist_items
CREATE POLICY "Block anonymous access to playlist_items"
ON public.playlist_items FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Bloquear acesso anônimo à tabela screens
CREATE POLICY "Block anonymous access to screens"
ON public.screens FOR SELECT
USING (auth.uid() IS NOT NULL);