// F-259 — artes oficiais da FARMÁCIA, no mesmo padrão das de mercado: a logo "Ofertas de Farmácia" (sem fundo, em alta),
// o encarte "Saúde em Oferta" (verde e azul, mesma divisão do Mega Oferta) e o palco do carrossel (pedestal no mesmo lugar
// do Alerta de Oferta). Desenhadas em HTML/SVG e fotografadas pelo Chromium do Playwright, com as fontes do Studio.
// Uso: node scripts/studio/gerar-farmacia.mjs   (depois: node scripts/studio/adaptar-encartes.mjs)
import fs from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';

const FONTES = '<link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@600;800;900&display=block" rel="stylesheet">';
const pagina = (w, h, corpo, fundo = 'transparent') => `<!doctype html><html><head><meta charset="utf-8">${FONTES}<style>
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${fundo}}*{box-sizing:border-box}svg{display:block}</style></head><body>${corpo}</body></html>`;

// ---------- peças ----------
/** cruz da farmácia em 3D (verde, com brilho), centro (cx, cy) e lado s */
const cruz = (cx, cy, s, id) => {
  const b = s / 3, r = b * 0.22;
  const caminho = `M${cx - b / 2 + r},${cy - s / 2} h${b - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${b - r} h${b - r} a${r},${r} 0 0 1 ${r},${r} v${b - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${b - r} v${b - r} a${r},${r} 0 0 1 -${r},${r} h-${b - 2 * r} a${r},${r} 0 0 1 -${r},-${r} v-${b - r} h-${b - r} a${r},${r} 0 0 1 -${r},-${r} v-${b - 2 * r} a${r},${r} 0 0 1 ${r},-${r} h${b - r} v-${b - r} a${r},${r} 0 0 1 ${r},-${r} z`;
  return `<defs><linearGradient id="cz${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3ee38a"/><stop offset=".5" stop-color="#0db45c"/><stop offset="1" stop-color="#067a3c"/></linearGradient>
  <linearGradient id="cb${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
  <path d="${caminho}" transform="translate(0 ${s * 0.06})" fill="#04522a"/>
  <path d="${caminho}" fill="url(#cz${id})" stroke="#ffffff" stroke-width="${s * 0.035}"/>
  <path d="${caminho}" fill="url(#cb${id})" transform="translate(${cx} ${cy}) scale(.78 .5) translate(${-cx} ${-cy - s * 0.32})" opacity=".55"/>`;
};
/** cápsula (remédio) com metade colorida, brilho e sombra, girada */
const capsula = (cx, cy, c, l, giro, cor, id) => `<g transform="rotate(${giro} ${cx} ${cy})" filter="url(#somb)">
  <defs><linearGradient id="k${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#e7eef2"/><stop offset="1" stop-color="#b9c7cf"/></linearGradient>
  <linearGradient id="q${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cor[0]}"/><stop offset=".55" stop-color="${cor[1]}"/><stop offset="1" stop-color="${cor[2]}"/></linearGradient>
  <clipPath id="m${id}"><rect x="${cx - c / 2}" y="${cy - l / 2}" width="${c / 2}" height="${l}"/></clipPath></defs>
  <rect x="${cx - c / 2}" y="${cy - l / 2}" width="${c}" height="${l}" rx="${l / 2}" fill="url(#k${id})"/>
  <rect x="${cx - c / 2}" y="${cy - l / 2}" width="${c}" height="${l}" rx="${l / 2}" fill="url(#q${id})" clip-path="url(#m${id})"/>
  <rect x="${cx - c / 2 + l * 0.25}" y="${cy - l * 0.36}" width="${c - l * 0.5}" height="${l * 0.18}" rx="${l * 0.09}" fill="#fff" opacity=".7"/></g>`;
const SOMBRA = '<filter id="somb" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#00230f" flood-opacity=".45"/></filter>';

/** texto 3D: extrusão escura em camadas, contorno e preenchimento em degradê */
function texto3d(t, x, y, tam, { fill, extrusao, contorno, prof = 18, id, espaco = 0, ancora = 'middle', fonte = 'Anton' }) {
  const base = `x="${x}" y="${y}" font-family="${fonte}" font-size="${tam}" text-anchor="${ancora}" letter-spacing="${espaco}"`;
  let s = `<defs><linearGradient id="t${id}" x1="0" y1="0" x2="0" y2="1">${fill.map((c, i) => `<stop offset="${i / (fill.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient></defs>`;
  s += `<text ${base} fill="rgba(0,0,0,.35)" transform="translate(0 ${prof + 14})" filter="url(#borrao)">${t}</text>`;
  for (let i = prof; i > 0; i -= 2) s += `<text ${base} fill="${extrusao}" stroke="${extrusao}" stroke-width="${tam * 0.07}" stroke-linejoin="round" transform="translate(0 ${i})">${t}</text>`;
  s += `<text ${base} fill="url(#t${id})" stroke="${contorno}" stroke-width="${tam * 0.07}" stroke-linejoin="round" paint-order="stroke fill">${t}</text>`;
  return s;
}
const BORRAO = '<filter id="borrao"><feGaussianBlur stdDeviation="10"/></filter>';

// ---------- logo ----------
/** F-288: partes — sem os textos e sem a cruz vira a BASE da logo em camadas (textos e círculo editáveis pelo cliente) */
function logo(partes = { textos: true, icone: true }) {
  const W = 1500, H = 1050;
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${SOMBRA}${BORRAO}
  <radialGradient id="sel" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#e9f8ef"/><stop offset="1" stop-color="#bfe6cf"/></radialGradient>
  <linearGradient id="ouro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a6"/><stop offset=".45" stop-color="#ffd21f"/><stop offset="1" stop-color="#c98a00"/></linearGradient>
  <linearGradient id="fita" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f7cff"/><stop offset=".55" stop-color="#1046c8"/><stop offset="1" stop-color="#0a2a85"/></linearGradient></defs>
  ${partes.lados === false ? '' : capsula(250, 250, 250, 96, -32, ['#ff6b6b', '#e01b2f', '#8f0717'], 'a')}
  ${partes.lados === false ? '' : capsula(1255, 240, 240, 92, 28, ['#62f0a4', '#14b863', '#077a3d'], 'b')}
  <circle cx="750" cy="205" r="178" fill="#04522a" opacity=".35" transform="translate(0 16)" filter="url(#borrao)"/>
  <circle cx="750" cy="200" r="176" fill="url(#ouro)"/>
  <circle cx="750" cy="200" r="150" fill="url(#sel)"/>
  ${partes.icone ? cruz(750, 200, 200, 'l') : ''}
  ${!partes.textos ? '' : texto3d('OFERTAS', 750, 690, 390, { fill: ['#ffffff', '#f2fff7', '#bff0d4'], extrusao: '#055a2c', contorno: '#0a7a3d', prof: 26, id: 'of', espaco: 6 })}
  <g filter="url(#somb)">
    <path d="M250,742 L1250,742 L1290,812 L1250,882 L250,882 L210,812 Z" fill="url(#ouro)"/>
    <path d="M262,754 L1238,754 L1272,812 L1238,870 L262,870 L228,812 Z" fill="url(#fita)"/>
  </g>
  ${!partes.textos ? '' : texto3d('DE FARMÁCIA', 750, 853, 116, { fill: ['#ffffff', '#ffffff', '#d7e6ff'], extrusao: '#061c5e', contorno: '#061c5e', prof: 6, id: 'df', espaco: 8 })}
  ${!partes.textos ? '' : `<text x="750" y="975" font-family="Poppins" font-weight="800" font-size="66" text-anchor="middle" fill="#ffd21f" stroke="#04522a" stroke-width="16" stroke-linejoin="round" paint-order="stroke fill" letter-spacing="10">SAÚDE COM DESCONTO</text>`}
  </svg>`;
  return pagina(W, H, svg);
}

// ---------- fundos ----------
const icones = (x, y, t) => {
  // instagram, facebook, youtube e carrinho, brancos (como no Mega Oferta)
  const g = t * 1.7;
  return `<g fill="none" stroke="#fff" stroke-width="${t * 0.1}" stroke-linecap="round" stroke-linejoin="round">
  <rect x="${x}" y="${y}" width="${t}" height="${t}" rx="${t * 0.28}"/><circle cx="${x + t / 2}" cy="${y + t / 2}" r="${t * 0.22}"/><circle cx="${x + t * 0.77}" cy="${y + t * 0.23}" r="${t * 0.03}" fill="#fff"/>
  <rect x="${x + g}" y="${y}" width="${t}" height="${t}" rx="${t * 0.18}" fill="#fff"/>
  <rect x="${x + 2 * g}" y="${y + t * 0.12}" width="${t * 1.3}" height="${t * 0.8}" rx="${t * 0.22}" fill="#fff"/>
  <path d="M${x + 3 * g + t * 0.2},${y + t * 0.1} h${t * 0.18} l${t * 0.15},${t * 0.55} h${t * 0.6} l${t * 0.15},-${t * 0.4} h-${t * 0.8}"/></g>
  <text x="${x + g + t * 0.6}" y="${y + t * 0.92}" font-family="Poppins" font-weight="900" font-size="${t * 0.85}" text-anchor="middle" fill="#1046c8">f</text>
  <path d="M${x + 2 * g + t * 0.52},${y + t * 0.3} l${t * 0.35},${t * 0.22} l-${t * 0.35},${t * 0.22} z" fill="#1046c8"/>
  <circle cx="${x + 3 * g + t * 0.5}" cy="${y + t * 0.9}" r="${t * 0.08}" fill="#fff"/><circle cx="${x + 3 * g + t * 0.88}" cy="${y + t * 0.9}" r="${t * 0.08}" fill="#fff"/>`;
};
const caixaLogo = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="rgba(255,255,255,.08)" stroke="#fff" stroke-width="4" stroke-dasharray="16 12"/>
  <text x="${x + w / 2}" y="${y + h * 0.36}" font-family="Anton" font-size="${h * 0.24}" text-anchor="middle" fill="#fff">SUA</text>
  <text x="${x + w / 2}" y="${y + h * 0.62}" font-family="Anton" font-size="${h * 0.24}" text-anchor="middle" fill="#fff">LOGO</text>
  <text x="${x + w / 2}" y="${y + h * 0.88}" font-family="Anton" font-size="${h * 0.24}" text-anchor="middle" fill="#fff">AQUI</text>`;
/** cruzes e cápsulas soltas, bem leves, para dar textura de farmácia */
function textura(W, H, n, semente) {
  let s = semente, out = '';
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H, t = 18 + rnd() * 34, o = 0.05 + rnd() * 0.08;
    out += rnd() > 0.45
      ? `<path d="M${x - t / 6},${y - t / 2} h${t / 3} v${t / 3} h${t / 3} v${t / 3} h-${t / 3} v${t / 3} h-${t / 3} v-${t / 3} h-${t / 3} v-${t / 3} h${t / 3} z" fill="#fff" opacity="${o}"/>`
      : `<rect x="${x}" y="${y}" width="${t * 1.8}" height="${t * 0.7}" rx="${t * 0.35}" fill="#fff" opacity="${o}" transform="rotate(${rnd() * 180} ${x} ${y})"/>`;
  }
  return out;
}
/** raios de luz saindo de um ponto */
const raios = (cx, cy, r, n, cor, op) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2, b = a + Math.PI / n * 0.55;
  return `<path d="M${cx},${cy} L${cx + Math.cos(a) * r},${cy + Math.sin(a) * r} L${cx + Math.cos(b) * r},${cy + Math.sin(b) * r} Z" fill="${cor}" opacity="${op}"/>`;
}).join('');

/**
 * ENCARTE "Saúde em Oferta": lado VERDE (esquerda) e lado AZUL (direita) com a mesma curva do Mega Oferta, rodapé branco
 * para os contatos e a faixa verde do aviso obrigatório dos remédios.
 */
function encarte(f, comCaixa) {
  const v = f === 'v';
  const W = v ? 1080 : 1920, H = v ? 1920 : 1080;
  const rod = v ? 1693 : 954, faixa = v ? 1860 : 1040;
  // curva entre os lados (mesmos limites medidos no Mega Oferta)
  const curva = v
    ? `M560,0 C520,300 600,520 548,760 C500,1000 600,1250 540,1460 C510,1580 560,${rod} 548,${rod}`
    : `M1000,0 C930,160 1010,330 945,520 C905,660 990,800 950,${rod}`;
  const azul = v ? `${curva} L${W},${rod} L${W},0 Z` : `${curva} L${W},${rod} L${W},0 Z`;
  const logoCx = v ? 334 : 515, logoCy = v ? 258 : 238;
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${SOMBRA}${BORRAO}
  <linearGradient id="vd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16c46c"/><stop offset=".5" stop-color="#079a4f"/><stop offset="1" stop-color="#04693a"/></linearGradient>
  <linearGradient id="az" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e7bff"/><stop offset=".5" stop-color="#1450d4"/><stop offset="1" stop-color="#0a2f8f"/></linearGradient>
  <radialGradient id="luzv" cx="${logoCx / W}" cy="${logoCy / H}" r="${v ? 0.55 : 0.5}"><stop offset="0" stop-color="#bfffd9" stop-opacity=".55"/><stop offset="1" stop-color="#bfffd9" stop-opacity="0"/></radialGradient>
  <radialGradient id="luza" cx="${v ? 0.8 : 0.72}" cy="${v ? 0.1 : 0.2}" r=".6"><stop offset="0" stop-color="#9cc6ff" stop-opacity=".5"/><stop offset="1" stop-color="#9cc6ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="rod" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3f3ea"/></linearGradient>
  <linearGradient id="fx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#078a46"/><stop offset="1" stop-color="#04602f"/></linearGradient>
  <filter id="brilho"><feGaussianBlur stdDeviation="9"/></filter></defs>
  <rect width="${W}" height="${H}" fill="url(#vd)"/>
  ${raios(logoCx, logoCy, 1800, 26, '#ffffff', 0.05)}
  <rect width="${W}" height="${H}" fill="url(#luzv)"/>
  ${textura(W * (v ? 0.5 : 0.5), rod, v ? 40 : 46, 7)}
  <path d="${azul}" fill="url(#az)"/>
  <g clip-path="url(#ca)">${raios(v ? 860 : 1520, v ? 180 : 140, 1800, 22, '#ffffff', 0.05)}</g>
  <clipPath id="ca"><path d="${azul}"/></clipPath>
  <path d="${azul}" fill="url(#luza)"/>
  <g clip-path="url(#ca)">${textura(W, rod, v ? 40 : 52, 19)}</g>
  <path d="${curva}" fill="none" stroke="#ffffff" stroke-width="26" opacity=".55" filter="url(#brilho)"/>
  <path d="${curva}" fill="none" stroke="#ffffff" stroke-width="9"/>
  <path d="${curva}" fill="none" stroke="#ffd21f" stroke-width="4" transform="translate(${v ? 10 : 12} 0)"/>
  ${comCaixa ? (v ? caixaLogo(650, 66, 386, 290) + icones(684, 380, 56) : caixaLogo(1125, 40, 400, 252) + icones(1170, 316, 50)) : ''}
  <path d="M0,${rod + 18} C${W * 0.3},${rod - 22} ${W * 0.7},${rod + 40} ${W},${rod + 6} L${W},${H} L0,${H} Z" fill="#ffd21f"/>
  <path d="M0,${rod + 28} C${W * 0.3},${rod - 10} ${W * 0.7},${rod + 50} ${W},${rod + 16} L${W},${H} L0,${H} Z" fill="url(#rod)"/>
  <rect x="0" y="${faixa}" width="${W}" height="${H - faixa}" fill="url(#fx)"/>
  <rect x="0" y="${faixa}" width="${W}" height="4" fill="#ffd21f"/>
  </svg>`;
  return pagina(W, H, svg);
}

/**
 * PALCO do carrossel de farmácia: luz verde-água, raios, bolhas de luz e o pedestal branco e verde no mesmo lugar do
 * Alerta de Oferta (o produto pisa no tampo). A logo vai gravada na versão padrão; a "-st" fica sem ela.
 */
function palco(f, comLogo) {
  const v = f === 'v';
  const W = v ? 1080 : 1920, H = v ? 1920 : 1080;
  const cx = v ? 540 : 960, tampo = (v ? 0.745 : 0.745) * H;
  const pw = v ? 700 : 600, ph = v ? 64 : 56, corpo = v ? 120 : 92;
  const logoB = v ? { x: 0.05 * W, y: 0.012 * H, w: 0.9 * W, h: 0.325 * H } : { x: 0.235 * W, y: 0.012 * H, w: 0.53 * W, h: 0.49 * H };
  const luzY = v ? 0.62 * H : 0.6 * H;
  let bolhas = '', s = 11;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 26; i++) bolhas += `<circle cx="${rnd() * W}" cy="${rnd() * H * 0.9}" r="${10 + rnd() * 46}" fill="#ffffff" opacity="${0.04 + rnd() * 0.1}" filter="url(#bb)"/>`;
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${SOMBRA}${BORRAO}
  <radialGradient id="ceu" cx=".5" cy="${luzY / H}" r="${v ? 0.75 : 0.8}"><stop offset="0" stop-color="#3fe0a0"/><stop offset=".4" stop-color="#0aa863"/><stop offset=".8" stop-color="#05683f"/><stop offset="1" stop-color="#033f27"/></radialGradient>
  <radialGradient id="foco" cx=".5" cy="${luzY / H}" r=".42"><stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  <linearGradient id="tp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d8efe2"/></linearGradient>
  <linearGradient id="cp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#05753d"/><stop offset=".35" stop-color="#19c56f"/><stop offset=".55" stop-color="#0fae5f"/><stop offset="1" stop-color="#04582d"/></linearGradient>
  <linearGradient id="ouro" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b37a00"/><stop offset=".4" stop-color="#ffe680"/><stop offset=".6" stop-color="#ffd21f"/><stop offset="1" stop-color="#a86f00"/></linearGradient>
  <linearGradient id="pe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#001a0d" stop-opacity=".75"/></linearGradient>
  <filter id="bb"><feGaussianBlur stdDeviation="6"/></filter><filter id="fb"><feGaussianBlur stdDeviation="30"/></filter></defs>
  <rect width="${W}" height="${H}" fill="url(#ceu)"/>
  ${raios(cx, luzY, 2600, 30, '#ffffff', 0.06)}
  ${textura(W, H, v ? 46 : 60, 31)}
  ${bolhas}
  <rect width="${W}" height="${H}" fill="url(#foco)"/>
  <ellipse cx="${cx}" cy="${tampo + corpo + ph * 0.6}" rx="${pw * 0.62}" ry="${ph * 0.9}" fill="#00200f" opacity=".55" filter="url(#fb)"/>
  <path d="M${cx - pw / 2},${tampo} L${cx - pw / 2},${tampo + corpo} A${pw / 2},${ph / 2} 0 0 0 ${cx + pw / 2},${tampo + corpo} L${cx + pw / 2},${tampo} Z" fill="url(#cp)"/>
  <path d="M${cx - pw / 2},${tampo + corpo * 0.42} A${pw / 2},${ph / 2} 0 0 0 ${cx + pw / 2},${tampo + corpo * 0.42} L${cx + pw / 2},${tampo + corpo * 0.58} A${pw / 2},${ph / 2} 0 0 1 ${cx - pw / 2},${tampo + corpo * 0.58} Z" fill="url(#ouro)"/>
  <ellipse cx="${cx}" cy="${tampo}" rx="${pw / 2}" ry="${ph / 2}" fill="url(#ouro)"/>
  <ellipse cx="${cx}" cy="${tampo - 4}" rx="${pw / 2 - 10}" ry="${ph / 2 - 6}" fill="url(#tp)"/>
  <ellipse cx="${cx}" cy="${tampo - 4}" rx="${pw * 0.3}" ry="${ph * 0.22}" fill="#ffffff" opacity=".8" filter="url(#bb)"/>
  ${capsula(v ? 150 : 330, v ? 1420 : 760, v ? 170 : 150, v ? 64 : 58, -28, ['#ff6b6b', '#e01b2f', '#8f0717'], 'p1')}
  ${capsula(v ? 940 : 1600, v ? 1380 : 720, v ? 160 : 140, v ? 60 : 54, 34, ['#7fd0ff', '#1e7be0', '#0a3f95'], 'p2')}
  ${v ? '' : capsula(240, 320, 120, 46, 20, ['#ffe680', '#f5b800', '#9c6a00'], 'p3') + capsula(1690, 300, 120, 46, -24, ['#62f0a4', '#14b863', '#077a3d'], 'p4')}
  <rect x="0" y="${H * (v ? 0.9 : 0.86)}" width="${W}" height="${H * (v ? 0.1 : 0.14)}" fill="url(#pe)"/>
  ${comLogo ? `<image href="LOGO" x="${logoB.x}" y="${logoB.y}" width="${logoB.w}" height="${logoB.h}" preserveAspectRatio="xMidYMid meet"/>` : ''}
  </svg>`;
  return pagina(W, H, svg);
}

// ---------- fotografar ----------
// usa o Chromium já baixado quando o da versão do Playwright não estiver instalado
const instalado = `${process.env.LOCALAPPDATA}/ms-playwright`;
const extra = fs.existsSync(instalado) ? fs.readdirSync(instalado).filter((d) => /^chromium-\d+$/.test(d)).map((d) => `${instalado}/${d}/chrome-win64/chrome.exe`).find((p) => fs.existsSync(p)) : undefined;
const navegador = await chromium.launch().catch(() => chromium.launch({ executablePath: extra }));
const aba = await navegador.newPage();
async function foto(html, w, h, saida, { transparente = false } = {}) {
  await aba.setViewportSize({ width: w, height: h });
  await aba.setContent(html, { waitUntil: 'networkidle' });
  await aba.evaluate(() => document.fonts.ready);
  const png = await aba.screenshot({ omitBackground: transparente, type: 'png' });
  if (saida.endsWith('.png')) fs.writeFileSync(saida, png);
  else await sharp(png).webp({ quality: transparente ? 92 : 90, alphaQuality: 100 }).toFile(saida);
  return png;
}
const LOGO = 'public/studio/logos/ofertas-de-farmacia.webp';
// F-288: a base (sem textos e sem cruz) e o ícone do círculo, para a logo em camadas editável
await foto(logo({ textos: false, icone: false, lados: false }), 1500, 1050, 'public/studio/logos/ofertas-farmacia-base.webp', { transparente: true });
await foto(pagina(360, 360, `<svg width="360" height="360" viewBox="0 0 360 360"><defs>${SOMBRA}</defs>${capsula(180, 180, 250, 96, -32, ['#ff6b6b', '#e01b2f', '#8f0717'], 'a')}</svg>`), 360, 360, 'public/studio/logos/ofertas-farmacia-lado-a.webp', { transparente: true });
await foto(pagina(360, 360, `<svg width="360" height="360" viewBox="0 0 360 360"><defs>${SOMBRA}</defs>${capsula(180, 180, 240, 92, 28, ['#62f0a4', '#14b863', '#077a3d'], 'b')}</svg>`), 360, 360, 'public/studio/logos/ofertas-farmacia-lado-b.webp', { transparente: true });
await foto(pagina(400, 400, `<svg width="400" height="400" viewBox="0 0 400 400">${cruz(200, 190, 330, 'e')}</svg>`), 400, 400, 'public/studio/logos/ofertas-farmacia-emblema.webp', { transparente: true });
if (process.argv.includes('--so-logos')) { await navegador.close(); console.log('logos da farmácia prontas'); process.exit(0); }
const logoPng = await foto(logo(), 1500, 1050, LOGO, { transparente: true });
const logoUrl = `data:image/png;base64,${logoPng.toString('base64')}`;
const E = 'public/studio/encartes-oficiais', P = 'public/studio/palco';
for (const f of ['v', 'h']) {
  const [w, h] = f === 'v' ? [1080, 1920] : [1920, 1080];
  await foto(encarte(f, true), w, h, `${E}/saude-em-oferta-${f}-st.webp`);
  await foto(encarte(f, false), w, h, `${E}/saude-em-oferta-${f}-st-limpo.webp`);
  await foto(palco(f, true).replace('href="LOGO"', `href="${logoUrl}"`), w, h, `${P}/saude-em-oferta-${f}.webp`);
  await foto(palco(f, false), w, h, `${P}/saude-em-oferta-${f}-st.webp`);
}
await navegador.close();
console.log('artes de farmácia prontas');
