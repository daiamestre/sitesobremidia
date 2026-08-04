-- ============================================================================
-- SPRINT 1.5: HARDENING, ZERO TRUST E HOMOLOGAÇÃO OPERACIONAL (NCR-001)
-- MIGRATION 030: CAMADA CONSTITUCIONAL DE SEGURANÇA (SECURITY CORE & ZERO TRUST RLS)
-- ============================================================================

-- ============================================================================
-- 1. SECURITY CORE LAYER (FUNÇÕES CENTRAIS DE AUTENTICAÇÃO E AUTORIZAÇÃO)
-- ============================================================================
-- As policies RLS não devem conter regras de negócio espalhadas ou consultas
-- diretas à tabela usuarios. Toda validação de acesso, tenant scoping e status
-- do ciclo de vida delega autoridade às funções constitucionais abaixo.

-- 1.1 Função interna para ler o status de ciclo de vida e cargo atual do usuário
CREATE OR REPLACE FUNCTION public.fn_get_user_security_context(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE(status_ciclo_vida VARCHAR, cargo_nome VARCHAR, empresa_operadora_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT u.status_ciclo_vida::VARCHAR, p.nome::VARCHAR, u.empresa_operadora_id
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON u.perfil_id = p.id
  WHERE u.id = p_user_id;
END;
$$;

-- 1.2 Separação de AUTENTICAÇÃO: fn_can_login()
-- Valida estritamente se o usuário tem permissão para iniciar sessão no sistema.
CREATE OR REPLACE FUNCTION public.fn_can_login(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_status VARCHAR;
  v_role VARCHAR;
  v_empresa UUID;
BEGIN
  IF p_user_id IS NULL THEN RETURN FALSE; END IF;
  
  SELECT * INTO v_status, v_role, v_empresa FROM public.fn_get_user_security_context(p_user_id);
  
  IF v_role IN ('OWNER', 'ADMIN') THEN RETURN TRUE; END IF;
  IF v_status IN ('ACTIVE', 'APPROVED') THEN RETURN TRUE; END IF;
  
  RETURN FALSE;
END;
$$;

-- 1.3 Separação de AUTORIZAÇÃO: fn_can_access_data() / is_active_user()
-- Valida se um token JWT ativo tem permissão para transacionar dados no ERP em tempo real.
-- Bloqueia instantaneamente tentativas REST de contas PENDING, SUSPENDED, REJECTED, INACTIVE ou DELETED.
CREATE OR REPLACE FUNCTION public.fn_can_access_data(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_status VARCHAR;
  v_role VARCHAR;
  v_empresa UUID;
BEGIN
  IF p_user_id IS NULL THEN RETURN FALSE; END IF;
  
  SELECT * INTO v_status, v_role, v_empresa FROM public.fn_get_user_security_context(p_user_id);
  
  -- OWNER goza de soberania absoluta; ADMIN opera conforme governança ativa
  IF v_role IN ('OWNER', 'ADMIN') THEN RETURN TRUE; END IF;
  
  -- Regra Zero Trust: sem status ACTIVE ou APPROVED em tempo real no banco, o token é barrado
  IF v_status IN ('ACTIVE', 'APPROVED') THEN RETURN TRUE; END IF;
  
  RETURN FALSE;
END;
$$;

-- Alias de compatibilidade arquitetural com especificações iniciais de hardening
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN public.fn_can_access_data(auth.uid());
END;
$$;

-- ============================================================================
-- 2. FUNÇÕES DOMINAIS DE CONSUMO PELAS POLICIES (TENANT SCOPING E CARGOS)
-- ============================================================================

-- 2.1 Autorização para Clientes no CRM
CREATE OR REPLACE FUNCTION public.can_access_client_data(p_empresa_id UUID DEFAULT NULL, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_status VARCHAR;
  v_role VARCHAR;
  v_empresa UUID;
BEGIN
  IF NOT public.fn_can_access_data(p_user_id) THEN RETURN FALSE; END IF;
  
  SELECT * INTO v_status, v_role, v_empresa FROM public.fn_get_user_security_context(p_user_id);
  
  -- Bypass para OWNER e ADMIN
  IF v_role IN ('OWNER', 'ADMIN') THEN RETURN TRUE; END IF;
  
  -- Isolamento Multitenant: empresa_operadora_id deve coincidir
  IF p_empresa_id IS NULL OR p_empresa_id = v_empresa THEN RETURN TRUE; END IF;
  
  RETURN FALSE;
END;
$$;

-- 2.2 Autorização para Contratos
CREATE OR REPLACE FUNCTION public.can_read_contrato(p_representante_id UUID DEFAULT NULL, p_empresa_id UUID DEFAULT NULL, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_status VARCHAR;
  v_role VARCHAR;
  v_empresa UUID;
BEGIN
  IF NOT public.fn_can_access_data(p_user_id) THEN RETURN FALSE; END IF;
  
  SELECT * INTO v_status, v_role, v_empresa FROM public.fn_get_user_security_context(p_user_id);
  
  IF v_role IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'FINANCEIRO') THEN RETURN TRUE; END IF;
  IF v_role = 'REPRESENTANTE' AND p_representante_id = p_user_id THEN RETURN TRUE; END IF;
  
  RETURN FALSE;
END;
$$;

-- 2.3 Autorização para Mídias e Playlists
CREATE OR REPLACE FUNCTION public.can_access_midia(p_empresa_id UUID DEFAULT NULL, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.can_access_client_data(p_empresa_id, p_user_id);
END;
$$;


-- ============================================================================
-- 3. REVISÃO DE POLÍTICAS RLS CONSUMINDO APENAS O SECURITY CORE
-- ============================================================================
-- Erradicação de lógica dispersa em 40+ policies. As policies consomem as funções.

-- Tabela: clientes
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read for active authenticated users" ON public.clientes;
CREATE POLICY "Enable read for active authenticated users" 
ON public.clientes
FOR SELECT 
USING (public.can_access_client_data(empresa_operadora_id));

-- Tabela: contratos
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read for active contracts" ON public.contratos;
CREATE POLICY "Enable read for active contracts" 
ON public.contratos
FOR SELECT 
USING (public.can_read_contrato(representante_id, empresa_operadora_id));

-- Tabela: pedidos_insercao
ALTER TABLE public.pedidos_insercao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read for active PIs" ON public.pedidos_insercao;
CREATE POLICY "Enable read for active PIs" 
ON public.pedidos_insercao
FOR SELECT 
USING (public.fn_can_access_data());

-- Tabela: midias
ALTER TABLE public.midias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read for active media users" ON public.midias;
CREATE POLICY "Enable read for active media users" 
ON public.midias
FOR SELECT 
USING (public.can_access_midia());

-- Tabela: playlists
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read for active playlist users" ON public.playlists;
CREATE POLICY "Enable read for active playlist users" 
ON public.playlists
FOR SELECT 
USING (public.can_access_midia());


-- ============================================================================
-- 4. TRAVA DE CONCORRÊNCIA NA APROVAÇÃO (ANTI-RACE CONDITION)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_guard_approval_concurrency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Se a solicitação JÁ ESTAVA APROVADA antes desta transação tentar modificá-la
  IF OLD.status = 'APPROVED' AND NEW.status = 'APPROVED' THEN
    -- Preserva incondicionalmente os valores originais e evita sobrescrita concorrente
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;
    NEW.approval_used_at := OLD.approval_used_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_approval_concurrency ON public.solicitacoes_acesso;
CREATE TRIGGER trg_guard_approval_concurrency
BEFORE UPDATE ON public.solicitacoes_acesso
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_approval_concurrency();

-- Fim da Migration 030 - Security Core & Zero Trust Hardening (NCR-001)
