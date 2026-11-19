// SOBRE MÍDIA STUDIO — EDITOR DE ÁUDIO: CLONAR VOZ (F-347, edição refeita no F-348).
// O dono grava a voz dele do jeito dele (com respiro e pausas) e toca em "Clonar voz". REGRA ABSOLUTA do dono: a voz é
// TRATADA antes de ir para a ElevenLabs, com EDIÇÃO PROFISSIONAL (F-348, depois de o dono reprovar a versão acelerada):
//   1) limpeza suave: um canal, tira o grave de vento/batida (passa-alta) e os ESTALOS;
//   2) NÃO acelera e NÃO corta palavra: cada palavra fica inteira, com folga antes e depois e acompanhando o fim real do som;
//   3) só as PAUSAS são editadas: o respiro e o ruído dentro delas viram silêncio limpo e as pausas longas ficam num tamanho
//      natural (fim de frase 0,30 s, vírgula 0,20 s, meio de frase 0,18 s). Pausa curta (< 0,22 s) fica como está;
//   4) volume por igual (compressor suave) antes de mandar;
// e depois que volta convertida no timbre da voz escolhida, ganha o acabamento de rádio. As funções aqui são puras
// (o servidor só transcreve e converte).
import { amostras, copiarSom, normalizar, paraMono, type Som } from './som';
import { efeitoPorId, valoresPadrao } from './efeitos';

/** as vozes para clonar (o servidor sabe qual voz da ElevenLabs é cada uma). Voz nova = uma linha aqui e uma no servidor. */
export const VOZES_PARA_CLONAR = [
  { id: 'sergio-vaz', nome: 'Sérgio Vaz', descricao: 'Locutor do outro projeto (A3 NOVA): timbre editado, pegada de impacto' },
] as const;
export type IdDaVozParaClonar = (typeof VOZES_PARA_CLONAR)[number]['id'];

export interface PalavraNoTempo { texto: string; ini: number; fim: number }
export const MAX_SEGUNDOS_PARA_CLONAR = 300;

/** tira os estalos (cliques de boca, de microfone): picos curtíssimos muito acima da vizinhança viram a média dela */
export function tirarEstalos(s: Som, forca = 6): Som {
  const r = copiarSom(s), meia = Math.max(2, Math.round(s.sr * 0.0015)), viz = Math.round(s.sr * 0.004);
  for (const c of r.canais) {
    const n = c.length; if (n < viz * 4) continue;
    const abs = new Float32Array(n); for (let i = 0; i < n; i++) abs[i] = Math.abs(c[i]);
    const acum = new Float64Array(n + 1); for (let i = 0; i < n; i++) acum[i + 1] = acum[i] + abs[i];
    const media = (a: number, b: number) => (acum[Math.min(n, b)] - acum[Math.max(0, a)]) / Math.max(1, Math.min(n, b) - Math.max(0, a));
    for (let i = viz; i < n - viz; i++) {
      if (abs[i] > forca * media(i - viz, i + viz) && abs[i] > 0.02) {
        const a = Math.max(0, i - meia), b = Math.min(n - 1, i + meia), va = c[a], vb = c[b];
        for (let k = a; k <= b; k++) c[k] = va + ((vb - va) * (k - a)) / Math.max(1, b - a);
        i = b;
      }
    }
  }
  return r;
}

/** o tamanho natural da pausa depois de uma palavra (nunca aumenta uma pausa, só encurta as longas) */
export const pausaNatural = (texto: string) => (/[.!?]$/.test(texto.trim()) ? 0.30 : /[,;:]$/.test(texto.trim()) ? 0.20 : 0.18);
export const PAUSA_MINIMA_PARA_MEXER = 0.22;

export interface ResultadoDasPausas { som: Som; pausas: number; antes: number; depois: number }

/**
 * F-348: edita SÓ as pausas. Cada palavra fica inteira (folga de 40 ms antes e 50 ms depois, e o fim real do som seguido
 * pela energia, até 200 ms); o que sobra na pausa (respiro, ruído, estalo) vira silêncio, e a pausa longa fica natural.
 */
export function editarPausas(s: Som, palavras: PalavraNoTempo[]): ResultadoDasPausas {
  const sr = s.sr, x = paraMono(s).canais[0], n = x.length;
  const ws = [...palavras].filter((p) => p.fim > p.ini).sort((a, b) => a.ini - b.ini);
  if (!ws.length || n < sr * 0.05) return { som: copiarSom(s), pausas: 0, antes: n / sr, depois: n / sr };
  const Q = Math.max(1, Math.round(sr * 0.01)), nq = Math.max(1, Math.floor(n / Q)), e = new Float32Array(nq);
  for (let q = 0; q < nq; q++) { let t = 0; for (let i = q * Q; i < Math.min(n, (q + 1) * Q); i++) t += x[i] * x[i]; e[q] = Math.sqrt(t / Q); }
  const fala = [...e].sort((a, b) => a - b)[Math.floor(nq * 0.9)] || 1e-6;
  const limiar = fala * Math.pow(10, -26 / 20);
  const energia = (t: number) => e[Math.min(nq - 1, Math.max(0, Math.floor((t * sr) / Q)))];
  const pedacos: Array<{ a: number; b: number; silencio: number }> = [];
  let a = Math.max(0, ws[0].ini - 0.06);
  for (let i = 0; i < ws.length - 1; i++) {
    const w = ws[i], prox = ws[i + 1], gap = prox.ini - w.fim;
    if (gap < PAUSA_MINIMA_PARA_MEXER) continue;
    let fimFala = w.fim; while (fimFala - w.fim < 0.2 && fimFala < prox.ini && energia(fimFala) > limiar) fimFala += 0.01;
    let iniFala = prox.ini; while (prox.ini - iniFala < 0.08 && iniFala > fimFala && energia(iniFala - 0.01) > limiar) iniFala -= 0.01;
    const A = Math.min(fimFala + 0.05, prox.ini), B = Math.max(iniFala - 0.04, A);
    if (B - A < 0.03) continue;
    const mantido = (A - w.fim) + (prox.ini - B), novo = Math.max(Math.min(gap, pausaNatural(w.texto)), mantido);
    pedacos.push({ a, b: A, silencio: novo - mantido });
    a = B;
  }
  const ult = ws[ws.length - 1];
  let fimUlt = ult.fim; while (fimUlt - ult.fim < 0.3 && fimUlt * sr < n && energia(fimUlt) > limiar) fimUlt += 0.01;
  pedacos.push({ a, b: Math.min(n / sr, fimUlt + 0.1), silencio: 0 });
  const fade = Math.round(sr * 0.02);
  const total = pedacos.reduce((t, p) => t + Math.max(0, Math.round((p.b - p.a) * sr)) + Math.round(p.silencio * sr), 0);
  const canais = s.canais.map(() => new Float32Array(total));
  let pos = 0;
  for (const p of pedacos) {
    const i0 = Math.round(p.a * sr), len = Math.max(0, Math.min(n - i0, Math.round((p.b - p.a) * sr)));
    s.canais.forEach((c, k) => { const d = canais[k]; for (let i = 0; i < len; i++) d[pos + i] = c[i0 + i] * Math.min(1, i / fade, (len - 1 - i) / fade); });
    pos += len + Math.round(p.silencio * sr);
  }
  return { som: { sr, canais }, pausas: pedacos.length - 1, antes: n / sr, depois: total / sr };
}

export interface ResultadoDoTratamento { som: Som; pausas: number; antes: number; depois: number }

/** 2+3+4: a voz tratada (no ritmo do próprio dono, sem acelerar), pronta para a conversão */
export async function tratarVoz(s: Som, palavras: PalavraNoTempo[]): Promise<ResultadoDoTratamento> {
  if (!palavras.length) throw new Error('Não achei fala nesse áudio.');
  const r = editarPausas(s, palavras);
  const comp = efeitoPorId('compressor')!;
  const som = normalizar(await comp.aplicar(r.som, { ...valoresPadrao(comp), limiar: -20, razao: 2.5, ataque: 8, liberar: 120 }), -1.5);
  return { som, pausas: r.pausas, antes: r.antes, depois: amostras(som) / som.sr };
}

/** 1: limpeza suave (antes de transcrever: a transcrição acha melhor as palavras) */
export async function limparVoz(s: Som): Promise<Som> {
  const pa = efeitoPorId('passa-alta')!;
  return tirarEstalos(await pa.aplicar(paraMono(s), { ...valoresPadrao(pa), freq: 70 }));
}

/** acabamento de rádio depois da conversão (volume forte e por igual, sem estalo novo) */
export async function acabamentoDeRadio(s: Som): Promise<Som> {
  const comp = efeitoPorId('compressor')!;
  return normalizar(await comp.aplicar(tirarEstalos(s), { ...valoresPadrao(comp), limiar: -18, razao: 3, ataque: 5, liberar: 80 }), -1);
}

/** bytes ↔ base64 (o áudio vai e volta do servidor dentro do JSON) */
export function paraBase64(b: Uint8Array): string { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); }
export function deBase64(t: string): Uint8Array { const s = atob(t); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
