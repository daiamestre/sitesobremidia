const fs = require('fs');
const path = 'supabase/migrations/00185_corporate_auth_foundation.sql';
let content = fs.readFileSync(path, 'utf8').replace(/\x00/g, '');

const rlsFix = `
-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) & TENANT ISOLATION (FIXED BY RED TEAM)
-- ==============================================================================

-- Habilitar RLS em todas as tabelas fundacionais
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_ownership ENABLE ROW LEVEL SECURITY;

-- 1. ORGANIZATIONS
CREATE POLICY "organizations_select_policy" ON public.organizations
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        id IN (SELECT organization_id FROM public.usuarios WHERE id = auth.uid())
    );

CREATE POLICY "organizations_modify_policy" ON public.organizations
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        id IN (SELECT organization_id FROM public.usuarios WHERE id = auth.uid() AND is_owner = true)
    );

-- 2. DEPARTMENTS
CREATE POLICY "departments_select_policy" ON public.departments
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.usuarios u
            WHERE u.id = auth.uid() AND u.organization_id = departments.organization_id
        )
    );

CREATE POLICY "departments_modify_policy" ON public.departments
    FOR ALL
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.usuarios u
            JOIN public.roles r ON u.role_id = r.id
            WHERE u.id = auth.uid() 
            AND u.organization_id = departments.organization_id 
            AND (u.is_owner = true OR r.name = 'ADMIN')
        )
    );

-- 3. ROLES E PERMISSIONS (Dicionario Global)
-- Como não possuem organization_id, devem ser apenas leitura para usuários normais.
CREATE POLICY "roles_select_policy" ON public.roles
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "permissions_select_policy" ON public.permissions
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "role_permissions_select_policy" ON public.role_permissions
    FOR SELECT USING (auth.role() = 'authenticated');

-- 4. SYSTEM_OWNERSHIP
CREATE POLICY "system_ownership_select_policy" ON public.system_ownership
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM public.usuarios u
            WHERE u.id = auth.uid() AND u.organization_id = system_ownership.organization_id
        )
    );

`;

if (!content.includes('ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY')) {
    
    // Add ownership_scope as well
    content = content.replace(
        "owner_locked BOOLEAN DEFAULT false;",
        "owner_locked BOOLEAN DEFAULT false;\n      END IF;\n      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'ownership_scope') THEN\n          ALTER TABLE public.usuarios ADD COLUMN ownership_scope TEXT DEFAULT 'ORGANIZATION_OWNER'; -- Pode ser PLATFORM_OWNER ou ORGANIZATION_OWNER"
    );

    fs.writeFileSync(path, content + rlsFix, 'utf8');
    console.log('Appended RLS to 00185 and added ownership_scope roadmap column.');
} else {
    console.log('RLS already exists in 00185');
}
