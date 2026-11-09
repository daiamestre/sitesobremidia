/**
 * Missão do catálogo (F-275) — FOTO COM FUNDO LISO (padrão de loja) vira foto SEM FUNDO POR LINK, SEM GASTAR a cota da Cloudflare.
 *   node scripts/ops/marca-recortar-local.mjs <pasta da marca>
 * Para cada item de <pasta>/com-fundo.json (marca-varejo.mjs ou marca-loja.mjs):
 *   1) baixa a foto SÓ PARA O PC (<pasta>/oficial) no tamanho que o passa-foto entrega (até 1400 px);
 *   2) tira o fundo liso com o MESMO código do site (src/lib/tabloide/recorte.ts → recortarFundo) e passa na MESMA inspeção
 *      (qualidadeRecorte.ts: repararMordidas + inspecionar). Reprovado não entra;
 *   3) aprovado vira o link do passa-foto com s=1 (a Cloudflare tira o fundo na hora em que o encarte usa a foto). Se a cota do mês
 *      acabou, o site tira o fundo no navegador com este mesmo código (F-275): a foto nunca entra com fundo;
 *   4) guarda a prévia em <pasta>/pronto (folha de conferência) e soma o item a <pasta>/prontos.json com `link`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { linkDaFoto } from './passa-foto.mjs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const jiti = require('jiti')(import.meta.filename);
const { recortarFundo, caixaOpaca, apagarSelosSoltos } = jiti('../../src/lib/tabloide/recorte.ts');
const { repararMordidas, inspecionar } = jiti('../../src/lib/tabloide/qualidadeRecorte.ts');

const pasta = process.argv[2];
if (!pasta) { console.log('uso: <pasta da marca>'); process.exit(1); }
const LADO = 1400, AREA_SEM_CORTE = 0.6;
const UA = { 'User-Agent': 'SobreMidia-Catalogo/1.0 (contato@sobremidia.com.br)', Accept: 'image/*' };
const itens = JSON.parse(fs.readFileSync(path.join(pasta, 'com-fundo.json'), 'utf8'));
const arqProntos = path.join(pasta, 'prontos.json');
const prontos = fs.existsSync(arqProntos) ? JSON.parse(fs.readFileSync(arqProntos, 'utf8')) : [];
const ja = new Set(prontos.map((p) => p.slug));
fs.mkdirSync(path.join(pasta, 'oficial'), { recursive: true });
fs.mkdirSync(path.join(pasta, 'pronto'), { recursive: true });
const motivos = {};
let i = 0, aprovados = 0;

const trabalhar = async () => {
  while (i < itens.length) {
    const x = itens[i++];
    if (ja.has(x.slug)) continue;
    const motivo = (m) => { motivos[m] = (motivos[m] ?? 0) + 1; };
    try {
      let buf;
      const arq = x.arq ?? `${x.slug}${path.extname(new URL(x.url).pathname).slice(0, 5) || '.jpg'}`;
      const local = path.join(pasta, 'oficial', arq);
      if (fs.existsSync(local)) buf = fs.readFileSync(local);
      else {
        const r = await fetch(x.url, { headers: UA, signal: AbortSignal.timeout(30000) }).catch(() => null);
        if (!r?.ok || !/^image\//.test(r.headers.get('content-type') ?? '')) { motivo(`foto não abriu ${r?.status ?? ''}`.trim()); continue; }
        buf = Buffer.from(await r.arrayBuffer());
        fs.writeFileSync(local, buf);
      }
      const meta = await sharp(buf).metadata();
      if (!meta.width || Math.max(meta.width, meta.height) < 500) { motivo('foto pequena'); continue; }
      const { data, info } = await sharp(buf).rotate().resize(LADO, LADO, { fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const w = info.width, h = info.height;
      const foto = new Uint8ClampedArray(data);
      const recorte = new Uint8ClampedArray(data);
      if (!recortarFundo({ data: recorte, width: w, height: h })) { motivo('fundo não é liso'); continue; }
      repararMordidas(foto, recorte, w, h);
      const ins = inspecionar(recorte, w, h, foto);
      if (!ins.aprovado) { motivo(ins.defeitos.join('+') || 'reprovado'); continue; }
      const selos = apagarSelosSoltos(recorte, w, h);
      const c = caixaOpaca(recorte, w, h, true);
      if (!c) { motivo('vazio'); continue; }
      // corte da sobra só quando ela é grande (com folga, porque o recorte da Cloudflare pode sair um pouco maior)
      const folga = Math.round(Math.max(c.w, c.h) * (selos ? 0.01 : 0.03));
      const caixa = { left: Math.max(0, c.x - folga), top: Math.max(0, c.y - folga), width: 0, height: 0 };
      caixa.width = Math.min(w - caixa.left, c.w + folga * 2);
      caixa.height = Math.min(h - caixa.top, c.h + folga * 2);
      const util = (c.w * c.h) / (w * h);
      const link = linkDaFoto(x.url, util >= AREA_SEM_CORTE && !selos ? null : caixa, true);
      const final = `${x.slug}.png`;
      // prévia PEQUENA (só para a folha de conferência): o disco do PC não aguenta dezenas de milhares de PNGs grandes
      const previa = await sharp(Buffer.from(recorte.buffer), { raw: { width: w, height: h, channels: 4 } }).extract({ left: c.x, top: c.y, width: c.w, height: c.h }).resize(360, 360, { fit: 'inside' }).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
      fs.writeFileSync(path.join(pasta, 'pronto', final), previa);
      prontos.push({ ...x, arq, final, W: c.w, H: c.h, link, transparente: 1, recorte: 'local' });
      aprovados++;
    } catch (e) { motivo(`erro ${String(e?.message ?? e).slice(0, 40)}`); }
  }
};
await Promise.all(Array.from({ length: 6 }, trabalhar));
fs.writeFileSync(arqProntos, JSON.stringify(prontos, null, 1));
console.log(`RESULTADO com fundo ${itens.length} | aprovados sem fundo ${aprovados} | reprovados ${itens.length - aprovados} | motivos ${JSON.stringify(motivos)}`);
