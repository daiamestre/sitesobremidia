const { createClient } = require('@supabase/supabase-js');

// 1. Get credentials from environment variables (GitHub Secrets)
const PREV_SUPABASE_URL = process.env.SUPABASE_URL;
const PREV_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!PREV_SUPABASE_URL || !PREV_SUPABASE_ANON_KEY) {
    console.error('Error: Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.');
    process.exit(1);
}

// 2. Initialize Supabase Client
const supabase = createClient(PREV_SUPABASE_URL, PREV_SUPABASE_ANON_KEY);

// 3. Determine "Task of the Day"
// We use the day of the year to rotate tasks: Day % 3
const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
const taskIndex = dayOfYear % 3;

async function runTask() {
    console.log(`[Keep-Alive] Running Task #${taskIndex + 1}...`);
    let error;
    let count;

    try {
        if (taskIndex === 0) {
            // Task 1: Check Screens
            const { count: c, error: e } = await supabase.from('screens').select('*', { count: 'exact', head: true });
            count = c;
            error = e;
            console.log(`[Task 1] Checked Screens. Total found: ${count}`);
        } else if (taskIndex === 1) {
            // Task 2: Check Playlists
            const { count: c, error: e } = await supabase.from('playlists').select('*', { count: 'exact', head: true });
            count = c;
            error = e;
            console.log(`[Task 2] Checked Playlists. Total found: ${count}`);
        } else {
            // Task 3: Check Media Items (or another table if media_items is tricky, let's use media_items if exists or a safe alternative)
            // Note: User previous issue was with media_items vs media_id. The table name is likely 'media_items' or 'media'.
            // Let's assume 'media_items' based on earlier context or 'screens' again with a filter if fail.
            // Actually, best to check 'media_items' based on models.ts. 
            // Wait, models says 'media_items' is a relation name but table might be 'media_items'.
            // Let's use 'screens' with a filter for variety to be safe, or 'playlists' with filter.
            // Better: 'screens' where is_active = true
            const { count: c, error: e } = await supabase.from('screens').select('*', { count: 'exact', head: true }).eq('is_active', true);
            count = c;
            error = e;
            console.log(`[Task 3] Checked Active Screens. Total found: ${count}`);
        }

        if (error) {
            console.error('[Error] Supabase Error:', error.message);
            process.exit(1);
        } else {
            console.log('[Success] Keep-alive ping successful!');
        }

    } catch (err) {
        console.error('[Critical] Execution failed:', err);
        process.exit(1);
    }
}

runTask();
