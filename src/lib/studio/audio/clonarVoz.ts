// SOBRE MÍDIA STUDIO — EDITOR DE ÁUDIO: CLONAR VOZ (F-347).
// O dono grava a voz dele do jeito dele (com respiro e pausas) e toca em "Clonar voz". REGRA ABSOLUTA do dono (F-346):
// a voz é TRATADA antes de ir para a ElevenLabs:
//   1) limpeza: só um canal, tira o grave de vento/batida (passa-alta) e os ESTALOS;
//   2) sem respiro e sem espaço: as palavras (com o tempo de cada uma, vindo da transcrição) são coladas umas nas outras;
//      o que fica entre elas (respiração, estalo de boca, silêncio, barulho) sai;
//   3) ritmo do locutor do outro projeto: acelera sem mudar o tom até ~7,6 sílabas por segundo (máx. 1,5×);
//   4) volume por igual (compressor) antes de mandar;
// e depois que volta convertida no timbre da voz escolhida, ganha o acabamento de rádio. As funções aqui são puras
// (o servidor só transcreve e converte).
import { amostras, copiarSom, esticarTempo, normalizar, paraMono, type Som } from './som';
import { efeitoPorId, valoresPadrao } from './efeitos';

/** as vozes para clonar (o servidor sabe qual voz da ElevenLabs é cada uma). Voz nova = uma linha aqui e uma no servidor. */
export const VOZES_PARA_CLONAR = [
  { id: 'sergio-vaz', nome: 'Sérgio Vaz', descricao: 'Locutor do outro projeto (A3 NOVA): timbre editado, pegada de impacto' },
] as const;
export type IdDaVozParaClonar = (typeof VOZES_PARA_CLONAR)[number]['id'];

export interface PalavraNoTempo { texto: string; ini: number; fim: number }
export interface BlocoDeFala { ini: number; fim: number; texto: string }

/** o ritmo do locutor do outro projeto (medido: 7,97 sílabas/s enquanto fala) e o máximo que se acelera sem robotizar */
export const ALVO_SILABAS = 7.6;
export const MAX_ACELERAR = 1.5;
export const MAX_SEGUNDOS_PARA_CLONAR = 300;

/** tira os estalos (cliques de boca, de microfone): picos curtíssimos muito acima da vizinhança viram a média dela */
export function tirarEstalos(s: Som, forca = 6): Som {
  const r = copiarSom(s), meia = Math.max(2, Math.round(s.sr * 0.0015)), viz = Math.round(s.sr * 0.004);
  for (const c of r.canais) {
    const n = c.length; if (n < viz * 4) continue;
    // energia média da vizinhança (janela móvel de |x|)
    const abs = new Float32Array(n); for (let i = 0; i < n; i++) abs[i] = Math.abs(c[i]);
    const acum = new Float64Array(n + 1); for (let i = 0; i < n; i++) acum[i + 1] = acum[i] + abs[i];
    const media = (a: number, b: number) => (acum[Math.min(n, b)] - acum[Math.max(0, a)]) / Math.max(1, Math.min(n, b) - Math.max(0, a));
    for (let i = viz; i < n - viz; i++) {
      const m = media(i - viz, i + viz);
      if (abs[i] > forca * m && abs[i] > 0.02) {
        // conserta o trecho curto em volta do estalo ligando as duas pontas
        const a = Math.max(0, i - meia), b = Math.min(n - 1, i + meia), va = c[a], vb = c[b];
        for (let k = a; k <= b; k++) c[k] = va + ((vb - va) * (k - a)) / Math.max(1, b - a);
        i = b;
      }
    }
  }
  return r;
}

/** palavras quase coladas (menos de `juntar` s entre elas) viram um bloco de fala só */
export function blocosDeFala(palavras: PalavraNoTempo[], juntar = 0.05): BlocoDeFala[] {
  const bs: BlocoDeFala[] = [];
  for (const w of [...palavras].filter((p) => p.fim > p.ini).sort((a, b) => a.ini - b.ini)) {
    const b = bs[bs.length - 1];
    if (b && w.ini - b.fim < juntar) { b.fim = Math.max(b.fim, w.fim); b.texto += ` ${w.texto}`; } else bs.push({ ini: w.ini, fim: w.fim, texto: w.texto });
  }
  return bs;
}
/** o espaço que fica depois de um bloco: mínimo (fim de frase um pouco mais, para não embolar) */
export const pausaDepois = (texto: string) => (/[.!?]$/.test(texto.trim()) ? 0.11 : /[,;:]$/.test(texto.trim()) ? 0.06 : 0.03);
export const contarSilabas = (textos: string[]) => textos.reduce((a, t) => a + (t.toLowerCase().match(/[aeiouáéíóúâêôãõàü]+/g) ?? []).length, 0);
export const fatorDeRitmo = (silabas: number, segundos: number, alvo = ALVO_SILABAS, max = MAX_ACELERAR) =>
  (segundos <= 0 || silabas <= 0 ? 1 : Math.min(max, Math.max(1, alvo / (silabas / segundos))));

/** monta só os blocos de fala, colados, com micro-fades nas pontas (sem estalo no corte) */
export function montarSemRespiro(s: Som, blocos: BlocoDeFala[], folga = 0.015): Som {
  const sr = s.sr, n = amostras(s), pedacos: Array<{ a: number; b: number; pausa: number }> = [];
  blocos.forEach((b, i) => {
    const a = Math.max(0, Math.round((b.ini - folga) * sr)), z = Math.min(n, Math.round((b.fim + folga) * sr));
    if (z > a) pedacos.push({ a, b: z, pausa: i < blocos.length - 1 ? Math.round(pausaDepois(b.texto) * sr) : 0 });
  });
  const total = pedacos.reduce((t, p) => t + (p.b - p.a) + p.pausa, 0);
  const canais = s.canais.map(() => new Float32Array(total)), fi = Math.round(sr * 0.006), fo = Math.round(sr * 0.008);
  let pos = 0;
  for (const p of pedacos) {
    const len = p.b - p.a;
    s.canais.forEach((c, k) => {
      const d = canais[k];
      for (let i = 0; i < len; i++) {
        const g = Math.min(1, i / Math.max(1, fi), (len - 1 - i) / Math.max(1, fo));
        d[pos + i] = c[p.a + i] * g;
      }
    });
    pos += len + p.pausa;
  }
  return { sr, canais };
}

export interface ResultadoDoTratamento { som: Som; blocos: number; ritmoAntes: number; ritmoDepois: number; fator: number; antes: number; depois: number }

/** 1+2+3+4: a voz tratada, pronta para ir para a conversão */
export async function tratarVoz(s: Som, palavras: PalavraNoTempo[]): Promise<ResultadoDoTratamento> {
  const blocos = blocosDeFala(palavras);
  if (!blocos.length) throw new Error('Não achei fala nesse áudio.');
  const colado = montarSemRespiro(s, blocos);
  const silabas = contarSilabas(palavras.map((p) => p.texto)), dur = amostras(colado) / colado.sr;
  const fator = fatorDeRitmo(silabas, dur);
  let som = esticarTempo(colado, 1 / fator);
  const comp = efeitoPorId('compressor')!;
  som = await comp.aplicar(som, { ...valoresPadrao(comp), limiar: -20, razao: 3, ataque: 4, liberar: 60 });
  som = normalizar(som, -1.5);
  return { som, blocos: blocos.length, ritmoAntes: silabas / dur, ritmoDepois: (silabas / dur) * fator, fator, antes: amostras(s) / s.sr, depois: amostras(som) / som.sr };
}

/** 1: limpeza (antes de transcrever: a transcrição acha melhor as palavras) */
export async function limparVoz(s: Som): Promise<Som> {
  const pa = efeitoPorId('passa-alta')!;
  const mono = paraMono(s);
  return tirarEstalos(await pa.aplicar(mono, { ...valoresPadrao(pa), freq: 75 }));
}

/** acabamento de rádio depois da conversão (volume forte e por igual, sem estalo novo) */
export async function acabamentoDeRadio(s: Som): Promise<Som> {
  const comp = efeitoPorId('compressor')!;
  const c = await comp.aplicar(tirarEstalos(s), { ...valoresPadrao(comp), limiar: -18, razao: 3.5, ataque: 3, liberar: 50 });
  return normalizar(c, -1);
}

/** bytes ↔ base64 (o áudio vai e volta do servidor dentro do JSON) */
export function paraBase64(b: Uint8Array): string { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); }
export function deBase64(t: string): Uint8Array { const s = atob(t); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
