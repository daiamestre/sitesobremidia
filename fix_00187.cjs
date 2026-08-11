const fs = require('fs');
let content = fs.readFileSync('supabase/migrations/00187_corporate_navigation_upgrade.sql', 'utf8');

// Fix corporate_navigation_modify_policy
content = content.replace(
    /WHERE u\.id = auth\.uid\(\) AND \(u\.is_owner = true OR r\.name = 'ADMIN'\)/,
    "WHERE u.id = auth.uid() \n                                    AND u.organization_id = corporate_navigation.organization_id\n                                    AND (u.is_owner = true OR r.name = 'ADMIN')"
);

// Add index
if (!content.includes('idx_audit_events_org_created')) {
    content += '\n-- Melhoria de performance para Dashboard Owner\nCREATE INDEX IF NOT EXISTS idx_audit_events_org_created ON public.audit_events(organization_id, created_at DESC);\n';
}

fs.writeFileSync('supabase/migrations/00187_corporate_navigation_upgrade.sql', content, 'utf8');
console.log('Fixed 00187!');
