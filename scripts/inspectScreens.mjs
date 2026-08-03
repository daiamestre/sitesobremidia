import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bhwsybgsyvvhqtkdqozb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJod3N5YmdzeXZ2aHF0a2Rxb3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjk5NjgsImV4cCI6MjA4Mzk0NTk2OH0.ejbdSX6xeSC4Cg8unLFSUbN5BOW7dJw2CRcFJACcWfI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspect() {
    console.log('=== TESTING QUERY WITH EXPLICIT FOREIGN KEY ===');
    const { data: screens, error: sErr } = await supabase
        .from('screens')
        .select(`
            id, name, custom_id, playlist_id, orientation, resolution,
            playlists (
                id, name,
                playlist_items (
                    id, position, duration,
                    medias:media!playlist_items_media_id_fkey (id, name, file_url, file_type)
                )
            )
        `);
    
    if (sErr) {
        console.error('Error fetching screens with playlist_items_media_id_fkey:', sErr);
        
        // Try second relationship
        const { data: screens2, error: sErr2 } = await supabase
            .from('screens')
            .select(`
                id, name, custom_id, playlist_id, orientation, resolution,
                playlists (
                    id, name,
                    playlist_items (
                        id, position, duration,
                        medias:media!fk_playlist_items_media (id, name, file_url, file_type)
                    )
                )
            `);
        if (sErr2) {
            console.error('Error fetching screens with fk_playlist_items_media:', sErr2);
        } else {
            console.log('SUCCESS with fk_playlist_items_media:');
            console.log(JSON.stringify(screens2, null, 2));
        }
        return;
    }
    
    console.log('SUCCESS with playlist_items_media_id_fkey:');
    console.log(JSON.stringify(screens, null, 2));
}

inspect();
