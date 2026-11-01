-- F-252 — Foto enviada vira a foto OFICIAL do produto, para todos, quando o produto ainda não tem foto.
-- Motivo: regra do dono (01/11/2026): "o sistema grava a imagem do produto pelo nome e deixa como foto oficial daquele produto".
--   Antes, a foto enviada por anunciante ficava só para ele (cliente_id preenchido), e os outros seguiam sem foto.
-- Aditivo: só um INSERT a mais no ramo UPLOAD, quando não existe linha da empresa (cliente_id nulo) para o nome. Quem já tem foto
--   oficial não muda: a foto oficial de um produto não pode ser trocada por um anunciante; só a central a troca.
-- Impacto no Player: nenhum. O catálogo é lido só pelo painel, ao montar a arte.
-- ROLLBACK: aplicar a definição guardada em docs/engineering/evidence/F-252_catalogo_foto_oficial/antes.txt;
--   as linhas criadas por esta regra têm origem 'UPLOAD' e cliente_id nulo.

CREATE OR REPLACE FUNCTION public.tabloide_catalogo_salvar(p_nome text, p_nome_norm text, p_url text, p_fonte text, p_credito text, p_recortada boolean, p_origem text, p_recorte_tentado boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- F-252: regra do dono: produto SEM foto oficial ganha a foto enviada por qualquer usuário, para todos.
    -- Produto que já tem foto oficial não muda: o envio fica como preferência de quem enviou (só a central troca a oficial).
    IF v_alvo IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.tabloide_catalogo
       WHERE empresa_operadora_id = v_tenant AND nome_norm = p_nome_norm AND cliente_id IS NULL
    ) THEN
      INSERT INTO public.tabloide_catalogo (empresa_operadora_id, cliente_id, nome_norm, nome, imagem_url, fonte, credito, recortada, recorte_tentado, origem)
      VALUES (v_tenant, NULL, p_nome_norm, p_nome, p_url, 'UPLOAD', p_credito, p_recortada, p_recorte_tentado, 'UPLOAD');
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
END $function$
;
