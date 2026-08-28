import fs from 'fs';
import path from 'path';
import os from 'os';

async function main() {
    const tokenFile = path.join(os.tmpdir(), 'sb_token2.tmp');
    if (!fs.existsSync(tokenFile)) {
        console.error('Token file not found at:', tokenFile);
        process.exit(1);
    }

    const token = fs.readFileSync(tokenFile, 'utf-8').trim();
    console.log('[+] Supabase token loaded (prefix=' + token.substring(0, 5) + ')');

    const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '20260819160000_player_device_binding_zero_trust.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    console.log('[+] Migration SQL loaded (bytes=' + sql.length + ')');

    console.log('[+] Executing query on Supabase (project: bhwsybgsyvvhqtkdqozb)...');
    const res = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
    });

    const bodyText = await res.text();
    console.log('Status:', res.status, res.statusText);
    console.log('Response body:', bodyText);

    if (res.ok) {
        console.log('✅ ZERO TRUST RPC FUNCTION (get_player_playlist_for_screen) SUCCESSFULLY DEPLOYED TO SUPABASE!');
    } else {
        console.error('❌ Failed to deploy migration:', res.status, bodyText);
    }
}

main().catch(console.error);
