/**
 * F-303 (pedido do dono, 12/11/2026): grava as CAPAS EM VÍDEO do Studio — um MP4 leve por modelo de encarte e de palco,
 * com os produtos e as fotos de exemplo do segmento, para as capas passarem em loop sem o tablet desenhar nada ao vivo.
 *
 *   node scripts/studio/gravar-capas.mjs            → grava as que faltam
 *   node scripts/studio/gravar-capas.mjs --todas    → regrava todas (depois de mudar um modelo)
 *   node scripts/studio/gravar-capas.mjs --so=palco-saude-em-oferta
 *
 * Saída: public/studio/capas/<id>.mp4 (H.264, 360 px de largura, 20 qps, sem som) + <id>.jpg (imagem fixa para aparecer na
 * hora) e src/lib/studio/capasEmVideo.json (o índice que o Studio lê). Usa o servidor de desenvolvimento (vite) e a conta
 * de TESTE (sessao-teste.mjs) só para ler as fotos do catálogo.
 */
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import ffmpegInstalado from '@ffmpeg-installer/ffmpeg';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SAIDA = path.join(RAIZ, 'public/studio/capas');
const INDICE = path.join(RAIZ, 'src/lib/studio/capasEmVideo.json');
const PORTA = 5213;
const args = process.argv.slice(2);
const todas = args.includes('--todas');
const so = args.find((a) => a.startsWith('--so='))?.slice(5).split(',');
fs.mkdirSync(SAIDA, { recursive: true });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function ate(fn, ms = 90_000) { const fim = Date.now() + ms; while (Date.now() < fim) { try { const v = await fn(); if (v) return v; } catch { /* ainda não */ } await esperar(700); } throw new Error('tempo esgotado'); }

console.log('ligando o servidor de desenvolvimento…');
const vite = spawn(process.execPath, [path.join(RAIZ, 'node_modules/vite/bin/vite.js'), '--port', String(PORTA), '--strictPort'], { cwd: RAIZ, stdio: 'ignore' });
const sessao = spawn(process.execPath, [path.join(RAIZ, 'scripts/ops/sessao-teste.mjs')], { cwd: RAIZ, stdio: 'ignore' });
const fechar = () => { try { vite.kill(); } catch { /* */ } try { sessao.kill(); } catch { /* */ } };
process.on('exit', fechar);

try {
  await ate(async () => (await fetch(`http://localhost:${PORTA}/`)).ok);
  const conta = await ate(async () => (await fetch('http://127.0.0.1:8767/')).json());
  // o Chromium já instalado no PC (o Playwright pode ter sido atualizado sem baixar o navegador novo)
  const instalado = path.join(os.homedir(), 'AppData/Local/ms-playwright');
  const extra = fs.existsSync(instalado) ? fs.readdirSync(instalado).filter((d) => /^chromium-\d+$/.test(d)).map((d) => path.join(instalado, d, 'chrome-win64/chrome.exe')).find((p) => fs.existsSync(p)) : undefined;
  const nav = await chromium.launch().catch(() => chromium.launch({ executablePath: extra }));
  const pag = await nav.newPage({ viewport: { width: 800, height: 900 } });
  pag.setDefaultTimeout(180_000);
  await pag.goto(`http://localhost:${PORTA}/`, { waitUntil: 'domcontentloaded' });
  await pag.evaluate(([k, v]) => localStorage.setItem(k, v), [conta.key, JSON.stringify(conta.session)]);
  await pag.goto(`http://localhost:${PORTA}/studio`, { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(8000);
  const lista = await pag.evaluate(async () => (await import('/src/lib/studio/gravarCapas.ts')).listaDeCapas());
  const indice = fs.existsSync(INDICE) ? JSON.parse(fs.readFileSync(INDICE, 'utf8')) : {};
  for (const c of lista) {
    if (so && !so.includes(c.id)) continue;
    const mp4 = path.join(SAIDA, `${c.id}.mp4`);
    if (!todas && !so && fs.existsSync(mp4) && indice[c.id]) { console.log('já existe:', c.id); continue; }
    const t0 = Date.now();
    // o índice só é gravado no fim (gravar no meio faz o servidor de desenvolvimento recarregar a página); se recarregar, tenta de novo
    const gravar = () => pag.evaluate(async (id) => (await import('/src/lib/studio/gravarCapas.ts')).quadrosDaCapa(id), c.id);
    const r = await gravar().catch(async () => { await pag.waitForTimeout(5000); return gravar(); });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-'));
    r.quadros.forEach((q, i) => fs.writeFileSync(path.join(tmp, `${String(i).padStart(4, '0')}.jpg`), Buffer.from(q.split(',')[1], 'base64')));
    await new Promise((ok, erro) => {
      const ff = spawn(ffmpegInstalado.path, ['-y', '-loglevel', 'error', '-framerate', String(r.fps), '-i', path.join(tmp, '%04d.jpg'),
        // F-303 (dono: "qualidade boa, mas extremamente leve"): H.264 Main (toca em qualquer TV Box, tablet e celular),
        // ajuste para ARTE GRÁFICA (letras e bordas nítidas com menos bits), compressão lenta = menor arquivo
        '-c:v', 'libx264', '-profile:v', 'main', '-level', '3.1', '-pix_fmt', 'yuv420p', '-preset', 'veryslow', '-tune', 'animation', '-crf', '27', '-maxrate', '500k', '-bufsize', '1000k',
        '-g', String(r.fps * 2), '-movflags', '+faststart', '-an', mp4]);
      ff.on('exit', (code) => (code === 0 ? ok() : erro(new Error(`ffmpeg ${code}`))));
    });
    const capa = Math.floor(r.quadros.length * 0.45);
    // a imagem fixa (aparece na hora, antes do vídeo): JPEG comprimido (~30 KB)
    spawnSync(ffmpegInstalado.path, ['-y', '-loglevel', 'error', '-i', path.join(tmp, `${String(capa).padStart(4, '0')}.jpg`), '-q:v', '6', path.join(SAIDA, `${c.id}.jpg`)]);
    fs.rmSync(tmp, { recursive: true, force: true });
    indice[c.id] = {
      video: `/studio/capas/${c.id}.mp4`, poster: `/studio/capas/${c.id}.jpg`, largura: r.largura, altura: r.altura, segundos: +(r.quadros.length / r.fps).toFixed(1),
      kb: Math.round(fs.statSync(mp4).size / 1024), nome: c.nome, segmento: c.segmento, tipo: c.tipo,
    };
    console.log('gravada:', c.id, `${(fs.statSync(mp4).size / 1024).toFixed(0)} KB`, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  fs.writeFileSync(INDICE, JSON.stringify(indice, null, 1) + '\n');
  await nav.close();
} finally { fechar(); }
console.log('pronto. Índice:', path.relative(RAIZ, INDICE));
process.exit(0);
