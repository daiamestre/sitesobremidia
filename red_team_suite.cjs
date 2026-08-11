const fs = require('fs');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL.trim();
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function runTest(name, urlPath, method = 'GET') {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${urlPath}`, {
            method,
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            }
        });
        const data = await res.json().catch(() => ({}));
        
        let status = '❌ FAILED';
        if (res.status === 401 || res.status === 403) {
            status = '✅ PASSED (Blocked by RLS)';
        } else if (res.status === 404) {
            status = '⚠️ ERROR: Table not found (Migration missing)';
        } else if ((res.status === 200 || res.status === 201) && data.length > 0) { status = '❌ FAILED (Data exposed/modified without auth!)'; } else if (res.status === 200 && data.length === 0) { status = '✅ PASSED (Blocked by RLS - Empty Array)'; }
        
        console.log(`[TEST] ${name}`);
        console.log(`  -> Endpoint: /rest/v1/${urlPath}`);
        console.log(`  -> Status: ${res.status}`);
        console.log(`  -> Result: ${status}`);
        if (res.status === 404) console.log(`  -> Details: ${data.message}`);
        console.log('');
        
        return res.status;
    } catch (e) {
        console.log(`[TEST] ${name} -> ERROR: ${e.message}\n`);
        return 500;
    }
}

async function executeRedTeamSuite() {
    console.log('======================================================');
    console.log('🔴 INICIANDO RED TEAM SUITE - FASE 003-A.2');
    console.log('======================================================\n');

    const results = [];

    // 1. Tentar ler organizations anonimamente
    results.push(await runTest('Ataque 3: Usuário sem permissão lendo Organizations', 'organizations?select=*'));

    // 2. Tentar inserir no audit_events anonimamente
    results.push(await runTest('Ataque 3: Usuário sem organização escrevendo em audit_events', 'audit_events', 'POST'));

    // 3. Tentar ler corporate_modules
    results.push(await runTest('Verificar isolamento em corporate_modules', 'corporate_modules?select=*'));

    console.log('======================================================');
    const isMissingMigrations = results.some(r => r === 404);
    if (isMissingMigrations) {
        console.log('🚨 RESULTADO FINAL: Migrations NÃO foram aplicadas no banco de dados real.');
        console.log('A infraestrutura de RLS não existe no Supabase Cloud.');
    } else {
        console.log('🟢 RESULTADO FINAL: Testes executados com sucesso no banco real.');
    }
    console.log('======================================================');
}

executeRedTeamSuite();
