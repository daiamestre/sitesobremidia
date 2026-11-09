// F-277 — ENCARTES e PALCOS DE OFERTAS por SEGMENTO (padaria, adega, açougue, suplementos, hortifrúti, pet, beleza,
// eletrônicos, moda), no MESMO padrão aprovado do mercado e da farmácia (scripts/studio/gerar-farmacia.mjs):
//   - logo "OFERTAS" em 3D + fita com o segmento + frase, emblema com o ícone do segmento (sem fundo, em alta);
//   - encarte em duas áreas com a curva do Mega Oferta, rodapé branco dos contatos (adega: faixa do aviso obrigatório);
//   - palco do carrossel com o pedestal no mesmo lugar do Alerta de Oferta (versão com logo e "-st" sem logo).
// Arte própria (HTML/SVG + Chromium do Playwright, fontes Anton e Poppins). Uso:
//   node scripts/studio/gerar-segmentos.mjs [segmento...]   (depois: node scripts/studio/adaptar-encartes.mjs)
import fs from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';

/** A mesma tabela (ids, nomes e aviso) está em src/lib/studio/segmentosDeOferta.ts. */
export const TEMAS = {
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
const ICONES = {
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
  ${icone3d(t, t.icone, 250, 250, 230, -24, t.B, 'a')}
  ${icone3d(t, t.icone, 1255, 240, 220, 22, t.A, 'b')}
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

// ---------- encarte (a mesma divisão do Mega Oferta e da farmácia) ----------
const caixaLogo = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="rgba(255,255,255,.08)" stroke="#fff" stroke-width="4" stroke-dasharray="16 12"/>
  <text x="${x + w / 2}" y="${y + h * 0.36}" font-family="Anton" font-size="${h * 0.24}" text-anchor="middle" fill="#fff">SUA</text>
  <text x="${x + w / 2}" y="${y + h * 0.62}" font-family="Anton" font-size="${h * 0.24}" text-anchor="middle" fill="#fff">LOGO</text>
  <text x="${x + w / 2}" y="${y + h * 0.88}" font-family="Anton" font-size="${h * 0.24}" text-anchor="middle" fill="#fff">AQUI</text>`;
const icones = (x, y, tam, cor) => {
  const g = tam * 1.7;
  return `<g fill="none" stroke="#fff" stroke-width="${tam * 0.1}" stroke-linecap="round" stroke-linejoin="round">
  <rect x="${x}" y="${y}" width="${tam}" height="${tam}" rx="${tam * 0.28}"/><circle cx="${x + tam / 2}" cy="${y + tam / 2}" r="${tam * 0.22}"/><circle cx="${x + tam * 0.77}" cy="${y + tam * 0.23}" r="${tam * 0.03}" fill="#fff"/>
  <rect x="${x + g}" y="${y}" width="${tam}" height="${tam}" rx="${tam * 0.18}" fill="#fff"/>
  <rect x="${x + 2 * g}" y="${y + tam * 0.12}" width="${tam * 1.3}" height="${tam * 0.8}" rx="${tam * 0.22}" fill="#fff"/>
  <path d="M${x + 3 * g + tam * 0.2},${y + tam * 0.1} h${tam * 0.18} l${tam * 0.15},${tam * 0.55} h${tam * 0.6} l${tam * 0.15},-${tam * 0.4} h-${tam * 0.8}"/></g>
  <text x="${x + g + tam * 0.6}" y="${y + tam * 0.92}" font-family="Poppins" font-weight="900" font-size="${tam * 0.85}" text-anchor="middle" fill="${cor}">f</text>
  <path d="M${x + 2 * g + tam * 0.52},${y + tam * 0.3} l${tam * 0.35},${tam * 0.22} l-${tam * 0.35},${tam * 0.22} z" fill="${cor}"/>
  <circle cx="${x + 3 * g + tam * 0.5}" cy="${y + tam * 0.9}" r="${tam * 0.08}" fill="#fff"/><circle cx="${x + 3 * g + tam * 0.88}" cy="${y + tam * 0.9}" r="${tam * 0.08}" fill="#fff"/>`;
};
function encarte(t, f, comCaixa) {
  const v = f === 'v';
  const W = v ? 1080 : 1920, H = v ? 1920 : 1080;
  const rod = v ? 1693 : 954, faixa = t.aviso ? (v ? 1860 : 1040) : H;
  const curva = v
    ? `M560,0 C520,300 600,520 548,760 C500,1000 600,1250 540,1460 C510,1580 560,${rod} 548,${rod}`
    : `M1000,0 C930,160 1010,330 945,520 C905,660 990,800 950,${rod}`;
  const ladoB = `${curva} L${W},${rod} L${W},0 Z`;
  const logoCx = v ? 334 : 515, logoCy = v ? 258 : 238;
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${SOMBRA}${BORRAO}
  <linearGradient id="la" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.A[0]}"/><stop offset=".5" stop-color="${t.A[1]}"/><stop offset="1" stop-color="${t.A[2]}"/></linearGradient>
  <linearGradient id="lb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.B[0]}"/><stop offset=".5" stop-color="${t.B[1]}"/><stop offset="1" stop-color="${t.B[2]}"/></linearGradient>
  <radialGradient id="luza" cx="${logoCx / W}" cy="${logoCy / H}" r="${v ? 0.55 : 0.5}"><stop offset="0" stop-color="#ffffff" stop-opacity=".4"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  <radialGradient id="luzb" cx="${v ? 0.8 : 0.72}" cy="${v ? 0.1 : 0.2}" r=".6"><stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  <linearGradient id="rod" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f1efe9"/></linearGradient>
  <linearGradient id="fx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.A[1]}"/><stop offset="1" stop-color="${t.A[2]}"/></linearGradient>
  <filter id="brilho"><feGaussianBlur stdDeviation="9"/></filter><clipPath id="cb"><path d="${ladoB}"/></clipPath></defs>
  <rect width="${W}" height="${H}" fill="url(#la)"/>
  ${raios(logoCx, logoCy, 1800, 26, '#ffffff', 0.05)}
  <rect width="${W}" height="${H}" fill="url(#luza)"/>
  ${textura(t, W * 0.5, rod, v ? 34 : 40, 7)}
  <path d="${ladoB}" fill="url(#lb)"/>
  <g clip-path="url(#cb)">${raios(v ? 860 : 1520, v ? 180 : 140, 1800, 22, '#ffffff', 0.05)}</g>
  <path d="${ladoB}" fill="url(#luzb)"/>
  <g clip-path="url(#cb)">${textura(t, W, rod, v ? 34 : 46, 19)}</g>
  <path d="${curva}" fill="none" stroke="#ffffff" stroke-width="26" opacity=".55" filter="url(#brilho)"/>
  <path d="${curva}" fill="none" stroke="#ffffff" stroke-width="9"/>
  <path d="${curva}" fill="none" stroke="#ffd21f" stroke-width="4" transform="translate(${v ? 10 : 12} 0)"/>
  ${comCaixa ? (v ? caixaLogo(650, 66, 386, 290) + icones(684, 380, 56, t.B[1]) : caixaLogo(1125, 40, 400, 252) + icones(1170, 316, 50, t.B[1])) : ''}
  <path d="M0,${rod + 18} C${W * 0.3},${rod - 22} ${W * 0.7},${rod + 40} ${W},${rod + 6} L${W},${H} L0,${H} Z" fill="#ffd21f"/>
  <path d="M0,${rod + 28} C${W * 0.3},${rod - 10} ${W * 0.7},${rod + 50} ${W},${rod + 16} L${W},${H} L0,${H} Z" fill="url(#rod)"/>
  ${t.aviso ? `<rect x="0" y="${faixa}" width="${W}" height="${H - faixa}" fill="url(#fx)"/><rect x="0" y="${faixa}" width="${W}" height="4" fill="#ffd21f"/>` : ''}
  </svg>`;
  return pagina(W, H, svg);
}

// ---------- palco (pedestal no mesmo lugar do Alerta de Oferta) ----------
function palco(t, f, comLogo) {
  const v = f === 'v';
  const W = v ? 1080 : 1920, H = v ? 1920 : 1080;
  const cx = v ? 540 : 960, tampo = 0.745 * H;
  const pw = v ? 700 : 600, ph = v ? 64 : 56, corpo = v ? 120 : 92;
  const logoB = v ? { x: 0.05 * W, y: 0.012 * H, w: 0.9 * W, h: 0.325 * H } : { x: 0.235 * W, y: 0.012 * H, w: 0.53 * W, h: 0.49 * H };
  const luzY = v ? 0.62 * H : 0.6 * H;
  const p = t.palco;
  let bolhas = '', s = 11;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 26; i++) bolhas += `<circle cx="${rnd() * W}" cy="${rnd() * H * 0.9}" r="${10 + rnd() * 46}" fill="#ffffff" opacity="${0.04 + rnd() * 0.1}" filter="url(#bb)"/>`;
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${SOMBRA}${BORRAO}
  <radialGradient id="ceu" cx=".5" cy="${luzY / H}" r="${v ? 0.75 : 0.8}"><stop offset="0" stop-color="${p[0]}"/><stop offset=".4" stop-color="${p[1]}"/><stop offset=".8" stop-color="${p[2]}"/><stop offset="1" stop-color="${p[3]}"/></radialGradient>
  <radialGradient id="foco" cx=".5" cy="${luzY / H}" r=".42"><stop offset="0" stop-color="#ffffff" stop-opacity=".5"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  <linearGradient id="tp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9e6e0"/></linearGradient>
  <linearGradient id="cp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.B[2]}"/><stop offset=".35" stop-color="${t.B[0]}"/><stop offset=".55" stop-color="${t.B[1]}"/><stop offset="1" stop-color="${t.B[2]}"/></linearGradient>
  <linearGradient id="ouro" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b37a00"/><stop offset=".4" stop-color="#ffe680"/><stop offset=".6" stop-color="#ffd21f"/><stop offset="1" stop-color="#a86f00"/></linearGradient>
  <linearGradient id="pe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></linearGradient>
  <filter id="bb"><feGaussianBlur stdDeviation="6"/></filter><filter id="fb"><feGaussianBlur stdDeviation="30"/></filter></defs>
  <rect width="${W}" height="${H}" fill="url(#ceu)"/>
  ${raios(cx, luzY, 2600, 30, '#ffffff', 0.06)}
  ${textura(t, W, H, v ? 40 : 52, 31)}
  ${bolhas}
  <rect width="${W}" height="${H}" fill="url(#foco)"/>
  <ellipse cx="${cx}" cy="${tampo + corpo + ph * 0.6}" rx="${pw * 0.62}" ry="${ph * 0.9}" fill="#000" opacity=".5" filter="url(#fb)"/>
  <path d="M${cx - pw / 2},${tampo} L${cx - pw / 2},${tampo + corpo} A${pw / 2},${ph / 2} 0 0 0 ${cx + pw / 2},${tampo + corpo} L${cx + pw / 2},${tampo} Z" fill="url(#cp)"/>
  <path d="M${cx - pw / 2},${tampo + corpo * 0.42} A${pw / 2},${ph / 2} 0 0 0 ${cx + pw / 2},${tampo + corpo * 0.42} L${cx + pw / 2},${tampo + corpo * 0.58} A${pw / 2},${ph / 2} 0 0 1 ${cx - pw / 2},${tampo + corpo * 0.58} Z" fill="url(#ouro)"/>
  <ellipse cx="${cx}" cy="${tampo}" rx="${pw / 2}" ry="${ph / 2}" fill="url(#ouro)"/>
  <ellipse cx="${cx}" cy="${tampo - 4}" rx="${pw / 2 - 10}" ry="${ph / 2 - 6}" fill="url(#tp)"/>
  <ellipse cx="${cx}" cy="${tampo - 4}" rx="${pw * 0.3}" ry="${ph * 0.22}" fill="#ffffff" opacity=".8" filter="url(#bb)"/>
  ${icone3d(t, t.icone, v ? 150 : 330, v ? 1420 : 760, v ? 170 : 150, -22, t.A, 'p1')}
  ${icone3d(t, t.icone, v ? 940 : 1600, v ? 1380 : 720, v ? 160 : 140, 24, t.B, 'p2')}
  ${v ? '' : icone3d(t, t.icone, 240, 320, 120, 16, t.B, 'p3') + icone3d(t, t.icone, 1690, 300, 120, -18, t.A, 'p4')}
  <rect x="0" y="${H * (v ? 0.9 : 0.86)}" width="${W}" height="${H * (v ? 0.1 : 0.14)}" fill="url(#pe)"/>
  ${comLogo ? `<image href="LOGO" x="${logoB.x}" y="${logoB.y}" width="${logoB.w}" height="${logoB.h}" preserveAspectRatio="xMidYMid meet"/>` : ''}
  </svg>`;
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
    const t = TEMAS[seg], id = `${seg}-em-oferta`;
    const logoPng = await foto(logo(t), 1500, 1050, `public/studio/logos/ofertas-${seg}.webp`, { transparente: true });
    await foto(logo(t, { textos: false, icone: false }), 1500, 1050, `public/studio/logos/ofertas-${seg}-base.webp`, { transparente: true });
    await foto(emblema(t), 400, 400, `public/studio/logos/ofertas-${seg}-emblema.webp`, { transparente: true });
    if (process.argv.includes('--so-logos')) { console.log('logo pronta:', seg); continue; }
    const logoUrl = `data:image/png;base64,${logoPng.toString('base64')}`;
    for (const f of ['v', 'h']) {
      const [w, h] = f === 'v' ? [1080, 1920] : [1920, 1080];
      await foto(encarte(t, f, true), w, h, `${E}/${id}-${f}-st.webp`);
      await foto(encarte(t, f, false), w, h, `${E}/${id}-${f}-st-limpo.webp`);
      await foto(palco(t, f, true).replace('href="LOGO"', `href="${logoUrl}"`), w, h, `${P}/${id}-${f}.webp`);
      await foto(palco(t, f, false), w, h, `${P}/${id}-${f}-st.webp`);
    }
    console.log('pronto:', seg);
  }
  await navegador.close();
}
