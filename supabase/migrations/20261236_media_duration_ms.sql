-- Auditoria 2026-09-25 (F-61): Tempo de Mídia exato dos vídeos.
--
-- A tabela media não guardava a duração: o painel estimava pelo navegador (inteiro arredondado, e MP4 fragmentado
-- falhava -> 10 s). Resultado: todos os 27 itens de vídeo tinham tempo diferente do vídeo; vários cortavam até 34 s.
--
-- 1) media.duration_ms (ADITIVO, nulo = desconhecido): duração exata em ms, a mesma régua do Player (ExoPlayer: maior
--    entre mvhd e as trilhas). Nenhum consumidor existente lê a coluna; os Players antigos não são afetados.
-- 2) Preenche os vídeos existentes (medidos arquivo a arquivo).
-- 3) Tempo de Mídia (playlist_items.duration, INTEIRO em segundos: contrato do Player mantido) = segundo cheio para cima
--    da duração real. O Player 5.5.1 toca min(configurado, real) = exatamente a duração real, sem cortar.
--    Playlists de teste (F17 / Homolog) ficam como estão (usadas nas medições do Player).
--
-- Reversível: ALTER TABLE public.media DROP COLUMN duration_ms; (valores antigos dos itens no ledger F-61)

ALTER TABLE public.media ADD COLUMN IF NOT EXISTS duration_ms integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_duration_ms_positive') THEN
    ALTER TABLE public.media ADD CONSTRAINT media_duration_ms_positive CHECK (duration_ms IS NULL OR duration_ms > 0);
  END IF;
END $$;

UPDATE public.media m SET duration_ms = v.ms
FROM (VALUES
  ('a0a631c4-9e01-4ceb-b3f7-fb275240e8a4'::uuid, 64000),
  ('fc74463d-350f-4a8b-bb0e-6d9cf98ce935'::uuid, 10000),
  ('17ed1cbd-ef04-47ac-9dda-debcb909cec6'::uuid, 44587),
  ('a2130106-68a0-44e4-8bb1-1a49c7322944'::uuid, 30601),
  ('56656b59-498c-45b5-b6a2-fa4dd3843855'::uuid, 30080),
  ('e96d24f4-e002-4456-ad19-60e0b0189fc5'::uuid, 30080),
  ('1d31127d-726c-4afc-9fac-f50090929cb9'::uuid, 30080),
  ('790ef324-b7cb-498d-ba85-c7ed05d50295'::uuid, 30080),
  ('2b786166-3d88-4d69-9a80-f8dcebe2e31d'::uuid, 30080),
  ('93a17b5e-90b8-445e-aed5-2973a8a8f956'::uuid, 30080),
  ('381d1202-b959-4902-82e0-4995c0295bb6'::uuid, 6928),
  ('368d1ed7-baf8-4443-9343-b17e3bc193cc'::uuid, 15180),
  ('fe9651c8-cc44-4b48-acaa-6f1259d26d74'::uuid, 17764),
  ('cf98303c-cb9e-44ae-a9bd-0310e64c5fb6'::uuid, 14116),
  ('98052011-3366-4acd-bfee-0277ff0cdc37'::uuid, 14907),
  ('a1a8e5e0-2a92-41cc-bcaa-a529e22a7529'::uuid, 11171),
  ('4ea90eb0-d9ce-498a-8443-4b0e2b02751e'::uuid, 14997)
) AS v(id, ms)
WHERE m.id = v.id AND m.duration_ms IS DISTINCT FROM v.ms;

UPDATE public.playlist_items pi
   SET duration = CEIL(m.duration_ms / 1000.0)::integer
  FROM public.media m, public.playlists p
 WHERE pi.media_id = m.id
   AND p.id = pi.playlist_id
   AND m.file_type = 'video'
   AND m.duration_ms IS NOT NULL
   AND p.name NOT LIKE 'F17 %'
   AND p.name NOT LIKE 'Playlist Homolog %'
   AND pi.duration IS DISTINCT FROM CEIL(m.duration_ms / 1000.0)::integer;
