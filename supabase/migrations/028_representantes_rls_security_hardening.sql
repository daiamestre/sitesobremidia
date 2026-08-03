-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 028: SECURITY HARDENING & RLS PARA REPRESENTANTES
-- ======================================================================

-- 1. Criação da Tabela de Logs de Segurança (Auditoria de Acesso e Autenticação)
CREATE TABLE IF NOT EXISTS public.security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('LOGIN_FAILED', 'LOGIN_SUCCESS', 'LOGOUT', 'REPRESENTATIVE_APPROVED', 'PASSWORD_CHANGED', 'ACCESS_DENIED')),
  user_email VARCHAR(255),
  user_id UUID,
  user_agent TEXT,
  ip_address VARCHAR(45),
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_logs_event_type ON public.security_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_logs_user_email ON public.security_logs(user_email);

-- 2. Habilitar RLS estrito nas tabelas nucleares
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_operadora ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

-- 3. Remover políticas antigas ou permissivas se existirem para recriação limpa e segura
DROP POLICY IF EXISTS p_rep_clientes_read ON public.clientes;
DROP POLICY IF EXISTS p_rep_clientes_write ON public.clientes;
DROP POLICY IF EXISTS p_admin_all_clientes ON public.clientes;
DROP POLICY IF EXISTS p_usuarios_self_or_admin ON public.usuarios;
DROP POLICY IF EXISTS p_representantes_self_or_admin ON public.representantes;
DROP POLICY IF EXISTS p_security_logs_admin ON public.security_logs;
DROP POLICY IF EXISTS p_security_logs_insert ON public.security_logs;

-- ======================================================================
-- POLÍTICAS RLS: CLIENTES (ISOLAMENTO POR REPRESENTANTE & TENANT)
-- ======================================================================

-- Um representante veja apenas seus próprios clientes
CREATE POLICY p_rep_clientes_read ON public.clientes
FOR SELECT TO authenticated
USING (
  representante_id IN (
    SELECT r.id FROM public.representantes r WHERE r.usuario_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND p.nome IN ('ADMIN', 'GERENTE')
  )
);

-- Um representante pode inserir clientes vinculados apenas à sua própria conta
CREATE POLICY p_rep_clientes_insert ON public.clientes
FOR INSERT TO authenticated
WITH CHECK (
  representante_id IN (
    SELECT r.id FROM public.representantes r WHERE r.usuario_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND p.nome IN ('ADMIN', 'GERENTE')
  )
);

-- Um representante pode atualizar apenas seus próprios clientes
CREATE POLICY p_rep_clientes_update ON public.clientes
FOR UPDATE TO authenticated
USING (
  representante_id IN (
    SELECT r.id FROM public.representantes r WHERE r.usuario_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND p.nome IN ('ADMIN', 'GERENTE')
  )
);

-- Apenas Admin e Gerentes podem excluir clientes
CREATE POLICY p_admin_clientes_delete ON public.clientes
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND p.nome IN ('ADMIN', 'GERENTE')
  )
);

-- ======================================================================
-- POLÍTICAS RLS: USUÁRIOS E REPRESENTANTES (APROVAÇÃO E LEITURA SEGURA)
-- ======================================================================

-- Usuários authenticated podem ver seu próprio perfil ou Admins vêem tudo
CREATE POLICY p_usuarios_self_or_admin ON public.usuarios
FOR SELECT TO authenticated
USING (
  id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND p.nome = 'ADMIN'
  )
);

-- Representante vê seu próprio registro comercial
CREATE POLICY p_representantes_self_or_admin ON public.representantes
FOR ALL TO authenticated
USING (
  usuario_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND p.nome = 'ADMIN'
  )
);

-- ======================================================================
-- POLÍTICAS RLS: SECURITY LOGS
-- ======================================================================

-- Permite inserção de logs de segurança pelo backend/frontend (autenticado ou anônimo durante tentativa de login falha)
CREATE POLICY p_security_logs_insert ON public.security_logs
FOR INSERT TO anon, authenticated
WITH CHECK (TRUE);

-- Apenas ADMIN pode consultar os logs de segurança e auditorias do sistema
CREATE POLICY p_security_logs_admin_select ON public.security_logs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND p.nome = 'ADMIN'
  )
);

-- REGRA GERAL DO SUPABASE: Usuários não autenticados (anon) por padrão são bloqueados de qualquer SELECT em todas as tabelas acima.
