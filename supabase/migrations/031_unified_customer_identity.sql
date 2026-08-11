-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 031: UNIFIED CUSTOMER IDENTITY & ZERO MOCK
-- ======================================================================

-- 1. Remoção de referências à tabela portal_usuarios
ALTER TABLE public.portal_auditoria DROP COLUMN IF EXISTS portal_usuario_id;
ALTER TABLE public.portal_auditoria ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES public.usuarios(id) ON DELETE CASCADE;

-- 2. Drop das tabelas paralelas (Identidade Única via auth.users)
DROP TABLE IF EXISTS public.portal_sessoes CASCADE;
DROP TABLE IF EXISTS public.portal_usuarios CASCADE;

-- 3. Injeção do cliente_id na tabela principal de usuários
ALTER TABLE public.usuarios 
ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_usuarios_cliente ON public.usuarios(cliente_id);

-- 4. Atualização das Políticas RLS do Portal para validar o cliente logado
-- As políticas antigas permitiam acesso se authenticated. Agora elas verificam se o cliente_id do usuário logado bate com o cliente_id do registro.

DO $$
BEGIN
  -- portal_notificacoes
  DROP POLICY IF EXISTS p_read_portal_notificacoes ON public.portal_notificacoes;
  CREATE POLICY p_read_portal_notificacoes ON public.portal_notificacoes 
  FOR SELECT TO authenticated 
  USING (
    cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid()) 
    OR 
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  );

  -- portal_downloads
  DROP POLICY IF EXISTS p_read_portal_downloads ON public.portal_downloads;
  CREATE POLICY p_read_portal_downloads ON public.portal_downloads 
  FOR SELECT TO authenticated 
  USING (
    cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid()) 
    OR 
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  );

  -- portal_chamados
  DROP POLICY IF EXISTS p_read_portal_chamados ON public.portal_chamados;
  CREATE POLICY p_read_portal_chamados ON public.portal_chamados 
  FOR SELECT TO authenticated 
  USING (
    cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid()) 
    OR 
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  );
  
  -- portal_aprovacoes
  -- Acesso via producao_midia -> pi -> contrato -> cliente_id
  DROP POLICY IF EXISTS p_read_portal_aprovacoes ON public.portal_aprovacoes;
  CREATE POLICY p_read_portal_aprovacoes ON public.portal_aprovacoes 
  FOR SELECT TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.producao_midia pm
      JOIN public.pedidos_insercao pi ON pi.id = pm.pedido_insercao_id
      JOIN public.contratos c ON c.id = pi.contrato_id
      WHERE pm.id = portal_aprovacoes.producao_id
      AND c.cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
    )
    OR 
    empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  );

END $$;
