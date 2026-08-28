import fs from 'fs';
import path from 'path';
import os from 'os';

async function checkUsers() {
    const tokenFile = path.join(os.tmpdir(), 'sb_token2.tmp');
    const token = fs.readFileSync(tokenFile, 'utf-8').trim();

    const query = `
    SELECT u.id, u.email, u.status, u.ativo, u.is_owner, 
           ctx.status_ciclo_vida, ctx.cargo_nome, ctx.empresa_operadora_id
    FROM public.usuarios u
    LEFT JOIN LATERAL public.fn_get_user_security_context(u.id) ctx ON true
    LIMIT 10;
    `;

    const res = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
    });

    const data = await res.json();
    console.log('Users in DB:', data);
}

checkUsers().catch(console.error);
