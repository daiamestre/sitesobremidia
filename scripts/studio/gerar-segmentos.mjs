// F-277 — ENCARTES e PALCOS DE OFERTAS por SEGMENTO (padaria, adega, açougue, suplementos, hortifrúti, pet, beleza,
// eletrônicos, moda) e, desde o F-296, também a FARMÁCIA:
//   - logo "OFERTAS" em 3D + fita com o segmento + frase, emblema com o ícone do segmento (sem fundo, em alta);
//   - F-296 (pedido do dono): MODELOS COMPLEMENTARES de encarte e de palco (src/lib/studio/composicoesDosSegmentos.ts), cada um
//     com composição e cenário próprios, gravados com ids próprios (<id>-<estilo>). Os modelos de antes ficam como eram
//     (arquivos <segmento>-em-oferta-*, já no repositório; este script não mexe neles).
// Arte própria (HTML/SVG + Chromium do Playwright, fontes Anton e Poppins). Uso:
//   node scripts/studio/gerar-segmentos.mjs [segmento...] [--logos]   (depois: node scripts/studio/adaptar-encartes.mjs)
//   (as logos só são refeitas com --logos ou quando ainda não existem)
import fs from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { COMPOSICOES_DOS_ENCARTES, COMPOSICOES_DOS_PALCOS } from '../../src/lib/studio/composicoesDosSegmentos.ts';

/** A mesma tabela (ids, nomes e aviso) está em src/lib/studio/segmentosDeOferta.ts. */
export const TEMAS = {
  farmacia: { fita: 'DE FARMÁCIA', frase: 'SAÚDE COM DESCONTO', icone: 'cruz', A: ['#2fd17f', '#0a9a50', '#05602f'], B: ['#2e6bff', '#1046c8', '#0a2a80'], palco: ['#7ee0a8', '#0a9a50', '#05602f', '#022a14'], extrusao: '#05401f', aviso: true, logoPronta: 'public/studio/logos/ofertas-de-farmacia.webp' },
  padaria: { fita: 'DA PADARIA', frase: 'FRESQUINHO TODO DIA', icone: 'trigo', A: ['#e8a03a', '#b8661a', '#7a3e0b'], B: ['#b0293f', '#7d1428', '#4f0a18'], palco: ['#f5be6a', '#c27420', '#7a3e0b', '#3d1d04'], extrusao: '#5a2c06' },
  adega: { fita: 'DA ADEGA', frase: 'BEBIDAS GELADAS', icone: 'taca', A: ['#b3173f', '#6e0a26', '#3c0414'], B: ['#34343d', '#16161c', '#050507'], palco: ['#c9294f', '#7a0a2a', '#3c0414', '#120106'], extrusao: '#3c0414', aviso: true },
  acougue: { fita: 'DO AÇOUGUE', frase: 'CARNES SELECIONADAS', icone: 'chama', A: ['#ec2e35', '#b3121f', '#650810'], B: ['#3d3d3d', '#1f1f1f', '#0a0a0a'], palco: ['#ff6440', '#c0141f', '#5c0710', '#1a0204'], extrusao: '#4a050b' },
  suplementos: { fita: 'SUPLEMENTOS', frase: 'MAIS FORÇA NO TREINO', icone: 'haltere', A: ['#ff8126', '#e85600', '#a33800'], B: ['#30303a', '#17171c', '#050507'], palco: ['#ff9233', '#d14a00', '#5a1d00', '#140600'], extrusao: '#5a1d00' },
  hortifruti: { fita: 'HORTIFRÚTI', frase: 'QUITANDA · FRUTAS E LEGUMES', icone: 'folha', A: ['#55c94a', '#2c9a27', '#176412'], B: ['#ffa126', '#f07400', '#b04f00'], palco: ['#84e573', '#2c9a27', '#145c10', '#082a06'], extrusao: '#0f4a0c' },
  pet: { fita: 'PET SHOP', frase: 'TUDO PARA O SEU PET', icone: 'pata', A: ['#2cc6e6', '#1393b3', '#0a5d75'], B: ['#9255f2', '#6a2fd6', '#3f1491'], palco: ['#66e0f4', '#1393b3', '#0a4d63', '#04212b'], extrusao: '#073f50' },
  beleza: { fita: 'DE BELEZA', frase: 'PERFUMARIA E CUIDADOS', icone: 'brilho', A: ['#ff63a6', '#e5257a', '#a00f52'], B: ['#9733c7', '#6a1b9a', '#3d0a5c'], palco: ['#ff93c4', '#e5257a', '#7a0b3e', '#2a0315'], extrusao: '#6e0a38' },
  eletronicos: { fita: 'TECNOLOGIA', frase: 'CONECTADO COM VOCÊ', icone: 'raio', A: ['#3a84ff', '#1450d4', '#0a2f8f'], B: ['#283052', '#121628', '#04060f'], palco: ['#62a6ff', '#1450d4', '#0a2a7a', '#020818'], extrusao: '#061c5e' },
  moda: { fita: 'DE MODA', frase: 'NOVA COLEÇÃO', icone: 'etiqueta', A: ['#ff5a82', '#e3245a', '#9c0f3a'], B: ['#303030', '#151515', '#000000'], palco: ['#ff83a2', '#e3245a', '#6e0a28', '#1a0209'], extrusao: '#5c0824' },
};

const FONTES = '<link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@600;800;900&display=block" rel="stylesheet">';
const pagina = (w, h, corpo, fundo = 'transparent') => `<!doctype html><html><head><meta charset="utf-8">${FONTES}<style>
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${fundo}}*{box-sizing:border-box}svg{display:block}</style></head><body>${corpo}</body></html>`;

// ---------- ícones dos segmentos (caixa 100×100) ----------
export const ICONES = {
  cruz: (c) => `<path d="M36 6 H64 V36 H94 V64 H64 V94 H36 V64 H6 V36 H36 Z" fill="${c}"/>`,
  trigo: (c) => `<path d="M50 96 L50 18" stroke="${c}" stroke-width="5" stroke-linecap="round"/>${[26, 40, 54, 68].map((y) => `<ellipse cx="40" cy="${y}" rx="7" ry="13" fill="${c}" transform="rotate(-32 40 ${y})"/><ellipse cx="60" cy="${y}" rx="7" ry="13" fill="${c}" transform="rotate(32 60 ${y})"/>`).join('')}<ellipse cx="50" cy="12" rx="6" ry="12" fill="${c}"/>`,
  taca: (c) => `<path d="M24 6 H76 C76 44 63 58 54 61 V84 H70 V93 H30 V84 H46 V61 C37 58 24 44 24 6 Z" fill="${c}"/><path d="M28 24 H72 C70 44 60 53 50 53 C40 53 30 44 28 24 Z" fill="#fff" opacity=".35"/>`,
  chama: (c) => `<path d="M50 3 C60 24 81 35 79 62 C77 85 63 97 50 97 C35 97 21 86 21 65 C21 49 31 41 36 28 C40 41 44 45 48 45 C46 29 44 17 50 3 Z" fill="${c}"/><path d="M50 50 C56 60 66 66 64 80 C62 90 56 94 50 94 C42 94 35 88 36 78 C37 69 44 64 50 50 Z" fill="#fff" opacity=".4"/>`,
  haltere: (c) => `<rect x="18" y="45" width="64" height="10" rx="4" fill="${c}"/><rect x="6" y="24" width="14" height="52" rx="5" fill="${c}"/><rect x="21" y="32" width="10" height="36" rx="4" fill="${c}"/><rect x="80" y="24" width="14" height="52" rx="5" fill="${c}"/><rect x="69" y="32" width="10" height="36" rx="4" fill="${c}"/>`,
  folha: (c) => `<path d="M12 88 C12 40 44 10 90 10 C90 56 60 88 12 88 Z" fill="${c}"/><path d="M16 84 L78 22 M40 60 L40 40 M55 45 L55 28 M40 60 L60 60 M55 45 L72 45" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".55"/>`,
  pata: (c) => `<ellipse cx="50" cy="68" rx="23" ry="19" fill="${c}"/><ellipse cx="22" cy="42" rx="9" ry="12" fill="${c}" transform="rotate(-20 22 42)"/><ellipse cx="39" cy="25" rx="9" ry="12" fill="${c}"/><ellipse cx="61" cy="25" rx="9" ry="12" fill="${c}"/><ellipse cx="78" cy="42" rx="9" ry="12" fill="${c}" transform="rotate(20 78 42)"/>`,
  brilho: (c) => `<path d="M50 2 C54 36 64 46 98 50 C64 54 54 64 50 98 C46 64 36 54 2 50 C36 46 46 36 50 2 Z" fill="${c}"/><path d="M82 8 C83 16 86 19 94 20 C86 21 83 24 82 32 C81 24 78 21 70 20 C78 19 81 16 82 8 Z" fill="${c}" opacity=".8"/>`,
  raio: (c) => `<path d="M60 2 L18 56 H46 L36 98 L84 38 H55 L68 2 Z" fill="${c}"/>`,
  etiqueta: (c) => `<path d="M42 6 H92 V56 L50 98 L4 52 Z" fill="${c}"/><circle cx="74" cy="24" r="8" fill="#fff"/>`,
};
const icone = (nome, cx, cy, s, cor, extra = '') => `<g transform="translate(${cx - s / 2} ${cy - s / 2}) scale(${s / 100})" ${extra}>${ICONES[nome](cor)}</g>`;
/** ícone "de verdade": sombra, corpo em degradê e brilho (no lugar das cápsulas da farmácia) */
const icone3d = (t, nome, cx, cy, s, giro, cores, id) => `<defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cores[0]}"/><stop offset=".55" stop-color="${cores[1]}"/><stop offset="1" stop-color="${cores[2]}"/></linearGradient></defs>
  <g transform="rotate(${giro} ${cx} ${cy})" filter="url(#somb)">${icone(nome, cx, cy, s, `url(#g${id})`, 'stroke="#fff" stroke-width="3"')}</g>`;

const SOMBRA = '<filter id="somb" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity=".45"/></filter>';
const BORRAO = '<filter id="borrao"><feGaussianBlur stdDeviation="10"/></filter>';
function texto3d(t, x, y, tam, { fill, extrusao, contorno, prof = 18, id, espaco = 0, ancora = 'middle', fonte = 'Anton' }) {
  const base = `x="${x}" y="${y}" font-family="${fonte}" font-size="${tam}" text-anchor="${ancora}" letter-spacing="${espaco}"`;
  let s = `<defs><linearGradient id="t${id}" x1="0" y1="0" x2="0" y2="1">${fill.map((c, i) => `<stop offset="${i / (fill.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient></defs>`;
  s += `<text ${base} fill="rgba(0,0,0,.35)" transform="translate(0 ${prof + 14})" filter="url(#borrao)">${t}</text>`;
  for (let i = prof; i > 0; i -= 2) s += `<text ${base} fill="${extrusao}" stroke="${extrusao}" stroke-width="${tam * 0.07}" stroke-linejoin="round" transform="translate(0 ${i})">${t}</text>`;
  s += `<text ${base} fill="url(#t${id})" stroke="${contorno}" stroke-width="${tam * 0.07}" stroke-linejoin="round" paint-order="stroke fill">${t}</text>`;
  return s;
}
const raios = (cx, cy, r, n, cor, op) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2, b = a + Math.PI / n * 0.55;
  return `<path d="M${cx},${cy} L${cx + Math.cos(a) * r},${cy + Math.sin(a) * r} L${cx + Math.cos(b) * r},${cy + Math.sin(b) * r} Z" fill="${cor}" opacity="${op}"/>`;
}).join('');
/** o ícone do segmento solto, bem leve, como textura */
function textura(t, W, H, n, semente) {
  let s = semente, out = '';
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H, tam = 26 + rnd() * 40, o = 0.05 + rnd() * 0.07;
    out += `<g opacity="${o}" transform="rotate(${Math.round(rnd() * 70 - 35)} ${x} ${y})">${icone(t.icone, x, y, tam, '#fff')}</g>`;
  }
  return out;
}

// ---------- logo ----------
/** partes: textos (OFERTAS, faixa, frase) e o ícone do círculo; F-286: a base sem eles vira camada e os textos ficam editáveis */
function logo(t, partes = { textos: true, icone: true }) {
  const W = 1500, H = 1050;
  const tamFita = Math.min(116, Math.round(900 / (t.fita.length * 0.5 + 0.6)));
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${SOMBRA}${BORRAO}
  <radialGradient id="sel" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#f6f6f6"/><stop offset="1" stop-color="#dcdcdc"/></radialGradient>
  <linearGradient id="ouro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a6"/><stop offset=".45" stop-color="#ffd21f"/><stop offset="1" stop-color="#c98a00"/></linearGradient>
  <linearGradient id="fita" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.B[0]}"/><stop offset=".55" stop-color="${t.B[1]}"/><stop offset="1" stop-color="${t.B[2]}"/></linearGradient>
  <linearGradient id="emb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.A[0]}"/><stop offset=".55" stop-color="${t.A[1]}"/><stop offset="1" stop-color="${t.A[2]}"/></linearGradient></defs>
  ${partes.lados === false ? '' : icone3d(t, t.icone, 250, 250, 230, -24, t.B, 'a')}
  ${partes.lados === false ? '' : icone3d(t, t.icone, 1255, 240, 220, 22, t.A, 'b')}
  <circle cx="750" cy="205" r="178" fill="#000" opacity=".3" transform="translate(0 16)" filter="url(#borrao)"/>
  <circle cx="750" cy="200" r="176" fill="url(#ouro)"/>
  <circle cx="750" cy="200" r="150" fill="url(#sel)"/>
  ${partes.icone ? icone(t.icone, 750, 200, 190, 'url(#emb)') : ''}
  ${!partes.textos ? '' : texto3d('OFERTAS', 750, 690, 390, { fill: ['#ffffff', '#fffdf5', '#f1e6c8'], extrusao: t.extrusao, contorno: t.A[2], prof: 26, id: 'of', espaco: 6 })}
  <g filter="url(#somb)">
    <path d="M250,742 L1250,742 L1290,812 L1250,882 L250,882 L210,812 Z" fill="url(#ouro)"/>
    <path d="M262,754 L1238,754 L1272,812 L1238,870 L262,870 L228,812 Z" fill="url(#fita)"/>
  </g>
  ${!partes.textos ? '' : texto3d(t.fita, 750, 812 + tamFita * 0.36, tamFita, { fill: ['#ffffff', '#ffffff', '#ececec'], extrusao: '#00000088', contorno: t.B[2], prof: 6, id: 'df', espaco: 8 })}
  ${!partes.textos ? '' : `<text x="750" y="975" font-family="Poppins" font-weight="800" font-size="62" text-anchor="middle" fill="#ffd21f" stroke="${t.extrusao}" stroke-width="16" stroke-linejoin="round" paint-order="stroke fill" letter-spacing="8">${t.frase}</text>`}
  </svg>`;
  return pagina(W, H, svg);
}

/** F-286: só o ícone do círculo (vira a camada "Logo no círculo", trocável pela logo do cliente) */
function emblema(t) {
  const svg = `<svg width="400" height="400" viewBox="0 0 400 400"><defs><linearGradient id="emb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.A[0]}"/><stop offset=".55" stop-color="${t.A[1]}"/><stop offset="1" stop-color="${t.A[2]}"/></linearGradient></defs>${icone(t.icone, 200, 200, 380, 'url(#emb)')}</svg>`;
  return pagina(400, 400, svg);
}

// ---------- F-296: encarte com a COMPOSIÇÃO PRÓPRIA do segmento (src/lib/studio/composicoesDosSegmentos.ts) ----------
// Nada aqui copia a divisão do Mega Oferta: cada estilo desenha o seu cenário em volta das caixas da composição.
const caixaLogo = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="rgba(255,255,255,.08)" stroke="#fff" stroke-width="4" stroke-dasharray="16 12"/>
  <text x="${x + w / 2}" y="${y + h * 0.36}" font-family="Anton" font-size="${h * 0.24}" text-anchor="middle" fill="#fff">SUA</text>
  <text x="${x + w / 2}" y="${y + h * 0.62}" font-family="Anton" font-size="${h * 0.24}" text-anchor="middle" fill="#fff">LOGO</text>
  <text x="${x + w / 2}" y="${y + h * 0.88}" font-family="Anton" font-size="${h * 0.24}" text-anchor="middle" fill="#fff">AQUI</text>`;
const grad = (id, cores, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${cores.map((c, i) => `<stop offset="${i / Math.max(1, cores.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const radial = (id, cx, cy, r, cores) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${cores.map((c, i) => `<stop offset="${i / Math.max(1, cores.length - 1)}" stop-color="${c}"/>`).join('')}</radialGradient>`;
const ret = (b, pad, rx, fill, extra = '') => `<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.w + 2 * pad}" height="${b.h + 2 * pad}" rx="${rx}" fill="${fill}" ${extra}/>`;
/** chapa escura atrás da vaga/redes (os dois são brancos): só onde o fundo é claro */
const chapa = (b, pad, cor, borda = 'none') => ret(b, pad, 22, cor, `stroke="${borda}" stroke-width="4"`);
function semente(n) { let s = n; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
const espalhar = (W, H, n, s, f) => { const r = semente(s); let o = ''; for (let i = 0; i < n; i++) o += f(r() * W, r() * H, r(), r()); return o; };
const cruz = (x, y, s, cor, op) => `<path d="M${x - s / 6},${y - s / 2} h${s / 3} v${s / 3} h${s / 3} v${s / 3} h-${s / 3} v${s / 3} h-${s / 3} v-${s / 3} h-${s / 3} v-${s / 3} h${s / 3} z" fill="${cor}" opacity="${op}"/>`;

const ESTILOS_DO_ENCARTE = {
  // farmácia: cabeçalho verde ondulado, cartão branco único, rodapé verde
  clinica(t, L, W, H, v) {
    const u = L.areas[0];
    let s = `<defs>${grad('fd', ['#f3fbf6', '#dff4e8'])}${grad('cab', [t.A[0], t.A[1], t.A[2]])}${grad('rod', [t.A[1], t.A[2]])}</defs>
    <rect width="${W}" height="${H}" fill="url(#fd)"/>${espalhar(W, H, v ? 46 : 60, 5, (x, y, a) => cruz(x, y, 24 + a * 30, t.A[1], 0.07))}`;
    s += v ? `<path d="M0,0 H${W} V540 C${W * 0.72},610 ${W * 0.3},500 0,575 Z" fill="url(#cab)"/>` : `<path d="M0,0 H575 C620,320 540,700 590,${H} H0 Z" fill="url(#cab)"/>`;
    s += espalhar(v ? W : 560, v ? 540 : H, 26, 9, (x, y, a) => cruz(x, y, 30 + a * 40, '#ffffff', 0.1));
    s += `<circle cx="${L.titulo.x + L.titulo.w / 2}" cy="${L.titulo.y + L.titulo.h / 2}" r="${L.titulo.w * 0.55}" fill="#fff" opacity=".12" filter="url(#borrao)"/>`;
    s += ret(u, 24, 34, '#000', 'opacity=".18" filter="url(#borrao)" transform="translate(0 14)"') + ret(u, 24, 34, '#ffffff', `stroke="${t.A[1]}" stroke-width="6"`);
    s += ret(u, 8, 26, 'none', `stroke="${t.A[0]}" stroke-width="2" stroke-dasharray="10 10" opacity=".6"`);
    if (v) s += `<path d="M0,${L.rodape.y - 30} C${W * 0.35},${L.rodape.y - 60} ${W * 0.65},${L.rodape.y} ${W},${L.rodape.y - 40} V${H} H0 Z" fill="url(#rod)"/>`;
    if (L.aviso) s += `<rect x="0" y="${L.aviso.y - 8}" width="${W}" height="${H - L.aviso.y + 8}" fill="#04401f"/><rect x="0" y="${L.aviso.y - 8}" width="${W}" height="4" fill="#ffd21f"/>`;
    return s;
  },
  // padaria: cabeçalho de madeira, lousa com moldura de madeira, rodapé de papel kraft
  lousa(t, L, W, H, v) {
    const u = L.areas[0], kraftY = L.rodape.y - 22;
    let s = `<defs>${grad('mad', ['#8a5426', '#6b3d17', '#4d2a0e'])}${grad('lou', ['#2c3b33', '#1d2822'])}${grad('kr', ['#ecd6ae', '#dcbf8c'])}${radial('giz', 0.5, 0.4, 0.7, ['rgba(255,255,255,.10)', 'rgba(255,255,255,0)'])}</defs>
    <rect width="${W}" height="${H}" fill="url(#mad)"/>`;
    for (let y = 0; y < H; y += 46) s += `<rect x="0" y="${y}" width="${W}" height="2" fill="#2d1606" opacity=".35"/>`;
    s += espalhar(W, H, 140, 3, (x, y, a) => `<path d="M${x},${y} q${30 + a * 60},${-4 + a * 8} ${80 + a * 120},0" stroke="#c48a4c" stroke-width="2" fill="none" opacity="${0.12 + a * 0.12}"/>`);
    s += ret(u, 46, 26, '#3a1f08') + ret(u, 40, 22, '#a8692e', 'stroke="#d79a55" stroke-width="3"') + ret(u, 20, 10, 'url(#lou)') + ret(u, 20, 10, 'url(#giz)');
    s += `` + espalhar(u.w, u.h, 18, 21, (x, y, a) => `<g opacity=".06">${icone('trigo', u.x + x, u.y + y, 50 + a * 50, '#ffffff')}</g>`);
    s += chapa(L.logo, 22, '#3a1f08', '#e8b36a') + `<rect x="${L.logo.x - 12}" y="${L.logo.y - 12}" width="${L.logo.w + 24}" height="${L.logo.h + 24}" rx="16" fill="none" stroke="#f3d9a6" stroke-width="2" stroke-dasharray="6 8"/>`;
    s += `<path d="M0,${kraftY} ${Array.from({ length: 40 }, (_, i) => `L${(i + 0.5) * W / 40},${kraftY + (i % 2 ? 10 : -6)}`).join(' ')} L${W},${kraftY} V${H} H0 Z" fill="url(#kr)"/>`;
    s += espalhar(W, H - kraftY, 16, 8, (x, y, a) => `<g opacity=".12">${icone('trigo', x, kraftY + 20 + y * 0.8, 40 + a * 30, '#7a3e0b')}</g>`);
    return s;
  },
  // adega: escuro com leque dourado, duas áreas (vinho e grafite) e a fita dourada com a vaga entre elas
  adega(t, L, W, H, v) {
    const [a, b2] = L.areas, ti = L.titulo, cx = ti.x + ti.w / 2, cy = ti.y + ti.h;
    let s = `<defs>${radial('fa', 0.5, 0.15, 0.9, ['#3d0616', '#1c020a', '#080003'])}${grad('va', ['#8a0f33', '#5a0820', '#3a0414'])}${grad('gr', ['#3a3a44', '#1f1f26', '#101014'])}${grad('ou', ['#fff0b0', '#e8c068', '#9c7420'], 1, 0)}</defs>
    <rect width="${W}" height="${H}" fill="url(#fa)"/>`;
    for (let i = 0; i <= 24; i++) { const ang = Math.PI + (i / 24) * Math.PI; s += `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(ang) * 1400}" y2="${cy + Math.sin(ang) * 1400}" stroke="#e8c068" stroke-width="2" opacity=".14"/>`; }
    for (let r = 120; r < 900; r += 90) s += `<path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}" fill="none" stroke="#e8c068" stroke-width="1.5" opacity=".1"/>`;
    s += espalhar(W, H, 30, 13, (x, y, q) => `<g opacity=".05">${icone('taca', x, y, 40 + q * 40, '#ffffff')}</g>`);
    s += ret(a, 22, 20, 'url(#va)', 'stroke="url(#ou)" stroke-width="5"') + ret(a, 10, 14, 'none', 'stroke="#e8c068" stroke-width="1.5" opacity=".6"');
    s += ret(b2, 22, 20, 'url(#gr)', 'stroke="url(#ou)" stroke-width="5"') + ret(b2, 10, 14, 'none', 'stroke="#e8c068" stroke-width="1.5" opacity=".6"');
    const lg = L.logo;
    s += v ? `<rect x="0" y="${lg.y - 6}" width="${W}" height="${lg.h + 12}" fill="url(#ou)"/><rect x="0" y="${lg.y + lg.h / 2 - 3}" width="${W}" height="6" fill="#5a0820" opacity=".5"/>`
      : `<rect x="${lg.x - 24}" y="0" width="${lg.w + 48}" height="${H}" fill="url(#ou)" opacity=".95"/>`;
    s += chapa(lg, 14, '#1c020a', '#fff0b0') + chapa(L.redes, 10, '#1c020a');
    s += `<rect x="0" y="${L.rodape.y - 14}" width="${W}" height="${H - L.rodape.y + 14}" fill="#0a0004"/><rect x="0" y="${L.rodape.y - 14}" width="${W}" height="4" fill="url(#ou)"/>`;
    if (L.aviso) s += `<rect x="0" y="${L.aviso.y - 6}" width="${W}" height="${H - L.aviso.y + 6}" fill="#5a0820"/>`;
    return s;
  },
  // açougue: azulejo branco, faixa preta vertical (vaga e redes), bloco vermelho da logo, rodapé preto
  acougue(t, L, W, H, v) {
    const faixa = v ? 300 : 440, topo = v ? 500 : 335, rod = L.rodape.y - 16;
    let s = `<defs>${grad('vm', ['#ec2e35', '#b3121f', '#7a0a12'])}${grad('pr', ['#262626', '#0c0c0c'], 1, 0)}</defs><rect width="${W}" height="${H}" fill="#f4f4f2"/>`;
    for (let x = 0; x < W; x += 90) s += `<rect x="${x}" y="0" width="3" height="${H}" fill="#d5d5d0"/>`;
    for (let y = 0; y < H; y += 60) s += `<rect x="0" y="${y}" width="${W}" height="3" fill="#d5d5d0"/>`;
    s += `<path d="M${faixa},0 H${W} V${topo - 40} L${faixa + 120},${topo} H${faixa} Z" fill="url(#vm)"/>`;
    s += espalhar(W - faixa, topo, 14, 4, (x, y, a) => `<g opacity=".1">${icone('chama', faixa + x, y, 40 + a * 40, '#ffffff')}</g>`);
    s += `<rect x="0" y="0" width="${faixa}" height="${H}" fill="url(#pr)"/><rect x="${faixa - 10}" y="0" width="10" height="${H}" fill="#b3121f"/>`;
    s += `<text transform="translate(${faixa * 0.62} ${v ? 1500 : 940}) rotate(-90)" font-family="Anton" font-size="${v ? 150 : 120}" fill="none" stroke="#ffffff" stroke-width="2" opacity=".18" letter-spacing="10">CARNES SELECIONADAS</text>`;
    s += L.areas.map((a) => ret(a, 18, 18, 'rgba(255,255,255,.55)', 'stroke="#b3121f" stroke-width="5"')).join('');
    s += `<rect x="0" y="${rod}" width="${W}" height="${H - rod}" fill="#111"/><rect x="0" y="${rod}" width="${W}" height="10" fill="#b3121f"/>`;
    return s;
  },
  // suplementos: preto com cortes laranja inclinados, logo embaixo numa faixa laranja inclinada
  energia(t, L, W, H, v) {
    const u = L.areas[0], ti = L.titulo, rod = L.rodape.y - 14;
    let s = `<defs>${radial('fe', 0.5, 0.3, 0.9, ['#2a2a33', '#121216', '#050507'])}${grad('lj', ['#ff9233', '#e85600', '#a33800'], 1, 0)}</defs><rect width="${W}" height="${H}" fill="url(#fe)"/>`;
    s += `<g transform="rotate(-24 ${W / 2} ${H / 2})">${Array.from({ length: 16 }, (_, i) => `<rect x="${-W + i * 260}" y="${-H}" width="${18 + (i % 3) * 22}" height="${H * 3}" fill="#e85600" opacity="${0.07 + (i % 4) * 0.03}"/>`).join('')}</g>`;
    s += espalhar(W, H, 26, 17, (x, y, a) => `<g opacity=".06">${icone('haltere', x, y, 50 + a * 40, '#ffffff')}</g>`);
    const p = 26, cut = 60;
    s += `<polygon points="${u.x - p + cut},${u.y - p} ${u.x + u.w + p},${u.y - p} ${u.x + u.w + p},${u.y + u.h + p - cut} ${u.x + u.w + p - cut},${u.y + u.h + p} ${u.x - p},${u.y + u.h + p} ${u.x - p},${u.y - p + cut}" fill="rgba(255,255,255,.05)" stroke="#ff8126" stroke-width="6"/>`;
    s += v ? `<polygon points="0,${ti.y + 40} ${W},${ti.y - 60} ${W},${ti.y + ti.h - 30} 0,${ti.y + ti.h + 70}" fill="url(#lj)"/>`
      : `<polygon points="0,${ti.y - 30} ${ti.x + ti.w + 30},${ti.y + 20} ${ti.x + ti.w - 10},${ti.y + ti.h + 30} 0,${ti.y + ti.h + 60}" fill="url(#lj)"/>`;
    s += `<polygon points="0,${rod + 30} ${W},${rod - 10} ${W},${H} 0,${H}" fill="#e85600"/><polygon points="0,${rod + 44} ${W},${rod + 4} ${W},${H} 0,${H}" fill="#1a0a00"/>`;
    return s;
  },
  // hortifrúti: céu, sol e folhas, dois caixotes de madeira clara, gramado
  feira(t, L, W, H, v) {
    const grama = L.rodape.y - 20;
    let s = `<defs>${grad('ceu', ['#7fd0ff', '#c9f0ff', '#fff6cf'])}${grad('pinho', ['#f3d29a', '#e2b672'])}${grad('gram', ['#55c94a', '#2c9a27', '#176412'])}</defs><rect width="${W}" height="${H}" fill="url(#ceu)"/>`;
    s += `<circle cx="${v ? 120 : 1820}" cy="${v ? 140 : 110}" r="90" fill="#ffd21f"/>${raios(v ? 120 : 1820, v ? 140 : 110, 260, 18, '#ffd21f', 0.35)}`;
    s += espalhar(W, grama, 22, 6, (x, y, a) => `<g opacity=".18" transform="rotate(${a * 80 - 40} ${x} ${y})">${icone('folha', x, y, 40 + a * 40, '#2c9a27')}</g>`);
    for (const a of L.areas) {
      s += ret(a, 30, 12, '#8a5a24') + ret(a, 22, 8, 'url(#pinho)');
      for (let y = a.y - 22 + 70; y < a.y + a.h + 22; y += 70) s += `<rect x="${a.x - 22}" y="${y}" width="${a.w + 44}" height="5" fill="#b8854a" opacity=".55"/>`;
      s += `<rect x="${a.x - 30}" y="${a.y - 30}" width="20" height="${a.h + 60}" fill="#6b4318"/><rect x="${a.x + a.w + 10}" y="${a.y - 30}" width="20" height="${a.h + 60}" fill="#6b4318"/>`;
    }
    s += chapa(L.redes, 12, '#2c9a27');
    if (!v) s += chapa(L.logo, 16, '#2c9a27', '#ffffff');
    s += `<path d="M0,${grama} ${Array.from({ length: 60 }, (_, i) => `L${(i + 0.5) * W / 60},${grama - (i % 2 ? 26 : 4)}`).join(' ')} L${W},${grama} V${H} H0 Z" fill="url(#gram)"/>`;
    return s;
  },
  // pet: degradê roxo-ciano, patinhas e bolhas, um balão de conversa branco com os produtos
  bolhas(t, L, W, H, v) {
    const u = L.areas[0], ti = L.titulo;
    let s = `<defs>${grad('pb', ['#2cc6e6', '#6a2fd6', '#3f1491'], 1, 1)}</defs><rect width="${W}" height="${H}" fill="url(#pb)"/>`;
    s += espalhar(W, H, 34, 23, (x, y, a) => `<circle cx="${x}" cy="${y}" r="${10 + a * 60}" fill="#ffffff" opacity="${0.05 + a * 0.08}"/>`);
    s += espalhar(W, H, 26, 29, (x, y, a, b) => `<g opacity=".1" transform="rotate(${b * 60 - 30} ${x} ${y})">${icone('pata', x, y, 40 + a * 40, '#ffffff')}</g>`);
    const p = 30;
    s += ret(u, p, 70, '#000', 'opacity=".2" filter="url(#borrao)" transform="translate(0 16)"') + ret(u, p, 70, '#ffffff');
    const tx = v ? ti.x + ti.w * 0.45 : u.x - p, ty = v ? u.y + u.h + p : ti.y + ti.h * 0.5;
    s += v ? `<path d="M${tx - 60},${ty - 2} L${tx},${ty + 90} L${tx + 70},${ty - 2} Z" fill="#ffffff"/>` : `<path d="M${tx + 2},${ty - 60} L${tx - 90},${ty} L${tx + 2},${ty + 60} Z" fill="#ffffff"/>`;
    s += ret(u, p - 14, 58, 'none', 'stroke="#2cc6e6" stroke-width="4" stroke-dasharray="2 16" stroke-linecap="round"');
    s += `<path d="M0,${L.rodape.y - 10} C${W * 0.25},${L.rodape.y - 50} ${W * 0.75},${L.rodape.y + 30} ${W},${L.rodape.y - 20} V${H} H0 Z" fill="#3f1491"/>`;
    return s;
  },
  // beleza: mármore rosa com brilhos, um ARCO claro com a logo e os produtos, rodapé ameixa
  arco(t, L, W, H, v) {
    const u = L.areas[0];
    let s = `<defs>${grad('rs', ['#ff93c4', '#e5257a', '#9c1a6a'], 1, 1)}${grad('bl', ['#fff6fa', '#ffe3ef'])}${grad('ou2', ['#fff0b0', '#e8c068', '#b8862a'], 1, 0)}</defs><rect width="${W}" height="${H}" fill="url(#rs)"/>`;
    s += espalhar(W, H, 16, 31, (x, y, a) => `<path d="M${x},${y} C${x + 120},${y + 40 + a * 60} ${x + 60},${y + 160} ${x + 220},${y + 230}" stroke="#ffffff" stroke-width="${2 + a * 3}" fill="none" opacity=".18"/>`);
    s += espalhar(W, H, 22, 37, (x, y, a) => `<g opacity=".35">${icone('brilho', x, y, 24 + a * 36, '#ffffff')}</g>`);
    let ax, ay, aw, fim;
    if (v) { ax = 150; aw = 780; ay = 30; fim = 1640; } else { ax = 490; aw = 1400; ay = 24; fim = 935; }
    const r = Math.min(aw / 2, v ? aw / 2 : 260);
    const arco = `M${ax},${fim} V${ay + r} A${r},${r} 0 0 1 ${ax + r},${ay} H${ax + aw - r} A${r},${r} 0 0 1 ${ax + aw},${ay + r} V${fim} Z`;
    s += `<path d="${arco}" fill="#000" opacity=".2" filter="url(#borrao)" transform="translate(0 16)"/><path d="${arco}" fill="url(#bl)" stroke="url(#ou2)" stroke-width="8"/>`;
    s += `<path d="${arco}" fill="none" stroke="#e5257a" stroke-width="2" opacity=".35" transform="translate(${aw * 0.015} ${aw * 0.015}) scale(${1 - 0.03})" transform-origin="${ax + aw / 2} ${(ay + fim) / 2}"/>`;
    s += `<rect x="0" y="${L.rodape.y - (v ? 90 : 18)}" width="${W}" height="${H}" fill="#3d0a2a"/><rect x="0" y="${L.rodape.y - (v ? 90 : 18)}" width="${W}" height="5" fill="url(#ou2)"/>`;
    return s;
  },
  // eletrônicos: azul-marinho com grade e trilhas de circuito, áreas com moldura neon
  neon(t, L, W, H, v) {
    let s = `<defs>${radial('nv', 0.5, 0.2, 1, ['#123a8f', '#071a4a', '#020818'])}<filter id="glow"><feGaussianBlur stdDeviation="8"/></filter></defs><rect width="${W}" height="${H}" fill="url(#nv)"/>`;
    for (let x = 0; x < W; x += 60) s += `<rect x="${x}" y="0" width="1" height="${H}" fill="#36c8ff" opacity=".08"/>`;
    for (let y = 0; y < H; y += 60) s += `<rect x="0" y="${y}" width="${W}" height="1" fill="#36c8ff" opacity=".08"/>`;
    s += espalhar(W, H, 26, 41, (x, y, a, b) => { const l = 80 + a * 200; return `<path d="M${x},${y} h${l} v${b > 0.5 ? l / 2 : -l / 2} h${l / 2}" stroke="#36c8ff" stroke-width="3" fill="none" opacity=".18"/><circle cx="${x + l * 1.5}" cy="${y + (b > 0.5 ? l / 2 : -l / 2)}" r="6" fill="#36c8ff" opacity=".35"/>`; });
    for (const a of L.areas) {
      s += ret(a, 16, 14, 'rgba(10,30,80,.55)') + ret(a, 16, 14, 'none', 'stroke="#36c8ff" stroke-width="8" opacity=".6" filter="url(#glow)"') + ret(a, 16, 14, 'none', 'stroke="#9ae6ff" stroke-width="3"');
      const c = 40, x0 = a.x - 16, y0 = a.y - 16, x1 = a.x + a.w + 16, y1 = a.y + a.h + 16;
      s += `<path d="M${x0},${y0 + c} V${y0} H${x0 + c} M${x1 - c},${y0} H${x1} V${y0 + c} M${x1},${y1 - c} V${y1} H${x1 - c} M${x0 + c},${y1} H${x0} V${y1 - c}" stroke="#ffffff" stroke-width="6" fill="none"/>`;
    }
    s += `<rect x="0" y="${L.rodape.y - 14}" width="${W}" height="${H}" fill="#020818"/><rect x="0" y="${L.rodape.y - 14}" width="${W}" height="4" fill="#36c8ff"/>`;
    return s;
  },
  // moda: creme editorial com o rasgo rosa, faixa preta vertical à direita, rodapé rosa
  editorial(t, L, W, H, v) {
    const faixa = v ? 780 : 1500, ate = v ? 1700 : 945;
    let s = `<defs>${grad('pk', ['#ff5a82', '#e3245a'], 1, 1)}</defs><rect width="${W}" height="${H}" fill="#f6efe7"/>`;
    s += `<polygon points="${v ? '-40,620 820,180 820,560 -40,1060' : '-40,420 1500,40 1500,360 -40,760'}" fill="url(#pk)" opacity=".2"/>`;
    s += `<polygon points="${v ? '-40,470 820,40 820,150 -40,580' : '-40,330 1500,-40 1500,40 -40,420'}" fill="url(#pk)"/>`;
    s += espalhar(faixa, ate, 18, 47, (x, y, a) => `<g opacity=".08">${icone('etiqueta', x, y, 40 + a * 30, '#1a1a1a')}</g>`);
    for (const a of L.areas) s += `<rect x="${a.x - 14}" y="${a.y - 14}" width="${a.w + 28}" height="${a.h + 28}" fill="none" stroke="#1a1a1a" stroke-width="3"/><rect x="${a.x - 4}" y="${a.y - 4}" width="${a.w + 8}" height="${a.h + 8}" fill="rgba(255,255,255,.45)"/>`;
    s += `<rect x="${faixa}" y="0" width="${W - faixa}" height="${ate}" fill="#111"/><rect x="${faixa}" y="0" width="8" height="${ate}" fill="#e3245a"/>`;
    s += `<text transform="translate(${faixa + (W - faixa) * 0.62} ${v ? 1640 : 900}) rotate(-90)" font-family="Anton" font-size="${v ? 170 : 150}" fill="none" stroke="#ffffff" stroke-width="2" opacity=".25" letter-spacing="12">NOVA COLEÇÃO</text>`;
    s += `<rect x="0" y="${L.rodape.y - 16}" width="${W}" height="${H}" fill="url(#pk)"/>`;
    return s;
  },
};

/** o encarte do segmento: o cenário do estilo dele + (versão "-st") a caixa SUA LOGO AQUI no lugar da vaga */
function encarte(t, comp, f, comCaixa) {
  const v = f === 'v', W = v ? 1080 : 1920, H = v ? 1920 : 1080, L = comp[f];
  const corpo = ESTILOS_DO_ENCARTE[comp.estilo](t, L, W, H, v);
  return pagina(W, H, `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${SOMBRA}${BORRAO}</defs>${corpo}${comCaixa ? caixaLogo(L.logo.x, L.logo.y, L.logo.w, L.logo.h) : ''}</svg>`);
}

// ---------- F-296: palco com o CENÁRIO e o PEDESTAL próprios do segmento ----------
const PEDESTAIS = {
  vitrine(t, cx, tampo, pw, W, H) { // prateleira de vidro
    return `<rect x="${cx - pw * 0.7}" y="${tampo}" width="${pw * 1.4}" height="${pw * 0.08}" rx="8" fill="rgba(255,255,255,.55)" stroke="#ffffff" stroke-width="3"/>
    <rect x="${cx - pw * 0.7}" y="${tampo + pw * 0.08}" width="${pw * 1.4}" height="10" fill="${t.A[1]}"/>
    <rect x="${cx - pw * 0.62}" y="${tampo + pw * 0.08 + 10}" width="14" height="${H}" fill="rgba(255,255,255,.35)"/><rect x="${cx + pw * 0.62 - 14}" y="${tampo + pw * 0.08 + 10}" width="14" height="${H}" fill="rgba(255,255,255,.35)"/>`;
  },
  tabua(t, cx, tampo, pw) { // tábua de pão redonda com cabo
    const r = pw * 0.62, e = r * 0.2;
    return `<rect x="${cx + r - 10}" y="${tampo - 6}" width="${r * 0.55}" height="${e * 0.6}" rx="${e * 0.3}" fill="#8a5426"/>
    <path d="M${cx - r},${tampo} v${e * 0.7} a${r},${e} 0 0 0 ${2 * r},0 v-${e * 0.7} z" fill="#6b3d17"/>
    <ellipse cx="${cx}" cy="${tampo}" rx="${r}" ry="${e}" fill="#c98d4f"/><ellipse cx="${cx}" cy="${tampo}" rx="${r * 0.8}" ry="${e * 0.75}" fill="none" stroke="#a96e34" stroke-width="3"/><ellipse cx="${cx}" cy="${tampo}" rx="${r * 0.5}" ry="${e * 0.45}" fill="none" stroke="#a96e34" stroke-width="2"/>`;
  },
  barril(t, cx, tampo, pw) { // barril de carvalho em pé
    const r = pw * 0.45, e = r * 0.25, alto = pw * 0.75;
    return `<path d="M${cx - r},${tampo} C${cx - r * 1.15},${tampo + alto * 0.5} ${cx - r * 1.15},${tampo + alto * 0.5} ${cx - r},${tampo + alto} a${r},${e} 0 0 0 ${2 * r},0 C${cx + r * 1.15},${tampo + alto * 0.5} ${cx + r * 1.15},${tampo + alto * 0.5} ${cx + r},${tampo} Z" fill="#6b3a1a"/>
    ${[0.18, 0.82].map((k) => `<path d="M${cx - r * 1.1},${tampo + alto * k} a${r * 1.1},${e} 0 0 0 ${2.2 * r},0" fill="none" stroke="#2a2a2a" stroke-width="12"/>`).join('')}
    ${[-0.5, 0, 0.5].map((k) => `<line x1="${cx + k * r}" y1="${tampo + e}" x2="${cx + k * r}" y2="${tampo + alto + e * 0.8}" stroke="#4a2410" stroke-width="3"/>`).join('')}
    <ellipse cx="${cx}" cy="${tampo}" rx="${r}" ry="${e}" fill="#a0632e" stroke="#2a2a2a" stroke-width="8"/>`;
  },
  cepo(t, cx, tampo, pw) { // tábua de corte grossa (cepo de açougueiro)
    const w = pw * 1.25, d = pw * 0.18, alto = pw * 0.22;
    return `<polygon points="${cx - w / 2},${tampo} ${cx + w / 2},${tampo} ${cx + w / 2 - d},${tampo - d * 0.5} ${cx - w / 2 + d},${tampo - d * 0.5}" fill="#d9a066"/>
    <rect x="${cx - w / 2}" y="${tampo}" width="${w}" height="${alto}" fill="#9c6232"/>
    ${Array.from({ length: 7 }, (_, i) => `<rect x="${cx - w / 2 + (i + 1) * w / 8}" y="${tampo}" width="3" height="${alto}" fill="#6b3d17"/>`).join('')}
    <rect x="${cx - w / 2}" y="${tampo + alto}" width="${w}" height="10" fill="#4a2410"/>`;
  },
  hexagono(t, cx, tampo, pw) { // plataforma hexagonal com borda neon laranja
    const r = pw * 0.62, e = 0.32, alto = pw * 0.16;
    const P = (k, dy = 0) => Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; return `${cx + Math.cos(a) * r},${tampo + dy + Math.sin(a) * r * e}`; }).join(' ');
    return `<polygon points="${P(0, alto)}" fill="#1a0a00"/><rect x="${cx - r * 0.866}" y="${tampo}" width="${r * 1.732}" height="${alto}" fill="#2a1406"/>
    <polygon points="${P(0)}" fill="#3a3a44" stroke="#ff8126" stroke-width="6"/><polygon points="${P(0)}" fill="none" stroke="#ff8126" stroke-width="16" opacity=".35" filter="url(#borrao)"/>`;
  },
  caixote(t, cx, tampo, pw) { // caixote de feira
    const w = pw * 1.15, alto = pw * 0.42;
    return `<rect x="${cx - w / 2}" y="${tampo}" width="${w}" height="${alto}" fill="#e2b672" stroke="#8a5a24" stroke-width="6"/>
    ${[0.12, 0.44, 0.76].map((k) => `<rect x="${cx - w / 2}" y="${tampo + alto * k}" width="${w}" height="${alto * 0.2}" fill="#c99556"/>`).join('')}
    <rect x="${cx - w / 2 - 8}" y="${tampo - 8}" width="${w + 16}" height="16" rx="4" fill="#8a5a24"/>
    <rect x="${cx - w / 2}" y="${tampo}" width="18" height="${alto}" fill="#8a5a24"/><rect x="${cx + w / 2 - 18}" y="${tampo}" width="18" height="${alto}" fill="#8a5a24"/>`;
  },
  almofada(t, cx, tampo, pw) { // almofada fofa redonda com patinha
    const r = pw * 0.62, e = r * 0.3;
    return `<ellipse cx="${cx}" cy="${tampo + e * 0.8}" rx="${r * 1.04}" ry="${e * 1.5}" fill="#3f1491"/>
    <ellipse cx="${cx}" cy="${tampo + e * 0.3}" rx="${r}" ry="${e * 1.2}" fill="#9255f2"/><ellipse cx="${cx}" cy="${tampo}" rx="${r * 0.82}" ry="${e * 0.8}" fill="#b388ff"/>
    <g opacity=".5">${icone('pata', cx, tampo + e * 0.9, r * 0.45, '#ffffff')}</g>`;
  },
  coluna(t, cx, tampo, pw) { // coluna de mármore com aro dourado
    const r = pw * 0.42, e = r * 0.22, alto = pw * 0.9;
    return `<rect x="${cx - r}" y="${tampo}" width="${2 * r}" height="${alto}" fill="#fbeff4"/>
    ${Array.from({ length: 7 }, (_, i) => `<rect x="${cx - r + (i + 0.6) * (2 * r) / 7.4}" y="${tampo + 16}" width="8" height="${alto}" fill="#efd5e0"/>`).join('')}
    <path d="M${cx - r * 1.1},${tampo - 4} h${r * 2.2} v18 h-${r * 2.2} z" fill="#e8c068"/>
    <ellipse cx="${cx}" cy="${tampo - 4}" rx="${r * 1.1}" ry="${e}" fill="#fff6fa" stroke="#e8c068" stroke-width="5"/>`;
  },
  holograma(t, cx, tampo, pw, W, H) { // anel holográfico com feixe de luz
    const r = pw * 0.62, e = r * 0.24;
    return `<path d="M${cx - r * 0.85},${tampo} L${cx - r * 0.5},${tampo - pw * 1.4} L${cx + r * 0.5},${tampo - pw * 1.4} L${cx + r * 0.85},${tampo} Z" fill="#36c8ff" opacity=".12"/>
    <ellipse cx="${cx}" cy="${tampo + 10}" rx="${r}" ry="${e}" fill="#0a1a4a" stroke="#36c8ff" stroke-width="6"/>
    <ellipse cx="${cx}" cy="${tampo + 10}" rx="${r}" ry="${e}" fill="none" stroke="#36c8ff" stroke-width="22" opacity=".4" filter="url(#borrao)"/>
    <ellipse cx="${cx}" cy="${tampo + 10}" rx="${r * 0.7}" ry="${e * 0.7}" fill="none" stroke="#9ae6ff" stroke-width="3"/>`;
  },
  cubo(t, cx, tampo, pw) { // cubo preto de vitrine
    const w = pw * 0.95, d = w * 0.22, alto = pw * 0.6;
    return `<polygon points="${cx - w / 2},${tampo} ${cx + w / 2},${tampo} ${cx + w / 2 + d},${tampo - d * 0.6} ${cx - w / 2 + d},${tampo - d * 0.6}" fill="#3a3a3a"/>
    <rect x="${cx - w / 2}" y="${tampo}" width="${w}" height="${alto}" fill="#111"/>
    <polygon points="${cx + w / 2},${tampo} ${cx + w / 2 + d},${tampo - d * 0.6} ${cx + w / 2 + d},${tampo + alto - d * 0.6} ${cx + w / 2},${tampo + alto}" fill="#000"/>
    <rect x="${cx - w / 2}" y="${tampo + alto * 0.12}" width="${w}" height="8" fill="#e3245a"/>`;
  },
};
const CENARIOS = {
  vitrine: (t, W, H) => `<defs>${radial('c1', 0.5, 0.45, 0.9, ['#e8fff1', '#7ee0a8', '#0a9a50', '#04401f'])}</defs><rect width="${W}" height="${H}" fill="url(#c1)"/>${espalhar(W, H, 40, 3, (x, y, a) => cruz(x, y, 30 + a * 50, '#ffffff', 0.12))}`,
  tabua: (t, W, H) => `<defs>${radial('c1', 0.5, 0.35, 0.95, ['#ffe2a8', '#e8a03a', '#8a4a12', '#3d1d04'])}</defs><rect width="${W}" height="${H}" fill="url(#c1)"/>${espalhar(W, H, 40, 7, (x, y, a) => `<circle cx="${x}" cy="${y}" r="${12 + a * 50}" fill="#fff3d0" opacity="${0.06 + a * 0.12}" filter="url(#borrao)"/>`)}<rect y="${H * 0.78}" width="${W}" height="${H * 0.22}" fill="#5a2c06" opacity=".55"/>${espalhar(W, H * 0.2, 10, 9, (x, y, a) => `<g opacity=".25">${icone('trigo', x, H * 0.8 + y, 50 + a * 40, '#f3d29a')}</g>`)}`,
  barril: (t, W, H) => `<defs>${radial('c1', 0.6, 0.4, 1, ['#5a0820', '#2a0410', '#0a0004'])}</defs><rect width="${W}" height="${H}" fill="url(#c1)"/>${Array.from({ length: 6 }, (_, i) => `<path d="M${(i / 5) * W - 120},${H} A160,160 0 0 1 ${(i / 5) * W + 200},${H}" fill="none" stroke="#e8c068" stroke-width="3" opacity=".12"/><circle cx="${(i / 5) * W + 40}" cy="${H * 0.86}" r="120" fill="#1a0206" stroke="#3a1a08" stroke-width="10" opacity=".7"/>`).join('')}${espalhar(W, H * 0.7, 16, 13, (x, y, a) => `<g opacity=".08">${icone('taca', x, y, 50 + a * 40, '#e8c068')}</g>`)}`,
  cepo: (t, W, H) => `<defs>${grad('c1', ['#7a0a12', '#3a0408', '#120102'])}</defs><rect width="${W}" height="${H}" fill="url(#c1)"/>${Array.from({ length: Math.ceil(W / 90) }, (_, i) => `<rect x="${i * 90}" y="${H * 0.62}" width="3" height="${H}" fill="#ffffff" opacity=".07"/>`).join('')}<rect y="${H * 0.62}" width="${W}" height="3" fill="#ffffff" opacity=".1"/>${espalhar(W, H * 0.6, 14, 19, (x, y, a) => `<g opacity=".08">${icone('chama', x, y, 50 + a * 40, '#ffffff')}</g>`)}`,
  hexagono: (t, W, H) => `<defs>${radial('c1', 0.5, 0.35, 0.9, ['#3a2416', '#141016', '#050507'])}</defs><rect width="${W}" height="${H}" fill="url(#c1)"/><g transform="rotate(-24 ${W / 2} ${H / 2})">${Array.from({ length: 14 }, (_, i) => `<rect x="${-W + i * 280}" y="${-H}" width="${16 + (i % 3) * 24}" height="${H * 3}" fill="#e85600" opacity="${0.08 + (i % 4) * 0.03}"/>`).join('')}</g>`,
  caixote: (t, W, H) => `<defs>${grad('c1', ['#bff0a8', '#7fd36a', '#2c9a27'])}</defs><rect width="${W}" height="${H}" fill="url(#c1)"/>${raios(W / 2, H * 0.1, 2600, 24, '#fff8c0', 0.12)}${espalhar(W, H, 30, 23, (x, y, a, b) => `<g opacity=".2" transform="rotate(${b * 90 - 45} ${x} ${y})">${icone('folha', x, y, 50 + a * 50, '#176412')}</g>`)}`,
  almofada: (t, W, H) => `<defs>${grad('c1', ['#66e0f4', '#6a2fd6', '#3f1491'], 1, 1)}</defs><rect width="${W}" height="${H}" fill="url(#c1)"/>${espalhar(W, H, 36, 29, (x, y, a) => `<circle cx="${x}" cy="${y}" r="${12 + a * 70}" fill="#ffffff" opacity="${0.05 + a * 0.08}"/>`)}${espalhar(W, H, 22, 31, (x, y, a, b) => `<g opacity=".12" transform="rotate(${b * 60 - 30} ${x} ${y})">${icone('pata', x, y, 50 + a * 40, '#ffffff')}</g>`)}`,
  coluna: (t, W, H) => `<defs>${grad('c1', ['#ffc2dc', '#e5257a', '#7a0b3e'], 1, 1)}</defs><rect width="${W}" height="${H}" fill="url(#c1)"/>${espalhar(W, H, 14, 37, (x, y, a) => `<path d="M${x},${y} C${x + 140},${y + 60} ${x + 40},${y + 200} ${x + 260},${y + 260}" stroke="#ffffff" stroke-width="${2 + a * 3}" fill="none" opacity=".2"/>`)}${espalhar(W, H, 20, 41, (x, y, a) => `<g opacity=".4">${icone('brilho', x, y, 24 + a * 30, '#ffffff')}</g>`)}`,
  holograma: (t, W, H) => `<defs>${radial('c1', 0.5, 0.4, 1, ['#123a8f', '#071a4a', '#020818'])}</defs><rect width="${W}" height="${H}" fill="url(#c1)"/>${Array.from({ length: 24 }, (_, i) => `<line x1="${W / 2}" y1="${H * 0.62}" x2="${(i / 23) * W * 3 - W}" y2="${H}" stroke="#36c8ff" stroke-width="2" opacity=".18"/>`).join('')}${[0.66, 0.72, 0.8, 0.9].map((k) => `<line x1="0" y1="${H * k}" x2="${W}" y2="${H * k}" stroke="#36c8ff" stroke-width="2" opacity=".18"/>`).join('')}${espalhar(W, H * 0.6, 14, 43, (x, y, a) => `<g opacity=".1">${icone('raio', x, y, 40 + a * 40, '#36c8ff')}</g>`)}`,
  cubo: (t, W, H) => `<defs>${grad('pk', ['#ff5a82', '#e3245a'], 1, 1)}</defs><rect width="${W}" height="${H}" fill="#f6efe7"/><polygon points="${-0.1 * W},${0.55 * H} ${1.1 * W},${0.15 * H} ${1.1 * W},${0.32 * H} ${-0.1 * W},${0.72 * H}" fill="url(#pk)" opacity=".85"/><rect x="0" y="${H * 0.8}" width="${W}" height="${H * 0.2}" fill="#e9dccd"/>${espalhar(W, H * 0.8, 12, 47, (x, y, a) => `<g opacity=".08">${icone('etiqueta', x, y, 40 + a * 30, '#1a1a1a')}</g>`)}`,
};
function palco(t, comp, f, comLogo) {
  const v = f === 'v', W = v ? 1080 : 1920, H = v ? 1920 : 1080, P = comp[f];
  const pr = { x: P.produto.x * W, y: P.produto.y * H, w: P.produto.w * W, h: P.produto.h * H };
  const cx = pr.x + pr.w / 2, tampo = pr.y + pr.h, pw = pr.w * 0.95;
  const tt = { x: P.titulo.x * W, y: P.titulo.y * H, w: P.titulo.w * W, h: P.titulo.h * H };
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${SOMBRA}${BORRAO}</defs>${CENARIOS[comp.estilo](t, W, H)}
  <ellipse cx="${cx}" cy="${tampo - pr.h * 0.45}" rx="${pr.w * 0.62}" ry="${pr.h * 0.55}" fill="#ffffff" opacity=".1" filter="url(#borrao)"/>
  <ellipse cx="${cx}" cy="${tampo + pw * 0.3}" rx="${pw * 0.7}" ry="${pw * 0.12}" fill="#000" opacity=".35" filter="url(#borrao)"/>
  ${PEDESTAIS[comp.estilo](t, cx, tampo, pw, W, H)}
  ${comLogo ? `<image href="LOGO" x="${tt.x}" y="${tt.y}" width="${tt.w}" height="${tt.h}" preserveAspectRatio="xMidYMid meet"/>` : ''}</svg>`;
  return pagina(W, H, svg);
}

// ---------- fotografar ----------
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/studio/gerar-segmentos.mjs')) {
  const pedidos = process.argv.slice(2).filter((a) => TEMAS[a]);
  const lista = pedidos.length ? pedidos : Object.keys(TEMAS);
  const instalado = `${process.env.LOCALAPPDATA}/ms-playwright`;
  const extra = fs.existsSync(instalado) ? fs.readdirSync(instalado).filter((d) => /^chromium-\d+$/.test(d)).map((d) => `${instalado}/${d}/chrome-win64/chrome.exe`).find((p) => fs.existsSync(p)) : undefined;
  const navegador = await chromium.launch().catch(() => chromium.launch({ executablePath: extra }));
  const aba = await navegador.newPage();
  const foto = async (html, w, h, saida, { transparente = false } = {}) => {
    await aba.setViewportSize({ width: w, height: h });
    await aba.setContent(html, { waitUntil: 'networkidle' });
    await aba.evaluate(() => document.fonts.ready);
    const png = await aba.screenshot({ omitBackground: transparente, type: 'png' });
    await sharp(png).webp({ quality: transparente ? 92 : 90, alphaQuality: 100 }).toFile(saida);
    return png;
  };
  const E = 'public/studio/encartes-oficiais', P = 'public/studio/palco';
  for (const seg of lista) {
    const t = TEMAS[seg], ce = COMPOSICOES_DOS_ENCARTES[seg], cp = COMPOSICOES_DOS_PALCOS[seg], id = ce.id;
    const arqLogo = t.logoPronta ?? `public/studio/logos/ofertas-${seg}.webp`;
    if (!t.logoPronta && (process.argv.includes('--logos') || !fs.existsSync(arqLogo))) {
      await foto(logo(t), 1500, 1050, arqLogo, { transparente: true });
      // F-288: a base fica sem os ícones dos lados: cada um vira camada própria (mover, girar, trocar pela galeria)
      await foto(logo(t, { textos: false, icone: false, lados: false }), 1500, 1050, `public/studio/logos/ofertas-${seg}-base.webp`, { transparente: true });
      await foto(pagina(360, 360, `<svg width="360" height="360" viewBox="0 0 360 360"><defs>${SOMBRA}</defs>${icone3d(t, t.icone, 180, 180, 230, -24, t.B, 'a')}</svg>`), 360, 360, `public/studio/logos/ofertas-${seg}-lado-a.webp`, { transparente: true });
      await foto(pagina(360, 360, `<svg width="360" height="360" viewBox="0 0 360 360"><defs>${SOMBRA}</defs>${icone3d(t, t.icone, 180, 180, 220, 22, t.A, 'b')}</svg>`), 360, 360, `public/studio/logos/ofertas-${seg}-lado-b.webp`, { transparente: true });
      await foto(emblema(t), 400, 400, `public/studio/logos/ofertas-${seg}-emblema.webp`, { transparente: true });
    }
    if (process.argv.includes('--so-logos')) { console.log('logo pronta:', seg); continue; }
    const logoUrl = `data:image/png;base64,${(await sharp(arqLogo).png().toBuffer()).toString('base64')}`;
    for (const f of ['v', 'h']) {
      const [w, h] = f === 'v' ? [1080, 1920] : [1920, 1080];
      await foto(encarte(t, ce, f, true), w, h, `${E}/${id}-${f}-st.webp`);
      await foto(encarte(t, ce, f, false), w, h, `${E}/${id}-${f}-st-limpo.webp`);
      await foto(palco(t, cp, f, true).replace('href="LOGO"', `href="${logoUrl}"`), w, h, `${P}/${cp.id}-${f}.webp`);
      await foto(palco(t, cp, f, false), w, h, `${P}/${cp.id}-${f}-st.webp`);
    }
    console.log('pronto:', seg);
  }
  await navegador.close();
}
