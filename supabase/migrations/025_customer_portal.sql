-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 025: PORTAL DO CLIENTE ENTERPRISE (FASE 9.5)
-- ======================================================================

-- 1. Tabela de Usuários do Portal do Cliente
CREATE TABLE IF NOT EXISTS public.portal_usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  senha_hash TEXT NOT NULL,
  mfa_enabled BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'BLOQUEADO', 'INATIVO')),
  ultimo_acesso TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_usuarios_tenant ON public.portal_usuarios(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_portal_usuarios_cliente ON public.portal_usuarios(cliente_id);

-- 2. Tabela de Sessões de Login do Cliente
CREATE TABLE IF NOT EXISTS public.portal_sessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_usuario_id UUID NOT NULL REFERENCES public.portal_usuarios(id) ON DELETE CASCADE,
  ip VARCHAR(45),
  user_agent TEXT,
  dispositivo VARCHAR(100),
  duracao_minutos INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_sessoes_usuario ON public.portal_sessoes(portal_usuario_id);

-- 3. Tabela de Notificações do Portal
CREATE TABLE IF NOT EXISTS public.portal_notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  mensagem TEXT NOT NULL,
  tipo VARCHAR(50) NOT NULL DEFAULT 'GERAL',
  prioridade VARCHAR(20) NOT NULL DEFAULT 'MEDIA' CHECK (prioridade IN ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE')),
  lida BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_notificacoes_cliente ON public.portal_notificacoes(cliente_id);

-- 4. Tabela de Log de Downloads do Cliente
CREATE TABLE IF NOT EXISTS public.portal_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo_documento VARCHAR(50) NOT NULL CHECK (tipo_documento IN ('CONTRATO', 'NF', 'BOLETO', 'POP', 'RELATORIO')),
  nome_arquivo VARCHAR(255) NOT NULL,
  download_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_downloads_cliente ON public.portal_downloads(cliente_id);

-- 5. Tabela de Chamados de Suporte e Atendimento
CREATE TABLE IF NOT EXISTS public.portal_chamados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT NOT NULL,
  categoria VARCHAR(50) NOT NULL DEFAULT 'FINANCEIRO',
  prioridade VARCHAR(20) NOT NULL DEFAULT 'MEDIA' CHECK (prioridade IN ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA')),
  sla_horas INT NOT NULL DEFAULT 24,
  status VARCHAR(30) NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'RESOLVIDO', 'FECHADO')),
  avaliacao INT CHECK (avaliacao BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_chamados_cliente ON public.portal_chamados(cliente_id);

-- 6. Tabela de Aprovação de Artes pelo Cliente
CREATE TABLE IF NOT EXISTS public.portal_aprovacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  producao_id UUID NOT NULL REFERENCES public.producao_midia(id) ON DELETE CASCADE,
  versao INT NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'APROVADO', 'REJEITADO')),
  comentario TEXT,
  aprovado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_aprovacoes_producao ON public.portal_aprovacoes(producao_id);

-- 7. Tabela de Log de Auditoria Imutável do Portal do Cliente
CREATE TABLE IF NOT EXISTS public.portal_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  evento VARCHAR(50) NOT NULL CHECK (evento IN ('LOGIN', 'LOGOUT', 'DOWNLOAD', 'APROVACAO', 'CHAMADO', 'PERFIL')),
  portal_usuario_id UUID REFERENCES public.portal_usuarios(id),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_auditoria_tenant ON public.portal_auditoria(empresa_operadora_id);

-- 8. Habilitação RLS Multi-Tenant
ALTER TABLE public.portal_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_aprovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_auditoria ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'portal_usuarios' AND policyname = 'p_read_portal_usuarios') THEN
    CREATE POLICY p_read_portal_usuarios ON public.portal_usuarios FOR SELECT TO authenticated
    USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'portal_sessoes' AND policyname = 'p_read_portal_sessoes') THEN
    CREATE POLICY p_read_portal_sessoes ON public.portal_sessoes FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'portal_notificacoes' AND policyname = 'p_read_portal_notificacoes') THEN
    CREATE POLICY p_read_portal_notificacoes ON public.portal_notificacoes FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'portal_downloads' AND policyname = 'p_read_portal_downloads') THEN
    CREATE POLICY p_read_portal_downloads ON public.portal_downloads FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'portal_chamados' AND policyname = 'p_read_portal_chamados') THEN
    CREATE POLICY p_read_portal_chamados ON public.portal_chamados FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'portal_aprovacoes' AND policyname = 'p_read_portal_aprovacoes') THEN
    CREATE POLICY p_read_portal_aprovacoes ON public.portal_aprovacoes FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'portal_auditoria' AND policyname = 'p_read_portal_auditoria') THEN
    CREATE POLICY p_read_portal_auditoria ON public.portal_auditoria FOR SELECT TO authenticated USING (TRUE);
  END IF;
END $$;
