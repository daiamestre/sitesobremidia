import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('media')
    .select('id, name, file_path, file_url, created_at, status')
    .eq('file_type', 'video')
    .order('created_at', { ascending: false })
    .limit(3);

  console.log("Latest videos:");
  console.log(JSON.stringify(data, null, 2));
}

check();
