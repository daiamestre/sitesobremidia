// F-288 — GALERIA DE ÍCONES 3D por segmento (pedido do dono): farmácia, saúde, hortifrúti, academia, mercado, Black Friday,
// padaria, adega, açougue, pet, beleza, eletrônicos e moda. Mesmo estilo das logos (degradê com volume, contorno branco e
// sombra), fundo transparente, 300×300. Servem para o círculo da logo, os ícones dos lados e qualquer ícone novo na arte.
// Arte própria em SVG fotografada pelo Chromium do Playwright. Gera public/studio/icones/<grupo>-<icone>.webp e a lista
// src/lib/studio/galeriaDeIcones.ts (não editar à mão).
//   node scripts/studio/gerar-icones.mjs
import fs from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { ICONES } from './gerar-segmentos.mjs';

const VERDE = ['#3ee38a', '#0db45c', '#067a3c'], VERMELHO = ['#ff6b6b', '#e01b2f', '#8f0717'], AZUL = ['#5aa8ff', '#1f6fe0', '#0a3a8f'];
const LARANJA = ['#ffb347', '#f07400', '#a34700'], AMARELO = ['#fff27a', '#ffd21f', '#c98a00'], ROXO = ['#c08bff', '#8a2eff', '#4a0fa3'];
const ROSA = ['#ff8fc0', '#e5257a', '#8f0a47'], PRETO = ['#4a4a55', '#1c1c22', '#000000'], MARROM = ['#e8a03a', '#b8661a', '#7a3e0b'];
const VINHO = ['#c9294f', '#7a0a2a', '#3c0414'], CIANO = ['#66e0f4', '#1393b3', '#0a4d63'];

/** desenhos novos (caixa 100×100); c = preenchimento (degradê) */
const D = {
  ...ICONES,
  cruz: (c) => `<path d="M38 6 Q38 4 40 4 H60 Q62 4 62 6 V38 H94 Q96 38 96 40 V60 Q96 62 94 62 H62 V94 Q62 96 60 96 H40 Q38 96 38 94 V62 H6 Q4 62 4 60 V40 Q4 38 6 38 H38 Z" fill="${c}"/>`,
  capsula: (c) => `<g transform="rotate(-35 50 50)"><rect x="6" y="33" width="88" height="34" rx="17" fill="${c}"/><path d="M50 33 H77 A17 17 0 0 1 77 67 H50 Z" fill="#ffffff"/><rect x="14" y="38" width="62" height="6" rx="3" fill="#fff" opacity=".5"/></g>`,
  comprimido: (c) => `<circle cx="50" cy="50" r="42" fill="${c}"/><path d="M22 50 H78" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".85"/><ellipse cx="38" cy="30" rx="14" ry="7" fill="#fff" opacity=".35"/>`,
  frasco: (c) => `<rect x="33" y="4" width="34" height="15" rx="4" fill="${c}"/><rect x="21" y="21" width="58" height="74" rx="13" fill="${c}"/><rect x="29" y="42" width="42" height="32" rx="5" fill="#fff"/><path d="M50 49 V67 M41 58 H59" stroke="#0db45c" stroke-width="6" stroke-linecap="round"/>`,
  gota: (c) => `<path d="M50 4 C66 30 82 48 82 64 C82 82 68 96 50 96 C32 96 18 82 18 64 C18 48 34 30 50 4 Z" fill="${c}"/><ellipse cx="38" cy="62" rx="7" ry="14" fill="#fff" opacity=".4"/>`,
  coracao: (c) => `<path d="M50 92 C20 70 5 54 5 33 C5 16 18 6 32 6 C41 6 47 11 50 18 C53 11 59 6 68 6 C82 6 95 16 95 33 C95 54 80 70 50 92 Z" fill="${c}"/><ellipse cx="28" cy="26" rx="10" ry="6" fill="#fff" opacity=".4"/>`,
  batimento: (c) => `${D.coracao(c)}<path d="M14 48 H33 L40 33 L50 64 L58 41 L64 48 H86" stroke="#fff" stroke-width="6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`,
  escudo: (c) => `<path d="M50 4 L88 18 V46 C88 72 70 88 50 96 C30 88 12 72 12 46 V18 Z" fill="${c}"/><path d="M43 28 H57 V42 H71 V56 H57 V70 H43 V56 H29 V42 H43 Z" fill="#fff"/>`,
  maca: (c) => `<path d="M50 28 C40 20 12 18 11 50 C10 76 30 96 42 94 C46 93 48 91 50 91 C52 91 54 93 58 94 C70 96 90 76 89 50 C88 18 60 20 50 28 Z" fill="${c}"/><path d="M50 28 C50 18 54 10 60 5" stroke="#6b4421" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M55 18 C62 6 78 8 81 12 C74 22 62 22 55 18 Z" fill="#2c9a27"/><ellipse cx="30" cy="44" rx="7" ry="12" fill="#fff" opacity=".35"/>`,
  cenoura: (c) => `<path d="M72 30 C82 40 80 50 74 56 L24 94 C18 98 8 90 12 84 L46 32 C52 24 64 22 72 30 Z" fill="${c}"/><path d="M40 52 L48 56 M32 66 L40 70 M26 78 L32 82" stroke="#fff" stroke-width="4" opacity=".5" stroke-linecap="round"/><path d="M70 28 C68 16 72 8 80 4 M74 31 C84 23 92 23 96 27 M72 29 C80 19 88 14 94 12" stroke="#2c9a27" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  uva: (c) => `<path d="M50 18 C50 10 56 4 64 4" stroke="#6b4421" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M52 14 C62 8 74 12 76 18 C66 22 58 20 52 14 Z" fill="#2c9a27"/>${[[38, 30], [60, 30], [28, 48], [49, 48], [70, 48], [38, 66], [60, 66], [49, 84]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12" fill="${c}"/><circle cx="${x - 4}" cy="${y - 4}" r="3.5" fill="#fff" opacity=".45"/>`).join('')}`,
  laranja: (c) => `<circle cx="50" cy="56" r="39" fill="${c}"/><path d="M50 18 C56 8 70 6 77 10 C70 20 58 22 50 18 Z" fill="#2c9a27"/><ellipse cx="34" cy="42" rx="9" ry="13" fill="#fff" opacity=".35"/>`,
  kettlebell: (c) => `<path d="M33 40 C27 12 73 12 67 40" stroke="${c}" stroke-width="11" fill="none" stroke-linecap="round"/><circle cx="50" cy="63" r="32" fill="${c}"/><ellipse cx="38" cy="52" rx="8" ry="11" fill="#fff" opacity=".35"/>`,
  trofeu: (c) => `<path d="M28 6 H72 V34 C72 50 62 60 50 60 C38 60 28 50 28 34 Z" fill="${c}"/><path d="M28 15 H12 C12 34 20 41 30 43 M72 15 H88 C88 34 80 41 70 43" stroke="${c}" stroke-width="7" fill="none"/><rect x="43" y="60" width="14" height="18" fill="${c}"/><rect x="26" y="78" width="48" height="16" rx="4" fill="${c}"/>`,
  carrinho: (c) => `<path d="M4 14 H20 L32 64 H80 L92 28 H26" stroke="${c}" stroke-width="9" fill="none" stroke-linejoin="round" stroke-linecap="round"/><path d="M30 34 H84 L78 58 H34 Z" fill="${c}"/><circle cx="38" cy="84" r="9" fill="${c}"/><circle cx="74" cy="84" r="9" fill="${c}"/>`,
  sacola: (c) => `<path d="M14 30 H86 L80 95 H20 Z" fill="${c}"/><path d="M34 42 V24 C34 8 66 8 66 24 V42" stroke="${c}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M24 36 H40" stroke="#fff" stroke-width="5" opacity=".4" stroke-linecap="round"/>`,
  cesta: (c) => `<path d="M6 40 H94 L82 92 H18 Z" fill="${c}"/><path d="M26 40 L44 10 M74 40 L56 10" stroke="${c}" stroke-width="7" stroke-linecap="round"/><path d="M30 52 V80 M50 52 V80 M70 52 V80" stroke="#fff" stroke-width="5" opacity=".6" stroke-linecap="round"/>`,
  estrela: (c) => `<path d="M50 4 L62 36 L96 38 L70 60 L79 94 L50 75 L21 94 L30 60 L4 38 L38 36 Z" fill="${c}"/>`,
  porcento: (c) => `<circle cx="50" cy="50" r="46" fill="${c}"/><circle cx="34" cy="34" r="10" fill="none" stroke="#fff" stroke-width="7"/><circle cx="66" cy="66" r="10" fill="none" stroke="#fff" stroke-width="7"/><path d="M70 26 L30 74" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`,
  presente: (c) => `<rect x="10" y="42" width="80" height="52" rx="4" fill="${c}"/><rect x="6" y="28" width="88" height="17" rx="3" fill="${c}"/><rect x="44" y="28" width="12" height="66" fill="#ffd21f"/><path d="M50 28 C40 6 18 14 30 28 M50 28 C60 6 82 14 70 28" stroke="#ffd21f" stroke-width="6" fill="none"/>`,
  sirene: (c) => `<path d="M24 76 V50 C24 30 36 18 50 18 C64 18 76 30 76 50 V76 Z" fill="${c}"/><rect x="12" y="76" width="76" height="16" rx="4" fill="${c}"/><path d="M50 4 V12 M18 16 L24 22 M82 16 L76 22" stroke="${c}" stroke-width="6" stroke-linecap="round"/><ellipse cx="40" cy="44" rx="6" ry="14" fill="#fff" opacity=".5"/>`,
  pao: (c) => `<path d="M8 62 C8 32 30 20 50 20 C70 20 92 32 92 62 C92 76 84 82 50 82 C16 82 8 76 8 62 Z" fill="${c}"/><path d="M30 34 L38 56 M48 30 L54 54 M66 34 L70 56" stroke="#fff" stroke-width="5" opacity=".6" stroke-linecap="round"/>`,
  xicara: (c) => `<path d="M12 32 H74 V58 C74 76 62 88 43 88 C24 88 12 76 12 58 Z" fill="${c}"/><path d="M74 40 C92 40 92 66 74 66" stroke="${c}" stroke-width="8" fill="none"/><path d="M32 6 C26 14 38 16 32 24 M48 6 C42 14 54 16 48 24" stroke="${c}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  garrafa: (c) => `<path d="M42 4 H58 V26 C58 32 70 36 70 50 V92 C70 95 68 96 66 96 H34 C32 96 30 95 30 92 V50 C30 36 42 32 42 26 Z" fill="${c}"/><rect x="34" y="56" width="32" height="22" rx="3" fill="#fff"/>`,
  caneca: (c) => `<rect x="16" y="24" width="52" height="70" rx="8" fill="${c}"/><path d="M68 38 H80 C88 38 90 44 90 52 V62 C90 70 86 74 80 74 H68" stroke="${c}" stroke-width="8" fill="none"/><path d="M13 26 C13 12 30 6 40 13 C48 4 67 7 71 22 Z" fill="#fff"/>`,
  bife: (c) => `<path d="M20 30 C34 8 76 8 88 30 C98 50 86 80 60 88 C36 96 10 84 8 62 C6 48 12 40 20 30 Z" fill="${c}"/><ellipse cx="62" cy="40" rx="12" ry="9" fill="#fff"/><path d="M24 58 C34 70 52 74 66 66" stroke="#fff" stroke-width="5" fill="none" opacity=".55" stroke-linecap="round"/>`,
  osso: (c) => `<rect x="22" y="40" width="56" height="20" fill="${c}"/><circle cx="20" cy="37" r="13" fill="${c}"/><circle cx="20" cy="63" r="13" fill="${c}"/><circle cx="80" cy="37" r="13" fill="${c}"/><circle cx="80" cy="63" r="13" fill="${c}"/>`,
  batom: (c) => `<rect x="30" y="58" width="40" height="38" rx="4" fill="#ffd21f"/><rect x="34" y="42" width="32" height="18" fill="#c98a00"/><path d="M38 42 V20 L62 6 V42 Z" fill="${c}"/>`,
  celular: (c) => `<rect x="24" y="4" width="52" height="92" rx="10" fill="${c}"/><rect x="30" y="14" width="40" height="64" rx="3" fill="#fff"/><circle cx="50" cy="87" r="4" fill="#fff"/>`,
  fone: (c) => `<path d="M16 62 V48 C16 20 84 20 84 48 V62" stroke="${c}" stroke-width="9" fill="none"/><rect x="8" y="54" width="22" height="36" rx="8" fill="${c}"/><rect x="70" y="54" width="22" height="36" rx="8" fill="${c}"/>`,
  cabide: (c) => `<path d="M50 32 C50 24 58 22 58 14 C58 5 42 5 42 14" stroke="${c}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M50 32 L8 70 C4 74 6 80 12 80 H88 C94 80 96 74 92 70 Z" stroke="${c}" stroke-width="9" fill="none" stroke-linejoin="round"/>`,
  camiseta: (c) => `<path d="M34 8 C40 17 60 17 66 8 L94 22 L84 44 L74 40 V94 H26 V40 L16 44 L6 22 Z" fill="${c}"/>`,
};

/** grupo → ícones [id, desenho, cores] */
const GRUPOS = [
  ['farmacia', 'Farmácia', [['cruz', 'cruz', VERDE], ['capsula-vermelha', 'capsula', VERMELHO], ['capsula-verde', 'capsula', VERDE], ['capsula-azul', 'capsula', AZUL], ['comprimido', 'comprimido', AZUL], ['frasco', 'frasco', VERDE], ['gota', 'gota', AZUL]]],
  ['saude', 'Saúde', [['coracao', 'coracao', VERMELHO], ['batimento', 'batimento', VERMELHO], ['escudo', 'escudo', AZUL], ['cruz-azul', 'cruz', AZUL], ['gota', 'gota', CIANO]]],
  ['hortifruti', 'Hortifrúti', [['maca', 'maca', VERMELHO], ['laranja', 'laranja', LARANJA], ['uva', 'uva', ROXO], ['cenoura', 'cenoura', LARANJA], ['folha', 'folha', VERDE]]],
  ['academia', 'Academia e suplementos', [['haltere', 'haltere', LARANJA], ['kettlebell', 'kettlebell', PRETO], ['raio', 'raio', AMARELO], ['chama', 'chama', LARANJA], ['trofeu', 'trofeu', AMARELO]]],
  ['mercado', 'Mercado', [['carrinho', 'carrinho', VERMELHO], ['sacola', 'sacola', LARANJA], ['cesta', 'cesta', MARROM], ['etiqueta', 'etiqueta', VERMELHO], ['estrela', 'estrela', AMARELO], ['sirene', 'sirene', VERMELHO]]],
  ['black-friday', 'Black Friday', [['porcento', 'porcento', PRETO], ['etiqueta', 'etiqueta', PRETO], ['sacola', 'sacola', PRETO], ['raio', 'raio', AMARELO], ['presente', 'presente', PRETO], ['estrela', 'estrela', AMARELO]]],
  ['padaria', 'Padaria', [['trigo', 'trigo', MARROM], ['pao', 'pao', MARROM], ['xicara', 'xicara', VINHO]]],
  ['adega', 'Adega', [['taca', 'taca', VINHO], ['garrafa', 'garrafa', VINHO], ['caneca', 'caneca', AMARELO]]],
  ['acougue', 'Açougue', [['bife', 'bife', VERMELHO], ['chama', 'chama', VERMELHO], ['osso', 'osso', PRETO]]],
  ['pet', 'Pet', [['pata', 'pata', CIANO], ['osso', 'osso', ROXO], ['coracao', 'coracao', ROXO]]],
  ['beleza', 'Beleza', [['brilho', 'brilho', ROSA], ['batom', 'batom', ROSA], ['coracao', 'coracao', ROSA], ['estrela', 'estrela', ROSA]]],
  ['eletronicos', 'Eletrônicos', [['raio', 'raio', AZUL], ['celular', 'celular', AZUL], ['fone', 'fone', PRETO]]],
  ['moda', 'Moda', [['etiqueta', 'etiqueta', ROSA], ['cabide', 'cabide', PRETO], ['camiseta', 'camiseta', ROSA], ['sacola', 'sacola', ROSA]]],
];

const pagina = (w, h, corpo) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}svg{display:block}</style></head><body>${corpo}</body></html>`;
const svgDoIcone = (desenho, cores) => `<svg width="300" height="300" viewBox="0 0 300 300"><defs>
  <filter id="somb" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#000" flood-opacity=".4"/></filter>
  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cores[0]}"/><stop offset=".55" stop-color="${cores[1]}"/><stop offset="1" stop-color="${cores[2]}"/></linearGradient></defs>
  <g filter="url(#somb)"><g transform="translate(40 34) scale(2.2)" stroke="#fff" stroke-width="3" stroke-linejoin="round">${D[desenho]('url(#g)')}</g></g></svg>`;

const instalado = `${process.env.LOCALAPPDATA}/ms-playwright`;
const extra = fs.existsSync(instalado) ? fs.readdirSync(instalado).filter((d) => /^chromium-\d+$/.test(d)).map((d) => `${instalado}/${d}/chrome-win64/chrome.exe`).find((p) => fs.existsSync(p)) : undefined;
const navegador = await chromium.launch().catch(() => chromium.launch({ executablePath: extra }));
const aba = await navegador.newPage();
await aba.setViewportSize({ width: 300, height: 300 });
fs.mkdirSync('public/studio/icones', { recursive: true });
const lista = [];
for (const [grupo, nomeGrupo, icones] of GRUPOS) {
  const itens = [];
  for (const [id, desenho, cores] of icones) {
    await aba.setContent(pagina(300, 300, svgDoIcone(desenho, cores)));
    const png = await aba.screenshot({ omitBackground: true, type: 'png' });
    const arq = `${grupo}-${id}.webp`;
    await sharp(png).webp({ quality: 92, alphaQuality: 100 }).toFile(`public/studio/icones/${arq}`);
    itens.push({ id: `${grupo}-${id}`, nome: id.replace(/-/g, ' '), src: `/studio/icones/${arq}` });
  }
  lista.push({ id: grupo, nome: nomeGrupo, icones: itens });
}
await navegador.close();
fs.writeFileSync('src/lib/studio/galeriaDeIcones.ts', `// F-288 — GALERIA DE ÍCONES 3D por segmento. Gerado por scripts/studio/gerar-icones.mjs (não editar à mão).
export interface IconeDaGaleria { id: string; nome: string; src: string }
export interface GrupoDeIcones { id: string; nome: string; icones: IconeDaGaleria[] }
export const GALERIA_DE_ICONES: GrupoDeIcones[] = ${JSON.stringify(lista, null, 1)};
`);
console.log('ícones gerados', lista.reduce((s, g) => s + g.icones.length, 0));
