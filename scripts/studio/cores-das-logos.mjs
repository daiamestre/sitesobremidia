// F-355 (pedido do dono, 23/11/2026) — as logos GENÉRICAS (que não falam de segmento nenhum: Oferta do Dia, Super Ofertas,
// Mega Oferta…) aparecem também nas pastas dos segmentos que combinam com a COR delas (regra em src/lib/studio/pastasDeLogos.ts).
// Aqui só se MEDE a cor (nada na logo é mudado): a fatia de cada cor entre os pontos coloridos, e quanto da logo é preto.
// Uso: node scripts/studio/cores-das-logos.mjs   (refaz scripts/studio/cores-das-logos.json para todas as genéricas)
import fs from 'node:fs';
import sharp from 'sharp';

export const ARQ_CORES = 'scripts/studio/cores-das-logos.json';
const faixa = (h) => (h < 15 || h >= 345 ? 'vermelho' : h < 40 ? 'laranja' : h < 65 ? 'amarelo' : h < 170 ? 'verde' : h < 250 ? 'azul' : h < 290 ? 'roxo' : 'rosa');

/** cores que ocupam pelo menos 20% dos pontos coloridos (+ "preto" se 10% ou mais da logo é preta) */
export async function medirCores(arquivo) {
  const { data } = await sharp(arquivo).resize(300).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const c = {}; let cor = 0, preto = 0, tot = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue; tot++;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (mx < 0.18) { preto++; continue; }
    if (d / mx < 0.35 || mx < 0.25) continue;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
    const k = faixa(h); c[k] = (c[k] || 0) + 1; cor++;
  }
  const cores = Object.entries(c).filter(([, n]) => n / cor >= 0.2).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  if (preto / tot >= 0.1) cores.push('preto');
  return cores;
}

export const lerCores = () => (fs.existsSync(ARQ_CORES) ? JSON.parse(fs.readFileSync(ARQ_CORES, 'utf8')) : {});
export const gravarCores = (c) => fs.writeFileSync(ARQ_CORES, `${JSON.stringify(c, null, 2)}\n`);

if (process.argv[1]?.endsWith('cores-das-logos.mjs')) {
  const pastas = JSON.parse(fs.readFileSync('scripts/studio/pastas-das-logos.json', 'utf8'));
  const lista = JSON.parse(fs.readFileSync('public/studio/logos/promocao/lista.json', 'utf8'));
  const cores = {};
  for (const id of pastas.mercado) { const l = lista.find((x) => x.id === id); if (l) cores[id] = await medirCores(`public/studio/logos/promocao/${l.arquivo}`); }
  for (const [id, arq] of [['oficial-mega-oferta', 'public/studio/logos/mega-oferta.webp'], ['oficial-alerta-de-oferta', 'public/studio/logos/alerta-de-oferta.webp']]) cores[id] = await medirCores(arq);
  gravarCores(cores);
  for (const [id, c] of Object.entries(cores)) console.log(id.padEnd(30), c.join(', '));
}
