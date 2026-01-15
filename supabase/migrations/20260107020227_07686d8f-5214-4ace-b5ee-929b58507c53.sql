-- Remover políticas genéricas de bloqueio anônimo que estão causando exposição
DROP POLICY IF EXISTS "Block anonymous access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Block anonymous access to user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Block anonymous access to media" ON public.media;
DROP POLICY IF EXISTS "Block anonymous access to playlists" ON public.playlists;
DROP POLICY IF EXISTS "Block anonymous access to playlist_items" ON public.playlist_items;
DROP POLICY IF EXISTS "Block anonymous access to screens" ON public.screens;