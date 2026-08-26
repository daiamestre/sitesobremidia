/**
 * FASE 17 — E2E de distribuição: Screen → Playlist → itens → mídia → Player.
 *
 * Prova o CONTRATO completo no caminho de rede real usado pelo PlayerEngine:
 *   PostgREST /rest/v1/rpc/get_player_playlist_for_screen com a chave anon
 *   (idêntico a src/components/player/PlayerEngine.tsx).
 *
 * Setup/teardown e probes privilegiados usam a Management API (postgres),
 * com o token vindo EXCLUSIVAMENTE da env SUPABASE_ACCESS_TOKEN (nunca
 * gravado em arquivo/código/log).
 *
 * Uso: node scripts/fase17/player-e2e.cjs
 */
const SUPABASE_URL = 'https://bhwsybgsyvvhqtkdqozb.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJod3N5YmdzeXZ2aHF0a2Rxb3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjk5NjgsImV4cCI6MjA4Mzk0NTk2OH0.ejbdSX6xeSC4Cg8unLFSUbN5BOW7dJw2CRcFJACcWfI';
const MGMT = 'https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALHA: SUPABASE_ACCESS_TOKEN não definido'); process.exit(2); }

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; console.log(`FAIL | ${name}${detail ? ' | ' + detail : ''}`); }
}

async function sql(queryText) {
  const res = await fetch(MGMT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: queryText }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

async function rpcAsPlayer(identifier, deviceId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_player_playlist_for_screen`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_identifier: identifier, p_device_id: deviceId }),
  });
  const text = await res.text();
  let body; try { body = typeof text === 'string' ? JSON.parse(text) : text; } catch { body = text; }
  if (Array.isArray(body)) body = body[0];
  return { http: res.status, payload: body };
}

const rand = Math.random().toString(36).slice(2, 8);
const CUSTOM_ID = `F17E2E${rand.toUpperCase()}`;
const DEV = `e2e-dev-${rand}`;
let fx = {};

async function setup() {
  const u = await sql(`
    SELECT u.id AS uid, u.empresa_operadora_id AS tenant
    FROM public.usuarios u
    WHERE u.status_ciclo_vida = 'ACTIVE' AND u.empresa_operadora_id IS NOT NULL
    ORDER BY u.created_at ASC LIMIT 1`);
  const uid = u[0].uid, tenant = u[0].tenant;
  fx.uid = uid; fx.tenant = tenant;
  const s = await sql(`
    INSERT INTO public.screens (user_id, empresa_operadora_id, name, custom_id, is_active)
    VALUES ('${uid}', '${tenant}', 'E2E F17 Tela', '${CUSTOM_ID}', true)
    RETURNING id`);
  fx.screen = s[0].id;
  const m = await sql(`
    INSERT INTO public.media (user_id, name, file_path, file_url, file_type, file_size, mime_type)
    VALUES
      ('${uid}', 'E2E video', 'f17/e2e-video-${rand}.mp4', 'https://example.com/f17-video.mp4', 'video', 1024, 'video/mp4'),
      ('${uid}', 'E2E img', 'f17/e2e-img-${rand}.jpg', 'https://example.com/f17-img.jpg', 'image', 512, 'image/jpeg')
    RETURNING id`);
  fx.m1 = m[0].id;
  fx.m2 = m[1].id;
  const p = await sql(`
    INSERT INTO public.playlists (user_id, name, is_active, audio_enabled)
    VALUES ('${uid}', 'F17 E2E Playlist', true, true) RETURNING id`);
  fx.playlist = p[0].id;
  const it = await sql(`
    INSERT INTO public.playlist_items (playlist_id, media_id, position, duration) VALUES
      ('${fx.playlist}', '${fx.m1}', 1, 10),
      ('${fx.playlist}', '${fx.m2}', 2, 5)
    RETURNING id`);
  fx.items = it.map(r => r.id);
  await sql(`UPDATE public.screens SET playlist_id='${fx.playlist}' WHERE id='${fx.screen}'`);
}

async function teardown() {
  try {
    await sql(`DELETE FROM public.screens WHERE id='${fx.screen}'`);
    await sql(`DELETE FROM public.playlists WHERE id='${fx.playlist}' OR name='F17 E2E P2'`);
    await sql(`DELETE FROM public.media WHERE id IN ('${fx.m1}','${fx.m2}')`);
  } catch (e) { console.log('TEARDOWN WARN:', e.message); }
}

(async () => {
  console.log('=== FASE 17 E2E — distribuição Screen→Playlist→Player ===');
  await setup();

  // T1 — Descoberta com paridade Dashboard (contexto autenticado do dono)
  const disc = await sql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${fx.uid}","role":"authenticated"}';
    SELECT get_authorized_screens_for_player() AS r;
    ROLLBACK;`);
  const djson = disc.length && disc[disc.length - 1].r ? disc[disc.length - 1].r : disc;
  const d = typeof djson === 'string' ? JSON.parse(djson) : djson;
  const ids = (d?.data || []).map(x => x.id);
  check('T1 descoberta: tela fixture visível p/ dono', ids.includes(fx.screen), JSON.stringify(ids));
  check('T1 descoberta: status SUCCESS', d?.status === 'SUCCESS');

  // T2 — RPC oficial via REST anon (mesmo caminho do PlayerEngine): tela inexistente
  let r = await rpcAsPlayer('NAO-EXISTE-' + rand, DEV);
  check('T2 tela inexistente → SCREEN_NOT_FOUND', r.payload?.status === 'SCREEN_NOT_FOUND', JSON.stringify(r.payload)?.slice(0, 120));

  // T3 — Fetch completo: ordem, duração, mídia, campos do contrato
  r = await rpcAsPlayer(CUSTOM_ID, DEV);
  const pl = r.payload?.data?.playlists;
  check('T3 status SUCCESS', r.payload?.status === 'SUCCESS');
  check('T3 screenId correto', r.payload?.data?.id === fx.screen);
  check('T3 custom_id ecoado', r.payload?.data?.custom_id === CUSTOM_ID);
  check('T3 playlist correta', pl?.id === fx.playlist);
  check('T3 is_active true', r.payload?.data?.is_active === true);
  check('T3 audio_enabled refletido', pl?.audio_enabled === true);
  const its = pl?.playlist_items || [];
  check('T3 nº itens = 2', its.length === 2, String(its.length));
  check('T3 ordem por position (1,2)', its.every((x, i) => x.position === i + 1), JSON.stringify(its.map(x => x.position)));
  check('T3 durações corretas (10,5)', its[0]?.duration === 10 && its[1]?.duration === 5, JSON.stringify(its.map(x => x.duration)));
  check('T3 mídias corretas', its[0]?.media?.id === fx.m1 && its[1]?.media?.id === fx.m2);
  check('T3 tipos de mídia', its[0]?.media?.file_type === 'video' && its[1]?.media?.file_type === 'image');
  check('T3 urls absolutas', /^https?:\/\//.test(its[0]?.media?.file_url || ''));

  // T4 — Sincronização/atualização (polling do player percebe delta)
  await sql(`UPDATE public.playlist_items SET duration=8 WHERE id='${fx.items[1]}'`);
  await sql(`INSERT INTO public.playlist_items (playlist_id, media_id, position, duration) VALUES ('${fx.playlist}', '${fx.m2}', 3, 7)`);
  r = await rpcAsPlayer(CUSTOM_ID, DEV);
  const its4 = r.payload?.data?.playlists?.playlist_items || [];
  check('T4 sync: nova duração visível (8)', its4.find(x => x.position === 2)?.duration === 8);
  check('T4 sync: novo item pos3 visível (7)', its4.find(x => x.position === 3)?.duration === 7);

  // T5 — Remoção de conteúdo
  await sql(`DELETE FROM public.playlist_items WHERE position=3 AND playlist_id='${fx.playlist}'`);
  r = await rpcAsPlayer(CUSTOM_ID, DEV);
  const its5 = r.payload?.data?.playlists?.playlist_items || [];
  check('T5 remoção: item some da playlist', its5.length === 2 && !its5.some(x => x.position === 3));

  // T6 — Substituição de conteúdo (troca de playlist na tela)
  const p2 = await sql(`INSERT INTO public.playlists (user_id, name, is_active) VALUES ('${fx.uid}','F17 E2E P2',true) RETURNING id`);
  await sql(`UPDATE public.screens SET playlist_id='${p2[0].id}' WHERE id='${fx.screen}'`);
  r = await rpcAsPlayer(CUSTOM_ID, DEV);
  check('T6 substituição: playlist vazia → PLAYLIST_EMPTY', r.payload?.status === 'PLAYLIST_EMPTY', JSON.stringify(r.payload)?.slice(0, 100));
  await sql(`UPDATE public.screens SET playlist_id='${fx.playlist}' WHERE id='${fx.screen}'`);

  // T7 — Segurança: tela suspensa
  await sql(`UPDATE public.screens SET is_active=false WHERE id='${fx.screen}'`);
  r = await rpcAsPlayer(CUSTOM_ID, DEV);
  check('T7 tela suspensa → SCREEN_SUSPENDED', r.payload?.status === 'SCREEN_SUSPENDED', JSON.stringify(r.payload)?.slice(0, 100));
  await sql(`UPDATE public.screens SET is_active=true WHERE id='${fx.screen}'`);

  // T8 — Segurança: binding de device
  await sql(`UPDATE public.screens SET bound_device_id='outro-device-123' WHERE id='${fx.screen}'`);
  r = await rpcAsPlayer(CUSTOM_ID, DEV);
  const bindCodes = ['DEVICE_ALREADY_BOUND', 'DEVICE_ACCESS_DENIED', 'DEVICE_REVOKED'];
  check('T8 device estranho bloqueado', bindCodes.includes(String(r.payload?.status || '').toUpperCase()), JSON.stringify(r.payload)?.slice(0, 100));
  await sql(`UPDATE public.screens SET bound_device_id=NULL WHERE id='${fx.screen}'`);

  // T9 — Recuperação após voltar ao normal (perda de conexão resolvida server-side)
  r = await rpcAsPlayer(CUSTOM_ID, DEV);
  check('T9 recuperação: SUCCESS após limpar bloqueios', r.payload?.status === 'SUCCESS');

  // T10 — Descoberta sem autenticação é negada
  const anon = await sql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{}';
    SELECT get_authorized_screens_for_player() AS r;
    ROLLBACK;`);
  const ajson = anon.length && anon[anon.length - 1].r ? anon[anon.length - 1].r : anon;
  const a = typeof ajson === 'string' ? JSON.parse(ajson) : ajson;
  check('T10 sem identidade → UNAUTHORIZED', a?.status === 'UNAUTHORIZED', JSON.stringify(a)?.slice(0, 80));

  if (process.env.KEEP) { console.log('KEEP=1: fixture preservada. custom_id:', CUSTOM_ID); } else { await teardown(); }
  console.log(`\nRESULTADO FASE 17 E2E: ${passed} PASS | ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error('ERRO FATAL:', e.message); if (!process.env.KEEP) await teardown(); process.exit(2); });
