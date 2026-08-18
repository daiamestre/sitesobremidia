const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 54322,
  user: 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: 'postgres',
  connectionTimeoutMillis: 10000,
});

async function main() {
  await client.connect();
  const ver = await client.query('select version()');
  console.log('CONNECTED:', ver.rows[0].version.split(',')[0]);

  const tabs = await client.query(`
    SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
  `);
  console.log('PUBLIC TABLES:', tabs.rows.map(r => r.tablename).join(', '));

  const pol = await client.query(`
    SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname IN ('public','storage')
    ORDER BY tablename, policyname
  `);
  console.log('POLICY COUNT:', pol.rows.length);
  for (const r of pol.rows) {
    console.log(`[${r.tablename}] ${r.policyname} cmd=${r.cmd} roles=${r.roles.join(',')} qual=${r.qual || ''} check=${r.with_check || ''}`);
  }
  await client.end();
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });