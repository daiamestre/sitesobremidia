-- ==============================================================================
-- FASE 003-A.2: CORPORATE OS INFRASTRUCTURE HARDENING
-- ==============================================================================
-- 1. CORPORATE NAVIGATION (Database Driven Menu)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.corporate_navigation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    route TEXT,
    parent_id UUID REFERENCES public.corporate_navigation(id) ON DELETE CASCADE,
    feature_flag TEXT,
    required_license TEXT,
    permission_required TEXT,
    display_order INTEGER DEFAULT 0,
    visible BOOLEAN DEFAULT true,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Index for fast lookup by module and organization
CREATE INDEX idx_corporate_nav_org ON public.corporate_navigation(organization_id, module_key);

-- ==============================================================================
-- 2. AUDIT EVENTS (Owner's Eyes)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    actor_email TEXT NOT NULL,
    actor_user_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    target_id TEXT, -- Pode ser o ID do usuário criado, configuração alterada, etc
    metadata JSONB, -- Dados extras da auditoria (before/after state)
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_audit_events_actor ON public.audit_events(actor_email);
CREATE INDEX idx_audit_events_org ON public.audit_events(organization_id, module);

-- ==============================================================================
-- 3. SEED INITIAL NAVIGATION DATA FOR OWNER
-- ==============================================================================
DO $$
DECLARE
    v_org_id UUID;
    v_principal_id UUID;
    v_gestao_id UUID;
    v_negocios_id UUID;
    v_operacao_id UUID;
    v_inteligencia_id UUID;
    v_config_id UUID;
BEGIN
    -- Localiza a organização principal do Owner
    SELECT id INTO v_org_id FROM public.organizations WHERE name = 'SOBRE MIDIA PRINCIPAL' LIMIT 1;
    
    IF v_org_id IS NOT NULL THEN
        -- 3.1 PRINCIPAL
        INSERT INTO public.corporate_navigation (organization_id, module_key, name, display_order, permission_required)
        VALUES (v_org_id, 'PRINCIPAL', 'Principal', 10, 'owner.view') RETURNING id INTO v_principal_id;

        INSERT INTO public.corporate_navigation (organization_id, module_key, name, route, parent_id, display_order, permission_required)
        VALUES 
            (v_org_id, 'PRINCIPAL_DASHBOARD', 'Dashboard', '/workspace/corporate', v_principal_id, 10, 'owner.view'),
            (v_org_id, 'PRINCIPAL_COMPANY', 'Minha Empresa', '/workspace/corporate/company', v_principal_id, 20, 'owner.view');

        -- 3.2 GESTÃO
        INSERT INTO public.corporate_navigation (organization_id, module_key, name, display_order, permission_required)
        VALUES (v_org_id, 'GESTAO', 'Gestão', 20, 'users.manage') RETURNING id INTO v_gestao_id;

        INSERT INTO public.corporate_navigation (organization_id, module_key, name, route, parent_id, display_order, permission_required)
        VALUES 
            (v_org_id, 'GESTAO_USERS', 'Usuários', '/workspace/corporate/users', v_gestao_id, 10, 'users.manage'),
            (v_org_id, 'GESTAO_DEPARTMENTS', 'Departamentos', '/workspace/corporate/departments', v_gestao_id, 20, 'departments.manage'),
            (v_org_id, 'GESTAO_ROLES', 'Cargos', '/workspace/corporate/roles', v_gestao_id, 30, 'roles.manage'),
            (v_org_id, 'GESTAO_PERMISSIONS', 'Permissões', '/workspace/corporate/permissions', v_gestao_id, 40, 'permissions.manage');

        -- 3.3 NEGÓCIOS
        INSERT INTO public.corporate_navigation (organization_id, module_key, name, display_order, permission_required)
        VALUES (v_org_id, 'NEGOCIOS', 'Negócios', 30, 'business.view') RETURNING id INTO v_negocios_id;

        INSERT INTO public.corporate_navigation (organization_id, module_key, name, route, parent_id, display_order, permission_required)
        VALUES 
            (v_org_id, 'NEGOCIOS_CLIENTS', 'Clientes', '/workspace/corporate/clients', v_negocios_id, 10, 'clients.view'),
            (v_org_id, 'NEGOCIOS_ADVERTISERS', 'Anunciantes', '/workspace/corporate/advertisers', v_negocios_id, 20, 'advertisers.view'),
            (v_org_id, 'NEGOCIOS_CAMPAIGNS', 'Campanhas', '/workspace/corporate/campaigns', v_negocios_id, 30, 'campaigns.view'),
            (v_org_id, 'NEGOCIOS_CONTRACTS', 'Contratos', '/workspace/corporate/contracts', v_negocios_id, 40, 'contracts.view'),
            (v_org_id, 'NEGOCIOS_FINANCE', 'Financeiro', '/workspace/corporate/finance', v_negocios_id, 50, 'finance.view');

        -- 3.4 OPERAÇÃO
        INSERT INTO public.corporate_navigation (organization_id, module_key, name, display_order, permission_required)
        VALUES (v_org_id, 'OPERACAO', 'Operação', 40, 'operation.view') RETURNING id INTO v_operacao_id;

        INSERT INTO public.corporate_navigation (organization_id, module_key, name, route, parent_id, display_order, permission_required)
        VALUES 
            (v_org_id, 'OPERACAO_NETWORK', 'Rede', '/workspace/corporate/network', v_operacao_id, 10, 'network.view'),
            (v_org_id, 'OPERACAO_PLAYERS', 'Players', '/workspace/corporate/players', v_operacao_id, 20, 'players.view'),
            (v_org_id, 'OPERACAO_NOC', 'NOC', '/workspace/corporate/noc', v_operacao_id, 30, 'noc.view');

        -- 3.5 INTELIGÊNCIA
        INSERT INTO public.corporate_navigation (organization_id, module_key, name, display_order, permission_required)
        VALUES (v_org_id, 'INTELIGENCIA', 'Inteligência', 50, 'intelligence.view') RETURNING id INTO v_inteligencia_id;

        INSERT INTO public.corporate_navigation (organization_id, module_key, name, route, parent_id, display_order, permission_required)
        VALUES 
            (v_org_id, 'INTELIGENCIA_AI', 'Agentes IA', '/workspace/corporate/ai-agents', v_inteligencia_id, 10, 'ai.manage'),
            (v_org_id, 'INTELIGENCIA_DATA', 'Data Intelligence', '/workspace/corporate/data', v_inteligencia_id, 20, 'data.view'),
            (v_org_id, 'INTELIGENCIA_REPORTS', 'Relatórios', '/workspace/corporate/reports', v_inteligencia_id, 30, 'reports.view');

        -- 3.6 CONFIGURAÇÃO
        INSERT INTO public.corporate_navigation (organization_id, module_key, name, display_order, permission_required)
        VALUES (v_org_id, 'CONFIGURACAO', 'Configuração', 60, 'settings.manage') RETURNING id INTO v_config_id;

        INSERT INTO public.corporate_navigation (organization_id, module_key, name, route, parent_id, display_order, permission_required)
        VALUES 
            (v_org_id, 'CONFIGURACAO_SECURITY', 'Segurança', '/workspace/corporate/security', v_config_id, 10, 'security.manage'),
            (v_org_id, 'CONFIGURACAO_AUDIT', 'Auditoria', '/workspace/corporate/audit', v_config_id, 20, 'audit.view'),
            (v_org_id, 'CONFIGURACAO_INTEGRATIONS', 'Integrações', '/workspace/corporate/integrations', v_config_id, 30, 'integrations.manage');
    END IF;
END $$;

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- Habilitar RLS
ALTER TABLE public.corporate_navigation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Politicas para corporate_navigation

-- Todos os usuarios autenticados da organizacao podem ver o menu
CREATE POLICY "corporate_navigation_select_policy" ON public.corporate_navigation
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.usuarios u
            WHERE u.id = auth.uid() AND u.organization_id = corporate_navigation.organization_id
        )
    );

-- Apenas usuarios com permissoes elevadas podem alterar o menu (Admin/Owner) E da mesma organizacao
CREATE POLICY "corporate_navigation_modify_policy" ON public.corporate_navigation
    FOR ALL
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.usuarios u
            JOIN public.roles r ON u.role_id = r.id
            WHERE u.id = auth.uid() 
            AND u.organization_id = corporate_navigation.organization_id 
            AND (u.is_owner = true OR r.name = 'ADMIN')
        )
    );

-- Politicas para audit_events

-- Qualquer usuario autenticado pode gerar um log (inserir) na sua propria organizacao
CREATE POLICY "audit_events_insert_policy" ON public.audit_events
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.usuarios u
            WHERE u.id = auth.uid() AND u.organization_id = audit_events.organization_id
        )
    );

-- Apenas Owners e Auditores (ou Admins) podem ler os logs de auditoria
CREATE POLICY "audit_events_select_policy" ON public.audit_events
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.usuarios u
            JOIN public.roles r ON u.role_id = r.id
            WHERE u.id = auth.uid() 
            AND u.organization_id = audit_events.organization_id 
            AND (u.is_owner = true OR r.name = 'ADMIN' OR r.name = 'AUDITOR')
        )
    );

-- ==============================================================================
-- 5. MELHORIAS DE PERFORMANCE
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_audit_events_org_created ON public.audit_events(organization_id, created_at DESC);
