-- F-205: "Vincular outro aparelho" — um aparelho já conectado passa para outra tela pelo painel.
--
-- • fn_aparelhos_para_vincular(p_tela): aparelhos que podem ir para a tela (os da MESMA conta da tela: o Player só
--   enxerga as telas da conta em que está logado — get_authorized_screens_for_player usa screens.user_id).
-- • fn_vincular_aparelho_na_tela(p_tela, p_aparelho): tira o aparelho da tela antiga e liga na nova. A tela antiga
--   recebe o comando "trocar_tela" (dirigido ao aparelho); se a tela nova tinha outro aparelho, ele recebe "unpair".
-- • fn_player_tela_do_aparelho(p_aparelho): o Player pergunta "a qual tela estou ligado?" (ao receber trocar_tela e
--   enquanto mostra a tela de suporte depois de ser desvinculado).
--
-- Nada do que o Player 5.7.10 usa muda. Só aparelhos com Player 5.8.9+ entendem a troca: os mais antigos aparecem na
-- lista como "precisa atualizar" e não podem ser escolhidos.

ALTER TABLE public.remote_commands DROP CONSTRAINT IF EXISTS remote_commands_command_check;
ALTER TABLE public.remote_commands ADD CONSTRAINT remote_commands_command_check CHECK (command = ANY (ARRAY[
  'reload','reboot','restart_player','reboot_device','screenshot','take_screenshot','sync','update_app','check_update',
  'install_update','maintenance_open','open_maintenance','maintenance_close','close_maintenance','rotate_portrait',
  'rotate_landscape','unpair','launcher_sobremidia','launcher_original','trocar_tela'
]::text[]));

-- "5.8.9-MicroGate" → {5,8,9}
CREATE OR REPLACE FUNCTION public.fn_versao_do_player(p text)
 RETURNS int[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE WHEN coalesce(p, '') !~ '^[0-9]+' THEN NULL
              ELSE string_to_array(substring(p from '^[0-9]+(?:\.[0-9]+)*'), '.')::int[] END;
$function$;

-- O aparelho entende "trocar_tela" e a tela de suporte ao ser desvinculado (Player 5.8.9 ou mais novo)?
CREATE OR REPLACE FUNCTION public.fn_player_sabe_trocar_tela(p text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT coalesce(public.fn_versao_do_player(p) >= ARRAY[5,8,9], false);
$function$;

-- Quem chama pode mexer nesta tela? (mesma regra do admin_unpair_screen)
CREATE OR REPLACE FUNCTION public.fn_pode_gerenciar_tela(p_tela uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ctx RECORD;
  v_tela RECORD;
  v_empresa_dono uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT id, user_id, empresa_operadora_id INTO v_tela FROM public.screens WHERE id = p_tela;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_ctx FROM public.fn_get_user_security_context(auth.uid());
  IF v_ctx.cargo_nome IN ('OWNER', 'ADMIN') THEN RETURN true; END IF;
  IF v_tela.user_id = auth.uid() THEN RETURN true; END IF;
  IF v_tela.empresa_operadora_id IS NOT NULL AND v_tela.empresa_operadora_id = v_ctx.empresa_operadora_id THEN RETURN true; END IF;
  SELECT empresa_operadora_id INTO v_empresa_dono FROM public.usuarios WHERE id = v_tela.user_id;
  RETURN v_empresa_dono IS NOT NULL AND v_empresa_dono = v_ctx.empresa_operadora_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_aparelhos_para_vincular(p_tela uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_destino RECORD;
  v_lista jsonb;
BEGIN
  IF NOT public.fn_pode_gerenciar_tela(p_tela) THEN
    RETURN jsonb_build_object('status', 'SEM_PERMISSAO', 'message', 'Sem permissão para esta tela.');
  END IF;
  SELECT id, user_id INTO v_destino FROM public.screens WHERE id = p_tela;

  WITH aparelhos AS (
    -- cada aparelho uma vez (o registro mais recente), ligado a uma tela da MESMA conta da tela de destino
    SELECT DISTINCT ON (d.identity_hash)
           d.identity_hash, d.app_version, d.last_seen, d.screen_id AS ultima_tela
      FROM public.devices d
     WHERE d.identity_hash IS NOT NULL AND trim(d.identity_hash) <> '' AND d.revoked_at IS NULL
     ORDER BY d.identity_hash, d.last_seen DESC NULLS LAST
  ), com_tela AS (
    SELECT a.*, ligada.id AS tela_id, ligada.name AS tela_nome, ligada.playlist_id, ligada.last_ping_at,
           coalesce(ligada.user_id, ultima.user_id) AS conta
      FROM aparelhos a
      LEFT JOIN LATERAL (SELECT s.* FROM public.screens s WHERE s.bound_device_id = a.identity_hash
                          ORDER BY s.last_ping_at DESC NULLS LAST LIMIT 1) ligada ON true
      LEFT JOIN public.screens ultima ON ultima.id = a.ultima_tela
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'aparelho', c.identity_hash,
           'versao', c.app_version,
           'compativel', public.fn_player_sabe_trocar_tela(c.app_version),
           'online', greatest(c.last_seen, c.last_ping_at) > now() - interval '3 minutes',
           'visto_em', greatest(c.last_seen, c.last_ping_at),
           'tela_id', c.tela_id,
           'tela_nome', c.tela_nome,
           'playlist_nome', (SELECT p.name FROM public.playlists p WHERE p.id = c.playlist_id),
           'nesta_tela', coalesce(c.tela_id = p_tela, false)
         ) ORDER BY (c.tela_id = p_tela) DESC NULLS LAST, greatest(c.last_seen, c.last_ping_at) DESC NULLS LAST), '[]'::jsonb)
    INTO v_lista
    FROM com_tela c
   WHERE c.conta = v_destino.user_id
     AND greatest(c.last_seen, c.last_ping_at) > now() - interval '60 days';

  RETURN jsonb_build_object('status', 'SUCCESS', 'data', v_lista);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_vincular_aparelho_na_tela(p_tela uuid, p_aparelho text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_destino RECORD;
  v_versao text;
  v_conta uuid;
  v_antiga RECORD;
  v_saiu text;
  v_trocas int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('status', 'UNAUTHORIZED', 'message', 'Usuário não autenticado.');
  END IF;
  IF p_aparelho IS NULL OR trim(p_aparelho) = '' THEN
    RETURN jsonb_build_object('status', 'APARELHO_INVALIDO', 'message', 'Aparelho não informado.');
  END IF;
  IF NOT public.fn_pode_gerenciar_tela(p_tela) THEN
    RETURN jsonb_build_object('status', 'SEM_PERMISSAO', 'message', 'Sem permissão para esta tela.');
  END IF;

  SELECT * INTO v_destino FROM public.screens WHERE id = p_tela FOR UPDATE;
  IF v_destino.bound_device_id = p_aparelho THEN
    RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Este aparelho já está nesta tela.', 'screen_id', p_tela);
  END IF;

  -- o aparelho existe, não foi revogado e está logado na MESMA conta da tela (senão o Player não acharia a tela)
  SELECT d.app_version INTO v_versao FROM public.devices d
   WHERE d.identity_hash = p_aparelho AND d.revoked_at IS NULL ORDER BY d.last_seen DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'APARELHO_NAO_ENCONTRADO', 'message', 'Aparelho não encontrado.');
  END IF;
  SELECT coalesce(
           (SELECT s.user_id FROM public.screens s WHERE s.bound_device_id = p_aparelho LIMIT 1),
           (SELECT s.user_id FROM public.devices d JOIN public.screens s ON s.id = d.screen_id
             WHERE d.identity_hash = p_aparelho ORDER BY d.last_seen DESC NULLS LAST LIMIT 1))
    INTO v_conta;
  IF v_conta IS DISTINCT FROM v_destino.user_id THEN
    RETURN jsonb_build_object('status', 'OUTRA_CONTA',
      'message', 'Este aparelho está logado em outra conta: ele só pode ir para telas dessa conta.');
  END IF;
  IF NOT public.fn_player_sabe_trocar_tela(v_versao) THEN
    RETURN jsonb_build_object('status', 'PLAYER_ANTIGO',
      'message', 'Este aparelho está com o Player ' || coalesce(v_versao, 'antigo') ||
                 '. A troca de tela pelo painel precisa do Player 5.8.9 ou mais novo.');
  END IF;

  -- 1. sai da(s) tela(s) antiga(s): o aparelho recebe "trocar_tela" e vai sozinho para a nova
  FOR v_antiga IN SELECT id, name FROM public.screens WHERE bound_device_id = p_aparelho AND id <> p_tela FOR UPDATE LOOP
    UPDATE public.screens SET bound_device_id = NULL WHERE id = v_antiga.id;
    INSERT INTO public.remote_commands (screen_id, command, status, payload, created_at)
    VALUES (v_antiga.id, 'trocar_tela', 'pending', jsonb_build_object(
      'target_device_id', p_aparelho, 'nova_tela', p_tela, 'reason', 'MOVIDO_PELO_PAINEL',
      'pedido_por', auth.uid(), 'timestamp', now()), now());
    v_trocas := v_trocas + 1;
  END LOOP;

  -- 2. a tela nova tinha outro aparelho: ele é desvinculado (mostra a tela de suporte)
  v_saiu := nullif(trim(coalesce(v_destino.bound_device_id, '')), '');
  IF v_saiu IS NOT NULL THEN
    INSERT INTO public.remote_commands (screen_id, command, status, payload, created_at)
    VALUES (p_tela, 'unpair', 'pending', jsonb_build_object(
      'target_device_id', v_saiu, 'reason', 'SUBSTITUIDO_POR_OUTRO_APARELHO', 'revoked_by', auth.uid(),
      'screen_id', p_tela, 'timestamp', now()), now());
  END IF;

  -- 3. liga o aparelho na tela nova
  UPDATE public.screens SET bound_device_id = p_aparelho WHERE id = p_tela;
  UPDATE public.devices SET screen_id = p_tela
   WHERE identity_hash = p_aparelho;

  BEGIN
    INSERT INTO public.system_events (event_type, screen_id, user_id, payload, created_at)
    VALUES ('SCREEN_DEVICE_MOVED', p_tela, auth.uid(), jsonb_build_object(
      'aparelho', p_aparelho, 'telas_antigas', v_trocas, 'aparelho_substituido', v_saiu), now());
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('status', 'SUCCESS', 'screen_id', p_tela, 'saiu_de_telas', v_trocas,
    'aparelho_substituido', v_saiu,
    'message', CASE WHEN v_trocas > 0 THEN 'O aparelho saiu da tela antiga e já está indo para esta tela.'
                    ELSE 'Aparelho ligado a esta tela. Ele começa a reproduzir assim que conferir o vínculo (até 15 s).' END);
END;
$function$;

-- O Player pergunta a qual tela este aparelho está ligado (só telas da própria conta, como na escolha de tela)
CREATE OR REPLACE FUNCTION public.fn_player_tela_do_aparelho(p_aparelho text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    (SELECT jsonb_build_object('status', 'LIGADO', 'screen_id', s.id, 'nome', s.name)
       FROM public.screens s
      WHERE auth.uid() IS NOT NULL AND s.user_id = auth.uid() AND s.bound_device_id = p_aparelho
        AND coalesce(s.is_active, true)
      ORDER BY s.last_ping_at DESC NULLS LAST LIMIT 1),
    jsonb_build_object('status', 'LIVRE'));
$function$;

REVOKE ALL ON FUNCTION public.fn_pode_gerenciar_tela(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_aparelhos_para_vincular(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_vincular_aparelho_na_tela(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_player_tela_do_aparelho(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pode_gerenciar_tela(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aparelhos_para_vincular(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_vincular_aparelho_na_tela(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_player_tela_do_aparelho(text) TO authenticated;
