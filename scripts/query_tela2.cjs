const fs = require('fs');
const os = require('os');
const path = require('path');
const tokenFile = path.join(os.tmpdir(), 'sb_token2.tmp');
const token = fs.readFileSync(tokenFile, 'utf-8').trim();

const sql = `
SELECT id, name, orientation, resolution, playlist_id 
FROM public.screens 
ORDER BY created_at DESC LIMIT 5;
`;

fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
    method: 'POST',
    headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
}).then(res => res.json()).then(data => console.log('--- SCREENS ---\n' + JSON.stringify(data, null, 2)));
