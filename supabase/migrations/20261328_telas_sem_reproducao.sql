-- F-187 — Painel: telas que dão sinal mas NÃO estão reproduzindo, com a causa e o que fazer.
--
-- Até aqui a Central de Alertas só sabia "aparelho sem sinal". Uma tela presa em "Sincronizando", preta, sem playlist ou
-- com o aparelho desvinculado continuava aparecendo como normal. Esta função junta o que o servidor sabe sozinho (playlist,
-- itens, registro de exibições) com o que o Player informa (status "sem_reproducao" + causa, a partir do Player 5.7.5).
-- Só leitura; mesmas regras de acesso de fn_alertas_dispositivos.

CREATE OR REPLACE FUNCTION public.fn_telas_sem_reproducao()
 RETURNS TABLE(
   screen_id uuid, tela text, motivo text, causa text, o_que_fazer text,
   ultimo_sinal timestamptz, ultima_exibicao timestamptz, app_version text
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH base AS (
    SELECT s.*,
           (SELECT max(pl.started_at) FROM public.playback_logs pl
             WHERE pl.screen_id = s.id::text AND pl.started_at > now() - interval '2 days') AS ultima,
           (SELECT count(*) FROM public.playlist_items pi WHERE pi.playlist_id = s.playlist_id) AS itens,
           (SELECT coalesce(max(pi.duration), 0) FROM public.playlist_items pi WHERE pi.playlist_id = s.playlist_id) AS maior_item_s
      FROM public.screens s
     WHERE auth.uid() IS NOT NULL
       AND s.bound_device_id IS NOT NULL                       -- há um aparelho conectado a esta tela
       AND s.last_ping_at > now() - interval '3 minutes'       -- e ele está dando sinal (sem sinal = alerta de aparelho)
       AND s.is_active AND NOT coalesce(s.bloqueada_por_inadimplencia, false)   -- suspensa no painel não é defeito
       AND public.fn_player_can_access_screen(s.id)
       AND (NOT public.fn_perfil_sem_gestao_de_telas() OR s.user_id = auth.uid())
  ), motivos AS (
    SELECT b.*,
           CASE
             WHEN b.playlist_id IS NULL THEN 'SEM_PLAYLIST'
             WHEN b.itens = 0 THEN 'PLAYLIST_VAZIA'
             WHEN b.status ILIKE '%BINDING_MISMATCH%' THEN 'APARELHO_NAO_VINCULADO'
             -- o estado é gravado por mais de um caminho do Player; a nota "SemReproducao (causa)" fica até ele informar "Reproducao (normal)"
             WHEN b.status = 'sem_reproducao' OR b.status_note LIKE 'Applied: SemReproducao (%' THEN 'PLAYER_SEM_IMAGEM'
             WHEN b.ultima IS NULL
               OR b.ultima < now() - greatest(interval '5 minutes', make_interval(secs => 2 * b.maior_item_s + 60)) THEN 'SEM_EXIBICAO'
           END AS motivo
      FROM base b
  )
  SELECT m.id, m.name::text, m.motivo,
         CASE m.motivo
           WHEN 'SEM_PLAYLIST' THEN 'A tela está conectada, mas não tem playlist atribuída.'
           WHEN 'PLAYLIST_VAZIA' THEN 'A playlist desta tela não tem nenhuma mídia.'
           WHEN 'APARELHO_NAO_VINCULADO' THEN 'O aparelho que está dando sinal não é o que está vinculado a esta tela.'
           WHEN 'PLAYER_SEM_IMAGEM' THEN coalesce(
                  nullif(substring(m.status_note from 'SemReproducao \((.*)\) at '), ''),
                  'O Player informou que não há mídia aparecendo na tela.')
           WHEN 'SEM_EXIBICAO' THEN
                  CASE WHEN m.ultima IS NULL
                       THEN 'O aparelho dá sinal, mas não registrou nenhuma exibição: ainda sincronizando/baixando as mídias, ou parado na tela de sincronização.'
                       ELSE 'O aparelho dá sinal, mas não registra exibição há ' || greatest(1, round(extract(epoch FROM now() - m.ultima) / 60))::int || ' min: parado na tela de sincronização ou com falha na reprodução.'
                  END
         END,
         CASE m.motivo
           WHEN 'SEM_PLAYLIST' THEN 'Abra Telas, escolha esta tela e atribua uma playlist.'
           WHEN 'PLAYLIST_VAZIA' THEN 'Adicione mídias à playlist desta tela.'
           WHEN 'APARELHO_NAO_VINCULADO' THEN 'No aparelho, escolha a tela de novo; ou desvincule a tela no painel e conecte outra vez.'
           WHEN 'PLAYER_SEM_IMAGEM' THEN 'Confira a internet e o espaço do aparelho; use "Reiniciar". Se continuar, atualize o Player.'
           WHEN 'SEM_EXIBICAO' THEN 'Confira a internet do aparelho e use "Reiniciar". Se continuar, atualize o Player para a versão mais nova.'
         END,
         m.last_ping_at, m.ultima, m.app_version::text
    FROM motivos m
   WHERE m.motivo IS NOT NULL
   ORDER BY m.name;
$function$;

REVOKE ALL ON FUNCTION public.fn_telas_sem_reproducao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_telas_sem_reproducao() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
