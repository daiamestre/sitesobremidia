-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 009: SISTEMA DE SOLICITAÇÕES DE ACESSO E APROVAÇÃO
-- ======================================================================

-- 1. Tabela de Solicitações de Acesso
CREATE TABLE IF NOT EXISTS public.solicitacoes_acesso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID REFERENCES public.empresa_operadora(id) ON DELETE SET NULL,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  tipo_acesso VARCHAR(30) NOT NULL CHECK (tipo_acesso IN ('REPRESENTANTE', 'GESTOR_TELAS')),
  nome_usuario VARCHAR(150) NOT NULL,
  email_usuario VARCHAR(255) NOT NULL,
  telefone VARCHAR(20),
  dados_cadastro JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  approval_token_hash VARCHAR(128),
  approval_token_expires_at TIMESTAMPTZ,
  approval_used_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.usuarios(id),
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.usuarios(id),
  rejected_at TIMESTAMPTZ,
  motivo_rejeicao TEXT,
  email_admin_enviado BOOLEAN NOT NULL DEFAULT FALSE,
  email_admin_enviado_em TIMESTAMPTZ,
  tentativas_envio INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para buscas rápidas e isolamento por tenant
CREATE INDEX IF NOT EXISTS idx_solicitacoes_email ON public.solicitacoes_acesso(email_usuario);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON public.solicitacoes_acesso(status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_auth ON public.solicitacoes_acesso(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_token ON public.solicitacoes_acesso(approval_token_hash);

-- 2. Trigger para atualização de updated_at
CREATE OR REPLACE TRIGGER trg_solicitacoes_acesso_updated_at 
BEFORE UPDATE ON public.solicitacoes_acesso 
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3. Habilitação de RLS
ALTER TABLE public.solicitacoes_acesso ENABLE ROW LEVEL SECURITY;

-- Policy: Admin tem controle total das solicitações
CREATE POLICY p_admin_solicitacoes ON public.solicitacoes_acesso 
FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.id = auth.uid() AND p.nome = 'ADMIN'
  )
);

-- Policy: Usuário pode ver sua própria solicitação
CREATE POLICY p_user_read_own_solicitacao ON public.solicitacoes_acesso 
FOR SELECT TO authenticated USING (
  auth_user_id = auth.uid()
);

-- Policy: Permite inserção para novos cadastros (anon e authenticated)
CREATE POLICY p_insert_solicitacao ON public.solicitacoes_acesso 
FOR INSERT TO anon, authenticated WITH CHECK (TRUE);
