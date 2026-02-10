
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY are required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function keepAlive() {
    console.log(`[${new Date().toISOString()}] Starting Keep-Alive Check...`);

    try {
        // Simple query to wake up the database
        const { count, error } = await supabase
            .from('screens')
            .select('*', { count: 'exact', head: true });

        if (error) {
            throw error;
        }

        console.log(`[${new Date().toISOString()}] Keep-alive successful! Active screens count: ${count}`);
        process.exit(0);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Keep-alive failed:`, error.message);
        process.exit(1);
    }
}

keepAlive();
