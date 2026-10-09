-- F-173: Tabloide Digital — a foto do catálogo guarda se já está recortada (fundo transparente),
-- para o cartaz desenhar o produto solto sobre o cartão em vez de emoldurado.
ALTER TABLE public.tabloide_catalogo ADD COLUMN IF NOT EXISTS recortada boolean NOT NULL DEFAULT false;
