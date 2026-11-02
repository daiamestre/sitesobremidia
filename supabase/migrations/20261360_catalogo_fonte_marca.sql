-- Missão do catálogo — a foto pode ter como fonte a própria marca.
-- Motivo: regra do dono (02/11/2026): as imagens de produto vêm das marcas.
-- Aditivo: o CHECK continua aceitando todas as linhas atuais e passa a aceitar 'MARCA'.
-- Impacto no Player: nenhum. O catálogo é lido só pelo painel, ao montar a arte.
-- ROLLBACK: apagar ou trocar as linhas com fonte 'MARCA' e recriar o CHECK sem esse valor.

ALTER TABLE public.tabloide_catalogo DROP CONSTRAINT tabloide_catalogo_fonte_check;
ALTER TABLE public.tabloide_catalogo ADD CONSTRAINT tabloide_catalogo_fonte_check
  CHECK (fonte = ANY (ARRAY['OPENFOODFACTS'::text, 'PEXELS'::text, 'PIXABAY'::text, 'WIKIMEDIA'::text, 'OPENVERSE'::text, 'UPLOAD'::text, 'IA'::text, 'MARCA'::text]));
