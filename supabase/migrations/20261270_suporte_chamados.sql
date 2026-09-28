-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261270 — F-102
-- Suporte com triagem (Anunciante e Gestor de Mídias → OWNER/ADMIN).
--
-- Regra do proprietário:
--   * quem abre (anunciante, gestor…) escolhe o MOTIVO (triagem) e escreve;
--     a mensagem chega ao OWNER e a TODOS os ADMIN do tenant;
--   * só OWNER/ADMIN atendem e fecham como RESOLVIDO;
--   * resolvido = canal fechado; para falar de novo, abre-se outro suporte;
--   * um chamado aberto por vez por usuário (abrir de novo devolve o aberto).
--
-- Aditiva: tabelas novas (suporte_chamados, suporte_mensagens) + RPCs.
-- Nada existente é alterado (conversas/grupos da Central seguem iguais;
-- portal_chamados legado, vazio, fica intocado).
-- Escrita só pelas RPCs (SECURITY DEFINER); leitura por RLS:
--   quem abriu vê os seus; OWNER/ADMIN do tenant veem todos.
-- Player: sem impacto.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.suporte_abrir_chamado(text,text,text);
--   DROP FUNCTION IF EXISTS public.suporte_enviar_mensagem(uuid,text);
--   DROP FUNCTION IF EXISTS public.suporte_resolver(uuid);
--   DROP FUNCTION IF EXISTS public.suporte_avisar_atendentes(uuid,text,text,uuid);
--   DROP FUNCTION IF EXISTS public.suporte_avisar(uuid,uuid,text,text,text,uuid,text);
--   DROP FUNCTION IF EXISTS public.suporte_rotulo_categoria(text);
--   DROP FUNCTION IF EXISTS public.suporte_eh_atendente();
--   DROP TABLE IF EXISTS public.suporte_mensagens;
--   DROP TABLE IF EXISTS public.suporte_chamados;
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.suporte_chamados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id uuid NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  aberto_por uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  perfil_origem text NOT NULL,
  categoria text NOT NULL CHECK (categoria IN ('FATURA_PAGAMENTO','ATIVACAO_MIDIA','CAMPANHA_TELAS','ACESSO_CONTA','OUTRO')),
  assunto text NOT NULL CHECK (length(btrim(assunto)) BETWEEN 3 AND 140),
  status text NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO','EM_ATENDIMENTO','RESOLVIDO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ultima_mensagem_em timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz,
  resolvido_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS suporte_chamados_tenant_status_idx ON public.suporte_chamados (empresa_operadora_id, status, ultima_mensagem_em DESC);
CREATE INDEX IF NOT EXISTS suporte_chamados_aberto_por_idx ON public.suporte_chamados (aberto_por, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS suporte_um_aberto_por_usuario ON public.suporte_chamados (aberto_por) WHERE status <> 'RESOLVIDO';

CREATE TABLE IF NOT EXISTS public.suporte_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id uuid NOT NULL REFERENCES public.suporte_chamados(id) ON DELETE CASCADE,
  remetente_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  do_atendente boolean NOT NULL DEFAULT false,
  mensagem text NOT NULL CHECK (length(btrim(mensagem)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suporte_mensagens_chamado_idx ON public.suporte_mensagens (chamado_id, created_at);

-- OWNER ou ADMIN do próprio tenant
CREATE OR REPLACE FUNCTION public.suporte_eh_atendente()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid()
      AND (u.is_owner = true OR upper(coalesce(p.nome, '')) IN ('OWNER', 'ADMIN'))
  );
$$;

ALTER TABLE public.suporte_chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suporte_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sch_select ON public.suporte_chamados;
CREATE POLICY sch_select ON public.suporte_chamados FOR SELECT TO authenticated
  USING (
    aberto_por = auth.uid()
    OR (public.suporte_eh_atendente() AND empresa_operadora_id = public.get_user_tenant_id())
  );

DROP POLICY IF EXISTS smg_select ON public.suporte_mensagens;
CREATE POLICY smg_select ON public.suporte_mensagens FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.suporte_chamados c
     WHERE c.id = suporte_mensagens.chamado_id
       AND (c.aberto_por = auth.uid()
            OR (public.suporte_eh_atendente() AND c.empresa_operadora_id = public.get_user_tenant_id()))
  ));
-- sem policies de INSERT/UPDATE/DELETE: escrita só pelas RPCs abaixo

REVOKE ALL ON public.suporte_chamados, public.suporte_mensagens FROM anon;
GRANT SELECT ON public.suporte_chamados, public.suporte_mensagens TO authenticated;

-- Aviso na Central (notificacoes_central) para um usuário
CREATE OR REPLACE FUNCTION public.suporte_avisar(p_usuario uuid, p_tenant uuid, p_titulo text, p_msg text, p_rota text, p_chamado uuid, p_prioridade text)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.notificacoes_central
    (empresa_operadora_id, usuario_id, tipo_evento, canal, titulo, mensagem, status_envio, lida,
     prioridade, severidade, status_notificacao, rota_destino, entidade_relacionada_tipo, entidade_relacionada_id, enviado_em)
  VALUES
    (p_tenant, p_usuario, 'SUPORTE', 'IN_APP', left(p_titulo, 250), left(p_msg, 1000), 'SENT', false,
     p_prioridade, 'INFO', 'NAO_LIDA', p_rota, 'SUPORTE_CHAMADO', p_chamado, now());
$$;
REVOKE ALL ON FUNCTION public.suporte_avisar(uuid, uuid, text, text, text, uuid, text) FROM public, anon, authenticated;

-- Rota da Central de cada atendente (OWNER em /workspace; ADMIN idem)
CREATE OR REPLACE FUNCTION public.suporte_avisar_atendentes(p_tenant uuid, p_titulo text, p_msg text, p_chamado uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT u.id FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.empresa_operadora_id = p_tenant
      AND (u.is_owner = true OR upper(coalesce(p.nome, '')) IN ('OWNER', 'ADMIN'))
      AND coalesce(u.ativo, true)
  LOOP
    PERFORM public.suporte_avisar(r.id, p_tenant, p_titulo, p_msg, '/workspace/central?aba=suporte', p_chamado, 'IMPORTANTE');
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.suporte_avisar_atendentes(uuid, text, text, uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.suporte_rotulo_categoria(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p
    WHEN 'FATURA_PAGAMENTO' THEN 'Fatura ou pagamento'
    WHEN 'ATIVACAO_MIDIA'   THEN 'Ativação de mídia'
    WHEN 'CAMPANHA_TELAS'   THEN 'Campanha ou telas'
    WHEN 'ACESSO_CONTA'     THEN 'Acesso à conta'
    ELSE 'Outro assunto' END;
$$;

-- Abrir suporte (triagem obrigatória). Se já houver um aberto, devolve o aberto.
CREATE OR REPLACE FUNCTION public.suporte_abrir_chamado(p_categoria text, p_assunto text, p_mensagem text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_u record;
  v_id uuid;
  v_nome text;
BEGIN
  SELECT u.id, u.nome, u.empresa_operadora_id, u.cliente_id,
         CASE WHEN u.is_owner THEN 'OWNER' ELSE upper(coalesce(p.nome, '')) END AS perfil
    INTO v_u
    FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id
   WHERE u.id = auth.uid();
  IF v_u.id IS NULL THEN RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501'; END IF;
  IF v_u.perfil IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Dono e administradores atendem o suporte; não abrem chamado.' USING ERRCODE = '42501';
  END IF;
  IF p_categoria NOT IN ('FATURA_PAGAMENTO','ATIVACAO_MIDIA','CAMPANHA_TELAS','ACESSO_CONTA','OUTRO') THEN
    RAISE EXCEPTION 'Escolha o motivo do contato.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_assunto, ''))) < 3 THEN RAISE EXCEPTION 'Descreva o assunto.' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_mensagem, ''))) < 1 THEN RAISE EXCEPTION 'Escreva a mensagem.' USING ERRCODE = '22023'; END IF;

  SELECT id INTO v_id FROM public.suporte_chamados WHERE aberto_por = v_u.id AND status <> 'RESOLVIDO' LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'JA_ABERTO', 'chamado_id', v_id);
  END IF;

  INSERT INTO public.suporte_chamados (empresa_operadora_id, aberto_por, cliente_id, perfil_origem, categoria, assunto)
  VALUES (v_u.empresa_operadora_id, v_u.id, v_u.cliente_id, coalesce(nullif(v_u.perfil, ''), 'USUARIO'), p_categoria, btrim(p_assunto))
  RETURNING id INTO v_id;

  INSERT INTO public.suporte_mensagens (chamado_id, remetente_id, do_atendente, mensagem)
  VALUES (v_id, v_u.id, false, btrim(p_mensagem));

  SELECT coalesce(e.nome_fantasia, e.razao_social) INTO v_nome FROM public.empresas e WHERE e.cliente_id = v_u.cliente_id LIMIT 1;
  PERFORM public.suporte_avisar_atendentes(
    v_u.empresa_operadora_id,
    'Novo suporte: ' || public.suporte_rotulo_categoria(p_categoria),
    coalesce(v_nome, v_u.nome, 'Usuário') || ' — ' || btrim(p_assunto),
    v_id);

  RETURN jsonb_build_object('status', 'OK', 'chamado_id', v_id);
END;
$$;

-- Enviar mensagem: quem abriu (se não resolvido) ou OWNER/ADMIN do tenant
CREATE OR REPLACE FUNCTION public.suporte_enviar_mensagem(p_chamado uuid, p_mensagem text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c public.suporte_chamados%ROWTYPE;
  v_atendente boolean := public.suporte_eh_atendente();
BEGIN
  SELECT * INTO c FROM public.suporte_chamados WHERE id = p_chamado FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Chamado não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF NOT (c.aberto_por = auth.uid() OR (v_atendente AND c.empresa_operadora_id = public.get_user_tenant_id())) THEN
    RAISE EXCEPTION 'Sem permissão neste chamado.' USING ERRCODE = '42501';
  END IF;
  IF c.status = 'RESOLVIDO' THEN
    RAISE EXCEPTION 'Este suporte foi encerrado. Abra um novo suporte.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_mensagem, ''))) < 1 THEN RAISE EXCEPTION 'Escreva a mensagem.' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.suporte_mensagens (chamado_id, remetente_id, do_atendente, mensagem)
  VALUES (c.id, auth.uid(), c.aberto_por <> auth.uid(), btrim(p_mensagem));

  UPDATE public.suporte_chamados
     SET ultima_mensagem_em = now(), updated_at = now(),
         status = CASE WHEN c.aberto_por <> auth.uid() THEN 'EM_ATENDIMENTO' ELSE status END
   WHERE id = c.id;

  IF c.aberto_por <> auth.uid() THEN
    PERFORM public.suporte_avisar(c.aberto_por, c.empresa_operadora_id, 'Resposta do suporte',
      left(btrim(p_mensagem), 300),
      CASE WHEN c.perfil_origem IN ('ANUNCIANTE', 'CLIENTE') THEN '/portal/central' ELSE '/dashboard/central?aba=suporte' END,
      c.id, 'IMPORTANTE');
  ELSE
    PERFORM public.suporte_avisar_atendentes(c.empresa_operadora_id, 'Nova mensagem no suporte', c.assunto, c.id);
  END IF;

  RETURN jsonb_build_object('status', 'OK');
END;
$$;

-- Encerrar como resolvido (só OWNER/ADMIN do tenant)
CREATE OR REPLACE FUNCTION public.suporte_resolver(p_chamado uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE c public.suporte_chamados%ROWTYPE;
BEGIN
  IF NOT public.suporte_eh_atendente() THEN
    RAISE EXCEPTION 'Só o dono e os administradores encerram o suporte.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.suporte_chamados WHERE id = p_chamado FOR UPDATE;
  IF c.id IS NULL OR c.empresa_operadora_id <> public.get_user_tenant_id() THEN
    RAISE EXCEPTION 'Chamado não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF c.status = 'RESOLVIDO' THEN RETURN jsonb_build_object('status', 'OK'); END IF;

  UPDATE public.suporte_chamados
     SET status = 'RESOLVIDO', resolvido_em = now(), resolvido_por = auth.uid(), updated_at = now()
   WHERE id = c.id;

  PERFORM public.suporte_avisar(c.aberto_por, c.empresa_operadora_id, 'Suporte resolvido',
    'Seu atendimento "' || c.assunto || '" foi encerrado. Se precisar, abra um novo suporte.',
    CASE WHEN c.perfil_origem IN ('ANUNCIANTE', 'CLIENTE') THEN '/portal/central' ELSE '/dashboard/central?aba=suporte' END,
    c.id, 'SUCESSO');
  RETURN jsonb_build_object('status', 'OK');
END;
$$;

REVOKE ALL ON FUNCTION public.suporte_abrir_chamado(text, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.suporte_enviar_mensagem(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.suporte_resolver(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.suporte_abrir_chamado(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suporte_enviar_mensagem(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suporte_resolver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suporte_eh_atendente() TO authenticated;
