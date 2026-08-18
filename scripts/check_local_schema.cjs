const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'localhost', port: 54322, user: 'postgres', password: 'postgres', database: 'postgres' });
  await c.connect();
  const r = await c.query('select schema_name from information_schema.schemata order by 1');
  console.log('SCHEMAS:', r.rows.map(x => x.schema_name).join(', '));
  try {
    const a = await c.query('select count(*) from auth.users');
    console.log('auth.users:', a.rows[0].count);
  } catch (e) { console.log('auth.users ERR:', e.message); }
  await c.end();
})().catch(e => console.error(e.message));