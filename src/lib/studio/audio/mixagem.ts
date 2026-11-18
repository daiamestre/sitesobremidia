// SOBRE MÍDIA STUDIO — EDITOR DE ÁUDIO: tocar e exportar a MISTURA. O mesmo grafo serve para ouvir (AudioContext) e para
// gerar o arquivo (OfflineAudioContext): o que se ouve é exatamente o que se baixa.
import { faixasAudiveis, fimDoClipe, fimDoProjeto, type Projeto } from './projeto';
import { normalizar, paraMono, igualarCanais, type Som } from './som';

/** o AudioBuffer de cada som (guardado por contexto, para não recriar a cada play) */
export type FonteDeBuffers = (ctx: BaseAudioContext, somId: string) => AudioBuffer | null;

/**
 * Agenda o projeto no contexto, de `de` até `ate` (s da linha do tempo), começando em `quando` (relógio do contexto).
 * Devolve as fontes (para parar) e o fim.
 */
export function agendarProjeto(ctx: BaseAudioContext, p: Projeto, buffers: FonteDeBuffers, de: number, ate: number, destino: AudioNode, quando: number): AudioScheduledSourceNode[] {
  const fontes: AudioScheduledSourceNode[] = [];
  const T = (x: number) => quando + (x - de);
  for (const f of faixasAudiveis(p)) {
    const vol = ctx.createGain(); vol.gain.value = Math.pow(10, f.volumeDb / 20);
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, f.pan));
    vol.connect(pan).connect(destino);
    for (const c of f.clipes) {
      const cs = c.inicio, ce = fimDoClipe(c);
      if (ce <= de || cs >= ate) continue;
      const buf = buffers(ctx, c.somId); if (!buf) continue;
      const ini = Math.max(cs, de), fim = Math.min(ce, ate);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = ctx.createGain(), base = Math.pow(10, c.ganhoDb / 20);
      const env = (x: number) => {
        const r = x - cs; let k = base;
        if (c.fadeEntrada > 0 && r < c.fadeEntrada) k *= Math.max(0, r / c.fadeEntrada);
        if (c.fadeSaida > 0 && r > c.duracao - c.fadeSaida) k *= Math.max(0, (c.duracao - r) / c.fadeSaida);
        return k;
      };
      g.gain.setValueAtTime(env(ini), T(ini));
      const fimEntrada = cs + c.fadeEntrada, iniSaida = ce - c.fadeSaida;
      if (c.fadeEntrada > 0 && fimEntrada > ini && fimEntrada < fim) g.gain.linearRampToValueAtTime(env(fimEntrada), T(fimEntrada));
      if (c.fadeSaida > 0 && iniSaida > ini && iniSaida < fim) g.gain.setValueAtTime(env(iniSaida), T(iniSaida));
      if (c.fadeSaida > 0 && fim > Math.max(ini, iniSaida)) g.gain.linearRampToValueAtTime(env(fim), T(fim));
      src.connect(g).connect(vol);
      const offset = c.deslocamento + (ini - cs), dur = fim - ini;
      if (offset >= buf.duration || dur <= 0) continue;
      src.start(T(ini), offset, Math.min(dur, buf.duration - offset));
      fontes.push(src);
    }
  }
  return fontes;
}

export interface OpcoesDeExportacao {
  de?: number; ate?: number; sr?: number; canais?: 1 | 2; normalizarDb?: number | null;
}

/** a mistura final em Som (pronto para virar WAV/MP3) */
export async function renderizarProjeto(p: Projeto, buffers: FonteDeBuffers, o: OpcoesDeExportacao = {}): Promise<Som> {
  const de = Math.max(0, o.de ?? 0), ate = Math.max(de + 0.01, o.ate ?? fimDoProjeto(p)), sr = o.sr ?? 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil((ate - de) * sr), sr);
  const geral = ctx.createGain(); geral.gain.value = Math.pow(10, p.volumeGeralDb / 20); geral.connect(ctx.destination);
  agendarProjeto(ctx, p, buffers, de, ate, geral, 0);
  const r = await ctx.startRendering();
  let som: Som = { sr, canais: [new Float32Array(r.getChannelData(0)), new Float32Array(r.getChannelData(1))] };
  if (o.canais === 1) som = paraMono(som); else som = igualarCanais(som, 2);
  if (o.normalizarDb != null) som = normalizar(som, o.normalizarDb);
  return som;
}
