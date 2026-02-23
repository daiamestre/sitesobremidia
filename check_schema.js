import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.log("Missing env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.from('screens').select('*').limit(1);
    if (error) {
        console.error("Error:", error);
    } else if (data && data.length > 0) {
        console.log("Keys:", Object.keys(data[0]));
    } else {
        console.log("No data or empty table.");
        // Fallback: try to insert a dummy with is_active to see if it errors? No, safer to just check keys.
        // If table is empty, we can't check keys easily this way without metadata API (which is restricted).
        // Let's assume we need to ADD the column if it's not in the models.ts which usually reflects DB.
    }
}

check();
