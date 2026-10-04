-- F-144 — Minha Marca: a imagem que o Player mostra depois do login é o logo da marca; quando a marca não tem logo,
-- vale a foto de perfil do próprio usuário. A foto de capa (usuarios.capa_url, F-134) NÃO vai para o Player: ela só
-- aparece em "Meu Perfil" e em "Minha Marca".
-- Aditiva: mesma função, mesmos campos (contrato do Player 5.6.9 inalterado). Player antigo não chama esta função.
-- ROLLBACK: reaplicar a definição da migração 20261271 (logo_url = m.logo_url).
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
              'logo_url', coalesce(m.logo_url, CASE WHEN u.avatar_url ~ '^https://' THEN u.avatar_url END),
              'cor_primaria', m.cor_primaria,
              'cor_secundaria', m.cor_secundaria,
              'atualizado_em', greatest(m.updated_at, u.updated_at))
       FROM public.gestor_marcas m
       JOIN public.usuarios u ON u.id = m.usuario_id
      WHERE m.usuario_id = auth.uid() AND m.usar_no_player),
    jsonb_build_object('status', 'PADRAO'));
$$;
REVOKE ALL ON FUNCTION public.fn_player_minha_marca() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_player_minha_marca() TO authenticated;
