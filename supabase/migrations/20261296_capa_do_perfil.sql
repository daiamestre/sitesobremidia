-- F-134 — Foto de capa do perfil (dono e administrador). A foto de perfil (avatar_url) já existia.
-- A capa só aparece na página "Meu Perfil"; o arquivo fica no balde "avatars", na pasta do próprio usuário
-- (as regras do balde já limitam envio/remoção à pasta de quem está logado).
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS capa_url text;
COMMENT ON COLUMN public.usuarios.capa_url IS 'F-134: imagem de capa mostrada só na página Meu Perfil.';
