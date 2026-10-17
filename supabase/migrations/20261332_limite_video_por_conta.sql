-- F-191 — Limite de duração de vídeo/áudio POR CONTA, definido pelo dono/ADM.
--
-- Motivo: o dono quer que o gestor de mídia "Hotel Maxsuel" (3 telas) envie vídeos de até 1 minuto; o limite era fixo por
-- perfil (gestor 30 s, anunciante 20 s), na tela de envio e no banco (trg_fn_media_limite_gestor).
-- O que muda (aditivo):
--   * usuarios.limite_video_segundos (vazio = padrão do perfil). Só dono/ADM alteram (gatilho; o próprio usuário não).
--   * trg_fn_media_limite_gestor: se a conta tem limite próprio, vale ele (+0,5 s de tolerância da leitura do arquivo);
--     senão, a regra de antes (anunciante/cliente 20 s, gestor 30 s, dono sem limite).
--   * fn_definir_limite_video(usuario, segundos): dono/ADM da mesma empresa definem ou limpam o limite.
--   * fn_visao_contas passa a informar o limite da conta (Visão das Contas).
--   * Hotel Maxsuel (gestor, f6fe7c99-…) fica com 60 s.
-- Player: nada muda.
-- ROLLBACK: reaplicar trg_fn_media_limite_gestor de 20261284_limite_duracao_por_perfil.sql; DROP FUNCTION
--   fn_definir_limite_video(uuid, integer); DROP TRIGGER trg_usuarios_limite_video_so_gestao ON usuarios;
--   ALTER TABLE usuarios DROP COLUMN limite_video_segundos.

ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS limite_video_segundos integer;
DO $$ BEGIN
  ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_limite_video_segundos_faixa
    CHECK (limite_video_segundos IS NULL OR limite_video_segundos BETWEEN 5 AND 600);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON COLUMN public.usuarios.limite_video_segundos IS 'F-191: duração máxima de vídeo/áudio desta conta, em segundos (vazio = padrão do perfil). Só dono/ADM alteram.';

-- só dono/ADM (ou o servidor, sem usuário logado) mudam o limite de uma conta
CREATE OR REPLACE FUNCTION public.trg_fn_usuarios_limite_video_so_gestao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.limite_video_segundos IS DISTINCT FROM OLD.limite_video_segundos
     AND auth.uid() IS NOT NULL AND NOT public.fn_pode_ver_todas_as_contas() THEN
    RAISE EXCEPTION 'Só o dono ou o ADM podem mudar o limite de duração de vídeo de uma conta.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_usuarios_limite_video_so_gestao ON public.usuarios;
CREATE TRIGGER trg_usuarios_limite_video_so_gestao BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_usuarios_limite_video_so_gestao();

-- trava do banco: limite da conta, se houver; senão o do perfil (como antes)
CREATE OR REPLACE FUNCTION public.trg_fn_media_limite_gestor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_perfil text; v_owner boolean; v_limite_conta integer;
BEGIN
  IF auth.uid() IS NULL OR coalesce(NEW.duration_ms, 0) <= 0 THEN RETURN NEW; END IF;
  SELECT upper(coalesce(p.nome, '')), coalesce(u.is_owner, false), u.limite_video_segundos
    INTO v_perfil, v_owner, v_limite_conta
    FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id WHERE u.id = auth.uid();
  IF v_owner THEN RETURN NEW; END IF;
  IF v_limite_conta IS NOT NULL THEN
    IF NEW.duration_ms > v_limite_conta * 1000 + 500 THEN
      RAISE EXCEPTION 'Esta conta pode enviar vídeos de até % segundos.', v_limite_conta USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.duration_ms <= 20500 THEN RETURN NEW; END IF;
  IF v_perfil IN ('ANUNCIANTE', 'CLIENTE') THEN
    RAISE EXCEPTION 'Anunciante pode enviar vídeos de até 20 segundos.' USING ERRCODE = '22023';
  ELSIF v_perfil = 'GESTOR' AND NEW.duration_ms > 30500 THEN
    RAISE EXCEPTION 'Gestor de mídia pode enviar vídeos de até 30 segundos.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

-- dono/ADM definem (ou limpam, com NULL) o limite de uma conta da mesma empresa
CREATE OR REPLACE FUNCTION public.fn_definir_limite_video(p_usuario uuid, p_segundos integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_empresa uuid;
BEGIN
  IF NOT public.fn_pode_ver_todas_as_contas() THEN
    RETURN jsonb_build_object('status', 'SEM_PERMISSAO');
  END IF;
  IF p_segundos IS NOT NULL AND (p_segundos < 5 OR p_segundos > 600) THEN
    RETURN jsonb_build_object('status', 'FORA_DA_FAIXA', 'mensagem', 'Use de 5 a 600 segundos.');
  END IF;
  SELECT empresa_operadora_id INTO v_empresa FROM public.usuarios WHERE id = auth.uid();
  UPDATE public.usuarios SET limite_video_segundos = p_segundos
   WHERE id = p_usuario AND deleted_at IS NULL AND (v_empresa IS NULL OR empresa_operadora_id = v_empresa);
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'CONTA_NAO_ENCONTRADA'); END IF;
  RETURN jsonb_build_object('status', 'OK', 'limite_video_segundos', p_segundos);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_definir_limite_video(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_definir_limite_video(uuid, integer) TO authenticated, service_role;

-- Visão das Contas mostra o limite próprio de cada conta
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
          'limite_video_segundos', u.limite_video_segundos,
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

-- pedido do dono: gestor Hotel Maxsuel com vídeos de até 1 minuto
UPDATE public.usuarios SET limite_video_segundos = 60 WHERE id = 'f6fe7c99-efb9-47d7-8788-585568ba1086';

NOTIFY pgrst, 'reload schema';
