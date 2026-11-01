// SOBRE MÍDIA STUDIO — EDITOR DE VÍDEO (F-232): as ferramentas de edição no estilo DaVinci Resolve, sem tela.
// LÂMINA (corta qualquer clipe, texto ou áudio no ponto clicado), arrastar o clipe para outra posição da faixa,
// ÍMÃ (encaixa nas pontas dos clipes e no cursor) e o TIMECODE hh:mm:ss:qq (30 quadros por segundo).
import { dividir, duracaoDoClipe, duracaoTotal, idNovo, inicios, type FaixaDeAudio, type ProjetoDeVideo } from './linha';

export type Ferramenta = 'selecao' | 'lamina';
export type Alvo = { tipo: 'clipe' | 'sob' | 'audio'; id: string };

export const QUADROS_POR_SEGUNDO = 30;
const MARGEM_DE_CORTE = 0.15;

/** 00:00:04:12 — horas, minutos, segundos e quadro (30 qps), como no DaVinci. */
export function timecode(s: number): string {
  const q = Math.round(Math.max(0, s) * QUADROS_POR_SEGUNDO);
  const quadro = q % QUADROS_POR_SEGUNDO;
  const tot = Math.floor(q / QUADROS_POR_SEGUNDO);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(tot / 3600))}:${p(Math.floor(tot / 60) % 60)}:${p(tot % 60)}:${p(quadro)}`;
}

/** Um quadro para a frente ou para trás (setas do teclado). */
export const umQuadro = (t: number, sentido: 1 | -1) => Math.max(0, Math.round(t * QUADROS_POR_SEGUNDO + sentido) / QUADROS_POR_SEGUNDO);

/** Quanto um trecho de áudio ocupa na linha do tempo (repetindo, vai até o fim do vídeo). */
export function duracaoDoAudio(a: FaixaDeAudio, total: number): number {
  const trecho = Math.max(0.1, a.fim - a.inicio);
  return a.repetir ? Math.max(trecho, total - a.em) : trecho;
}

/**
 * LÂMINA: corta o item no instante `t` da linha do tempo e devolve o projeto com as duas partes (ou null se o ponto
 * está fora do item ou colado numa ponta). A 2ª parte ganha id novo e fica escolhida.
 */
export function cortarEm(p: ProjetoDeVideo, alvo: Alvo, t: number): { projeto: ProjetoDeVideo; novoId: string } | null {
  if (alvo.tipo === 'clipe') {
    const i = p.clipes.findIndex((c) => c.id === alvo.id);
    if (i < 0) return null;
    const local = t - inicios(p.clipes)[i];
    const partes = dividir(p.clipes[i], local);
    if (!partes) return null;
    const clipes = [...p.clipes];
    clipes.splice(i, 1, ...partes);
    return { projeto: { ...p, clipes }, novoId: partes[1].id };
  }
  if (alvo.tipo === 'sob') {
    const s = p.sobreposicoes.find((x) => x.id === alvo.id);
    if (!s || t <= s.de + MARGEM_DE_CORTE || t >= s.ate - MARGEM_DE_CORTE) return null;
    const segunda = { ...s, id: idNovo('s'), de: t };
    return { projeto: { ...p, sobreposicoes: p.sobreposicoes.flatMap((x) => (x.id === s.id ? [{ ...x, ate: t }, segunda] : [x])) }, novoId: segunda.id };
  }
  const a = p.audios.find((x) => x.id === alvo.id);
  if (!a) return null;
  const off = t - a.em;
  const trecho = a.fim - a.inicio;
  if (off <= MARGEM_DE_CORTE || off >= trecho - MARGEM_DE_CORTE) return null;
  const segunda: FaixaDeAudio = { ...a, id: idNovo('a'), em: t, inicio: a.inicio + off, somEntra: 0, repetir: false };
  return { projeto: { ...p, audios: p.audios.flatMap((x) => (x.id === a.id ? [{ ...x, fim: a.inicio + off, somSai: 0, repetir: false }, segunda] : [x])) }, novoId: segunda.id };
}

/**
 * Arrastar um clipe na faixa de vídeo: ele vai para a posição em que o MEIO dele caiu (os outros se ajeitam, sem buracos).
 * `inicioNovo` = onde o começo do clipe foi solto (s).
 */
export function moverClipePara(p: ProjetoDeVideo, id: string, inicioNovo: number): ProjetoDeVideo {
  const i = p.clipes.findIndex((c) => c.id === id);
  if (i < 0) return p;
  const c = p.clipes[i];
  const meio = inicioNovo + duracaoDoClipe(c) / 2;
  const resto = p.clipes.filter((x) => x.id !== id);
  const ini = inicios(resto);
  let j = resto.findIndex((x, k) => meio < ini[k] + duracaoDoClipe(x) / 2);
  if (j < 0) j = resto.length;
  if (j === i) return p;
  const clipes = [...resto];
  clipes.splice(j, 0, c);
  return { ...p, clipes };
}

/** Pontos onde o ÍMÃ puxa: começo e fim de cada clipe, texto e áudio, e o cursor. */
export function pontosDeEncaixe(p: ProjetoDeVideo, cursor: number, ignorar?: string): number[] {
  const total = duracaoTotal(p);
  const ini = inicios(p.clipes);
  const pts = new Set<number>([0, cursor]);
  p.clipes.forEach((c, i) => { pts.add(ini[i]); pts.add(ini[i] + duracaoDoClipe(c)); });
  p.sobreposicoes.forEach((s) => { if (s.id !== ignorar) { pts.add(s.de); pts.add(s.ate); } });
  p.audios.forEach((a) => { if (a.id !== ignorar) { pts.add(a.em); pts.add(a.em + duracaoDoAudio(a, total)); } });
  return [...pts];
}

/** Encaixa `t` no ponto mais perto se estiver a menos de `tolerancia` segundos. */
export function encaixar(t: number, pontos: number[], tolerancia: number): number {
  let melhor = t;
  let dist = tolerancia;
  for (const x of pontos) { const d = Math.abs(x - t); if (d < dist) { dist = d; melhor = x; } }
  return melhor;
}

/** Ondas do áudio (picos 0..1) para desenhar na faixa — calculadas uma vez por arquivo. */
const ondas = new Map<string, Promise<Float32Array | null>>();
export function ondaDoAudio(src: string, pontos = 1200): Promise<Float32Array | null> {
  let p = ondas.get(src);
  if (!p) {
    p = (async () => {
      try {
        const bytes = await (await fetch(src)).arrayBuffer();
        const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        const ctx = new Ctx();
        const buf = await ctx.decodeAudioData(bytes);
        void ctx.close();
        return picos(buf.getChannelData(0), pontos);
      } catch { return null; }
    })();
    ondas.set(src, p);
  }
  return p;
}

/** Reduz as amostras a `pontos` picos (maior valor absoluto de cada pedaço), normalizados de 0 a 1. */
export function picos(amostras: Float32Array, pontos: number): Float32Array {
  const out = new Float32Array(pontos);
  const passo = Math.max(1, Math.floor(amostras.length / pontos));
  let max = 0;
  for (let i = 0; i < pontos; i++) {
    let m = 0;
    for (let j = i * passo; j < Math.min(amostras.length, (i + 1) * passo); j++) { const v = Math.abs(amostras[j]); if (v > m) m = v; }
    out[i] = m;
    if (m > max) max = m;
  }
  if (max > 0) for (let i = 0; i < pontos; i++) out[i] /= max;
  return out;
}
