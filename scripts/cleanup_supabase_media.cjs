const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup() {
    console.log('--- Starting Cleanup ---');

    try {
        // 1. Delete playlist items (to avoid FK constraints)
        console.log('Deleting all playlist items...');
        const { error: piError } = await supabase
            .from('playlist_items')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        if (piError) console.error('Error deleting playlist items:', piError.message);
        else console.log('Playlist items deleted.');

        // 2. Clear media table
        console.log('Deleting all media records...');
        // We need to fetch paths first to delete from storage
        const { data: mediaFiles, error: fetchError } = await supabase
            .from('media')
            .select('file_path');

        if (fetchError) {
            console.error('Error fetching media paths:', fetchError.message);
        } else if (mediaFiles && mediaFiles.length > 0) {
            const paths = mediaFiles.map(m => m.file_path);
            console.log(`Found ${paths.length} files in storage. Attempting deletion...`);

            // 3. Delete from storage bucket
            const { error: storageError } = await supabase.storage
                .from('media')
                .remove(paths);

            if (storageError) console.error('Error deleting from storage:', storageError.message);
            else console.log('Storage bucket cleared.');
        }

        const { error: mError } = await supabase
            .from('media')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
        if (mError) console.error('Error deleting media records:', mError.message);
        else console.log('Media table cleared.');

        console.log('--- Cleanup Finished ---');
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

cleanup();
