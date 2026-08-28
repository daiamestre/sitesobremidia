import fs from 'fs';
import path from 'path';
import os from 'os';

async function assignPlaylistAndFixDeviceTable() {
    const tokenFile = path.join(os.tmpdir(), 'sb_token2.tmp');
    const token = fs.readFileSync(tokenFile, 'utf-8').trim();

    const sql = `
    -- 1. ADD MODEL / BRAND / OS / APP_VERSION COLUMNS TO DEVICES IF MISSING
    ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS model TEXT;
    ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS brand TEXT;
    ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS os_version TEXT;
    ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS app_version TEXT;

    -- 2. ASSIGN PLAYLIST TO SCREEN 'HOTEL MAXSUEL'
    UPDATE public.screens
    SET playlist_id = '1ec39023-a573-4067-94e1-31ac08aa540a',
        is_active = true
    WHERE id = '9f47ddae-93ec-4aeb-921c-72e26c8098f2';

    NOTIFY pgrst, 'reload schema';
    `;

    console.log('[+] Assigning playlist and ensuring device columns in DB...');
    const res = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
    });

    console.log('Status:', res.status, await res.text());
}

assignPlaylistAndFixDeviceTable().catch(console.error);
