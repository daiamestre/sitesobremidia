import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bhwsybgsyvvhqtkdqozb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJod3N5YmdzeXZ2aHF0a2Rxb3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjk5NjgsImV4cCI6MjA4Mzk0NTk2OH0.ejbdSX6xeSC4Cg8unLFSUbN5BOW7dJw2CRcFJACcWfI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testHeartbeat() {
    const screenId = '4f0b3bd6-7014-434a-8d21-235d1daa6345'; // TELA1
    
    console.log('--- TEST 1: Testing RPC pulse_screen ---');
    const { data: rpcData, error: rpcErr } = await supabase.rpc('pulse_screen', {
        p_screen_id: screenId,
        p_status: 'online',
        p_version: '1.0',
        p_ram_usage: '45%',
        p_free_space: '10GB',
        p_cpu_temp: '45°C',
        p_uptime: '1h',
        p_ip_address: '192.168.1.1'
    });
    
    if (rpcErr) {
        console.error('RPC pulse_screen Error:', rpcErr);
    } else {
        console.log('RPC pulse_screen Success:', rpcData);
    }
    
    console.log('\n--- TEST 2: Testing Direct update to screens table ---');
    const { data: upData, error: upErr } = await supabase
        .from('screens')
        .update({
            last_ping_at: new Date().toISOString(),
            status: 'online'
        })
        .eq('id', screenId)
        .select();
        
    if (upErr) {
        console.error('Direct update Error:', upErr);
    } else {
        console.log('Direct update Success:', upData);
    }
}

testHeartbeat();
