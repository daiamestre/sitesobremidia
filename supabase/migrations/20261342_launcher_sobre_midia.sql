-- F-200 — Launcher Sobre Mídia (o Player que vira tela inicial do aparelho).
--
-- O que é: o dono/ADM escolhe as mídias de fundo da launcher, quanto tempo ela espera para abrir o Player sozinha, o
-- tempo de uso livre e os aplicativos que NÃO aparecem nela (YouTube, Netflix e apps de TV já vêm ocultos). O Player
-- (a partir do 5.8.0, versão de TESTE) busca isto por fn_player_launcher() e informa os apps instalados por
-- fn_player_launcher_apps(). A logo continua sendo a "Minha Marca" do gestor (fn_player_minha_marca, sem mudança).
--
-- Aditivo: só tabelas e funções NOVAS + 2 comandos novos aceitos pelo banco (launcher_sobremidia, launcher_original).
-- Impacto no Player 5.7.10: nenhum (não chama nada disto; os 17 comandos dele continuam aceitos).
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.fn_player_launcher(); DROP FUNCTION IF EXISTS public.fn_player_launcher_apps(text, jsonb);
--   DROP TABLE IF EXISTS public.launcher_apps_vistos, public.launcher_fundo, public.launcher_configuracao;
--   e recriar remote_commands_command_check com a lista de 20261339 (sem os 2 comandos novos).

CREATE TABLE IF NOT EXISTS public.launcher_configuracao (
  empresa_operadora_id uuid PRIMARY KEY,
  segundos_para_abrir_player integer NOT NULL DEFAULT 30 CHECK (segundos_para_abrir_player BETWEEN 5 AND 3600),
  minutos_de_uso_livre integer NOT NULL DEFAULT 30 CHECK (minutos_de_uso_livre BETWEEN 1 AND 1440),
  mostrar_relogio boolean NOT NULL DEFAULT true,
  mostrar_clima boolean NOT NULL DEFAULT true,
  mostrar_wifi boolean NOT NULL DEFAULT true,
  apps_ocultos text[] NOT NULL DEFAULT ARRAY[
    'youtube', 'netflix', 'com.amazon.avod', 'primevideo', 'prime video', 'disney', 'globoplay', 'com.globo', 'hbo',
    'com.wbd', 'paramount', 'pluto', 'twitch', 'starplus', 'crunchyroll', 'iptv', 'kodi', 'xbmc', 'livechannels',
    're:\btv\b'
  ],
  apps_liberados text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.launcher_fundo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id uuid NOT NULL,
  media_id uuid NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  duracao_s integer NOT NULL DEFAULT 10 CHECK (duracao_s BETWEEN 3 AND 600),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS launcher_fundo_empresa_idx ON public.launcher_fundo (empresa_operadora_id, ordem);

CREATE TABLE IF NOT EXISTS public.launcher_apps_vistos (
  empresa_operadora_id uuid NOT NULL,
  aparelho text NOT NULL,
  pacote text NOT NULL,
  nome text,
  visto_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_operadora_id, aparelho, pacote)
);

ALTER TABLE public.launcher_configuracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launcher_fundo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launcher_apps_vistos ENABLE ROW LEVEL SECURITY;

-- Só o dono e o ADM da empresa veem e mudam a launcher (o gestor só troca a própria logo em "Minha Marca").
DROP POLICY IF EXISTS lc_admin ON public.launcher_configuracao;
CREATE POLICY lc_admin ON public.launcher_configuracao FOR ALL TO authenticated
  USING (empresa_operadora_id = public.fn_biblioteca_tenant() AND public.fn_biblioteca_admin())
  WITH CHECK (empresa_operadora_id = public.fn_biblioteca_tenant() AND public.fn_biblioteca_admin());
DROP POLICY IF EXISTS lf_admin ON public.launcher_fundo;
CREATE POLICY lf_admin ON public.launcher_fundo FOR ALL TO authenticated
  USING (empresa_operadora_id = public.fn_biblioteca_tenant() AND public.fn_biblioteca_admin())
  WITH CHECK (empresa_operadora_id = public.fn_biblioteca_tenant() AND public.fn_biblioteca_admin());
DROP POLICY IF EXISTS lav_admin_select ON public.launcher_apps_vistos;
CREATE POLICY lav_admin_select ON public.launcher_apps_vistos FOR SELECT TO authenticated
  USING (empresa_operadora_id = public.fn_biblioteca_tenant() AND public.fn_biblioteca_admin());

-- Empresa de quem está logado no Player (gestor, dono ou ADM).
CREATE OR REPLACE FUNCTION public.fn_launcher_empresa_do_usuario()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce(
    (SELECT u.empresa_operadora_id FROM public.usuarios u WHERE u.id = auth.uid()),
    (SELECT r.empresa_operadora_id FROM public.representantes r WHERE r.usuario_id = auth.uid() LIMIT 1));
$$;
REVOKE ALL ON FUNCTION public.fn_launcher_empresa_do_usuario() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_launcher_empresa_do_usuario() TO authenticated;

-- O que a launcher do aparelho precisa (configuração + mídias de fundo). Sem linha de configuração: padrões.
CREATE OR REPLACE FUNCTION public.fn_player_launcher()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_empresa uuid := public.fn_launcher_empresa_do_usuario();
  v_cfg public.launcher_configuracao;
  v_fundo jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_empresa IS NULL THEN
    RETURN jsonb_build_object('status', 'SEM_EMPRESA');
  END IF;
  SELECT * INTO v_cfg FROM public.launcher_configuracao WHERE empresa_operadora_id = v_empresa;
  IF NOT FOUND THEN
    v_cfg := ROW(v_empresa, 30, 30, true, true, true,
      ARRAY['youtube', 'netflix', 'com.amazon.avod', 'primevideo', 'prime video', 'disney', 'globoplay', 'com.globo',
            'hbo', 'com.wbd', 'paramount', 'pluto', 'twitch', 'starplus', 'crunchyroll', 'iptv', 'kodi', 'xbmc',
            'livechannels', 're:\btv\b'],
      '{}'::text[], now(), NULL)::public.launcher_configuracao;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id,
           'media_id', m.id,
           'url', m.file_url,
           'tipo', CASE WHEN m.file_type ILIKE 'video%' THEN 'video' ELSE 'image' END,
           'duracao_s', f.duracao_s,
           'hash', coalesce(nullif(m.file_hash, ''), md5(m.id::text || coalesce(m.file_url, '') || coalesce(m.updated_at::text, '')))
         ) ORDER BY f.ordem, f.created_at), '[]'::jsonb)
    INTO v_fundo
    FROM public.launcher_fundo f JOIN public.media m ON m.id = f.media_id
   WHERE f.empresa_operadora_id = v_empresa AND f.ativo AND m.file_url ~ '^https://'
     AND (m.file_type ILIKE 'video%' OR m.file_type ILIKE 'image%');
  RETURN jsonb_build_object(
    'status', 'OK',
    'segundos_para_abrir_player', v_cfg.segundos_para_abrir_player,
    'minutos_de_uso_livre', v_cfg.minutos_de_uso_livre,
    'mostrar_relogio', v_cfg.mostrar_relogio,
    'mostrar_clima', v_cfg.mostrar_clima,
    'mostrar_wifi', v_cfg.mostrar_wifi,
    'apps_ocultos', to_jsonb(v_cfg.apps_ocultos),
    'apps_liberados', to_jsonb(v_cfg.apps_liberados),
    'fundo', v_fundo);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_player_launcher() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_player_launcher() TO authenticated;

-- O aparelho informa os apps que tem (o painel usa para o dono escolher o que esconder). Substitui a lista do aparelho.
CREATE OR REPLACE FUNCTION public.fn_player_launcher_apps(p_aparelho text, p_apps jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_empresa uuid := public.fn_launcher_empresa_do_usuario();
  v_total integer;
BEGIN
  IF auth.uid() IS NULL OR v_empresa IS NULL THEN RETURN jsonb_build_object('status', 'SEM_EMPRESA'); END IF;
  IF coalesce(length(p_aparelho), 0) NOT BETWEEN 4 AND 120 OR jsonb_typeof(p_apps) <> 'array' THEN
    RETURN jsonb_build_object('status', 'INVALIDO');
  END IF;
  DELETE FROM public.launcher_apps_vistos WHERE empresa_operadora_id = v_empresa AND aparelho = p_aparelho;
  INSERT INTO public.launcher_apps_vistos (empresa_operadora_id, aparelho, pacote, nome)
  SELECT DISTINCT ON (a->>'pacote') v_empresa, p_aparelho, left(a->>'pacote', 200), left(a->>'nome', 120)
    FROM (SELECT a FROM jsonb_array_elements(p_apps) a LIMIT 400) x
   WHERE coalesce(a->>'pacote', '') ~ '^[A-Za-z0-9_.]{3,200}$';
  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN jsonb_build_object('status', 'OK', 'apps', v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_player_launcher_apps(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_player_launcher_apps(text, jsonb) TO authenticated;

-- Comandos novos do painel (só o Player 5.8.0+ entende; os 17 do 5.7.10 continuam).
ALTER TABLE public.remote_commands DROP CONSTRAINT IF EXISTS remote_commands_command_check;
ALTER TABLE public.remote_commands ADD CONSTRAINT remote_commands_command_check CHECK (command = ANY (ARRAY[
  'reload', 'reboot', 'restart_player', 'reboot_device', 'screenshot', 'take_screenshot', 'sync',
  'update_app', 'check_update', 'install_update',
  'maintenance_open', 'open_maintenance', 'maintenance_close', 'close_maintenance',
  'rotate_portrait', 'rotate_landscape', 'unpair',
  'launcher_sobremidia', 'launcher_original'
]));
