import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bhwsybgsyvvhqtkdqozb.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'COLE_A_CHAVE_ANON_AQUI';

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
