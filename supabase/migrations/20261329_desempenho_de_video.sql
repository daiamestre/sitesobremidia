-- F-188 — Fluidez de cada vídeo exibido, medida no próprio aparelho (Player 5.7.6+).
--
-- O dono pediu para testar no aparelho real (TV Box MXQ 4K do totem) se 1080p a 24 fps roda liso ou se 720p é melhor.
-- Sem esta medição não há como saber de longe: o registro de exibições diz "tocou" mesmo com o vídeo travando.
-- Cada linha: decodificador usado (hardware/software), formato do vídeo, quadros exibidos, perdidos e esperados.

CREATE TABLE IF NOT EXISTS public.player_desempenho_video (
  id bigserial PRIMARY KEY,
  screen_id uuid NOT NULL REFERENCES public.screens(id) ON DELETE CASCADE,
  media_id uuid,
  midia text,
  decodificador text,
  por_software boolean,
  formato text,
  duracao_ms integer,
  quadros_exibidos integer,
  quadros_perdidos integer,
  max_perdidos_seguidos integer,
  quadros_esperados integer,
  veredito text,
  giro_por_software boolean,
  app_version text,
  modelo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_desempenho_video_tela_idx ON public.player_desempenho_video (screen_id, created_at DESC);

ALTER TABLE public.player_desempenho_video ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS desempenho_video_leitura ON public.player_desempenho_video;
CREATE POLICY desempenho_video_leitura ON public.player_desempenho_video
  FOR SELECT TO authenticated
  USING (public.fn_player_can_access_screen(screen_id));

-- Gravação só pela função abaixo (o Player não insere direto).
REVOKE INSERT, UPDATE, DELETE ON public.player_desempenho_video FROM anon, authenticated;

-- O Player chama com o próprio identificador de aparelho: só grava se for o aparelho conectado HOJE a esta tela
-- (funciona mesmo com a sessão do Player vencida, como a busca da playlist).
CREATE OR REPLACE FUNCTION public.fn_player_registrar_desempenho_video(p jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tela uuid;
  v_media uuid;
BEGIN
  BEGIN
    v_tela := (p->>'screen_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.screens s
     WHERE s.id = v_tela
       AND s.bound_device_id IS NOT NULL
       AND s.bound_device_id = coalesce(p->>'device_id', '')
  ) THEN
    RETURN false;
  END IF;
  BEGIN
    v_media := (p->>'media_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_media := NULL;
  END;
  INSERT INTO public.player_desempenho_video (
    screen_id, media_id, midia, decodificador, por_software, formato, duracao_ms, quadros_exibidos, quadros_perdidos,
    max_perdidos_seguidos, quadros_esperados, veredito, giro_por_software, app_version, modelo
  ) VALUES (
    v_tela, v_media, left(p->>'midia', 200), left(p->>'decodificador', 120), (p->>'por_software')::boolean,
    left(p->>'formato', 40), (p->>'duracao_ms')::integer, (p->>'quadros_exibidos')::integer, (p->>'quadros_perdidos')::integer,
    (p->>'max_perdidos_seguidos')::integer, (p->>'quadros_esperados')::integer, left(p->>'veredito', 30),
    (p->>'giro_por_software')::boolean, left(p->>'app_version', 40), left(p->>'modelo', 160)
  );
  -- guarda só os últimos 7 dias desta tela (é diagnóstico, não histórico)
  DELETE FROM public.player_desempenho_video WHERE screen_id = v_tela AND created_at < now() - interval '7 days';
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_player_registrar_desempenho_video(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_player_registrar_desempenho_video(jsonb) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
