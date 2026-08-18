import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bhwsybgsyvvhqtkdqozb.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'COLE_A_CHAVE_ANON_AQUI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectAll() {
    console.log('=== ALL PLAYLISTS & ITEMS ===');
    const { data: playlists, error: pErr } = await supabase
        .from('playlists')
        .select('*, playlist_items(*, media:media!playlist_items_media_id_fkey(*))');
        
    if (pErr) {
        console.error('Error fetching playlists:', pErr);
    } else {
        console.log(JSON.stringify(playlists, null, 2));
    }
}

inspectAll();
