-- F-178: Tabloide Digital — logos do CABEÇALHO (PNG transparente fornecido pelo dono) no mesmo catálogo de selos.
-- Reaproveita tabloide_selos (R2 + RLS + estado de aprovação + transparência validada); não cria tabela nova.
--  * tipo: 'SELO' = selo para colocar livre no cartaz (como antes); 'LOGO_CABECALHO' = opção da galeria "Logo do Cabeçalho";
--  * miniatura_url: versão leve só para a galeria (o cartaz e a exportação usam o arquivo original, sem perda);
--  * ordem: posição na galeria (as novas logos entram no fim, sem reescrever nada).
-- Quem cadastra/arquiva continua sendo só a central (políticas já existentes); qualquer usuário do editor escolhe.

ALTER TABLE public.tabloide_selos
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'SELO',
  ADD COLUMN IF NOT EXISTS miniatura_url text,
  ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;

ALTER TABLE public.tabloide_selos DROP CONSTRAINT IF EXISTS tabloide_selos_tipo_check;
ALTER TABLE public.tabloide_selos ADD CONSTRAINT tabloide_selos_tipo_check CHECK (tipo IN ('SELO', 'LOGO_CABECALHO'));
ALTER TABLE public.tabloide_selos DROP CONSTRAINT IF EXISTS tabloide_selos_miniatura_check;
ALTER TABLE public.tabloide_selos ADD CONSTRAINT tabloide_selos_miniatura_check CHECK (miniatura_url IS NULL OR miniatura_url ~ '^https://');

-- a logo do cabeçalho tem proporção própria (a primeira é 1403×1121): o limite de tamanho já cobre
CREATE INDEX IF NOT EXISTS tabloide_selos_tipo_ordem ON public.tabloide_selos (empresa_operadora_id, tipo, ordem, nome);
