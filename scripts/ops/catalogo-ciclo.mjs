/**
 * F-277 — CICLO CONTÍNUO DA BUSCA DE FOTOS (ordem do dono: "os agentes sempre trabalhando para encontrar as imagens").
 * Roda sem parar no PC, um passo de cada vez (a API do Supabase recusa gravações em paralelo):
 *   0) PEDIDOS DE FOTO dos encartes (pedidos-de-foto.mjs): produto sem foto é procurado primeiro
 *   1) recorta no PC as fotos novas das lojas (marca-varejo-lote recortar)
 *   2) CONFERÊNCIA DUPLA com a IA nas marcas ainda não conferidas (marca-conferir-ia) — parte comida, sombra ou reflexo = fora
 *   3) tira as fotos genéricas das lojas (marca-varejo-lote filtrar)
 *   4) grava POR LINK só o que a IA aprovou (marca-varejo-lote gravar)
 *   5) hortifrúti: procura o que ainda falta (hortifruti-fotos buscar) e grava os aprovados
 *   6) a cada 7 dias, procura de novo nas lojas as marcas que ainda não tinham nada (marca-varejo --status=...)
 *   7) espera 30 min e recomeça. Tudo vai para ../marcas/lista/ciclo.log.
 *   node scripts/ops/catalogo-ciclo.mjs [--uma-vez]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const MARCAS = path.resolve(RAIZ, '..', 'marcas');
const LOG = path.join(MARCAS, 'lista', 'ciclo.log');
const uma = process.argv.includes('--uma-vez');
const log = (t) => { const l = `[${new Date().toLocaleString('pt-BR')}] ${t}`; fs.appendFileSync(LOG, `${l}\n`); console.log(l); };
const rodar = (args, max = 6 * 3600_000) => {
  const r = spawnSync(process.execPath, args, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: max });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').filter((l) => /RESULTADO|TOTAL|gravados|fotos genéricas/.test(l)).slice(-3).join(' | ');
};
/** pastas que outra fila de conferência ainda está processando (listas conf-*.txt cujo log não terminou) */
function ocupadas() {
  const dir = path.join(MARCAS, 'lista');
  const out = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => /^conf-.*\.txt$/.test(x))) {
    const logf = path.join(dir, f.replace(/\.txt$/, '.log'));
    if (fs.existsSync(logf) && /RESULTADO/.test(fs.readFileSync(logf, 'utf8'))) continue;
    fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).filter(Boolean).forEach((p) => out.add(path.resolve(p)));
  }
  return out;
}
const ULTIMA_VARREDURA = path.join(MARCAS, 'lista', 'ciclo-ultima-varredura.txt');

for (let volta = 1; ; volta++) {
  log(`volta ${volta}: começo`);
  // F-284 (ordem do dono): PRIMEIRO os pedidos de foto dos encartes (produto sem foto = varredura na hora)
  log(`pedidos de foto: ${rodar(['scripts/ops/pedidos-de-foto.mjs', '--max=60'])}`);
  log(`recorte: ${rodar(['scripts/ops/marca-varejo-lote.mjs', MARCAS, '--fase=recortar'])}`);
  const reg = fs.readFileSync(path.join(MARCAS, 'lista', 'varejo.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const fora = ocupadas();
  const aConferir = [...new Set(reg.map((x) => path.resolve(x.pasta)))].filter((p) => !fora.has(p) && fs.existsSync(path.join(p, 'prontos.json')) && !fs.existsSync(path.join(p, 'conferencia-ia.json')));
  if (aConferir.length) {
    const lista = path.join(MARCAS, 'lista', 'ciclo-conferir.txt');
    fs.writeFileSync(lista, aConferir.slice(0, 80).join('\n'));
    log(`conferência dupla (${Math.min(80, aConferir.length)} de ${aConferir.length} marcas): ${rodar(['scripts/ops/marca-conferir-ia.mjs', `--lista=${lista}`])}`);
  }
  log(`fotos genéricas: ${rodar(['scripts/ops/marca-varejo-lote.mjs', MARCAS, '--fase=filtrar'])}`);
  log(`gravação: ${rodar(['scripts/ops/marca-varejo-lote.mjs', MARCAS, '--fase=gravar'])}`);
  log(`hortifrúti: ${rodar(['scripts/ops/hortifruti-fotos.mjs', 'buscar'])}`);
  log(`hortifrúti gravação: ${rodar(['scripts/ops/hortifruti-fotos.mjs', 'gravar'])}`);
  const ultima = fs.existsSync(ULTIMA_VARREDURA) ? Number(fs.readFileSync(ULTIMA_VARREDURA, 'utf8')) : 0;
  if (Date.now() - ultima > 7 * 86400_000) {
    fs.writeFileSync(ULTIMA_VARREDURA, String(Date.now()));
    log(`nova varredura das lojas: ${rodar(['scripts/ops/marca-varejo.mjs', MARCAS])}`);
  }
  log(`volta ${volta}: fim`);
  if (uma) break;
  await new Promise((r) => setTimeout(r, 30 * 60_000));
}
