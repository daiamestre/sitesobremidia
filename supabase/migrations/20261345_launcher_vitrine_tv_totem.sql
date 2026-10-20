-- F-200 — "Destaques Sobre Mídia" na launcher: o cartão de destaque mostra 4 telas (2 TVs 16:9 e 2 totens 9:16) e cada
-- uma recebe as suas mídias (pontos parceiros e tutoriais do sistema). Cada mídia de destaque ganha a tela em que passa.
-- Aditivo: coluna nova com padrão 'tv1' (linhas atuais continuam valendo) + campo 'vitrine' na resposta de
-- fn_player_launcher (a partir da definição viva). Player 5.7.10: sem impacto. Player 5.8.0–5.8.2 ignora o campo novo.
-- ROLLBACK: recriar fn_player_launcher sem 'vitrine'; ALTER TABLE public.launcher_fundo DROP COLUMN vitrine;

ALTER TABLE public.launcher_fundo ADD COLUMN IF NOT EXISTS vitrine text NOT NULL DEFAULT 'tv1';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'launcher_fundo_vitrine_check') THEN
    ALTER TABLE public.launcher_fundo ADD CONSTRAINT launcher_fundo_vitrine_check
      CHECK (vitrine IN ('tv1', 'tv2', 'totem1', 'totem2'));
  END IF;
END $$;

DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.fn_player_launcher()'::regprocedure);
  IF position('''vitrine''' IN d) = 0 THEN
    d := replace(d, '''duracao_s'', f.duracao_s,', '''duracao_s'', f.duracao_s, ''vitrine'', f.vitrine,');
    IF position('''vitrine''' IN d) = 0 THEN RAISE EXCEPTION 'trecho de fn_player_launcher não encontrado'; END IF;
    EXECUTE d;
  END IF;
END $$;
