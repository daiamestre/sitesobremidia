import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bhwsybgsyvvhqtkdqozb.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'COLE_A_CHAVE_ANON_AQUI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectAllMedia() {
    console.log('=== ALL MEDIA IN DATABASE ===');
    const { data: media, error: mErr } = await supabase
        .from('media')
        .select('*');
        
    if (mErr) {
        console.error('Error fetching media:', mErr);
    } else {
        console.log(JSON.stringify(media, null, 2));
    }
}

inspectAllMedia();
