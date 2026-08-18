import { createClient } from '@supabase/supabase-js';

// [SECURITY FASE FUNDAÇÃO] Chave anon lida do ambiente — nunca hardcodar.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMedias() {
    const { data, error } = await supabase.from('media').select('*').order('created_at', { ascending: false }).limit(5);
    console.log('Error:', error);
    console.log('Recent Medias:', JSON.stringify(data, null, 2));
}

checkMedias();
