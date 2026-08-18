const fs = require('fs');
const os = require('os');
const path = require('path');

const token = fs.readFileSync(path.join(os.tmpdir(), 'sb_token2.tmp'), 'utf8').trim();
const sql = fs.readFileSync(process.argv[2], 'utf8');

async function run(query, label) {
  const r = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  console.log(`\n===== ${label} -> HTTP ${r.status}`);
  if (!r.ok) {
    console.log(text.slice(0, 3000));
    process.exitCode = 1;
  } else {
    console.log('OK');
  }
}

async function main() {
  const marks = sql.split(/\n-- =+ *\n-- (\d+)\. /).slice(1);
  // marks alternates: [num, body, num, body, ...]
  for (let i = 0; i < marks.length; i += 2) {
    const num = marks[i];
    const body = '-- ' + num + '. ' + marks[i + 1];
    await run(body, `Seção ${num}`);
  }
}

main();
