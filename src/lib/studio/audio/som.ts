// SOBRE MÍDIA STUDIO — EDITOR DE ÁUDIO (pedido do dono, 18/11/2026; só owner/ADM).
// O som "cru" do editor: amostras em Float32 por canal. Tudo aqui é função PURA (sem Web Audio), para rodar nos testes e em
// qualquer navegador: recortar, juntar, volume, normalizar, fades, inverter, mono, porta de ruído, aparar silêncio,
// mudar velocidade (com e sem mudar o tom, por WSOLA) e mudar o tom sem mudar a duração.

export interface Som { sr: number; canais: Float32Array[] }

export const dbParaGanho = (db: number) => Math.pow(10, db / 20);
export const ganhoParaDb = (g: number) => (g <= 0 ? -Infinity : 20 * Math.log10(g));
export const amostras = (s: Som) => s.canais[0]?.length ?? 0;
export const duracaoDoSom = (s: Som) => amostras(s) / s.sr;

export function somVazio(sr: number, n: number, canais = 2): Som {
  return { sr, canais: Array.from({ length: canais }, () => new Float32Array(Math.max(0, Math.round(n)))) };
}
export const silencio = (sr: number, seg: number, canais = 2) => somVazio(sr, seg * sr, canais);
export const copiarSom = (s: Som): Som => ({ sr: s.sr, canais: s.canais.map((c) => c.slice()) });

/** o som com N canais (mono vira estéreo repetindo; estéreo vira mono pela média) */
export function igualarCanais(s: Som, n: number): Som {
  if (s.canais.length === n) return s;
  if (n === 1) return paraMono(s);
  return { sr: s.sr, canais: Array.from({ length: n }, (_, i) => (s.canais[i] ?? s.canais[0]).slice()) };
}

/** o trecho [ini, fim) em segundos */
export function recortar(s: Som, ini: number, fim: number): Som {
  const a = Math.max(0, Math.min(amostras(s), Math.round(ini * s.sr))), b = Math.max(a, Math.min(amostras(s), Math.round(fim * s.sr)));
  return { sr: s.sr, canais: s.canais.map((c) => c.slice(a, b)) };
}

/** um som depois do outro (o 2º é convertido para os canais do 1º; mesma taxa) */
export function juntar(a: Som, b: Som): Som {
  const bb = igualarCanais(b, a.canais.length);
  return { sr: a.sr, canais: a.canais.map((c, i) => { const o = new Float32Array(c.length + bb.canais[i].length); o.set(c); o.set(bb.canais[i], c.length); return o; }) };
}

export const mapear = (s: Som, f: (v: number, i: number, n: number, canal: number) => number): Som =>
  ({ sr: s.sr, canais: s.canais.map((c, k) => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = f(c[i], i, c.length, k); return o; }) });

export function pico(s: Som): number { let m = 0; for (const c of s.canais) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > m) m = v; } return m; }
export function rms(s: Som): number { let t = 0, n = 0; for (const c of s.canais) { for (let i = 0; i < c.length; i++) t += c[i] * c[i]; n += c.length; } return n ? Math.sqrt(t / n) : 0; }

export const volume = (s: Som, db: number) => { const g = dbParaGanho(db); return mapear(s, (v) => v * g); };
export function normalizar(s: Som, alvoDb = -1): Som { const p = pico(s); if (p < 1e-9) return copiarSom(s); const g = dbParaGanho(alvoDb) / p; return mapear(s, (v) => v * g); }
export const silenciar = (s: Som) => mapear(s, () => 0);
export const deTrasParaFrente = (s: Som): Som => ({ sr: s.sr, canais: s.canais.map((c) => c.slice().reverse()) });
export const inverterFase = (s: Som) => mapear(s, (v) => -v);
export const trocarCanais = (s: Som): Som => (s.canais.length < 2 ? copiarSom(s) : { sr: s.sr, canais: [s.canais[1].slice(), s.canais[0].slice(), ...s.canais.slice(2).map((c) => c.slice())] });
export function paraMono(s: Som): Som {
  const n = amostras(s), o = new Float32Array(n);
  for (const c of s.canais) for (let i = 0; i < n; i++) o[i] += c[i] / s.canais.length;
  return { sr: s.sr, canais: [o] };
}
/** tira a componente contínua (o som "deslocado" do zero) */
export const tirarDC = (s: Som): Som => ({ sr: s.sr, canais: s.canais.map((c) => { let m = 0; for (let i = 0; i < c.length; i++) m += c[i]; m /= c.length || 1; return c.map((v) => v - m); }) });

export type CurvaDeFade = 'linear' | 'exponencial' | 'logaritmica' | 'suave';
export function curva(x: number, tipo: CurvaDeFade): number {
  const t = Math.max(0, Math.min(1, x));
  if (tipo === 'exponencial') return t * t * t;
  if (tipo === 'logaritmica') return 1 - Math.pow(1 - t, 3);
  if (tipo === 'suave') return 0.5 - 0.5 * Math.cos(Math.PI * t);
  return t;
}
/** fade em todo o som (entrada: do silêncio ao volume; saída: do volume ao silêncio) */
export const fade = (s: Som, tipo: 'entrada' | 'saida', forma: CurvaDeFade = 'linear') =>
  mapear(s, (v, i, n) => { const x = n <= 1 ? 1 : i / (n - 1); return v * curva(tipo === 'entrada' ? x : 1 - x, forma); });

/** porta de ruído: abaixa (reducaoDb) tudo o que fica abaixo do limiar, com ataque e liberação suaves */
export function portaDeRuido(s: Som, limiarDb = -45, reducaoDb = -40, ataqueMs = 5, liberarMs = 120): Som {
  const lim = dbParaGanho(limiarDb), piso = dbParaGanho(reducaoDb), n = amostras(s);
  const aEnv = Math.exp(-1 / (0.002 * s.sr)), rEnv = Math.exp(-1 / (0.05 * s.sr));
  const aG = 1 - Math.exp(-1 / Math.max(1, (ataqueMs / 1000) * s.sr)), rG = 1 - Math.exp(-1 / Math.max(1, (liberarMs / 1000) * s.sr));
  const ganhos = new Float32Array(n); let env = 0, g = piso; // começa fechada (abre em ms se o som começar alto)
  for (let i = 0; i < n; i++) {
    let x = 0; for (const c of s.canais) x = Math.max(x, Math.abs(c[i]));
    env = x > env ? aEnv * env + (1 - aEnv) * x : rEnv * env + (1 - rEnv) * x;
    const alvo = env >= lim ? 1 : piso;
    g += (alvo - g) * (alvo > g ? aG : rG); ganhos[i] = g;
  }
  return mapear(s, (v, i) => v * ganhos[i]);
}

/** tira o silêncio do começo e do fim (abaixo do limiar), deixando uma folga */
export function aparaSilencio(s: Som, limiarDb = -50, folgaMs = 30): Som {
  const lim = dbParaGanho(limiarDb), n = amostras(s);
  const alto = (i: number) => s.canais.some((c) => Math.abs(c[i]) > lim);
  let a = 0; while (a < n && !alto(a)) a++;
  let b = n - 1; while (b > a && !alto(b)) b--;
  if (a >= n) return { sr: s.sr, canais: s.canais.map(() => new Float32Array(0)) };
  const f = Math.round((folgaMs / 1000) * s.sr);
  return { sr: s.sr, canais: s.canais.map((c) => c.slice(Math.max(0, a - f), Math.min(n, b + 1 + f))) };
}

/** muda a velocidade E o tom juntos (como girar o disco mais rápido): fator 2 = metade da duração, uma oitava acima */
export function reamostrar(s: Som, fator: number): Som {
  const n = amostras(s), m = Math.max(1, Math.round(n / fator));
  return {
    sr: s.sr,
    canais: s.canais.map((c) => {
      const o = new Float32Array(m);
      for (let j = 0; j < m; j++) {
        const x = j * fator, i = Math.floor(x), t = x - i;
        const y0 = c[Math.max(0, i - 1)] ?? 0, y1 = c[i] ?? 0, y2 = c[i + 1] ?? y1, y3 = c[i + 2] ?? y2;
        // interpolação cúbica (Catmull-Rom): sem o chiado da linear
        o[j] = y1 + 0.5 * t * (y2 - y0 + t * (2 * y0 - 5 * y1 + 4 * y2 - y3 + t * (3 * (y1 - y2) + y3 - y0)));
      }
      return o;
    }),
  };
}

/**
 * Estica ou encolhe o TEMPO sem mudar o tom (WSOLA: pedaços de 40 ms costurados onde a onda casa melhor).
 * fator 2 = o dobro da duração; 0,5 = metade.
 */
export function esticarTempo(s: Som, fator: number): Som {
  const n = amostras(s); if (n < 16 || Math.abs(fator - 1) < 1e-3) return copiarSom(s);
  const N = Math.max(256, Math.round(s.sr * 0.04)) & ~1, Hs = N / 2, Ha = Hs / fator, tol = Math.round(s.sr * 0.012);
  const m = Math.round(n * fator), saida = s.canais.map(() => new Float32Array(m + N)), soma = new Float32Array(m + N);
  const jan = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const mono = new Float32Array(n); for (const c of s.canais) for (let i = 0; i < n; i++) mono[i] += c[i];
  let anterior = 0; // onde o pedaço anterior começou no original
  for (let k = 0; k * Hs < m; k++) {
    const ideal = Math.round(k * Ha);
    let melhor = ideal;
    if (k > 0) {
      const natural = anterior + Hs; // o que viria naturalmente depois do pedaço anterior
      let mc = -Infinity;
      for (let d = -tol; d <= tol; d += 2) {
        const p = ideal + d; if (p < 0 || p + Hs >= n) continue;
        let c = 0; for (let i = 0; i < Hs; i += 4) { const q = natural + i; if (q >= n) break; c += mono[p + i] * mono[q]; }
        if (c > mc) { mc = c; melhor = p; }
      }
    }
    melhor = Math.max(0, Math.min(n - 1, melhor)); anterior = melhor;
    const o = k * Hs;
    for (let i = 0; i < N; i++) {
      const src = melhor + i; if (src >= n || o + i >= m + N) break;
      soma[o + i] += jan[i];
      for (let ch = 0; ch < s.canais.length; ch++) saida[ch][o + i] += s.canais[ch][src] * jan[i];
    }
  }
  return { sr: s.sr, canais: saida.map((c) => { const r = new Float32Array(m); for (let i = 0; i < m; i++) r[i] = soma[i] > 1e-3 ? c[i] / soma[i] : c[i]; return r; }) };
}

/** muda o tom em semitons sem mudar a duração */
export function mudarTom(s: Som, semitons: number): Som {
  if (Math.abs(semitons) < 1e-3) return copiarSom(s);
  const r = Math.pow(2, semitons / 12), n = amostras(s);
  const out = reamostrar(esticarTempo(s, r), r);
  // acerta o tamanho exato do original
  return { sr: s.sr, canais: out.canais.map((c) => { const o = new Float32Array(n); o.set(c.subarray(0, n)); return o; }) };
}

/** velocidade em % (200 = o dobro da velocidade); manterTom = sem ficar "voz de esquilo" */
export const mudarVelocidade = (s: Som, porcento: number, manterTom: boolean) =>
  (manterTom ? esticarTempo(s, 100 / porcento) : reamostrar(s, porcento / 100));

/** gera um tom (para testes, bipe de censura e "marcação") */
export function gerarTom(sr: number, seg: number, freq: number, forma: 'seno' | 'quadrada' | 'serra' = 'seno', amp = 0.5, canais = 2): Som {
  const n = Math.round(sr * seg), c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const f = (i * freq) / sr, x = f - Math.floor(f);
    c[i] = amp * (forma === 'seno' ? Math.sin(2 * Math.PI * f) : forma === 'quadrada' ? (x < 0.5 ? 1 : -1) : 2 * x - 1);
  }
  return { sr, canais: Array.from({ length: canais }, () => c.slice()) };
}
export function gerarRuido(sr: number, seg: number, amp = 0.2, canais = 2): Som {
  return { sr, canais: Array.from({ length: canais }, () => Float32Array.from({ length: Math.round(sr * seg) }, () => (Math.random() * 2 - 1) * amp)) };
}

/** os picos (mín/máx por bloco) para desenhar a onda rápido em qualquer zoom */
export interface Picos { bloco: number; min: Float32Array; max: Float32Array }
export function calcularPicos(s: Som, bloco = 128): Picos {
  const n = amostras(s), nb = Math.ceil(n / bloco), mn = new Float32Array(nb), mx = new Float32Array(nb);
  for (let b = 0; b < nb; b++) {
    let lo = 0, hi = 0; const a = b * bloco, z = Math.min(n, a + bloco);
    for (const c of s.canais) for (let i = a; i < z; i++) { const v = c[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    mn[b] = lo; mx[b] = hi;
  }
  return { bloco, min: mn, max: mx };
}
