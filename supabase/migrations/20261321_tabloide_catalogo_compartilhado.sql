-- F-177: Tabloide Digital — catálogo de fotos COMPARTILHADO por toda a empresa.
-- Antes, a foto achada por um anunciante ficava só dele e o próximo anunciante buscava tudo de novo.
-- Agora: foto achada automaticamente ou escolhida vale para todos (linha com cliente_id nulo);
-- foto ENVIADA pelo anunciante continua só dele; a equipe (central) pode corrigir a foto de todos.
-- A chave do nome passa a ser canônica (src/lib/tabloide/chave.ts): "Coca-Cola 2L" = "2 litros Coca Cola".

ALTER TABLE public.tabloide_catalogo DROP CONSTRAINT IF EXISTS tabloide_catalogo_fonte_check;
ALTER TABLE public.tabloide_catalogo ADD CONSTRAINT tabloide_catalogo_fonte_check
  CHECK (fonte IN ('OPENFOODFACTS', 'PEXELS', 'PIXABAY', 'WIKIMEDIA', 'OPENVERSE', 'UPLOAD', 'IA'));

ALTER TABLE public.tabloide_catalogo
  ADD COLUMN IF NOT EXISTS recortada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recorte_tentado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'AUTO';
ALTER TABLE public.tabloide_catalogo DROP CONSTRAINT IF EXISTS tabloide_catalogo_origem_check;
ALTER TABLE public.tabloide_catalogo ADD CONSTRAINT tabloide_catalogo_origem_check CHECK (origem IN ('AUTO', 'ESCOLHA', 'UPLOAD', 'SEMENTE'));

-- as chaves antigas (só minúsculas, sem ordenar) não casam com a chave canônica: eram só dados de teste
DELETE FROM public.tabloide_catalogo;

-- Guarda a foto de um produto. Quem pode o quê:
--  * foto enviada (UPLOAD): anunciante guarda só para si; a central guarda para a empresa;
--  * foto achada (AUTO) ou escolhida (ESCOLHA): vale para a empresa inteira se ainda não houver; nunca troca a que já existe,
--    a não ser para "melhorar" (a mesma foto, agora recortada) ou quando a central corrige (ESCOLHA da central);
--  * escolha de anunciante vira também preferência dele, sem mexer na dos outros.
CREATE OR REPLACE FUNCTION public.tabloide_catalogo_salvar(
  p_nome text, p_nome_norm text, p_url text, p_fonte text, p_credito text,
  p_recortada boolean, p_origem text, p_recorte_tentado boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant_id();
  v_cli uuid := (SELECT u.cliente_id FROM public.usuarios u WHERE u.id = auth.uid());
  v_priv boolean := public.is_central_privileged();
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
  v_alvo uuid;
  v_id uuid;
  v_recortada_atual boolean;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF coalesce(length(p_nome_norm), 0) < 2 OR length(p_nome_norm) > 160 OR length(p_nome) > 160 THEN RAISE EXCEPTION 'Nome inválido'; END IF;
  IF p_url !~ '^https://' OR length(p_url) > 800 THEN RAISE EXCEPTION 'Endereço de imagem inválido'; END IF;
  IF p_origem NOT IN ('AUTO', 'ESCOLHA', 'UPLOAD', 'SEMENTE') THEN RAISE EXCEPTION 'Origem inválida'; END IF;
  IF p_origem = 'SEMENTE' AND NOT v_priv THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  IF p_fonte = 'UPLOAD' OR p_origem = 'UPLOAD' THEN
    v_alvo := CASE WHEN v_priv THEN NULL ELSE v_cli END;
    IF v_alvo IS NULL AND NOT v_priv THEN RAISE EXCEPTION 'Cadastro do anunciante não encontrado'; END IF;
    SELECT id INTO v_id FROM public.tabloide_catalogo WHERE empresa_operadora_id = v_tenant AND nome_norm = p_nome_norm AND coalesce(cliente_id, v_zero) = coalesce(v_alvo, v_zero);
    IF v_id IS NULL THEN
      INSERT INTO public.tabloide_catalogo (empresa_operadora_id, cliente_id, nome_norm, nome, imagem_url, fonte, credito, recortada, recorte_tentado, origem)
      VALUES (v_tenant, v_alvo, p_nome_norm, p_nome, p_url, 'UPLOAD', p_credito, p_recortada, p_recorte_tentado, 'UPLOAD');
    ELSE
      UPDATE public.tabloide_catalogo SET imagem_url = p_url, fonte = 'UPLOAD', credito = p_credito, recortada = p_recortada, recorte_tentado = p_recorte_tentado, origem = 'UPLOAD', usos = usos + 1 WHERE id = v_id;
    END IF;
    RETURN;
  END IF;

  -- foto achada/escolhida: linha da empresa (cliente_id nulo)
  SELECT id, recortada INTO v_id, v_recortada_atual FROM public.tabloide_catalogo
   WHERE empresa_operadora_id = v_tenant AND nome_norm = p_nome_norm AND cliente_id IS NULL;
  IF v_id IS NULL THEN
    INSERT INTO public.tabloide_catalogo (empresa_operadora_id, cliente_id, nome_norm, nome, imagem_url, fonte, credito, recortada, recorte_tentado, origem)
    VALUES (v_tenant, NULL, p_nome_norm, p_nome, p_url, p_fonte, p_credito, p_recortada, p_recorte_tentado, p_origem);
  ELSIF p_origem = 'ESCOLHA' AND v_priv THEN
    UPDATE public.tabloide_catalogo SET imagem_url = p_url, fonte = p_fonte, credito = p_credito, recortada = p_recortada, recorte_tentado = p_recorte_tentado, origem = 'ESCOLHA', usos = usos + 1 WHERE id = v_id;
  ELSIF p_recortada AND NOT v_recortada_atual AND p_origem IN ('AUTO', 'SEMENTE') THEN
    -- melhoria: a mesma foto, agora sem fundo
    UPDATE public.tabloide_catalogo SET imagem_url = p_url, recortada = true, recorte_tentado = true WHERE id = v_id;
  ELSIF p_recorte_tentado THEN
    UPDATE public.tabloide_catalogo SET recorte_tentado = true, usos = usos + 1 WHERE id = v_id;
  ELSE
    UPDATE public.tabloide_catalogo SET usos = usos + 1 WHERE id = v_id;
  END IF;

  -- escolha manual de anunciante: vira preferência dele (não muda a dos outros)
  IF p_origem = 'ESCOLHA' AND NOT v_priv AND v_cli IS NOT NULL THEN
    SELECT id INTO v_id FROM public.tabloide_catalogo WHERE empresa_operadora_id = v_tenant AND nome_norm = p_nome_norm AND cliente_id = v_cli;
    IF v_id IS NULL THEN
      INSERT INTO public.tabloide_catalogo (empresa_operadora_id, cliente_id, nome_norm, nome, imagem_url, fonte, credito, recortada, recorte_tentado, origem)
      VALUES (v_tenant, v_cli, p_nome_norm, p_nome, p_url, p_fonte, p_credito, p_recortada, p_recorte_tentado, 'ESCOLHA');
    ELSE
      UPDATE public.tabloide_catalogo SET imagem_url = p_url, fonte = p_fonte, credito = p_credito, recortada = p_recortada, recorte_tentado = p_recorte_tentado, origem = 'ESCOLHA', usos = usos + 1 WHERE id = v_id;
    END IF;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.tabloide_catalogo_salvar(text, text, text, text, text, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tabloide_catalogo_salvar(text, text, text, text, text, boolean, text, boolean) TO authenticated;

-- gravação direta no catálogo passa a ser só pela função (regras acima); leitura continua por RLS
DROP POLICY IF EXISTS tabloide_catalogo_insert ON public.tabloide_catalogo;
DROP POLICY IF EXISTS tabloide_catalogo_update ON public.tabloide_catalogo;
