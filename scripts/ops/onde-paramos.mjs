// SOBRE MÍDIA — "onde paramos": resumo para retomar o trabalho em qualquer IA, IDE ou janela nova.
// Mostra o ramo e os últimos commits, o que está sem commit, as últimas entregas (F-NN) e as pendências abertas de
// docs/ESTADO_DO_SISTEMA.md. Não usa rede nem chaves.
//   node scripts/ops/onde-paramos.mjs            → resumo
//   node scripts/ops/onde-paramos.mjs P-03       → só a pendência pedida, com o texto completo
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8' }).replace(/\s+$/, ''); } catch { return ''; } };
const SITUACAO = /🟥|🟧|🟨|✅/;

/** As pendências da seção 4 do estado: { id, situacao, texto (com os passos), resolvida }. */
export function pendencias(estado) {
  const secao = estado.split(/^## 4\./m)[1]?.split(/^## 5\./m)[0] ?? '';
  const lista = [];
  let atual = null;
  for (const l of secao.split('\n')) {
    const m = l.match(/^- \*\*(P-\d+)/);
    if (m) {
      atual = { id: m[1], situacao: l.match(SITUACAO)?.[0] ?? '', texto: l.replace(/^- \*\*P-\d+\s*/, '').replace(SITUACAO, '').replace(/\*\*/g, '').trim(), resolvida: l.includes('✅') };
      lista.push(atual);
    } else if (atual && /^\s+\S/.test(l)) atual.texto += `\n    ${l.trim()}`; // passos numerados da pendência
    else if (!l.trim() || l.startsWith('#')) atual = null;
  }
  return lista;
}

/** Os títulos das últimas entregas do histórico (### F-NN — título). */
export function ultimasEntregas(ledger, n = 6) {
  return [...ledger.matchAll(/^### (F-\d+) — (.+)$/gm)].map((m) => `${m[1]} — ${m[2].slice(0, 110)}`).slice(-n).reverse();
}

function main() {
  const estado = fs.readFileSync('docs/ESTADO_DO_SISTEMA.md', 'utf8');
  const pedida = process.argv[2]?.toUpperCase();
  const lista = pendencias(estado);
  if (pedida) {
    const p = lista.find((x) => x.id === pedida);
    console.log(p ? `${p.id} ${p.situacao} ${p.texto}` : `Pendência ${pedida} não encontrada em docs/ESTADO_DO_SISTEMA.md.`);
    return;
  }
  const sujos = git('status', '--porcelain', '--untracked-files=no').split('\n').filter(Boolean).map((l) => l.slice(3));
  console.log('=== SOBRE MÍDIA — onde paramos ===');
  console.log(`Ramo: ${git('branch', '--show-current')}  ·  último commit: ${git('log', '-1', '--format=%h %s (%cr)')}`);
  console.log(`Arquivos alterados sem commit: ${sujos.length}${sujos.length ? ` (${sujos.slice(0, 5).join(', ')}${sujos.length > 5 ? ', …' : ''})` : ''}`);
  console.log('\nÚltimos commits:');
  for (const l of git('log', '-8', '--format=%h %ad %s', '--date=short').split('\n')) console.log(`  ${l}`);
  const ledger = fs.existsSync('docs/engineering/FINDINGS_LEDGER.md') ? fs.readFileSync('docs/engineering/FINDINGS_LEDGER.md', 'utf8') : '';
  console.log('\nÚltimas entregas (FINDINGS_LEDGER):');
  for (const e of ultimasEntregas(ledger)) console.log(`  ${e}`);
  const abertas = lista.filter((p) => !p.resolvida);
  console.log(`\nPendências abertas (${abertas.length}) — 🟥 depende do dono · 🟧 dá para fazer já · 🟨 melhoria:`);
  for (const p of abertas) {
    const t = p.texto.split('\n')[0];
    console.log(`  ${p.id} ${p.situacao} ${t.slice(0, 120)}${t.length > 120 ? '…' : ''}`);
  }
  console.log('\nDetalhe de uma pendência: node scripts/ops/onde-paramos.mjs P-01');
  console.log('Leitura completa: docs/ESTADO_DO_SISTEMA.md → docs/DECISOES_DO_DONO.md → AGENTS.md → docs/MAPA_DO_PROJETO.md');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
