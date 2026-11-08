/**
 * F-272 — CATÁLOGO POR LINK: o catálogo de fotos dos encartes guarda só TEXTO (nome, marca, peso, código e o endereço da foto
 * no site da marca). A foto vem na hora pelo passa-foto (Worker `sobremidia-tabloide-ia`, rota /foto), que corta a sobra
 * transparente e entrega com permissão de uso, sem guardar nada no R2 nem no SSD.
 *
 *   node scripts/ops/catalogo-por-link.mjs hosts                 → regrava no worker a lista de sites permitidos (pesquisa das marcas)
 *   node scripts/ops/catalogo-por-link.mjs converter [--max=N]   → ENSAIO: monta o link de cada foto do catálogo que é cópia de foto
 *                                                                  de marca, confere CADA link pelo passa-foto (abre, é imagem,
 *                                                                  mesmo tamanho da cópia) e grava o relatório; não muda o banco
 *   node scripts/ops/catalogo-por-link.mjs converter --aplicar   → o mesmo e troca no banco SÓ as fotos cujo link passou
 *   node scripts/ops/catalogo-por-link.mjs voltar                → desfaz: devolve as fotos para as cópias do R2 (que não são apagadas)
 *
 * Fonte: ../marcas e ../marcas-v2 (<marca>/prontos.json) + oficial/ (a mesma foto que a cópia veio). Relatório e desfazer ficam em
 * ../backup-pesquisa-marcas/ (fora do Git). As cópias do R2 NÃO são apagadas por este script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { R2_PUBLICO } from './segredos.mjs';
import { sharp, sqlBruto } from './recorte-do-catalogo.mjs';
import { linkDaFoto } from './passa-foto.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const ACIMA = path.resolve(RAIZ, '..');
const SAIDA = path.join(ACIMA, 'backup-pesquisa-marcas');
const DESFAZER = path.join(SAIDA, 'catalogo-por-link-desfazer.json');
const RELATORIO = path.join(SAIDA, 'catalogo-por-link-relatorio.json');
const WORKER = path.join(RAIZ, 'cloudflare/tabloide-ia/worker.js');
const esc = (s) => String(s ?? '').replace(/'/g, "''");

/** Todas as marcas da pesquisa: { pasta, itens de prontos.json (sem recusados) }. */
function marcasDaPesquisa() {
  const out = [];
  for (const raiz of ['marcas', 'marcas-v2']) {
    const dir = path.join(ACIMA, raiz);
    if (!fs.existsSync(dir)) continue;
    for (const m of fs.readdirSync(dir)) {
      const pasta = path.join(dir, m);
      const arq = (n) => path.join(pasta, n);
      if (!fs.existsSync(arq('produtos.json'))) continue;
      const fora = new Set(fs.existsSync(arq('recusados.txt')) ? fs.readFileSync(arq('recusados.txt'), 'utf8').split(/\s+/).filter(Boolean) : []);
      const produtos = JSON.parse(fs.readFileSync(arq('produtos.json'), 'utf8'));
      const prontos = fs.existsSync(arq('prontos.json')) ? JSON.parse(fs.readFileSync(arq('prontos.json'), 'utf8')).filter((p) => !fora.has(p.slug)) : [];
      out.push({ pasta, produtos, prontos });
    }
  }
  return out;
}

const modo = process.argv[2];
const APLICAR = process.argv.includes('--aplicar');
const MAX = Number((process.argv.find((a) => a.startsWith('--max=')) ?? '').slice(6)) || Infinity;

if (modo === 'hosts') {
  const hosts = new Set();
  for (const m of marcasDaPesquisa()) for (const p of m.produtos) { try { hosts.add(new URL(p.url).hostname); } catch { /* sem foto */ } }
  const lista = [...hosts].sort();
  const t = fs.readFileSync(WORKER, 'utf8');
  const novo = t.replace(/(\/\/ <<HOSTS[^\n]*\n)[\s\S]*?(\/\/ HOSTS>>)/, `$1const HOSTS = ${JSON.stringify(lista, null, 0).replace(/","/g, '", "')};\n$2`);
  if (novo === t && !t.includes('const HOSTS = [')) throw new Error('marcadores HOSTS não encontrados no worker');
  fs.writeFileSync(WORKER, novo);
  console.log('sites permitidos no passa-foto:', lista.length);
} else if (modo === 'converter') {
  // 1) cada cópia do R2 → a foto oficial de onde veio (página + nome do arquivo final)
  const porCopia = new Map();
  for (const m of marcasDaPesquisa()) for (const p of m.prontos) if (p.final && p.url) porCopia.set(`${p.pagina}|${p.final}`, { ...p, pasta: m.pasta });
  const linhas = await sqlBruto(`select distinct imagem_url, origem_url from public.tabloide_catalogo where fonte = 'MARCA' and imagem_url like '${esc(R2_PUBLICO)}catalogo/marcas/%'`);
  const alvos = [];
  let semOrigem = 0;
  for (const l of linhas) {
    const p = porCopia.get(`${l.origem_url}|${decodeURIComponent(l.imagem_url.split('/').pop())}`);
    if (!p) { semOrigem++; continue; }
    alvos.push({ copia: l.imagem_url, p });
  }
  console.log(`cópias de marca no catálogo: ${linhas.length} · com a foto oficial de origem: ${alvos.length} · sem origem (ficam como estão): ${semOrigem}`);
  // 2) a caixa da sobra transparente, medida na própria foto oficial (o mesmo corte que fez a cópia)
  const resultado = [];
  const fila = alvos.slice(0, MAX);
  let i = 0;
  const trabalhar = async () => {
    while (i < fila.length) {
      const { copia, p } = fila[i++];
      const r = { copia, origem: p.url, ok: false };
      try {
        const arq = path.join(p.pasta, 'oficial', p.arq);
        const meta = await sharp(arq).metadata();
        const t = await sharp(arq).trim({ threshold: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer({ resolveWithObject: true });
        const caixa = { left: -(t.info.trimOffsetLeft ?? 0), top: -(t.info.trimOffsetTop ?? 0), width: t.info.width, height: t.info.height };
        const inteira = caixa.left === 0 && caixa.top === 0 && caixa.width === meta.width && caixa.height === meta.height;
        r.link = linkDaFoto(p.url, inteira ? null : caixa);
        // 3) confere o link de verdade: abre, é imagem, e tem o tamanho da cópia (o corte bateu)
        const resp = await fetch(r.link, { signal: AbortSignal.timeout(30000) });
        const corpo = Buffer.from(await resp.arrayBuffer());
        r.status = resp.status;
        r.transformou = resp.headers.get('x-passa-foto');
        if (resp.ok && /^image\//.test(resp.headers.get('content-type') ?? '')) {
          const m2 = await sharp(corpo).metadata();
          r.tamanho = `${m2.width}x${m2.height}`;
          r.esperado = `${p.W}x${p.H}`;
          r.ok = Math.abs(m2.width - p.W) <= 2 && Math.abs(m2.height - p.H) <= 2;
          r.bytes = corpo.length;
        }
      } catch (e) { r.erro = String(e?.message ?? e).slice(0, 120); }
      resultado.push(r);
      if (resultado.length % 100 === 0) console.log(`  ${resultado.length}/${fila.length} conferidos (ok ${resultado.filter((x) => x.ok).length})`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, trabalhar));
  const ok = resultado.filter((r) => r.ok);
  fs.mkdirSync(SAIDA, { recursive: true });
  fs.writeFileSync(RELATORIO, JSON.stringify({ quando: new Date().toISOString(), conferidos: resultado.length, ok: ok.length, falhas: resultado.filter((r) => !r.ok) }, null, 1));
  const kb = (n) => Math.round(ok.reduce((s, r) => s + (r.bytes ?? 0), 0) / Math.max(1, ok.length) / 1024);
  console.log(`conferidos ${resultado.length} · link OK ${ok.length} · falharam ${resultado.length - ok.length} (ficam com a cópia) · média ${kb()} KB por foto`);
  if (APLICAR && ok.length) {
    const anterior = fs.existsSync(DESFAZER) ? JSON.parse(fs.readFileSync(DESFAZER, 'utf8')) : {};
    for (const r of ok) anterior[r.link] = r.copia;
    fs.writeFileSync(DESFAZER, JSON.stringify(anterior, null, 1));
    for (let k = 0; k < ok.length; k += 200) {
      const lote = ok.slice(k, k + 200);
      await sqlBruto(`update public.tabloide_catalogo c set imagem_url = v.link, updated_at = now() from (values ${lote.map((r) => `('${esc(r.copia)}', '${esc(r.link)}')`).join(',')}) v(copia, link) where c.fonte = 'MARCA' and c.imagem_url = v.copia`);
    }
    console.log(`APLICADO: ${ok.length} fotos do catálogo agora vêm pelo link (desfazer: node scripts/ops/catalogo-por-link.mjs voltar)`);
  }
} else if (modo === 'voltar') {
  const mapa = fs.existsSync(DESFAZER) ? Object.entries(JSON.parse(fs.readFileSync(DESFAZER, 'utf8'))) : [];
  for (let k = 0; k < mapa.length; k += 200) {
    const lote = mapa.slice(k, k + 200);
    await sqlBruto(`update public.tabloide_catalogo c set imagem_url = v.copia, updated_at = now() from (values ${lote.map(([link, copia]) => `('${esc(link)}', '${esc(copia)}')`).join(',')}) v(link, copia) where c.imagem_url = v.link`);
  }
  console.log('desfeito:', mapa.length, 'fotos voltaram para as cópias do R2');
} else {
  console.log('uso: hosts | converter [--max=N] [--aplicar] | voltar');
}
