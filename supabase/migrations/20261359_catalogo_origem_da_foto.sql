-- Missão do catálogo, Fase 1 — o catálogo guarda de onde veio cada foto, sob qual licença, o código de barras e o segmento.
-- Motivo: regra da missão (docs/MISSAO_CATALOGO_DE_PRODUTOS.md): foto sem origem registrada não entra.
-- Aditivo: só colunas novas, todas opcionais; nenhuma função, regra de acesso ou linha existente muda.
-- Impacto no Player: nenhum. O catálogo é lido só pelo painel, ao montar a arte.
-- ROLLBACK: ALTER TABLE public.tabloide_catalogo DROP COLUMN origem_url, DROP COLUMN licenca, DROP COLUMN codigo, DROP COLUMN segmento;

ALTER TABLE public.tabloide_catalogo
  ADD COLUMN IF NOT EXISTS origem_url text,
  ADD COLUMN IF NOT EXISTS licenca text,
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS segmento text;
