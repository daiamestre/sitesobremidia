-- Realtime: publica public.playlists para o Player receber mudancas de cabecalho da playlist na hora.
-- Auditoria 2026-09-24: o Player assinava `playlists` (fora da publicacao) e o servidor derrubava o canal
-- inteiro ("Unable to subscribe to changes ... table: playlists"), atrasando Tela Ativa/atualizacoes ate o polling de 60 s.
-- Aditivo e reversivel: ALTER PUBLICATION supabase_realtime DROP TABLE public.playlists;
-- (`devices` NAO e publicada de proposito: cada heartbeat geraria evento e ela contem screen_token.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'playlists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.playlists;
  END IF;
END $$;
