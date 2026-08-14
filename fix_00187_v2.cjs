const fs = require('fs');
let content = fs.readFileSync('supabase/migrations/00187_corporate_navigation_upgrade.sql', 'utf8');

const rlsIndex = content.indexOf('-- 4. ROW LEVEL SECURITY (RLS)');
if (rlsIndex === -1) {
    console.error('RLS section not found!');
    process.exit(1);
}

// Keep everything before the RLS section
const newContent = content.substring(0, rlsIndex) + `-- 4. ROW LEVEL SECURITY (RLS)
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
`;

fs.writeFileSync('supabase/migrations/00187_corporate_navigation_upgrade.sql', newContent, 'utf8');
console.log('RLS policies rewritten successfully.');
