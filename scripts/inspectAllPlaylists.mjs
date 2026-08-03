import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bhwsybgsyvvhqtkdqozb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJod3N5YmdzeXZ2aHF0a2Rxb3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjk5NjgsImV4cCI6MjA4Mzk0NTk2OH0.ejbdSX6xeSC4Cg8unLFSUbN5BOW7dJw2CRcFJACcWfI';

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
