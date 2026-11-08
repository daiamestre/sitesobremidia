// F-246 — adapta os fundos OFICIAIS do dono para os outros tamanhos sem deformar a arte: o título, a logo e o rodapé ficam
// iguais (só mudam de escala, por igual) e apenas a FAIXA de fundo entre eles (onde entram os produtos) ajusta a altura.
// As faixas usadas aqui são as mesmas de ADAPTACOES em src/lib/studio/encartesOficiais.ts.
// Uso: node scripts/studio/adaptar-encartes.mjs
import sharp from 'sharp';

const PASTA = 'public/studio/encartes-oficiais';
const TAMANHOS = { '1x1': [1080, 1080], '4x5': [1080, 1350], a4: [1240, 1754], 'a4-h': [1754, 1240], a3: [1754, 2480] };
const SOURCES = { v: { w: 1080, h: 1920 }, h: { w: 1920, h: 1080 } };
const ADAPTACOES = {
  'mega-oferta-bicolor': { a4: ['v', 500, 1690], a3: ['v', 500, 1690], '4x5': ['v', 500, 1690], 'a4-h': ['h', 470, 945], '1x1': ['h', 470, 945] },
  'semana-do-frango': { a4: ['v', 650, 1570], a3: ['v', 650, 1570], '4x5': ['h', 540, 820], 'a4-h': ['h', 540, 820], '1x1': ['h', 540, 820] },
  'saude-em-oferta': { a4: ['v', 500, 1690], a3: ['v', 500, 1690], '4x5': ['v', 500, 1690], 'a4-h': ['h', 470, 945], '1x1': ['h', 470, 945] },
};

async function adaptar(entrada, saida, base, y1, y2, W, H) {
  const s = W / base.w;
  const topo = Math.round(y1 * s), pe = Math.round((base.h - y2) * s), meio = H - topo - pe;
  if (meio < 40) throw new Error(`${saida}: a faixa ficou pequena demais`);
  const parte = (top, height, h) => sharp(entrada).extract({ left: 0, top, width: base.w, height }).resize(W, h, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const pecas = [await parte(0, y1, topo), await parte(y1, y2 - y1, meio), await parte(y2, base.h - y2, pe)];
  await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } })
    .composite([{ input: pecas[0], top: 0, left: 0 }, { input: pecas[1], top: topo, left: 0 }, { input: pecas[2], top: topo + meio, left: 0 }])
    .sharpen(s > 1.2 ? { sigma: 0.8 } : undefined)
    .webp({ quality: 90 }).toFile(saida);
}

for (const [id, formatos] of Object.entries(ADAPTACOES)) {
  for (const [f, [fonte, y1, y2]] of Object.entries(formatos)) {
    const [W, H] = TAMANHOS[f];
    for (const fim of ['', '-limpo']) await adaptar(`${PASTA}/${id}-${fonte}-st${fim}.webp`, `${PASTA}/${id}-${f}${fim}.webp`, SOURCES[fonte], y1, y2, W, H);
  }
}
console.log('fundos adaptados');
