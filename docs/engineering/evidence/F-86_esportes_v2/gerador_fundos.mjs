// Fundos temáticos do widget Esportes (F-87): estádio à noite, torcida desfocada, gramado com linhas, bola e taça
// estilizada de cada campeonato. Arte própria (sem logotipos oficiais nem patrocinadores). Saída: JPG 16:9 e 9:16.
import sharp from 'sharp';
import fs from 'fs';

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

const TEMAS = {
  brasileirao:        { topo: '#04160c', meio: '#07301a', luz: '#ffe45c', acento: '#19b34a', gramado: ['#0f5a2a', '#0a3d1c'], metal: 'ouro', taca: 'brasileirao', estrelas: 5 },
  'copa-do-brasil':   { topo: '#0b0906', meio: '#1c160a', luz: '#ffd76a', acento: '#d4a017', gramado: ['#1d4d24', '#123318'], metal: 'ouro', taca: 'copa', estrelas: 0 },
  'premier-league':   { topo: '#12021f', meio: '#2e0a4a', luz: '#04f5ff', acento: '#e90052', gramado: ['#135c33', '#0b3d22'], metal: 'prata', taca: 'premier', estrelas: 0 },
  'la-liga':          { topo: '#0d0a14', meio: '#2a0c16', luz: '#ff6a3d', acento: '#ee2523', gramado: ['#16582e', '#0d3b1f'], metal: 'prata', taca: 'laliga', estrelas: 0 },
  'champions-league': { topo: '#020a26', meio: '#0a1d56', luz: '#9fc4ff', acento: '#d9e3ff', gramado: ['#124a37', '#0a3024'], metal: 'prata', taca: 'champions', estrelas: 8 },
};

// ------------------------------------------------------------------ peças (em caixa própria, escaladas depois)
function metalDefs(id, metal) {
  const c = metal === 'ouro' ? ['#fff6c8', '#f2c94c', '#c9961a', '#7a5500'] : ['#ffffff', '#dfe5f0', '#9aa6bd', '#4b556b'];
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${c[3]}"/><stop offset="0.28" stop-color="${c[1]}"/><stop offset="0.5" stop-color="${c[0]}"/>
    <stop offset="0.72" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[3]}"/></linearGradient>`;
}

/** Taças estilizadas, caixa 400 x 600 (x centro = 200, base em y = 600). */
function taca(tipo, fill) {
  const base = `<path d="M110 600 L290 600 L278 560 L122 560 Z" fill="${fill}"/><rect x="138" y="520" width="124" height="40" rx="6" fill="${fill}"/>`;
  switch (tipo) {
    case 'brasileirao': // alta e esguia, taça estreita no alto
      return `${base}<path d="M178 520 L222 520 L214 380 L186 380 Z" fill="${fill}"/>
        <path d="M120 70 L280 70 Q284 250 226 330 Q214 360 214 380 L186 380 Q186 360 174 330 Q116 250 120 70 Z" fill="${fill}"/>
        <ellipse cx="200" cy="70" rx="80" ry="16" fill="${fill}" opacity="0.9"/>
        <circle cx="200" cy="200" r="34" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="5"/>`;
    case 'copa': // taça larga de duas alças
      return `${base}<path d="M184 520 L216 520 L210 420 L190 420 Z" fill="${fill}"/>
        <path d="M90 120 L310 120 Q316 330 212 410 L188 410 Q84 330 90 120 Z" fill="${fill}"/>
        <path d="M92 150 Q20 150 30 240 Q40 310 118 330" fill="none" stroke="${fill}" stroke-width="22" stroke-linecap="round"/>
        <path d="M308 150 Q380 150 370 240 Q360 310 282 330" fill="none" stroke="${fill}" stroke-width="22" stroke-linecap="round"/>
        <ellipse cx="200" cy="120" rx="110" ry="20" fill="${fill}"/>
        <rect x="112" y="205" width="176" height="14" rx="7" fill="rgba(255,255,255,0.35)"/>`;
    case 'premier': // taça com coroa no alto
      return `${base}<path d="M182 520 L218 520 L212 430 L188 430 Z" fill="${fill}"/>
        <path d="M110 170 L290 170 Q300 360 214 425 L186 425 Q100 360 110 170 Z" fill="${fill}"/>
        <path d="M112 200 Q60 210 70 280 Q80 330 132 350" fill="none" stroke="${fill}" stroke-width="16" stroke-linecap="round"/>
        <path d="M288 200 Q340 210 330 280 Q320 330 268 350" fill="none" stroke="${fill}" stroke-width="16" stroke-linecap="round"/>
        <path d="M130 170 L130 95 L165 130 L200 70 L235 130 L270 95 L270 170 Z" fill="${fill}"/>
        <circle cx="200" cy="62" r="12" fill="${fill}"/><circle cx="130" cy="88" r="9" fill="${fill}"/><circle cx="270" cy="88" r="9" fill="${fill}"/>`;
    case 'laliga': // taça larga e rasa, alças retas
      return `${base}<path d="M180 520 L220 520 L214 390 L186 390 Z" fill="${fill}"/>
        <path d="M70 170 L330 170 Q318 320 218 385 L182 385 Q82 320 70 170 Z" fill="${fill}"/>
        <path d="M70 185 L30 185 L30 250 L88 262" fill="none" stroke="${fill}" stroke-width="18" stroke-linejoin="round"/>
        <path d="M330 185 L370 185 L370 250 L312 262" fill="none" stroke="${fill}" stroke-width="18" stroke-linejoin="round"/>
        <ellipse cx="200" cy="170" rx="130" ry="22" fill="${fill}"/>`;
    case 'champions': // "orelhuda": vaso com alças grandes
      return `${base}<path d="M176 520 L224 520 L216 450 L184 450 Z" fill="${fill}"/>
        <path d="M130 90 L270 90 Q262 170 290 260 Q312 350 222 445 L178 445 Q88 350 110 260 Q138 170 130 90 Z" fill="${fill}"/>
        <path d="M128 110 Q0 90 20 260 Q34 380 140 380" fill="none" stroke="${fill}" stroke-width="20" stroke-linecap="round"/>
        <path d="M272 110 Q400 90 380 260 Q366 380 260 380" fill="none" stroke="${fill}" stroke-width="20" stroke-linecap="round"/>
        <ellipse cx="200" cy="90" rx="72" ry="14" fill="${fill}"/>`;
  }
  return '';
}

/** Bola clássica (gomos pretos), raio 100, centro (0,0). */
function bola() {
  const pent = (cx, cy, r, rot) => {
    const p = [];
    for (let i = 0; i < 5; i++) { const a = rot + (i * 2 * Math.PI) / 5 - Math.PI / 2; p.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`); }
    return `<polygon points="${p.join(' ')}" fill="#111827"/>`;
  };
  let gomos = pent(0, 0, 30, 0);
  for (let i = 0; i < 5; i++) { const a = (i * 2 * Math.PI) / 5 - Math.PI / 2; gomos += pent(Math.cos(a) * 82, Math.sin(a) * 82, 30, Math.PI / 5 + a); }
  let costuras = '';
  for (let i = 0; i < 5; i++) { const a = (i * 2 * Math.PI) / 5 - Math.PI / 2; costuras += `<line x1="${(Math.cos(a) * 30).toFixed(1)}" y1="${(Math.sin(a) * 30).toFixed(1)}" x2="${(Math.cos(a) * 60).toFixed(1)}" y2="${(Math.sin(a) * 60).toFixed(1)}" stroke="#374151" stroke-width="3"/>`; }
  return `<defs><radialGradient id="bolaG" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#e5e7eb"/><stop offset="1" stop-color="#6b7280"/></radialGradient>
    <clipPath id="bolaC"><circle r="100"/></clipPath><radialGradient id="bolaS" cx="0.3" cy="0.25" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient></defs>
    <circle r="100" fill="url(#bolaG)"/><g clip-path="url(#bolaC)">${gomos}${costuras}</g><circle r="100" fill="url(#bolaS)"/>`;
}

function refletor(x, y) {
  let luzes = '';
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) luzes += `<circle cx="${(x - 27 + j * 18).toFixed(0)}" cy="${(y - 12 + i * 14).toFixed(0)}" r="6" fill="#ffffff"/>`;
  return `<circle cx="${x}" cy="${y}" r="140" fill="url(#refl)"/>`;
}

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function svg(slug, t, W, H) {
  const r = rng(slug.length * 7919 + W);
  const vertical = H > W;
  const campoY = H * (vertical ? 0.78 : 0.7);
  // torcida desfocada (luzes)
  let torcida = '';
  for (let i = 0; i < (vertical ? 170 : 220); i++) {
    const x = r() * W, y = campoY - H * (0.02 + r() * 0.26), rad = 2 + r() * 6;
    torcida += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rad.toFixed(1)}" fill="${r() > 0.55 ? t.luz : '#ffffff'}" opacity="${(0.05 + r() * 0.22).toFixed(2)}"/>`;
  }
  // estrelas (Brasileirão: 5 no alto; Champions: anel de 8)
  let estrelas = '';
  const star = (cx, cy, s, cor, op) => {
    const p = [];
    for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2; const rr = i % 2 ? s * 0.45 : s; p.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`); }
    return `<polygon points="${p.join(' ')}" fill="${cor}" opacity="${op}"/>`;
  };
  // taça: à direita (horizontal) / no alto à direita (vertical)
  const th = vertical ? H * 0.34 : H * 0.78;
  const esc = th / 600;
  const tx = vertical ? W - 400 * esc - W * 0.02 : W - 400 * esc - W * 0.04;
  const ty = vertical ? H * 0.16 : H * 0.12;
  if (t.estrelas === 5) for (let i = 0; i < 5; i++) estrelas += star(tx + (80 + i * 60) * esc, ty - 10, 16 * Math.max(1, esc * 1.4), t.luz, 0.85);
  if (t.estrelas === 8) for (let i = 0; i < 8; i++) { const a = (i * 2 * Math.PI) / 8; estrelas += star(tx + 200 * esc + Math.cos(a) * 250 * esc, ty + 250 * esc + Math.sin(a) * 250 * esc, 14 * esc + 6, '#ffffff', 0.5); }
  // bola: canto inferior esquerdo
  const br = vertical ? W * 0.13 : H * 0.15;
  const bx = W * (vertical ? 0.16 : 0.1), by = H - br * 1.25;
  // gramado com faixas e linhas
  let faixas = '';
  for (let i = 0; i < 12; i++) {
    const x0 = (W / 12) * i - W * 0.25 + (W * 0.5 * i) / 12, x1 = x0 + W / 12 + W * 0.05;
    faixas += `<polygon points="${((W / 12) * i).toFixed(0)},${campoY.toFixed(0)} ${((W / 12) * (i + 1)).toFixed(0)},${campoY.toFixed(0)} ${x1.toFixed(0)},${H} ${x0.toFixed(0)},${H}" fill="#ffffff" opacity="${i % 2 ? 0.035 : 0}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.topo}"/><stop offset="0.6" stop-color="${t.meio}"/><stop offset="1" stop-color="${t.topo}"/></linearGradient>
    <radialGradient id="refl" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="1" stop-color="${t.luz}" stop-opacity="0"/></radialGradient>
    <linearGradient id="feixe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
    <linearGradient id="campo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.gramado[0]}"/><stop offset="1" stop-color="${t.gramado[1]}"/></linearGradient>
    <radialGradient id="brilhoTaca" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${t.luz}" stop-opacity="0.45"/><stop offset="1" stop-color="${t.luz}" stop-opacity="0"/></radialGradient>
    <linearGradient id="leitura" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="0.62" stop-color="#000" stop-opacity="0.35"/><stop offset="1" stop-color="#000" stop-opacity="0.05"/></linearGradient>
    ${metalDefs('metal', t.metal)}
    <filter id="desfoque"><feGaussianBlur stdDeviation="${vertical ? 3 : 4}"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#ceu)"/>
  ${refletor(W * 0.07, H * 0.06)}${refletor(W * 0.93, H * 0.06)}
  <polygon points="${W * 0.05},${H * 0.08} ${W * 0.09},${H * 0.06} ${W * 0.58},${campoY} ${W * 0.32},${campoY}" fill="url(#feixe)"/>
  <polygon points="${W * 0.91},${H * 0.06} ${W * 0.95},${H * 0.08} ${W * 0.68},${campoY} ${W * 0.42},${campoY}" fill="url(#feixe)"/>
  <path d="M0 ${campoY} L0 ${campoY - H * 0.2} Q${W / 2} ${campoY - H * 0.34} ${W} ${campoY - H * 0.2} L${W} ${campoY} Z" fill="#000" opacity="0.35"/>
  <g filter="url(#desfoque)">${torcida}</g>
  <rect x="0" y="${campoY}" width="${W}" height="${H - campoY}" fill="url(#campo)"/>
  ${faixas}
  <line x1="0" y1="${campoY + 2}" x2="${W}" y2="${campoY + 2}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="3"/>
  <ellipse cx="${W / 2}" cy="${campoY + (H - campoY) * 0.55}" rx="${W * 0.16}" ry="${(H - campoY) * 0.3}" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="3"/>
  <line x1="${W / 2}" y1="${campoY}" x2="${W / 2}" y2="${H}" stroke="#ffffff" stroke-opacity="0.18" stroke-width="3"/>
  <rect x="0" y="${H * 0.93}" width="${W}" height="${H * 0.07}" fill="${t.acento}" opacity="0.18"/>
  <ellipse cx="${tx + 200 * esc}" cy="${ty + 300 * esc}" rx="${330 * esc}" ry="${380 * esc}" fill="url(#brilhoTaca)"/>
  ${estrelas}
  <g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${esc.toFixed(4)})" opacity="0.92">${taca(t.taca, 'url(#metal)')}</g>
  <circle cx="${bx}" cy="${by}" r="${br * 1.6}" fill="url(#brilhoTaca)" opacity="0.6"/>
  <ellipse cx="${bx}" cy="${by + br * 0.95}" rx="${br * 1.05}" ry="${br * 0.18}" fill="#000" opacity="0.45"/>
  <g transform="translate(${bx.toFixed(1)} ${by.toFixed(1)}) scale(${(br / 100).toFixed(4)})">${bola()}</g>
  <rect width="${W}" height="${H}" fill="url(#leitura)"/>
</svg>`;
}

for (const [slug, t] of Object.entries(TEMAS)) {
  for (const [sufixo, W, H] of [['h', 1920, 1080], ['v', 1080, 1920]]) {
    const arq = `${OUT}/${slug}-${sufixo}.jpg`;
    await sharp(Buffer.from(svg(slug, t, W, H))).jpeg({ quality: 82, progressive: true, mozjpeg: true }).toFile(arq);
    console.log(arq, fs.statSync(arq).size);
  }
}
