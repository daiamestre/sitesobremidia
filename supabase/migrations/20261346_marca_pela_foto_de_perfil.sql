-- F-204: a logo da empresa no Player/launcher vem também da FOTO DE PERFIL.
-- Antes: só quem tinha "Minha Marca" (gestor_marcas com usar_no_player) recebia a logo; quem só colocou a foto de
-- perfil da empresa continuava com a logo da Sobre Mídia. Agora, sem linha em gestor_marcas, a foto de perfil (https)
-- vira a logo. Quem desligou "usar no Player" na Minha Marca continua com a Sobre Mídia (decisão dele vale).
-- Mesmo formato de resposta (status/nome_marca/logo_url/...): o Player 5.7.10 lê sem mudança.
CREATE OR REPLACE FUNCTION public.fn_player_minha_marca()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    (SELECT jsonb_build_object(
              'status', 'OK',
              'nome_marca', m.nome_marca,
              'slogan', m.slogan,
              'logo_url', coalesce(m.logo_url, CASE WHEN u.avatar_url ~ '^https://' THEN u.avatar_url END),
              'cor_primaria', m.cor_primaria,
              'cor_secundaria', m.cor_secundaria,
              'atualizado_em', greatest(m.updated_at, u.updated_at))
       FROM public.gestor_marcas m
       JOIN public.usuarios u ON u.id = m.usuario_id
      WHERE m.usuario_id = auth.uid() AND m.usar_no_player),
    (SELECT jsonb_build_object(
              'status', 'OK',
              'nome_marca', u.nome,
              'logo_url', u.avatar_url,
              'atualizado_em', u.updated_at)
       FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.avatar_url ~ '^https://'
        AND NOT EXISTS (SELECT 1 FROM public.gestor_marcas m WHERE m.usuario_id = u.id)),
    jsonb_build_object('status', 'PADRAO'));
$function$;
