import fs from 'fs';
import path from 'path';
import os from 'os';

async function listScreens() {
    const tokenFile = path.join(os.tmpdir(), 'sb_token2.tmp');
    const token = fs.readFileSync(tokenFile, 'utf-8').trim();

    const query = `
    SELECT id, name, custom_id, playlist_id, bound_device_id 
    FROM public.screens 
    ORDER BY created_at DESC 
    LIMIT 5;
    `;

    const res = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
    });

    const data = await res.json();
    console.log('Screens in DB:', data);
}

listScreens().catch(console.error);
