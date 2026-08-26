-- ============================================================================
-- MIGRATION: 20261016_realtime_player_channels.sql
-- SOBRE MIDIA - TAREFA 02: canais realtime do Player operantes
-- ============================================================================
-- Evidencia (Tarefa 02 - validacao Android real, logcat do device):
--
--   remote_commands_channel:
--     ERROR P0001 (raise_exception) invalid column for filter screen_id
--     -> A tabela esta na publicacao supabase_realtime porem com REPLICA
--        IDENTITY DEFAULT. O filtro {screen_id = ...} enviado pelo Player
--        nativo so e aceito para colunas da identidade de replicacao (PK),
--        e a PK e (id). Resultado: comando "unpair" do Dashboard NUNCA chega
--        ao aparelho em tempo real.
--
--   yeloo_sync_channel:
--     "Please check Realtime is enabled" para playlist_items
--     -> A tabela playlist_items NAO consta na publicacao supabase_realtime.
--        Mudancas de programacao nao sao empurradas ao player.
--
-- Correcao minima (nenhuma coluna/policy/RPC alterada):
--   1) REPLICA IDENTITY FULL em remote_commands e playlist_items;
--   2) ADD TABLE playlist_items na publicacao supabase_realtime.
--
-- RLS permanece como autoridade de entrega (realtime aplica SELECT RLS por
-- assinante): rc_select_own / "Users can view their playlist items".
-- Idempotente: pode ser reaplicada sem dano.
-- ============================================================================

BEGIN;

ALTER TABLE public.remote_commands REPLICA IDENTITY FULL;
ALTER TABLE public.playlist_items  REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'playlist_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.playlist_items;
  END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261016', 'realtime_player_channels')
ON CONFLICT (version) DO NOTHING;

COMMIT;
