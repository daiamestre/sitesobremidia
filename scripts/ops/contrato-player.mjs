/**
 * F-198 — CONTRATO do Player comercial (5.7.10): confere no banco de PRODUÇÃO que tudo o que o aparelho usa continua
 * existindo e respondendo do mesmo jeito. Rodar ANTES e DEPOIS de toda migração (receita migracao-segura) e antes de
 * publicar o site. Sai com código 1 se algo quebrou. Não imprime chaves.
 *   node scripts/ops/contrato-player.mjs
 */
import { sql } from './sql.mjs';

const falhas = [];
const ok = (cond, msg) => { console.log(`${cond ? 'OK   ' : 'FALHA'} ${msg}`); if (!cond) falhas.push(msg); };

// 1) funções que o Player 5.7.10 chama (nome -> quem pode chamar)
const FUNCOES = [
  'admin_unpair_screen', 'fn_device_attest', 'fn_device_bind', 'fn_device_heartbeat_v2', 'fn_device_register_extended',
  'fn_device_telemetry_batch', 'fn_player_minha_marca', 'fn_player_registrar_desempenho_video', 'fn_player_registrar_exibicoes',
  'fn_player_report_telemetry', 'get_authorized_screens_for_player', 'get_latest_app_release', 'get_player_layout_for_screen',
  'get_player_playlist_for_screen', 'get_player_radio_for_screen', 'player_unpair_screen',
];
const fns = await sql(`select p.proname n, bool_or(has_function_privilege('authenticated', p.oid, 'execute')) a
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any(array[${FUNCOES.map((f) => `'${f}'`).join(',')}]) group by 1`);
const tem = new Map((Array.isArray(fns) ? fns : []).map((r) => [r.n, r.a]));
for (const f of FUNCOES) ok(tem.get(f) === true, `função ${f} existe e o Player (login) pode chamar`);

// 2) tabelas e colunas que o Player lê/grava direto
const COLUNAS = {
  screens: ['id', 'last_ping_at', 'version', 'status', 'is_active', 'last_screenshot_at', 'bound_device_id', 'last_action', 'last_action_value', 'status_note'],
  remote_commands: ['id', 'screen_id', 'command', 'status', 'payload', 'executed_at', 'created_at'],
  devices: ['id', 'identity_hash', 'screen_id'],
  device_health: ['device_id', 'last_seen'],
  playback_logs: ['screen_id', 'media_id', 'started_at'],
  device_logs: ['device_id', 'log_type', 'message', 'occurrence_time'],
  app_releases: ['version_code', 'version_name', 'apk_url', 'sha256', 'canal'],
};
const cols = await sql(`select table_name t, column_name c from information_schema.columns where table_schema = 'public'
  and table_name = any(array[${Object.keys(COLUNAS).map((t) => `'${t}'`).join(',')}])`);
const conj = new Set((Array.isArray(cols) ? cols : []).map((r) => `${r.t}.${r.c}`));
for (const [t, cs] of Object.entries(COLUNAS)) {
  const faltam = cs.filter((c) => !conj.has(`${t}.${c}`));
  ok(faltam.length === 0, `tabela ${t}: colunas ${faltam.length ? 'FALTANDO ' + faltam.join(', ') : 'completas'}`);
}

// 3) todos os comandos que o Player entende são aceitos pelo banco
const COMANDOS = ['reload', 'reboot', 'restart_player', 'reboot_device', 'screenshot', 'take_screenshot', 'sync', 'update_app',
  'check_update', 'install_update', 'maintenance_open', 'open_maintenance', 'maintenance_close', 'close_maintenance',
  'rotate_portrait', 'rotate_landscape', 'unpair'];
const chk = await sql(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'remote_commands_command_check'`);
const def = Array.isArray(chk) && chk[0] ? chk[0].d : '';
const recusados = COMANDOS.filter((c) => !def.includes(`'${c}'`));
ok(recusados.length === 0, `comandos aceitos pelo banco (${COMANDOS.length})${recusados.length ? ' — RECUSADOS: ' + recusados.join(', ') : ''}`);
const trg = await sql(`select count(*)::int n from pg_trigger where tgname in ('trg_remote_commands_status_do_player', 'trg_screens_aplica_na_hora') and not tgisinternal`);
ok(Array.isArray(trg) && trg[0]?.n === 2, 'gatilhos: resposta do Player normalizada e "aplica na hora" ativos');

// 4) resposta da playlist com os campos que o 5.7.10 lê (numa tela com aparelho)
const pl = await sql(`select public.get_player_playlist_for_screen(s.id::text, s.bound_device_id) r from screens s
  where s.bound_device_id is not null and s.playlist_id is not null order by s.last_ping_at desc nulls last limit 1`);
const r = Array.isArray(pl) && pl[0] ? pl[0].r : null;
const dados = r && (r.data ?? r);
for (const campo of ['id', 'is_active', 'orientation', 'resolution', 'giro_quadro', 'rotacao_tela', 'playlists']) {
  ok(!!dados && Object.prototype.hasOwnProperty.call(dados, campo), `playlist da tela devolve "${campo}"`);
}

// 5) versão que os aparelhos recebem pelo OTA = canal estável
const rel = await sql(`select public.get_latest_app_release() r`);
const est = Array.isArray(rel) && rel[0]?.r;
ok(!!est && /^\d+\.\d+\.\d+/.test(est.version_name ?? '') && /^https:\/\//.test(est.apk_url ?? '') && /^[a-f0-9]{64}$/.test(est.sha256 ?? ''),
  `OTA entrega a versão estável ${est?.version_name ?? '(nenhuma)'}`);
const teste = await sql(`select count(*)::int n from app_releases where canal = 'teste' and version_code > (select max(version_code) from app_releases where canal = 'estavel')`);
console.log(`     versões de TESTE acima da estável (não vão aos aparelhos): ${Array.isArray(teste) ? teste[0]?.n : '?'}`);

console.log(falhas.length ? `\nCONTRATO QUEBRADO (${falhas.length}): ${falhas.join(' | ')}` : '\nCONTRATO DO PLAYER 5.7.10 ÍNTEGRO');
process.exit(falhas.length ? 1 : 0);
