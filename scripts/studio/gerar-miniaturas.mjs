// SOBRE MÍDIA STUDIO — miniaturas PRONTAS dos modelos (F-226).
// Antes o tablet desenhava cada modelo na hora (baixando a foto de 1024 px e montando a arte em 1920 px, ~170 vezes),
// o que travava a página do Studio. Agora cada modelo é desenhado UMA vez aqui, no mesmo código do site, e vai para
// public/studio/miniaturas/<id>-h.webp (560×315) e <id>-v.webp (315×560). O site só baixa essas imagens leves.
//   node scripts/studio/gerar-miniaturas.mjs
// Roda de novo sempre que um modelo ou foto mudar (o robô studio-fotos roda sozinho depois de fotos novas).
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const RAIZ = resolve(import.meta.dirname, '../..');
const PUBLICO = join(RAIZ, 'public');
const SAIDA = join(PUBLICO, 'studio/miniaturas');
const MANIFESTO = join(RAIZ, 'src/lib/studio/miniaturas-prontas.ts');
const LARGURA = { '16:9': 560, '9:16': 315 };
const TIPOS = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const pacote = await build({ entryPoints: [join(RAIZ, 'scripts/studio/miniaturas-entrada.ts')], bundle: true, format: 'iife', write: false, target: 'chrome120', logLevel: 'error' });
const codigo = pacote.outputFiles[0].text;

// servidor só desta máquina: a página de trabalho + as fotos de public/
const servidor = createServer(async (req, res) => {
  const caminho = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (caminho === '/' || caminho === '/trabalho.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><body><script>${codigo}</script></body>`);
    return;
  }
  const arquivo = join(PUBLICO, caminho);
  if (!arquivo.startsWith(PUBLICO) || !existsSync(arquivo)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' });
  res.end(await readFile(arquivo));
});
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
const porta = servidor.address().port;

// Chromium do Playwright; sem ele (PC do dono), o Chrome instalado na máquina
const navegador = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const pagina = await navegador.newPage();
await pagina.goto(`http://127.0.0.1:${porta}/trabalho.html`);
const ids = await pagina.evaluate(() => window.listarModelos());
await mkdir(SAIDA, { recursive: true });

const manifesto = {};
const feitos = new Set();
let n = 0;
for (const id of ids) {
  for (const [formato, letra] of [['16:9', 'h'], ['9:16', 'v']]) {
    const url = await pagina.evaluate(([i, f, l]) => window.desenharModelo(i, f, l), [id, formato, LARGURA[formato]]);
    if (!url?.startsWith('data:image/webp')) { console.log(`falhou: ${id} ${formato}`); continue; }
    const bytes = Buffer.from(url.split(',')[1], 'base64');
    const nome = `${id}-${letra}.webp`;
    await writeFile(join(SAIDA, nome), bytes);
    feitos.add(nome);
    (manifesto[id] ??= {})[letra] = createHash('md5').update(bytes).digest('hex').slice(0, 8);
    n++;
  }
}
await navegador.close();
servidor.close();

// tira as miniaturas de modelos que não existem mais
for (const f of await readdir(SAIDA)) if (f.endsWith('.webp') && !feitos.has(f)) await unlink(join(SAIDA, f));

const linhas = Object.keys(manifesto).sort().map((id) => `  '${id}': { h: '${manifesto[id].h}', v: '${manifesto[id].v}' },`);
await writeFile(MANIFESTO, `// GERADO por scripts/studio/gerar-miniaturas.mjs (F-226) — não editar à mão.
// Miniaturas prontas em public/studio/miniaturas/<id>-h.webp e <id>-v.webp; o valor é a impressão do arquivo (cache).
export const MINIATURAS_PRONTAS: Record<string, { h: string; v: string }> = {
${linhas.join('\n')}
};
`);
console.log(`miniaturas prontas: ${n} (${ids.length} modelos)`);
