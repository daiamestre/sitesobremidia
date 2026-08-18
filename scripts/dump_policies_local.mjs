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
  const res = await client.query(`
    SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.roles, p.qual, p.with_check
    FROM pg_policies p
    WHERE p.tablename IN ('screens','devices','remote_commands','playback_logs','device_health','player_heartbeats','download_status','app_releases','media','widgets','playlists','playlist_items','monitoring_logs','proof_of_play','screenshots_logs','device_logs')
       OR (p.schemaname='storage' AND p.tablename='objects')
    ORDER BY p.tablename, p.policyname;
  `);
  for (const r of res.rows) {
    console.log(`[${r.tablename}] ${r.policyname} cmd=${r.cmd} roles=${r.roles.join(',')} qual=${r.qual || ''} check=${r.with_check || ''}`);
  }
  await client.end();
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });