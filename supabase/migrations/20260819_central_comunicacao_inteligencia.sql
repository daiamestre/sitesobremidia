-- ======================================================================
-- SOBRE MÍDIA ERP - MIGRATION 20260819: CENTRAL DE COMUNICAÇÃO & INTELIGÊNCIA
-- ======================================================================
-- Consolida o módulo Central de Comunicação & Inteligência:
--  1. Colunas de protocolo completo em notificacoes_central
--     (prioridade, severidade, status_notificacao, rota_destino,
--      entidade_relacionada_tipo/id, resolvida_em)
--  2. Tabela solicitacoes (decisão aprovar/rejeitar) com RLS por tenant
--  3. Chat individual e em grupo: conversas, conversa_participantes,
--     conversa_mensagens (RLS por tenant + participante)
--  4. RLS real em notificacoes_central e eventos (isolamento de tenant)
--  5. Triggers de auditoria (auditoria_logs)
--  6. Tabelas adicionadas à publicação realtime (supabase_realtime)
-- Idempotente: seguro para reexecução. Substitui as migrations quebradas
-- 20260812_central_comunicacao_schema.sql / _final.sql (sintaxe inválida
-- e policies USING(true) que violavam o isolamento de tenant).
-- ======================================================================

-- ----------------------------------------------------------------------
-- 0. Funções auxiliares (RBAC/RLS)
-- ----------------------------------------------------------------------

-- Papel do usuário autenticado (OWNER quando is_owner, senão perfil)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN u.is_owner = true THEN 'OWNER'
      ELSE UPPER(COALESCE(p.nome, 'REPRESENTANTE'))
    END
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON u.perfil_id = p.id
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

-- Tenant (empresa_operadora_id) do usuário autenticado
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_operadora_id
  FROM public.usuarios
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- Perfis com poder de decisão/gestão na Central
CREATE OR REPLACE FUNCTION public.is_central_privileged()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON u.perfil_id = p.id
    WHERE u.id = auth.uid()
      AND (
        u.is_owner = true
        OR UPPER(COALESCE(p.nome, '')) IN ('ADMIN','GESTOR','GERENTE','FINANCEIRO','SUPERVISOR')
      )
  );
$$;

-- ----------------------------------------------------------------------
-- 1. notificacoes_central — protocolo completo
-- ----------------------------------------------------------------------

ALTER TABLE public.notificacoes_central
  ADD COLUMN IF NOT EXISTS prioridade VARCHAR(20) NOT NULL DEFAULT 'INFORMATIVO',
  ADD COLUMN IF NOT EXISTS severidade VARCHAR(20) NOT NULL DEFAULT 'INFO',
  ADD COLUMN IF NOT EXISTS status_notificacao VARCHAR(20) NOT NULL DEFAULT 'NAO_LIDA',
  ADD COLUMN IF NOT EXISTS rota_destino TEXT,
  ADD COLUMN IF NOT EXISTS entidade_relacionada_tipo VARCHAR(50),
  ADD COLUMN IF NOT EXISTS entidade_relacionada_id UUID,
  ADD COLUMN IF NOT EXISTS resolvida_em TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notificacoes_central_prioridade_check'
  ) THEN
    ALTER TABLE public.notificacoes_central
      ADD CONSTRAINT notificacoes_central_prioridade_check
      CHECK (prioridade IN ('INFORMATIVO','SUCESSO','ATENCAO','IMPORTANTE','CRITICO'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notificacoes_central_severidade_check'
  ) THEN
    ALTER TABLE public.notificacoes_central
      ADD CONSTRAINT notificacoes_central_severidade_check
      CHECK (severidade IN ('INFO','AVISO','ALERTA','CRITICO'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notificacoes_central_status_notificacao_check'
  ) THEN
    ALTER TABLE public.notificacoes_central
      ADD CONSTRAINT notificacoes_central_status_notificacao_check
      CHECK (status_notificacao IN ('NAO_LIDA','LIDA','RESOLVIDA'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notificacoes_central_usuario_status
  ON public.notificacoes_central(usuario_id, status_notificacao, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_central_empresa
  ON public.notificacoes_central(empresa_operadora_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_central_entidade
  ON public.notificacoes_central(entidade_relacionada_tipo, entidade_relacionada_id);

-- ----------------------------------------------------------------------
-- 2. RLS: notificacoes_central (isolamento de tenant)
-- ----------------------------------------------------------------------

ALTER TABLE public.notificacoes_central ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nc_select_policy" ON public.notificacoes_central;
CREATE POLICY "nc_select_policy" ON public.notificacoes_central
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_tenant_id()
    AND (
      usuario_id = auth.uid()
      OR public.is_central_privileged()
    )
  );

DROP POLICY IF EXISTS "nc_insert_policy" ON public.notificacoes_central;
CREATE POLICY "nc_insert_policy" ON public.notificacoes_central
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = notificacoes_central.usuario_id
        AND u.empresa_operadora_id = public.get_user_tenant_id()
    )
  );

DROP POLICY IF EXISTS "nc_update_policy" ON public.notificacoes_central;
CREATE POLICY "nc_update_policy" ON public.notificacoes_central
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_tenant_id()
    AND (
      usuario_id = auth.uid()
      OR public.is_central_privileged()
    )
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_tenant_id()
    AND (
      usuario_id = auth.uid()
      OR public.is_central_privileged()
    )
  );

-- ----------------------------------------------------------------------
-- 3. solicitacoes — exigem decisão (aprovar/rejeitar/cancelar)
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.solicitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  tipo_solicitacao VARCHAR(50) NOT NULL,
  titulo VARCHAR(150) NOT NULL,
  descricao TEXT,
  entidade_tipo VARCHAR(50),
  entidade_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
  solicitante_id UUID REFERENCES public.usuarios(id),
  responsavel_id UUID REFERENCES public.usuarios(id),
  decisao_motivo TEXT,
  decisao_data TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT solicitacoes_status_check
    CHECK (status IN ('PENDENTE','APROVADA','REJEITADA','CANCELADA','EXPIRADA'))
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_empresa ON public.solicitacoes(empresa_operadora_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_solicitante ON public.solicitacoes(solicitante_id, status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_entidade ON public.solicitacoes(entidade_tipo, entidade_id);

ALTER TABLE public.solicitacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sol_select_policy" ON public.solicitacoes;
CREATE POLICY "sol_select_policy" ON public.solicitacoes
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_tenant_id()
    AND (
      solicitante_id = auth.uid()
      OR public.is_central_privileged()
    )
  );

DROP POLICY IF EXISTS "sol_insert_policy" ON public.solicitacoes;
CREATE POLICY "sol_insert_policy" ON public.solicitacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_tenant_id()
    AND solicitante_id = auth.uid()
  );

DROP POLICY IF EXISTS "sol_update_policy" ON public.solicitacoes;
CREATE POLICY "sol_update_policy" ON public.solicitacoes
  FOR UPDATE TO authenticated
  USING (
    empresa_operadora_id = public.get_user_tenant_id()
    AND public.is_central_privileged()
  )
  WITH CHECK (
    empresa_operadora_id = public.get_user_tenant_id()
    AND public.is_central_privileged()
  );

-- Trigger: auditoria de mudança de status + updated_at
CREATE OR REPLACE FUNCTION public.handle_solicitacao_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text;
BEGIN
  SELECT u.email, COALESCE(UPPER(p.nome), 'SISTEMA')
    INTO v_email, v_role
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON u.perfil_id = p.id
  WHERE u.id = v_user_id;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.auditoria_logs (
      empresa_operadora_id, usuario_id, usuario_email, usuario_role,
      entidade_tipo, entidade_id, acao,
      status_anterior, status_novo, observacoes
    ) VALUES (
      NEW.empresa_operadora_id, v_user_id, v_email, v_role,
      'SOLICITACAO', NEW.id, 'STATUS_CHANGE',
      OLD.status, NEW.status,
      'Decisao registrada via Central de Comunicacao'
    );
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_solicitacao_status ON public.solicitacoes;
CREATE TRIGGER trg_solicitacao_status
  BEFORE UPDATE ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.handle_solicitacao_update();

-- ----------------------------------------------------------------------
-- 4. Chat individual e em grupo
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL DEFAULT 'INDIVIDUAL',
  nome VARCHAR(150),
  criado_por UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversas_tipo_check CHECK (tipo IN ('INDIVIDUAL','GRUPO'))
);

CREATE TABLE IF NOT EXISTS public.conversa_participantes (
  conversa_id UUID NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  ultima_leitura TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversa_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS public.conversa_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  remetente_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  mensagem TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversa_participantes_usuario
  ON public.conversa_participantes(usuario_id, conversa_id);
CREATE INDEX IF NOT EXISTS idx_conversa_mensagens_conversa
  ON public.conversa_mensagens(conversa_id, created_at ASC);

-- Usuário autenticado é participante da conversa?
-- (criada após as tabelas de conversa, pois o corpo da função SQL é
--  validado no CREATE e referencia conversa_participantes)
CREATE OR REPLACE FUNCTION public.is_conversa_participante(p_conversa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversa_participantes cp
    WHERE cp.conversa_id = p_conversa_id
      AND cp.usuario_id = auth.uid()
  );
$$;

-- RLS: conversas (somente participantes)
ALTER TABLE public.conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversa_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversa_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conv_select_policy" ON public.conversas;
CREATE POLICY "conv_select_policy" ON public.conversas
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_tenant_id()
    AND public.is_conversa_participante(id)
  );

DROP POLICY IF EXISTS "conv_insert_policy" ON public.conversas;
CREATE POLICY "conv_insert_policy" ON public.conversas
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_tenant_id()
    AND criado_por = auth.uid()
  );

DROP POLICY IF EXISTS "cp_select_policy" ON public.conversa_participantes;
CREATE POLICY "cp_select_policy" ON public.conversa_participantes
  FOR SELECT TO authenticated
  USING (
    usuario_id = auth.uid()
    OR public.is_conversa_participante(conversa_id)
  );

DROP POLICY IF EXISTS "cp_insert_policy" ON public.conversa_participantes;
CREATE POLICY "cp_insert_policy" ON public.conversa_participantes
  FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id IN (
      SELECT u.id FROM public.usuarios u WHERE u.empresa_operadora_id = public.get_user_tenant_id()
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.conversas c
        WHERE c.id = conversa_id
          AND c.empresa_operadora_id = public.get_user_tenant_id()
          AND (c.criado_por = auth.uid() OR public.is_conversa_participante(c.id))
      )
    )
  );

DROP POLICY IF EXISTS "cp_update_policy" ON public.conversa_participantes;
CREATE POLICY "cp_update_policy" ON public.conversa_participantes
  FOR UPDATE TO authenticated
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

DROP POLICY IF EXISTS "cm_select_policy" ON public.conversa_mensagens;
CREATE POLICY "cm_select_policy" ON public.conversa_mensagens
  FOR SELECT TO authenticated
  USING (
    empresa_operadora_id = public.get_user_tenant_id()
    AND public.is_conversa_participante(conversa_id)
  );

DROP POLICY IF EXISTS "cm_insert_policy" ON public.conversa_mensagens;
CREATE POLICY "cm_insert_policy" ON public.conversa_mensagens
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_tenant_id()
    AND remetente_id = auth.uid()
    AND public.is_conversa_participante(conversa_id)
  );

-- Trigger: auditoria de mensagens
CREATE OR REPLACE FUNCTION public.handle_conversa_mensagem_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text;
BEGIN
  SELECT u.email, COALESCE(UPPER(p.nome), 'SISTEMA')
    INTO v_email, v_role
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON u.perfil_id = p.id
  WHERE u.id = v_user_id;

  INSERT INTO public.auditoria_logs (
    empresa_operadora_id, usuario_id, usuario_email, usuario_role,
    entidade_tipo, entidade_id, acao, observacoes
  ) VALUES (
    NEW.empresa_operadora_id, v_user_id, v_email, v_role,
    'MENSAGEM', NEW.id, 'INSERT',
    'Mensagem enviada na conversa ' || NEW.conversa_id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversa_mensagem_audit ON public.conversa_mensagens;
CREATE TRIGGER trg_conversa_mensagem_audit
  AFTER INSERT ON public.conversa_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.handle_conversa_mensagem_insert();

-- Trigger: auditoria de leitura/resolução de notificações
CREATE OR REPLACE FUNCTION public.handle_notificacao_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text;
BEGIN
  IF OLD.status_notificacao IS DISTINCT FROM NEW.status_notificacao THEN
    SELECT u.email, COALESCE(UPPER(p.nome), 'SISTEMA')
      INTO v_email, v_role
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON u.perfil_id = p.id
    WHERE u.id = v_user_id;

    INSERT INTO public.auditoria_logs (
      empresa_operadora_id, usuario_id, usuario_email, usuario_role,
      entidade_tipo, entidade_id, acao,
      status_anterior, status_novo, observacoes
    ) VALUES (
      NEW.empresa_operadora_id, v_user_id, v_email, v_role,
      'NOTIFICACAO', NEW.id, 'STATUS_CHANGE',
      OLD.status_notificacao, NEW.status_notificacao,
      'Leitura/resolucao de notificacao na Central'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificacao_audit ON public.notificacoes_central;
CREATE TRIGGER trg_notificacao_audit
  AFTER UPDATE OF status_notificacao ON public.notificacoes_central
  FOR EACH ROW EXECUTE FUNCTION public.handle_notificacao_audit();

-- ----------------------------------------------------------------------
-- 5. RLS: eventos (event bus) — isolamento de tenant
-- ----------------------------------------------------------------------

ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_tentativas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evt_select_policy" ON public.eventos;
CREATE POLICY "evt_select_policy" ON public.eventos
  FOR SELECT TO authenticated
  USING (empresa_operadora_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "evt_insert_policy" ON public.eventos;
CREATE POLICY "evt_insert_policy" ON public.eventos
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_operadora_id = public.get_user_tenant_id()
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "evtt_select_policy" ON public.eventos_tentativas;
CREATE POLICY "evtt_select_policy" ON public.eventos_tentativas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.eventos e
      WHERE e.id = eventos_tentativas.evento_id
        AND e.empresa_operadora_id = public.get_user_tenant_id()
    )
  );

DROP POLICY IF EXISTS "evtt_insert_policy" ON public.eventos_tentativas;
CREATE POLICY "evtt_insert_policy" ON public.eventos_tentativas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.eventos e
      WHERE e.id = eventos_tentativas.evento_id
        AND e.empresa_operadora_id = public.get_user_tenant_id()
    )
  );

-- ----------------------------------------------------------------------
-- 6. Realtime: tabelas da Central na publicação supabase_realtime
-- ----------------------------------------------------------------------

DO $$
DECLARE
  v_tab text;
BEGIN
  FOREACH v_tab IN ARRAY ARRAY[
    'notificacoes_central',
    'solicitacoes',
    'conversas',
    'conversa_participantes',
    'conversa_mensagens',
    'eventos'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_tab
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', v_tab);
    END IF;
  END LOOP;
END $$;