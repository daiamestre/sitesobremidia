/**
 * F-253 — REGRA DO DONO: nenhum recorte com defeito chega ao cliente. Depois de tirar o fundo, o sistema olha o resultado contra a
 * foto original, conserta o que dá e reprova o resto. Tudo aqui é conta sobre pixels (RGBA, foto e recorte do mesmo tamanho):
 * - `repararMordidas`: o recorte comeu parte do produto onde a foto não tem borda de verdade (embalagem branca em fundo branco);
 * - `acabamento`: contorno limpo e suave, sem halo da cor do fundo;
 * - `inspecionar`: foto com o produto cortado, contorno rasgado, pedaço do produto levado junto, sobrou pouco ou nada saiu.
 */

export type Rgba = Uint8ClampedArray | Uint8Array;
export type Defeito = 'foto-cortada' | 'contorno-irregular' | 'produto-mordido' | 'sobrou-pouco' | 'nao-tirou-fundo';

export interface Inspecao {
  aprovado: boolean;
  defeitos: Defeito[];
  /** fração da foto ocupada pelo produto; maior fração de um lado da foto colada no produto; contorno que foge do traçado suave */
  medidas: { fracao: number; bordaColada: number; rugosidade: number; comido: number };
}

/** Até aqui de diferença (soma de R+G+B) dos dois lados do contorno, a foto não mostra borda nenhuma: é o ruído do JPEG. */
const SEM_BORDA = 30;
/** Limites calibrados com as embalagens do catálogo (lisas, sacos amassados, garrafas) contra os recortes rasgados. */
export const LIMITES = { fracaoMin: 0.03, fracaoMax: 0.995, bordaColada: 0.3, rugosidade: 0.16, comido: 0.03 };
/** Parte solta menor que isto (fração da maior) não é outro produto: é etiqueta, sujeira ou um pedaço do fundo. */
const ILHA = 0.25;

export const MENSAGEM_DO_DEFEITO: Record<Defeito, string> = {
  'foto-cortada': 'o produto está cortado nas bordas da foto',
  'contorno-irregular': 'o contorno do produto ficou irregular',
  'produto-mordido': 'o recorte levou um pedaço do produto',
  'sobrou-pouco': 'o produto quase não aparece na foto',
  'nao-tirou-fundo': 'não foi possível separar o produto do fundo',
};

function cheios(recorte: Rgba, w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = recorte[i * 4 + 3] >= 128 ? 1 : 0;
  return m;
}

/** Numera as partes ligadas de `marca`. `areas[n]` é o tamanho da parte n (a parte 0 não existe). */
function partes(marca: Uint8Array, w: number): { rotulo: Int32Array; areas: number[] } {
  const n = marca.length;
  const rotulo = new Int32Array(n);
  const pilha = new Int32Array(n);
  const areas = [0];
  for (let i = 0; i < n; i++) {
    if (!marca[i] || rotulo[i]) continue;
    const id = areas.length;
    let area = 0, topo = 0;
    pilha[topo++] = i;
    rotulo[i] = id;
    while (topo) {
      const p = pilha[--topo];
      area++;
      const x = p % w;
      if (x > 0 && marca[p - 1] && !rotulo[p - 1]) { rotulo[p - 1] = id; pilha[topo++] = p - 1; }
      if (x < w - 1 && marca[p + 1] && !rotulo[p + 1]) { rotulo[p + 1] = id; pilha[topo++] = p + 1; }
      if (p >= w && marca[p - w] && !rotulo[p - w]) { rotulo[p - w] = id; pilha[topo++] = p - w; }
      if (p < n - w && marca[p + w] && !rotulo[p + w]) { rotulo[p + w] = id; pilha[topo++] = p + w; }
    }
    areas.push(area);
  }
  return { rotulo, areas };
}

/** Fecho convexo do produto, preenchido: o desenho de um elástico esticado em volta dele. */
function casco(marca: Uint8Array, w: number, h: number): Uint8Array {
  const pontos: Array<[number, number]> = [];
  for (let y = 0; y < h; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < w; x++) if (marca[y * w + x]) { if (a < 0) a = x; b = x; }
    if (a >= 0) { pontos.push([a, y]); if (b !== a) pontos.push([b, y]); }
  }
  const saida = new Uint8Array(w * h);
  if (pontos.length < 3) return saida;
  pontos.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const giro = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const meia = (lista: Array<[number, number]>) => {
    const c: Array<[number, number]> = [];
    for (const p of lista) {
      while (c.length >= 2 && giro(c[c.length - 2], c[c.length - 1], p) <= 0) c.pop();
      c.push(p);
    }
    c.pop();
    return c;
  };
  const poligono = [...meia(pontos), ...meia([...pontos].reverse())];
  const min = new Int32Array(h).fill(w), max = new Int32Array(h).fill(-1);
  for (let i = 0; i < poligono.length; i++) {
    const [x0, y0] = poligono[i], [x1, y1] = poligono[(i + 1) % poligono.length];
    const passos = Math.max(1, Math.abs(y1 - y0));
    for (let s = 0; s <= passos; s++) {
      const y = Math.round(y0 + ((y1 - y0) * s) / passos), x = x0 + ((x1 - x0) * s) / passos;
      if (Math.floor(x) < min[y]) min[y] = Math.floor(x);
      if (Math.ceil(x) > max[y]) max[y] = Math.ceil(x);
    }
  }
  for (let y = 0; y < h; y++) for (let x = Math.max(0, min[y]); x <= Math.min(w - 1, max[y]); x++) saida[y * w + x] = 1;
  return saida;
}

/**
 * Tira a sujeira solta do fundo e devolve o pedaço do produto que o recorte comeu (altera a transparência de `recorte`).
 * A prova da mordida é a própria foto: dos dois lados do contorno a cor é a mesma, ou seja, ali não existe borda de verdade.
 * Reentrância com borda real (o pescoço da garrafa) fica como está. Furo cercado de produto por todos os lados também volta (a janela
 * do pacote de feijão), a não ser que mostre o próprio fundo da foto: aí é vazio de verdade (a alça do galão). Devolve quantos voltaram.
 */
export function repararMordidas(foto: Rgba, recorte: Rgba, w: number, h: number, passada = 1): number {
  const marca = cheios(recorte, w, h);
  const { rotulo, areas } = partes(marca, w);
  const maior = areas.reduce((a, b) => Math.max(a, b), 0);
  if (!maior) return 0;
  for (let i = 0; i < marca.length; i++) {
    if (marca[i] && areas[rotulo[i]] < maior * ILHA) { marca[i] = 0; recorte[i * 4 + 3] = 0; }
  }

  const fecho = casco(marca, w, h);
  const falta = new Uint8Array(w * h);
  let areaDoFecho = 0;
  for (let i = 0; i < falta.length; i++) { areaDoFecho += fecho[i]; falta[i] = fecho[i] && !marca[i] ? 1 : 0; }
  const buracos = partes(falta, w);
  const contorno = new Int32Array(buracos.areas.length), semBorda = new Int32Array(buracos.areas.length);
  const aberto = new Uint8Array(buracos.areas.length), soma = new Float64Array(buracos.areas.length * 3);
  const fundo = [0, 0, 0];
  let nFundo = 0;
  for (let p = 0; p < falta.length; p++) {
    if (!fecho[p]) { for (let c = 0; c < 3; c++) fundo[c] += foto[p * 4 + c]; nFundo++; }
    const id = buracos.rotulo[p];
    if (!id) continue;
    for (let c = 0; c < 3; c++) soma[id * 3 + c] += foto[p * 4 + c];
    const x = p % w;
    if (x === 0 || x === w - 1 || p < w || p >= falta.length - w || !fecho[p - 1] || !fecho[p + 1] || !fecho[p - w] || !fecho[p + w]) aberto[id] = 1;
  }
  const passos = [1, -1, w, -w];
  for (let p = 0; p < falta.length; p++) {
    const id = buracos.rotulo[p];
    if (!id) continue;
    for (const d of passos) {
      const a = p + 3 * d, b = p - 2 * d;
      if (a < 0 || b < 0 || a >= falta.length || b >= falta.length) continue;
      if (Math.abs(d) === 1 && (Math.floor(a / w) !== Math.floor(p / w) || Math.floor(b / w) !== Math.floor(p / w))) continue;
      if (!marca[p + d] || !marca[a] || marca[b]) continue;
      contorno[id]++;
      const dif = Math.abs(foto[a * 4] - foto[b * 4]) + Math.abs(foto[a * 4 + 1] - foto[b * 4 + 1]) + Math.abs(foto[a * 4 + 2] - foto[b * 4 + 2]);
      if (dif <= SEM_BORDA) semBorda[id]++;
    }
  }
  let reparadas = 0;
  const volta = new Uint8Array(buracos.areas.length);
  for (let id = 1; id < buracos.areas.length; id++) {
    const area = buracos.areas[id];
    if (!aberto[id] && nFundo && area >= areaDoFecho * 0.002 && area <= areaDoFecho * 0.25) {
      let dif = 0;
      for (let c = 0; c < 3; c++) dif += Math.abs(soma[id * 3 + c] / area - fundo[c] / nFundo);
      if (dif > 60) { volta[id] = 1; reparadas++; continue; }
    }
    // pedaço grande precisa de prova firme; fresta fina que sobrou entre dois pedaços (um risco no meio do produto) precisa de menos
    const fresta = area < areaDoFecho * 0.002;
    if (contorno[id] < (fresta ? 3 : 12) || area > areaDoFecho * 0.12 || (!fresta && area < areaDoFecho * 0.0005)) continue;
    if (semBorda[id] / contorno[id] >= (fresta ? 0.5 : 0.75)) { volta[id] = 1; reparadas++; }
  }
  if (reparadas) for (let p = 0; p < falta.length; p++) if (volta[buracos.rotulo[p]]) recorte[p * 4 + 3] = 255;
  const total = reparadas + (reparadas && passada < 3 ? repararMordidas(foto, recorte, w, h, passada + 1) : 0);
  // a emenda entre o produto e o pedaço que voltou não pode ficar como um risco
  if (passada === 1 && total) {
    const v = new Float32Array(w * h);
    for (let i = 0; i < v.length; i++) v[i] = recorte[i * 4 + 3] >= 128 ? 1 : 0;
    const crescido = borrar(v, w, h, 1);
    for (let i = 0; i < v.length; i++) v[i] = crescido[i] > 0.001 ? 1 : 0;
    const fechado = borrar(v, w, h, 1);
    for (let i = 0; i < v.length; i++) if (fechado[i] > 0.999) recorte[i * 4 + 3] = 255;
  }
  return total;
}

/** Média em caixa (duas passadas por eixo): base da suavização do contorno e da conta de rugosidade. */
function borrar(v: Float32Array, w: number, h: number, r: number): Float32Array {
  const a = new Float32Array(v), b = new Float32Array(v.length);
  const t = 2 * r + 1;
  for (let vez = 0; vez < 2; vez++) {
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[y * w + x] = s / t;
        s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / t;
        s += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

/**
 * Acabamento profissional (altera `recorte`): contorno suave, recolhido um pouco para dentro para não sobrar fio do fundo,
 * e a cor da beirada vem do miolo do produto, nunca do fundo: é isso que tira o halo branco.
 */
export function acabamento(foto: Rgba, recorte: Rgba, w: number, h: number): void {
  const n = w * h;
  const r = Math.max(1, Math.round(Math.max(w, h) / 1000));
  const bruto = new Float32Array(n);
  for (let i = 0; i < n; i++) bruto[i] = recorte[i * 4 + 3];
  const liso = borrar(bruto, w, h, r);
  const alfa = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) alfa[i] = ((liso[i] - 140) / 90) * 255;

  // miolo: o que está a mais de alguns pontos do contorno
  let miolo = new Uint8Array(n);
  for (let i = 0; i < n; i++) miolo[i] = alfa[i] === 255 ? 1 : 0;
  const vizinhos = (i: number) => {
    const x = i % w, l: number[] = [];
    if (x > 0) l.push(i - 1);
    if (x < w - 1) l.push(i + 1);
    if (i >= w) l.push(i - w);
    if (i < n - w) l.push(i + w);
    return l;
  };
  for (let vez = 0; vez <= r; vez++) {
    const prox = new Uint8Array(miolo);
    for (let i = 0; i < n; i++) if (miolo[i] && vizinhos(i).some((j) => !miolo[j])) prox[i] = 0;
    miolo = prox;
  }

  for (let i = 0; i < n; i++) {
    recorte[i * 4] = foto[i * 4];
    recorte[i * 4 + 1] = foto[i * 4 + 1];
    recorte[i * 4 + 2] = foto[i * 4 + 2];
    recorte[i * 4 + 3] = alfa[i];
  }
  // a cor do miolo avança até a beirada, uma camada por vez
  for (let vez = 0; vez < r + 6; vez++) {
    const proxima: number[] = [];
    for (let i = 0; i < n; i++) {
      if (miolo[i] || !alfa[i]) continue;
      const v = vizinhos(i).filter((j) => miolo[j]);
      if (!v.length) continue;
      for (let c = 0; c < 3; c++) recorte[i * 4 + c] = v.reduce((s, j) => s + recorte[j * 4 + c], 0) / v.length;
      proxima.push(i);
    }
    if (!proxima.length) break;
    for (const i of proxima) miolo[i] = 1;
  }
  for (let i = 0; i < n; i++) if (!alfa[i]) { recorte[i * 4] = 0; recorte[i * 4 + 1] = 0; recorte[i * 4 + 2] = 0; }
}

/**
 * Nitidez fiel (altera `rgba`): realça as bordas do que já está na foto, sem inventar detalhe nenhum. Ampliação por IA foi testada
 * e recusada (F-253): ela apaga letra pequena e deforma rosto de embalagem.
 */
export function realcar(rgba: Rgba, w: number, h: number, forca: number): void {
  const n = w * h;
  for (let c = 0; c < 3; c++) {
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) v[i] = rgba[i * 4 + c];
    const liso = borrar(v, w, h, 1);
    for (let i = 0; i < n; i++) if (rgba[i * 4 + 3]) rgba[i * 4 + c] = Math.max(0, Math.min(255, Math.round(v[i] + (v[i] - liso[i]) * forca)));
  }
}

/**
 * Quanto do produto o recorte levou junto. Olha o que foi removido por dentro do fecho: ao lado do gargalo da garrafa o que saiu é o
 * fundo da foto; num rasgo, o que saiu não se parece com o fundo. Medido em 28 fotos do catálogo: o bom fica perto de 0,01; o rasgo, de 0,03 a 0,39.
 */
function pedacoComido(foto: Rgba, marca: Uint8Array, w: number, h: number): number {
  const fecho = casco(marca, w, h);
  const canais: number[][] = [[], [], []];
  let vistos = 0, area = 0;
  for (let i = 0; i < marca.length; i++) {
    area += fecho[i];
    if (!fecho[i] && vistos++ % 7 === 0) for (let c = 0; c < 3; c++) canais[c].push(foto[i * 4 + c]);
  }
  if (!area || !canais[0].length) return 0;
  const fundo = canais.map((v) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]);
  let comido = 0;
  for (let i = 0; i < marca.length; i++) {
    if (!fecho[i] || marca[i]) continue;
    if (Math.abs(foto[i * 4] - fundo[0]) + Math.abs(foto[i * 4 + 1] - fundo[1]) + Math.abs(foto[i * 4 + 2] - fundo[2]) >= 60) comido++;
  }
  return comido / area;
}

/** Dá nota ao recorte, ANTES de entregar. `recorte` no tamanho da foto, sem cortar as sobras: a borda da foto importa. */
export function inspecionar(recorte: Rgba, w: number, h: number, foto?: Rgba): Inspecao {
  const marca = cheios(recorte, w, h);
  let area = 0;
  for (let i = 0; i < marca.length; i++) area += marca[i];
  const fracao = area / (w * h);

  let cima = 0, baixo = 0, esq = 0, dir = 0;
  for (let x = 0; x < w; x++) { cima += marca[x]; baixo += marca[(h - 1) * w + x]; }
  for (let y = 0; y < h; y++) { esq += marca[y * w]; dir += marca[y * w + w - 1]; }
  const bordaColada = Math.max(cima / w, baixo / w, esq / h, dir / h);

  // contorno que foge do traçado suave: rasgado e serrilhado dão muito; embalagem lisa, quase nada
  const r = Math.max(2, Math.round(Math.min(w, h) * 0.012));
  const f = new Float32Array(marca.length);
  for (let i = 0; i < marca.length; i++) f[i] = marca[i];
  const liso = borrar(f, w, h, r);
  let foge = 0, perimetro = 0;
  for (let i = 0; i < marca.length; i++) {
    if ((liso[i] >= 0.5 ? 1 : 0) !== marca[i]) foge++;
    if (marca[i] && (i % w === 0 || !marca[i - 1] || (i + 1) % w === 0 || !marca[i + 1] || i < w || !marca[i - w] || i >= marca.length - w || !marca[i + w])) perimetro++;
  }
  const rugosidade = perimetro ? foge / (perimetro * r) : 0;

  const comido = foto ? pedacoComido(foto, marca, w, h) : 0;

  const defeitos: Defeito[] = [];
  if (comido >= LIMITES.comido) defeitos.push('produto-mordido');
  if (fracao < LIMITES.fracaoMin) defeitos.push('sobrou-pouco');
  if (fracao > LIMITES.fracaoMax) defeitos.push('nao-tirou-fundo');
  if (bordaColada >= LIMITES.bordaColada) defeitos.push('foto-cortada');
  if (rugosidade >= LIMITES.rugosidade) defeitos.push('contorno-irregular');
  return { aprovado: !defeitos.length, defeitos, medidas: { fracao, bordaColada, rugosidade, comido } };
}
