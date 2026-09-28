/**
 * Prova que uma mudança no banco NÃO altera o que as telas recebem: calcula o md5 da resposta REAL de
 * get_player_playlist_for_screen para cada tela vinculada, dentro de uma transação que é desfeita (não grava
 * last_ping_at nem nada).
 *   node scripts/ops/comparar-telas.mjs antes      (guarda em scratch/telas-antes.txt)
 *   ... aplicar a migração ...
 *   node scripts/ops/comparar-telas.mjs depois     (compara e diz IDÊNTICA ou DIFERENTE por tela)
 */
import fs from 'node:fs';
import { sql } from './sql.mjs';

const modo = process.argv[2];
if (!['antes', 'depois'].includes(modo)) { console.error('uso: node scripts/ops/comparar-telas.mjs antes|depois'); process.exit(2); }
const BLOCO = `DO $$ DECLARE t text; BEGIN
  SELECT string_agg(s.name || '=' || md5(public.get_player_playlist_for_screen(s.id::text, s.bound_device_id)::text), ' | ' ORDER BY s.id)
    INTO t FROM public.screens s WHERE s.bound_device_id IS NOT NULL;
  RAISE EXCEPTION 'RESULTADO %', t; END $$;`;
let texto = '';
try { await sql(BLOCO); } catch (e) { texto = /RESULTADO ([^\\"]*)/.exec(e.message)?.[1] ?? ''; }
if (!texto) { console.error('não foi possível ler as telas'); process.exitCode = 1; }
const arq = 'scratch/telas-antes.txt';
fs.mkdirSync('scratch', { recursive: true });
if (modo === 'antes') { fs.writeFileSync(arq, texto); console.log(`retrato de ${texto.split(' | ').length} telas salvo em ${arq}`); }
else {
const antes = Object.fromEntries(fs.readFileSync(arq, 'utf8').split(' | ').map((x) => x.split('=')));
let dif = 0;
for (const par of texto.split(' | ')) {
  const [nome, h] = par.split('=');
  const igual = antes[nome] === h; if (!igual) dif++;
  console.log(`${igual ? 'IDÊNTICA ' : 'DIFERENTE'} ${nome}`);
}
console.log(dif ? `${dif} tela(s) mudaram` : 'resposta de todas as telas idêntica');
process.exitCode = dif ? 1 : 0; // (sem process.exit: evita erro do Node no Windows ao fechar logo após uma requisição)
}
