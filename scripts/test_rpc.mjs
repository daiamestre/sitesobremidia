import fs from 'fs';
import path from 'path';
import os from 'os';

async function testRpc() {
    const tokenFile = path.join(os.tmpdir(), 'sb_token2.tmp');
    const token = fs.readFileSync(tokenFile, 'utf-8').trim();

    // Reload schema cache
    console.log('[+] Reloading PostgREST schema cache...');
    const reloadRes = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema';" })
    });
    console.log('Schema reload status:', reloadRes.status);

    // Call the RPC via PostgREST with anon key
    const env = fs.readFileSync('.env', 'utf-8');
    const anonMatch = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.*)/);
    const anonKey = anonMatch ? anonMatch[1].trim() : '';

    console.log('[+] Testing RPC call to get_player_playlist_for_screen via REST...');
    const rpcRes = await fetch('https://bhwsybgsyvvhqtkdqozb.supabase.co/rest/v1/rpc/get_player_playlist_for_screen', {
        method: 'POST',
        headers: {
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            p_identifier: 'test_screen_123',
            p_device_id: 'test_device_456'
        })
    });

    console.log('RPC Call Status:', rpcRes.status, rpcRes.statusText);
    const rpcBody = await rpcRes.text();
    console.log('RPC Response:', rpcBody);
}

testRpc().catch(console.error);
