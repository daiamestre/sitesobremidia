-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 018: HARDENING DE SEGURANÇA E RLS (FASE 8.0-A)
-- ======================================================================

-- 1. Função Auxiliar de Resolução de Tenant por Usuário Autenticado
CREATE OR REPLACE FUNCTION public.get_user_empresa_operadora_id(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Busca empresa_operadora_id vinculada ao usuário em public.usuarios
  SELECT empresa_operadora_id INTO v_tenant_id
  FROM public.usuarios
  WHERE id = p_user_id;

  -- Se não encontrar em usuarios, tenta em public.representantes
  IF v_tenant_id IS NULL THEN
    SELECT empresa_operadora_id INTO v_tenant_id
    FROM public.representantes
    WHERE usuario_id = p_user_id;
  END IF;

  RETURN v_tenant_id;
END;
$$;

-- 2. Reforço de isolamento RLS Multi-Tenant por Tenant ID
-- A) Pedidos de Inserção
DROP POLICY IF EXISTS p_read_pedidos_insercao ON public.pedidos_insercao;
CREATE POLICY p_read_pedidos_insercao ON public.pedidos_insercao FOR SELECT TO authenticated
USING (
  empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR
  public.get_user_empresa_operadora_id(auth.uid()) IS NULL
);

-- B) Produções de Mídia
DROP POLICY IF EXISTS p_read_producoes ON public.producoes;
CREATE POLICY p_read_producoes ON public.producoes FOR SELECT TO authenticated
USING (
  empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR
  public.get_user_empresa_operadora_id(auth.uid()) IS NULL
);

-- C) Agendamentos de Rede
DROP POLICY IF EXISTS p_read_agendamentos ON public.agendamentos;
CREATE POLICY p_read_agendamentos ON public.agendamentos FOR SELECT TO authenticated
USING (
  empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR
  public.get_user_empresa_operadora_id(auth.uid()) IS NULL
);

-- D) Operações da Rede (NOC)
DROP POLICY IF EXISTS p_read_operacoes ON public.operacoes;
CREATE POLICY p_read_operacoes ON public.operacoes FOR SELECT TO authenticated
USING (
  empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()) OR
  public.get_user_empresa_operadora_id(auth.uid()) IS NULL
);

-- 3. Hardening de Segurança em Funções Críticas com SECURITY DEFINER
-- A) fn_gerar_codigo_cliente_atomo
ALTER FUNCTION public.fn_gerar_codigo_cliente_atomo(UUID, VARCHAR) SET search_path = public, pg_temp;

-- B) fn_gerar_numero_contrato_atomo
ALTER FUNCTION public.fn_gerar_numero_contrato_atomo(UUID) SET search_path = public, pg_temp;

-- C) fn_gerar_numero_pi
ALTER FUNCTION public.fn_gerar_numero_pi(UUID) SET search_path = public, pg_temp;

-- D) fn_validar_conflitos_agendamento
ALTER FUNCTION public.fn_validar_conflitos_agendamento(UUID, UUID, UUID, TIME, TIME, TIMESTAMPTZ, TIMESTAMPTZ) SET search_path = public, pg_temp;

-- 4. Função de Validação de Estrutura de Chaves do Cloudflare R2
CREATE OR REPLACE FUNCTION public.fn_validar_r2_object_key(
  p_tenant_id UUID,
  p_object_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Garante que a chave comece obrigatoriamente com tenants/{tenant_id}/
  IF p_object_key LIKE 'tenants/' || p_tenant_id::text || '/%' THEN
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END;
$$;
