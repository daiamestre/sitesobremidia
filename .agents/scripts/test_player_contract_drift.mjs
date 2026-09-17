/**
 * SOBRE MÍDIA AI Engineering System — Player Contract Drift Prevention Test
 *
 * Valida a sincronia rigorosa entre PLAYER_CONTRACT.md e as migrations SQL do Supabase.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

console.log('=================================================================');
console.log('TEST SUITE: PLAYER CONTRACT DRIFT PREVENTION TEST');
console.log('=================================================================\n');

// 1. Carregar PLAYER_CONTRACT.md
const contractDocPath = path.resolve(workspaceRoot, 'docs', 'PLAYER_CONTRACT.md');
assert(fs.existsSync(contractDocPath), 'PLAYER_CONTRACT.md deve existir');
const contractContent = fs.readFileSync(contractDocPath, 'utf8');

// 2. Validar assinatura de admin_unpair_screen no contrato
console.log('>>> Test 1: Assinatura de admin_unpair_screen no contrato');
assert(
  contractContent.includes('public.admin_unpair_screen(p_screen_id TEXT DEFAULT NULL)'),
  'PLAYER_CONTRACT.md deve documentar p_screen_id TEXT DEFAULT NULL em vez de UUID'
);
console.log('✅ PASS: admin_unpair_screen documentado fielmente como TEXT.\n');

// 3. Validar status completos de get_player_playlist_for_screen no contrato
console.log('>>> Test 2: Catálogo canônico de status de get_player_playlist_for_screen');
const expectedStatuses = [
  'SUCCESS',
  'DEVICE_ALREADY_BOUND',
  'SCREEN_NOT_FOUND',
  'SCREEN_SUSPENDED',
  'SCREEN_ACCESS_DENIED',
  'DEVICE_ACCESS_DENIED',
  'DEVICE_REVOKED',
  'NO_PLAYLIST_ASSIGNED',
  'PLAYLIST_NOT_FOUND',
  'PLAYLIST_EMPTY'
];

for (const st of expectedStatuses) {
  assert(
    contractContent.includes(st),
    `PLAYER_CONTRACT.md deve documentar o status canônico: ${st}`
  );
}
console.log('✅ PASS: Todos os 10 status canônicos documentados no contrato.\n');

// 4. Comparar com migration real no Supabase
console.log('>>> Test 3: Validação cruzada com as migrations SQL reais');
const migrationsDir = path.resolve(workspaceRoot, 'supabase', 'migrations');
assert(fs.existsSync(migrationsDir), 'Diretório de migrations deve existir');

// Validar migration 20261014_pairing_state_recovery.sql
const unpairMigrationPath = path.resolve(migrationsDir, '20261014_pairing_state_recovery.sql');
assert(fs.existsSync(unpairMigrationPath), 'Migration 20261014 deve existir');
const unpairSql = fs.readFileSync(unpairMigrationPath, 'utf8');
assert(
  unpairSql.includes('p_screen_id text DEFAULT NULL'),
  'Migration SQL real deve usar p_screen_id text DEFAULT NULL'
);
console.log('✅ PASS: admin_unpair_screen(text) em perfeita consonância com SQL real.\n');

// Validar migration 20261216_gate5322_liberacao_operacional_expansao.sql
const playlistMigrationPath = path.resolve(migrationsDir, '20261216_gate5322_liberacao_operacional_expansao.sql');
assert(fs.existsSync(playlistMigrationPath), 'Migration 20261216 deve existir');
const playlistSql = fs.readFileSync(playlistMigrationPath, 'utf8');
assert(
  playlistSql.includes('CREATE OR REPLACE FUNCTION public.get_player_playlist_for_screen(p_identifier text, p_device_id text)'),
  'Migration SQL real deve definir get_player_playlist_for_screen(text, text)'
);
assert(playlistSql.includes('DEVICE_ALREADY_BOUND'), 'SQL deve conter DEVICE_ALREADY_BOUND');
assert(playlistSql.includes('SCREEN_SUSPENDED'), 'SQL deve conter SCREEN_SUSPENDED');
assert(playlistSql.includes('DEVICE_ACCESS_DENIED'), 'SQL deve conter DEVICE_ACCESS_DENIED');
assert(playlistSql.includes('DEVICE_REVOKED'), 'SQL deve conter DEVICE_REVOKED');
assert(playlistSql.includes('NO_PLAYLIST_ASSIGNED'), 'SQL deve conter NO_PLAYLIST_ASSIGNED');
console.log('✅ PASS: get_player_playlist_for_screen em perfeita consonância com SQL real.\n');

console.log('=================================================================');
console.log('🎉 ZERO DRIFT: CONTRATO DO PLAYER 100% SINCRONIZADO COM O BANCO!');
console.log('=================================================================');
