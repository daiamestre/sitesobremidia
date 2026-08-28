import fs from 'fs';
import path from 'path';
import os from 'os';

async function deployMigrations() {
    const tokenFile = path.join(os.tmpdir(), 'sb_token2.tmp');
    const token = fs.readFileSync(tokenFile, 'utf-8').trim();

    const migrations = [
        'supabase/migrations/030_sprint_1_5_zero_trust_rls_and_concurrency.sql',
        'supabase/migrations/20260819160000_player_device_binding_zero_trust.sql'
    ];

    for (const m of migrations) {
        console.log(`[+] Deploying migration: ${m}...`);
        const sql = fs.readFileSync(m, 'utf-8');
        const res = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: sql })
        });
        const bodyText = await res.text();
        console.log(`[${m}] Status:`, res.status, bodyText);
        if (!res.ok) {
            console.error(`❌ Migration failed: ${m}`);
            process.exit(1);
        }
    }

    console.log('[+] Reloading schema cache...');
    await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema';" })
    });

    console.log('✅ ALL SECURITY CORE AND PLAYER RPC MIGRATIONS DEPLOYED!');
}

deployMigrations().catch(console.error);
