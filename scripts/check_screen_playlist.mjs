import fs from 'fs';
import path from 'path';
import os from 'os';

async function checkScreenAndPlaylists() {
    const tokenFile = path.join(os.tmpdir(), 'sb_token2.tmp');
    const token = fs.readFileSync(tokenFile, 'utf-8').trim();

    // 1. Check screen
    const screenQuery = `
    SELECT id, name, custom_id, playlist_id, bound_device_id, user_id, is_active
    FROM public.screens
    WHERE id = '9f47ddae-93ec-4aeb-921c-72e26c8098f2';
    `;
    const res1 = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: screenQuery })
    });
    console.log('Screen 9f47ddae-93ec-4aeb-921c-72e26c8098f2:', await res1.json());

    // 2. Check playlists with media
    const playlistsQuery = `
    SELECT p.id, p.name, count(pi.id) as items_count
    FROM public.playlists p
    LEFT JOIN public.playlist_items pi ON pi.playlist_id = p.id
    GROUP BY p.id, p.name
    ORDER BY items_count DESC
    LIMIT 5;
    `;
    const res2 = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: playlistsQuery })
    });
    console.log('Available Playlists:', await res2.json());
}

checkScreenAndPlaylists().catch(console.error);
