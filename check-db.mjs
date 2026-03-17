import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://bhwsybgsyvvhqtkdqozb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJod3N5YmdzeXZ2aHF0a2Rxb3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjk5NjgsImV4cCI6MjA4Mzk0NTk2OH0.ejbdSX6xeSC4Cg8unLFSUbN5BOW7dJw2CRcFJACcWfI');

async function checkMedias() {
    const { data, error } = await supabase.from('media').select('*').order('created_at', { ascending: false }).limit(5);
    console.log('Error:', error);
    console.log('Recent Medias:', JSON.stringify(data, null, 2));
}

checkMedias();
