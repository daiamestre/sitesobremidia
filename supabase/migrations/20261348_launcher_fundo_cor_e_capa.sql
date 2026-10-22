-- F-209: fundo da launcher Sobre Mídia — cor escolhida ou imagem de capa (mídia enviada do PC/celular ou da galeria).
-- fn_player_launcher refeita a partir da definição viva: mesmos campos de antes + 'fundo_cor' e 'capa'. A configuração
-- padrão (empresa sem linha) deixa de usar ROW(...) posicional, que quebraria com as colunas novas.
-- Só o Player 5.8.x usa esta função (o 5.7.10 não tem launcher): contrato do 5.7.10 intacto.

ALTER TABLE public.launcher_configuracao
  ADD COLUMN IF NOT EXISTS fundo_cor text,
  ADD COLUMN IF NOT EXISTS capa_media_id uuid REFERENCES public.media(id) ON DELETE SET NULL;

ALTER TABLE public.launcher_configuracao DROP CONSTRAINT IF EXISTS launcher_configuracao_fundo_cor_check;
ALTER TABLE public.launcher_configuracao ADD CONSTRAINT launcher_configuracao_fundo_cor_check
  CHECK (fundo_cor IS NULL OR fundo_cor ~ '^#[0-9A-Fa-f]{6}$');

CREATE OR REPLACE FUNCTION public.fn_player_launcher()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_empresa uuid := public.fn_launcher_empresa_do_usuario();
  v_cfg public.launcher_configuracao;
  v_achou boolean;
  v_fundo jsonb;
  v_capa jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_empresa IS NULL THEN
    RETURN jsonb_build_object('status', 'SEM_EMPRESA');
  END IF;
  SELECT * INTO v_cfg FROM public.launcher_configuracao WHERE empresa_operadora_id = v_empresa;
  v_achou := FOUND;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id,
           'media_id', m.id,
           'url', m.file_url,
           'tipo', CASE WHEN m.file_type ILIKE 'video%' THEN 'video' ELSE 'image' END,
           'duracao_s', f.duracao_s, 'vitrine', f.vitrine,
           'hash', coalesce(nullif(m.file_hash, ''), md5(m.id::text || coalesce(m.file_url, '') || coalesce(m.updated_at::text, '')))
         ) ORDER BY f.ordem, f.created_at), '[]'::jsonb)
    INTO v_fundo
    FROM public.launcher_fundo f JOIN public.media m ON m.id = f.media_id
   WHERE f.empresa_operadora_id = v_empresa AND f.ativo AND m.file_url ~ '^https://'
     AND (m.file_type ILIKE 'video%' OR m.file_type ILIKE 'image%');
  IF v_achou AND v_cfg.capa_media_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'media_id', m.id, 'url', m.file_url,
             'hash', coalesce(nullif(m.file_hash, ''), md5(m.id::text || coalesce(m.file_url, '') || coalesce(m.updated_at::text, ''))))
      INTO v_capa
      FROM public.media m
     WHERE m.id = v_cfg.capa_media_id AND m.file_url ~ '^https://' AND m.file_type ILIKE 'image%';
  END IF;
  RETURN jsonb_build_object(
    'status', 'OK',
    'segundos_para_abrir_player', CASE WHEN v_achou THEN v_cfg.segundos_para_abrir_player ELSE 30 END,
    'minutos_de_uso_livre', CASE WHEN v_achou THEN v_cfg.minutos_de_uso_livre ELSE 30 END,
    'mostrar_relogio', CASE WHEN v_achou THEN v_cfg.mostrar_relogio ELSE true END,
    'mostrar_clima', CASE WHEN v_achou THEN v_cfg.mostrar_clima ELSE true END,
    'mostrar_wifi', CASE WHEN v_achou THEN v_cfg.mostrar_wifi ELSE true END,
    'apps_ocultos', CASE WHEN v_achou THEN to_jsonb(v_cfg.apps_ocultos) ELSE to_jsonb(ARRAY[
        'youtube', 'netflix', 'com.amazon.avod', 'primevideo', 'prime video', 'disney', 'globoplay', 'com.globo',
        're:\bhbo\b', 'com.wbd', 'paramount', 'pluto', 'twitch', 'starplus', 'crunchyroll', 'iptv', 'kodi', 'xbmc',
        'livechannels', 're:\btv\b']) END,
    'apps_liberados', CASE WHEN v_achou THEN to_jsonb(v_cfg.apps_liberados) ELSE '[]'::jsonb END,
    'fundo', v_fundo,
    'fundo_cor', CASE WHEN v_achou THEN v_cfg.fundo_cor END,
    'capa', v_capa);
END;
$function$;
