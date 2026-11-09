// F-278 — tira os ícones de redes sociais GRAVADOS no fundo do Mega Oferta (arte do dono): eles agora são um elemento próprio
// (linha de redes que se arrasta e ganha nomes). Os pontos brancos dos ícones são preenchidos com o azul em volta (média
// ponderada só do fundo, sem os ícones), o resto da arte fica igual. O original vai para ../backup-pesquisa-marcas/fundos-originais (uma vez, fora do site).
// Uso: node scripts/studio/tirar-redes-do-fundo.mjs
import fs from 'node:fs';
import sharp from 'sharp';

const E = 'public/studio/encartes-oficiais';
const ALVOS = [
  { arq: `${E}/mega-oferta-bicolor-v-st-limpo.webp`, caixa: { x: 660, y: 352, w: 360, h: 90 } },
  { arq: `${E}/mega-oferta-bicolor-h-st-limpo.webp`, caixa: { x: 1105, y: 288, w: 410, h: 94 } },
];

async function tirar({ arq, caixa }) {
  fs.mkdirSync('../backup-pesquisa-marcas/fundos-originais', { recursive: true });
  const copia = `../backup-pesquisa-marcas/fundos-originais/${arq.split('/').pop().replace(/\.webp$/, '.com-redes.webp')}`;
  if (!fs.existsSync(copia)) fs.copyFileSync(arq, copia);
  const { data, info } = await sharp(copia).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  // a faixa inteira dos ícones é refeita coluna a coluna: a cor de cima da faixa vai, em degradê, até a cor de baixo
  // (o fundo ali é um degradê liso), e as bordas da faixa se misturam por 6 px para não marcar
  const out = Buffer.from(data);
  const media = (x, y0, y1) => { const c = [0, 0, 0]; for (let y = y0; y <= y1; y++) for (let k = 0; k < 3; k++) c[k] += data[(y * W + x) * 3 + k]; return c.map((v) => v / (y1 - y0 + 1)); };
  for (let x = caixa.x; x < caixa.x + caixa.w; x++) {
    const cima = media(x, caixa.y - 6, caixa.y - 1), baixo = media(x, caixa.y + caixa.h, caixa.y + caixa.h + 5);
    for (let y = caixa.y; y < caixa.y + caixa.h; y++) {
      const t = (y - caixa.y) / (caixa.h - 1), p = (y * W + x) * 3;
      const borda = Math.min(x - caixa.x, caixa.x + caixa.w - 1 - x) / 6;
      const peso = Math.min(1, borda);
      for (let k = 0; k < 3; k++) out[p + k] = Math.round((cima[k] * (1 - t) + baixo[k] * t) * peso + data[p + k] * (1 - peso));
    }
  }
  await sharp(out, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 92 }).toFile(arq);
  console.log('sem os ícones:', arq);
}
for (const a of ALVOS) await tirar(a);
