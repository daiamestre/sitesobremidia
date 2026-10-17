-- F-190 — Visão das Contas: o dono (OWNER) e o ADM enxergam o que cada usuário da empresa tem e faz.
--
-- Pedido do dono: cada usuário (gestor de mídia, anunciante, representante) vê só as próprias informações (migração
-- 20261330), mas o dono e o ADM precisam de visibilidade total, conta por conta: telas, telas online, playlists, mídias,
-- espaço usado, exibições, pontos parceiros, campanhas, contratos e carteira de clientes.
--
-- Só leitura (SECURITY DEFINER com trava): responde apenas a quem é dono, perfil OWNER/ADMIN ou papel admin, e só
-- com as contas da MESMA empresa operadora de quem pergunta. Para qualquer outro perfil devolve SEM_PERMISSAO.
-- Player: não usa estas funções.
-- ROLLBACK: DROP FUNCTION public.fn_visao_contas(); DROP FUNCTION public.fn_visao_conta_detalhe(uuid);
--           DROP FUNCTION public.fn_pode_ver_todas_as_contas();

CREATE OR REPLACE FUNCTION public.fn_pode_ver_todas_as_contas()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id
             WHERE u.id = auth.uid() AND u.deleted_at IS NULL
               AND (coalesce(u.is_owner, false) OR upper(coalesce(p.nome, '')) IN ('OWNER', 'ADMIN')))
    OR public.has_role(auth.uid(), 'admin'::app_role));
$$;
REVOKE ALL ON FUNCTION public.fn_pode_ver_todas_as_contas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pode_ver_todas_as_contas() TO authenticated, service_role;

-- Resumo de todas as contas da empresa
CREATE OR REPLACE FUNCTION public.fn_visao_contas()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_empresa uuid;
BEGIN
  IF NOT public.fn_pode_ver_todas_as_contas() THEN
    RETURN jsonb_build_object('status', 'SEM_PERMISSAO');
  END IF;
  SELECT empresa_operadora_id INTO v_empresa FROM public.usuarios WHERE id = auth.uid();

  RETURN jsonb_build_object('status', 'OK', 'gerado_em', now(), 'contas', coalesce((
    SELECT jsonb_agg(c ORDER BY c->>'perfil', c->>'nome')
      FROM (
        SELECT jsonb_build_object(
          'id', u.id,
          'nome', u.nome,
          'email', u.email,
          'perfil', upper(coalesce(p.nome, CASE WHEN u.is_owner THEN 'OWNER' END, 'SEM PERFIL')),
          'situacao', coalesce(u.status_ciclo_vida, u.status),
          'ativo', coalesce(u.ativo, true),
          'criado_em', u.created_at,
          'ultimo_acesso', (SELECT au.last_sign_in_at FROM auth.users au WHERE au.id = u.id),
          'telas', t.total,
          'telas_online', t.online,
          'telas_sem_playlist', t.sem_playlist,
          'playlists', (SELECT count(*) FROM public.playlists pl WHERE pl.user_id = u.id),
          'midias', m.total,
          'espaco_bytes', m.bytes,
          'exibicoes_7d', (SELECT count(*) FROM public.playback_logs lg
                            WHERE lg.started_at > now() - interval '7 days'
                              AND lg.screen_id IN (SELECT s.id::text FROM public.screens s WHERE s.user_id = u.id)),
          'pontos', CASE WHEN upper(coalesce(p.nome, '')) IN ('ANUNCIANTE', 'CLIENTE')
                         THEN (SELECT count(DISTINCT cp.ponto_id) FROM public.cliente_pontos cp WHERE u.cliente_id IS NOT NULL AND cp.cliente_id = u.cliente_id)
                         ELSE (SELECT count(*) FROM public.pontos po
                                WHERE po.deleted_at IS NULL
                                  AND (po.created_by = u.id OR po.id IN (SELECT s.ponto_id FROM public.screens s WHERE s.user_id = u.id)))
                    END,
          'campanhas', (SELECT count(*) FROM public.campanhas ca WHERE ca.deleted_at IS NULL AND u.cliente_id IS NOT NULL AND ca.cliente_id = u.cliente_id),
          'contratos', (SELECT count(*) FROM public.contratos co
                         WHERE co.deleted_at IS NULL
                           AND ((u.cliente_id IS NOT NULL AND co.cliente_id = u.cliente_id)
                             OR co.gestor_usuario_id = u.id
                             OR co.representante_id IN (SELECT r.id FROM public.representantes r WHERE r.usuario_id = u.id))),
          'clientes_carteira', (SELECT count(*) FROM public.clientes cl
                                 WHERE cl.representante_id IN (SELECT r.id FROM public.representantes r WHERE r.usuario_id = u.id))
        ) AS c
          FROM public.usuarios u
          LEFT JOIN public.perfis p ON p.id = u.perfil_id
          LEFT JOIN LATERAL (
            SELECT count(*) AS total,
                   count(*) FILTER (WHERE s.bound_device_id IS NOT NULL AND s.last_ping_at > now() - interval '10 minutes') AS online,
                   count(*) FILTER (WHERE s.playlist_id IS NULL) AS sem_playlist
              FROM public.screens s WHERE s.user_id = u.id) t ON true
          LEFT JOIN LATERAL (
            SELECT count(*) AS total, coalesce(sum(md.file_size), 0) AS bytes
              FROM public.media md WHERE md.user_id = u.id AND NOT coalesce(md.biblioteca, false)) m ON true
         WHERE u.deleted_at IS NULL
           AND (u.empresa_operadora_id = v_empresa OR v_empresa IS NULL)
      ) x), '[]'::jsonb));
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_visao_contas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_visao_contas() TO authenticated, service_role;

-- Detalhe de uma conta: telas, playlists, mídias, pontos, campanhas e contratos
CREATE OR REPLACE FUNCTION public.fn_visao_conta_detalhe(p_usuario uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_empresa uuid;
  v_alvo record;
BEGIN
  IF NOT public.fn_pode_ver_todas_as_contas() THEN
    RETURN jsonb_build_object('status', 'SEM_PERMISSAO');
  END IF;
  SELECT empresa_operadora_id INTO v_empresa FROM public.usuarios WHERE id = auth.uid();
  SELECT u.*, upper(coalesce(p.nome, '')) AS perfil_nome INTO v_alvo
    FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id
   WHERE u.id = p_usuario AND u.deleted_at IS NULL;
  IF NOT FOUND OR (v_empresa IS NOT NULL AND v_alvo.empresa_operadora_id IS DISTINCT FROM v_empresa) THEN
    RETURN jsonb_build_object('status', 'CONTA_NAO_ENCONTRADA');
  END IF;

  RETURN jsonb_build_object(
    'status', 'OK',
    'telas', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'id', s.id, 'nome', s.name, 'cidade', s.cidade, 'uf', s.estado,
                 'online', (s.bound_device_id IS NOT NULL AND s.last_ping_at > now() - interval '10 minutes'),
                 'conectada', s.bound_device_id IS NOT NULL,
                 'ultimo_sinal', s.last_ping_at, 'app', s.app_version,
                 'playlist', (SELECT pl.name FROM public.playlists pl WHERE pl.id = s.playlist_id)) ORDER BY s.name)
               FROM public.screens s WHERE s.user_id = p_usuario), '[]'::jsonb),
    'playlists', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'id', pl.id, 'nome', pl.name, 'formato', pl.resolution, 'atualizada_em', pl.updated_at,
                 'itens', (SELECT count(*) FROM public.playlist_items pi WHERE pi.playlist_id = pl.id),
                 'telas', (SELECT count(*) FROM public.screens s WHERE s.playlist_id = pl.id)) ORDER BY pl.name)
               FROM public.playlists pl WHERE pl.user_id = p_usuario), '[]'::jsonb),
    'midias', coalesce((SELECT jsonb_agg(x ORDER BY x->>'criada_em' DESC) FROM (
                 SELECT jsonb_build_object('id', md.id, 'nome', md.name, 'tipo', md.file_type, 'bytes', md.file_size,
                                           'formato', md.aspect_ratio, 'criada_em', md.created_at, 'miniatura', md.thumbnail_url) AS x
                   FROM public.media md WHERE md.user_id = p_usuario AND NOT coalesce(md.biblioteca, false)
                  ORDER BY md.created_at DESC LIMIT 200) z), '[]'::jsonb),
    'pontos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', po.id, 'nome', po.nome, 'cidade', po.cidade, 'uf', po.estado,
                                                            'categoria', po.categoria, 'ativo', po.ativo) ORDER BY po.nome)
               FROM public.pontos po
              WHERE po.deleted_at IS NULL
                AND (po.created_by = p_usuario
                  OR po.id IN (SELECT s.ponto_id FROM public.screens s WHERE s.user_id = p_usuario)
                  OR (v_alvo.cliente_id IS NOT NULL AND po.id IN (SELECT cp.ponto_id FROM public.cliente_pontos cp WHERE cp.cliente_id = v_alvo.cliente_id)))), '[]'::jsonb),
    'campanhas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', ca.id, 'titulo', ca.titulo, 'status', ca.status,
                                                               'inicio', ca.data_inicio, 'fim', ca.data_fim) ORDER BY ca.created_at DESC)
               FROM public.campanhas ca WHERE ca.deleted_at IS NULL AND v_alvo.cliente_id IS NOT NULL AND ca.cliente_id = v_alvo.cliente_id), '[]'::jsonb),
    'contratos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', co.id, 'numero', coalesce(co.numero_contrato_legivel, co.numero_contrato),
                                                               'situacao', co.status_workflow, 'valor_mensal', co.valor_mensal,
                                                               'inicio', co.data_inicio, 'fim', co.data_fim) ORDER BY co.created_at DESC)
               FROM public.contratos co
              WHERE co.deleted_at IS NULL
                AND ((v_alvo.cliente_id IS NOT NULL AND co.cliente_id = v_alvo.cliente_id)
                  OR co.gestor_usuario_id = p_usuario
                  OR co.representante_id IN (SELECT r.id FROM public.representantes r WHERE r.usuario_id = p_usuario))), '[]'::jsonb),
    'exibicoes_por_dia', coalesce((SELECT jsonb_agg(jsonb_build_object('dia', d.dia, 'n', d.n) ORDER BY d.dia) FROM (
                 SELECT (lg.started_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS n
                   FROM public.playback_logs lg
                  WHERE lg.started_at > now() - interval '14 days'
                    AND lg.screen_id IN (SELECT s.id::text FROM public.screens s WHERE s.user_id = p_usuario)
                  GROUP BY 1) d), '[]'::jsonb)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_visao_conta_detalhe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_visao_conta_detalhe(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
