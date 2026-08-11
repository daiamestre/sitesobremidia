-- ==============================================================================
-- FASE 003-A.1: CORPORATE OS FOUNDATION (MODULES & SETTINGS)
-- ==============================================================================

-- 1. CORPORATE MODULES
CREATE TABLE IF NOT EXISTS public.corporate_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(organization_id, module_key)
);

-- 2. CORPORATE SETTINGS
CREATE TABLE IF NOT EXISTS public.corporate_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    setting_key TEXT NOT NULL,
    setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(organization_id, setting_key)
);

-- ==============================================================================
-- 3. ROW LEVEL SECURITY (RLS) & TENANT ISOLATION
-- ==============================================================================

ALTER TABLE public.corporate_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_settings ENABLE ROW LEVEL SECURITY;

-- CORPORATE_MODULES
CREATE POLICY "corporate_modules_select_policy" ON public.corporate_modules
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.usuarios u
            WHERE u.id = auth.uid() AND u.organization_id = corporate_modules.organization_id
        )
    );

CREATE POLICY "corporate_modules_modify_policy" ON public.corporate_modules
    FOR ALL
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.usuarios u
            JOIN public.roles r ON u.role_id = r.id
            WHERE u.id = auth.uid() 
            AND u.organization_id = corporate_modules.organization_id 
            AND (u.is_owner = true OR r.name = 'ADMIN')
        )
    );

-- CORPORATE_SETTINGS
CREATE POLICY "corporate_settings_select_policy" ON public.corporate_settings
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.usuarios u
            WHERE u.id = auth.uid() AND u.organization_id = corporate_settings.organization_id
        )
    );

CREATE POLICY "corporate_settings_modify_policy" ON public.corporate_settings
    FOR ALL
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.usuarios u
            JOIN public.roles r ON u.role_id = r.id
            WHERE u.id = auth.uid() 
            AND u.organization_id = corporate_settings.organization_id 
            AND (u.is_owner = true OR r.name = 'ADMIN')
        )
    );

-- PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_corp_modules_org ON public.corporate_modules(organization_id);
CREATE INDEX IF NOT EXISTS idx_corp_settings_org ON public.corporate_settings(organization_id);
