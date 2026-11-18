// SOBRE MÍDIA STUDIO — EDITOR DE ÁUDIO: a lista de EFEITOS. Cada efeito tem os ajustes (com valor padrão) e a função que
// devolve o som novo. Os de filtro/dinâmica/espaço usam um OfflineAudioContext (o mesmo motor do navegador que toca); os
// outros são funções puras de `som.ts`.
import {
  aparaSilencio, deTrasParaFrente, fade, inverterFase, mudarTom, mudarVelocidade, normalizar, paraMono, portaDeRuido,
  igualarCanais, tirarDC, trocarCanais, volume, type CurvaDeFade, type Som,
} from './som';

export type Ajuste =
  | { id: string; nome: string; tipo: 'numero'; min: number; max: number; passo: number; padrao: number; unidade?: string }
  | { id: string; nome: string; tipo: 'opcoes'; opcoes: Array<{ valor: string; nome: string }>; padrao: string }
  | { id: string; nome: string; tipo: 'sim'; padrao: boolean };
export type Valores = Record<string, number | string | boolean>;
export type GrupoDeEfeito = 'Volume e dinâmica' | 'Fades' | 'Equalizador e filtros' | 'Espaço' | 'Tempo e tom' | 'Utilidades';
export interface Efeito {
  id: string; nome: string; grupo: GrupoDeEfeito; descricao: string; ajustes: Ajuste[];
  /** true: o resultado pode ter outra duração (o resto da faixa anda junto) */
  mudaDuracao?: boolean;
  aplicar: (s: Som, v: Valores) => Promise<Som> | Som;
}

const num = (v: Valores, k: string) => Number(v[k]);
export const valoresPadrao = (e: Efeito): Valores => Object.fromEntries(e.ajustes.map((a) => [a.id, a.padrao]));

/** roda um grafo do Web Audio sobre o som, sem tocar (mesma duração; `canais` força a saída em mono/estéreo) */
export async function processarComGrafo(s: Som, montar: (ctx: OfflineAudioContext, entrada: AudioNode) => AudioNode, canais?: number): Promise<Som> {
  const n = s.canais[0]?.length ?? 0; if (n === 0) return s;
  const nc = canais ?? s.canais.length;
  const ctx = new OfflineAudioContext(nc, n, s.sr);
  const b = ctx.createBuffer(s.canais.length, n, s.sr);
  s.canais.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  const src = ctx.createBufferSource(); src.buffer = b;
  montar(ctx, src).connect(ctx.destination); src.start();
  const r = await ctx.startRendering();
  return { sr: s.sr, canais: Array.from({ length: r.numberOfChannels }, (_, i) => new Float32Array(r.getChannelData(i))) };
}

const biquad = (ctx: BaseAudioContext, tipo: BiquadFilterType, freq: number, ganho = 0, q = 0.707) => {
  const f = ctx.createBiquadFilter(); f.type = tipo; f.frequency.value = freq; f.gain.value = ganho; f.Q.value = q; return f;
};
const ganhoNo = (ctx: BaseAudioContext, g: number) => { const n = ctx.createGain(); n.gain.value = g; return n; };

/** mistura seco + molhado (o efeito) */
function misturar(ctx: BaseAudioContext, entrada: AudioNode, molhado: (e: AudioNode) => AudioNode, mistura: number): AudioNode {
  const saida = ctx.createGain();
  entrada.connect(ganhoNo(ctx, 1 - mistura * 0.5)).connect(saida);
  molhado(entrada).connect(ganhoNo(ctx, mistura)).connect(saida);
  return saida;
}

/** a resposta de uma sala (ruído que some aos poucos), para a reverberação */
function respostaDeSala(ctx: BaseAudioContext, tamanho: number, brilho: number): AudioBuffer {
  const n = Math.max(1, Math.round(ctx.sampleRate * tamanho)), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let lp = 0;
    for (let i = 0; i < n; i++) { const r = Math.random() * 2 - 1; lp += (r - lp) * brilho; d[i] = lp * Math.pow(1 - i / n, 2.5); }
  }
  return b;
}

const CURVAS: Array<{ valor: CurvaDeFade; nome: string }> = [
  { valor: 'linear', nome: 'Linear' }, { valor: 'suave', nome: 'Suave (S)' }, { valor: 'exponencial', nome: 'Exponencial' }, { valor: 'logaritmica', nome: 'Logarítmica' },
];

export const EFEITOS: Efeito[] = [
  // ——— Volume e dinâmica ———
  { id: 'volume', nome: 'Volume', grupo: 'Volume e dinâmica', descricao: 'Aumenta ou abaixa o volume.',
    ajustes: [{ id: 'db', nome: 'Ganho', tipo: 'numero', min: -40, max: 24, passo: 0.5, padrao: 3, unidade: 'dB' }],
    aplicar: (s, v) => volume(s, num(v, 'db')) },
  { id: 'normalizar', nome: 'Normalizar', grupo: 'Volume e dinâmica', descricao: 'Deixa o ponto mais alto no volume escolhido, sem estourar.',
    ajustes: [{ id: 'db', nome: 'Pico', tipo: 'numero', min: -12, max: 0, passo: 0.1, padrao: -1, unidade: 'dB' }],
    aplicar: (s, v) => normalizar(s, num(v, 'db')) },
  { id: 'compressor', nome: 'Compressor', grupo: 'Volume e dinâmica', descricao: 'Iguala o volume: o alto abaixa, o baixo aparece (voz mais "na cara").',
    ajustes: [
      { id: 'limiar', nome: 'Limiar', tipo: 'numero', min: -60, max: 0, passo: 1, padrao: -24, unidade: 'dB' },
      { id: 'razao', nome: 'Razão', tipo: 'numero', min: 1, max: 20, passo: 0.5, padrao: 4, unidade: ':1' },
      { id: 'ataque', nome: 'Ataque', tipo: 'numero', min: 0, max: 200, passo: 1, padrao: 5, unidade: 'ms' },
      { id: 'liberar', nome: 'Liberação', tipo: 'numero', min: 10, max: 1000, passo: 10, padrao: 150, unidade: 'ms' },
      { id: 'joelho', nome: 'Joelho', tipo: 'numero', min: 0, max: 40, passo: 1, padrao: 6, unidade: 'dB' },
      { id: 'ganho', nome: 'Ganho de saída', tipo: 'numero', min: 0, max: 24, passo: 0.5, padrao: 4, unidade: 'dB' },
    ],
    aplicar: (s, v) => processarComGrafo(s, (ctx, e) => {
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = num(v, 'limiar'); c.ratio.value = num(v, 'razao'); c.attack.value = num(v, 'ataque') / 1000; c.release.value = num(v, 'liberar') / 1000; c.knee.value = num(v, 'joelho');
      return e.connect(c).connect(ganhoNo(ctx, Math.pow(10, num(v, 'ganho') / 20)));
    }) },
  { id: 'limitador', nome: 'Limitador', grupo: 'Volume e dinâmica', descricao: 'Segura os picos num teto e sobe o volume sem estourar.',
    ajustes: [
      { id: 'teto', nome: 'Teto', tipo: 'numero', min: -12, max: 0, passo: 0.1, padrao: -1, unidade: 'dB' },
      { id: 'ganho', nome: 'Ganho de entrada', tipo: 'numero', min: 0, max: 18, passo: 0.5, padrao: 6, unidade: 'dB' },
    ],
    aplicar: async (s, v) => {
      const r = await processarComGrafo(s, (ctx, e) => {
        const c = ctx.createDynamicsCompressor(); c.threshold.value = num(v, 'teto') - 0.5; c.ratio.value = 20; c.attack.value = 0.001; c.release.value = 0.08; c.knee.value = 0;
        return e.connect(ganhoNo(ctx, Math.pow(10, num(v, 'ganho') / 20))).connect(c);
      });
      // trava final: nada passa do teto
      const t = Math.pow(10, num(v, 'teto') / 20);
      return { sr: r.sr, canais: r.canais.map((c) => c.map((x) => (x > t ? t : x < -t ? -t : x))) };
    } },
  { id: 'porta', nome: 'Porta de ruído', grupo: 'Volume e dinâmica', descricao: 'Tira o chiado e o barulho de fundo nas pausas da fala.',
    ajustes: [
      { id: 'limiar', nome: 'Limiar', tipo: 'numero', min: -80, max: -10, passo: 1, padrao: -45, unidade: 'dB' },
      { id: 'reducao', nome: 'Redução', tipo: 'numero', min: -80, max: 0, passo: 1, padrao: -40, unidade: 'dB' },
      { id: 'ataque', nome: 'Ataque', tipo: 'numero', min: 1, max: 100, passo: 1, padrao: 5, unidade: 'ms' },
      { id: 'liberar', nome: 'Liberação', tipo: 'numero', min: 10, max: 1000, passo: 10, padrao: 120, unidade: 'ms' },
    ],
    aplicar: (s, v) => portaDeRuido(s, num(v, 'limiar'), num(v, 'reducao'), num(v, 'ataque'), num(v, 'liberar')) },

  // ——— Fades ———
  { id: 'fade-entrada', nome: 'Fade de entrada', grupo: 'Fades', descricao: 'O som nasce do silêncio.',
    ajustes: [{ id: 'curva', nome: 'Curva', tipo: 'opcoes', opcoes: CURVAS, padrao: 'suave' }],
    aplicar: (s, v) => fade(s, 'entrada', v.curva as CurvaDeFade) },
  { id: 'fade-saida', nome: 'Fade de saída', grupo: 'Fades', descricao: 'O som some até o silêncio.',
    ajustes: [{ id: 'curva', nome: 'Curva', tipo: 'opcoes', opcoes: CURVAS, padrao: 'suave' }],
    aplicar: (s, v) => fade(s, 'saida', v.curva as CurvaDeFade) },

  // ——— Equalizador e filtros ———
  { id: 'equalizador', nome: 'Equalizador (5 faixas)', grupo: 'Equalizador e filtros', descricao: 'Grave, médio-grave, médio, presença e agudo.',
    ajustes: [
      { id: 'g60', nome: 'Grave (60 Hz)', tipo: 'numero', min: -18, max: 18, passo: 0.5, padrao: 0, unidade: 'dB' },
      { id: 'g250', nome: 'Médio-grave (250 Hz)', tipo: 'numero', min: -18, max: 18, passo: 0.5, padrao: 0, unidade: 'dB' },
      { id: 'g1k', nome: 'Médio (1 kHz)', tipo: 'numero', min: -18, max: 18, passo: 0.5, padrao: 0, unidade: 'dB' },
      { id: 'g4k', nome: 'Presença (4 kHz)', tipo: 'numero', min: -18, max: 18, passo: 0.5, padrao: 0, unidade: 'dB' },
      { id: 'g12k', nome: 'Agudo (12 kHz)', tipo: 'numero', min: -18, max: 18, passo: 0.5, padrao: 0, unidade: 'dB' },
    ],
    aplicar: (s, v) => processarComGrafo(s, (ctx, e) => e
      .connect(biquad(ctx, 'lowshelf', 60, num(v, 'g60')))
      .connect(biquad(ctx, 'peaking', 250, num(v, 'g250'), 1))
      .connect(biquad(ctx, 'peaking', 1000, num(v, 'g1k'), 1))
      .connect(biquad(ctx, 'peaking', 4000, num(v, 'g4k'), 1))
      .connect(biquad(ctx, 'highshelf', 12000, num(v, 'g12k')))) },
  { id: 'parametrico', nome: 'Equalizador paramétrico', grupo: 'Equalizador e filtros', descricao: 'Uma faixa com frequência, ganho e largura livres.',
    ajustes: [
      { id: 'freq', nome: 'Frequência', tipo: 'numero', min: 20, max: 20000, passo: 10, padrao: 1000, unidade: 'Hz' },
      { id: 'ganho', nome: 'Ganho', tipo: 'numero', min: -24, max: 24, passo: 0.5, padrao: 6, unidade: 'dB' },
      { id: 'q', nome: 'Largura (Q)', tipo: 'numero', min: 0.1, max: 18, passo: 0.1, padrao: 1, unidade: '' },
    ],
    aplicar: (s, v) => processarComGrafo(s, (ctx, e) => e.connect(biquad(ctx, 'peaking', num(v, 'freq'), num(v, 'ganho'), num(v, 'q')))) },
  { id: 'passa-alta', nome: 'Passa-alta (tira grave)', grupo: 'Equalizador e filtros', descricao: 'Tira o grave abaixo da frequência (zumbido, vento, batida no microfone).',
    ajustes: [{ id: 'freq', nome: 'Corte', tipo: 'numero', min: 20, max: 2000, passo: 5, padrao: 90, unidade: 'Hz' }],
    aplicar: (s, v) => processarComGrafo(s, (ctx, e) => e.connect(biquad(ctx, 'highpass', num(v, 'freq'))).connect(biquad(ctx, 'highpass', num(v, 'freq')))) },
  { id: 'passa-baixa', nome: 'Passa-baixa (tira agudo)', grupo: 'Equalizador e filtros', descricao: 'Tira o agudo acima da frequência (chiado, som abafado de rádio antigo).',
    ajustes: [{ id: 'freq', nome: 'Corte', tipo: 'numero', min: 200, max: 20000, passo: 50, padrao: 8000, unidade: 'Hz' }],
    aplicar: (s, v) => processarComGrafo(s, (ctx, e) => e.connect(biquad(ctx, 'lowpass', num(v, 'freq'))).connect(biquad(ctx, 'lowpass', num(v, 'freq')))) },
  { id: 'telefone', nome: 'Voz de telefone', grupo: 'Equalizador e filtros', descricao: 'Só a faixa do telefone (300 a 3.400 Hz).',
    ajustes: [],
    aplicar: (s) => processarComGrafo(s, (ctx, e) => e.connect(biquad(ctx, 'highpass', 300)).connect(biquad(ctx, 'highpass', 300)).connect(biquad(ctx, 'lowpass', 3400)).connect(biquad(ctx, 'lowpass', 3400)).connect(ganhoNo(ctx, 1.6))) },
  { id: 'voz-de-radio', nome: 'Voz de rádio (locutor)', grupo: 'Equalizador e filtros', descricao: 'O tratamento de locutor dos vídeos do Studio: corte de grave, presença, brilho e compressor.',
    ajustes: [{ id: 'forca', nome: 'Intensidade', tipo: 'numero', min: 0, max: 200, passo: 5, padrao: 100, unidade: '%' }],
    aplicar: (s, v) => processarComGrafo(s, (ctx, e) => {
      const k = num(v, 'forca') / 100;
      const c = ctx.createDynamicsCompressor(); c.threshold.value = -24 * k; c.knee.value = 6; c.ratio.value = 1 + 3 * k; c.attack.value = 0.003; c.release.value = 0.15;
      return e.connect(biquad(ctx, 'highpass', 90)).connect(biquad(ctx, 'peaking', 3000, 3.5 * k, 0.9)).connect(biquad(ctx, 'highshelf', 8000, 2 * k)).connect(c).connect(ganhoNo(ctx, 1 + 0.6 * k));
    }) },

  // ——— Espaço ———
  { id: 'eco', nome: 'Eco', grupo: 'Espaço', descricao: 'Repetições do som (eco de estádio, efeito de locutor).',
    ajustes: [
      { id: 'tempo', nome: 'Tempo', tipo: 'numero', min: 20, max: 2000, passo: 10, padrao: 280, unidade: 'ms' },
      { id: 'repeticao', nome: 'Repetição', tipo: 'numero', min: 0, max: 90, passo: 1, padrao: 40, unidade: '%' },
      { id: 'mistura', nome: 'Mistura', tipo: 'numero', min: 0, max: 100, passo: 1, padrao: 35, unidade: '%' },
    ],
    aplicar: (s, v) => processarComGrafo(s, (ctx, e) => misturar(ctx, e, (x) => {
      const d = ctx.createDelay(2.5); d.delayTime.value = num(v, 'tempo') / 1000;
      const fb = ganhoNo(ctx, num(v, 'repeticao') / 100); d.connect(fb).connect(d); x.connect(d); return d;
    }, num(v, 'mistura') / 100)) },
  { id: 'reverb', nome: 'Reverberação', grupo: 'Espaço', descricao: 'O som numa sala, num salão ou numa igreja.',
    ajustes: [
      { id: 'tamanho', nome: 'Tamanho da sala', tipo: 'numero', min: 0.2, max: 8, passo: 0.1, padrao: 1.8, unidade: 's' },
      { id: 'brilho', nome: 'Brilho', tipo: 'numero', min: 5, max: 100, passo: 1, padrao: 60, unidade: '%' },
      { id: 'preatraso', nome: 'Pré-atraso', tipo: 'numero', min: 0, max: 200, passo: 1, padrao: 20, unidade: 'ms' },
      { id: 'mistura', nome: 'Mistura', tipo: 'numero', min: 0, max: 100, passo: 1, padrao: 30, unidade: '%' },
    ],
    aplicar: (s, v) => processarComGrafo(igualarCanais(s, 2), (ctx, e) => misturar(ctx, e, (x) => {
      const pre = ctx.createDelay(1); pre.delayTime.value = num(v, 'preatraso') / 1000;
      const conv = ctx.createConvolver(); conv.buffer = respostaDeSala(ctx, num(v, 'tamanho'), num(v, 'brilho') / 100);
      x.connect(pre).connect(conv); return conv;
    }, num(v, 'mistura') / 100)) },
  { id: 'coro', nome: 'Coro (chorus)', grupo: 'Espaço', descricao: 'Engrossa o som como se fossem várias vozes juntas.',
    ajustes: [
      { id: 'profundidade', nome: 'Profundidade', tipo: 'numero', min: 1, max: 20, passo: 0.5, padrao: 6, unidade: 'ms' },
      { id: 'velocidade', nome: 'Velocidade', tipo: 'numero', min: 0.1, max: 5, passo: 0.1, padrao: 1.2, unidade: 'Hz' },
      { id: 'mistura', nome: 'Mistura', tipo: 'numero', min: 0, max: 100, passo: 1, padrao: 45, unidade: '%' },
    ],
    aplicar: (s, v) => processarComGrafo(s, (ctx, e) => misturar(ctx, e, (x) => {
      const d = ctx.createDelay(0.1); d.delayTime.value = 0.02;
      const lfo = ctx.createOscillator(); lfo.frequency.value = num(v, 'velocidade');
      const prof = ganhoNo(ctx, num(v, 'profundidade') / 1000); lfo.connect(prof).connect(d.delayTime); lfo.start();
      x.connect(d); return d;
    }, num(v, 'mistura') / 100)) },
  { id: 'distorcao', nome: 'Distorção / saturação', grupo: 'Espaço', descricao: 'Esquenta ou "suja" o som (megafone, rádio estourado).',
    ajustes: [
      { id: 'drive', nome: 'Intensidade', tipo: 'numero', min: 0, max: 100, passo: 1, padrao: 30, unidade: '%' },
      { id: 'mistura', nome: 'Mistura', tipo: 'numero', min: 0, max: 100, passo: 1, padrao: 100, unidade: '%' },
    ],
    aplicar: (s, v) => processarComGrafo(s, (ctx, e) => misturar(ctx, e, (x) => {
      const k = num(v, 'drive') * 2, w = ctx.createWaveShaper(), n = 2048, c = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = (i * 2) / n - 1; c[i] = ((3 + k) * t * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(t)); }
      w.curve = c; w.oversample = '4x'; x.connect(w); return w;
    }, num(v, 'mistura') / 100)) },
  { id: 'megafone', nome: 'Megafone / carro de som', grupo: 'Espaço', descricao: 'Voz de alto-falante de rua: médio forte e um pouco de distorção.',
    ajustes: [],
    aplicar: (s) => processarComGrafo(s, (ctx, e) => {
      const w = ctx.createWaveShaper(), n = 2048, c = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = (i * 2) / n - 1; c[i] = Math.tanh(t * 3); }
      w.curve = c;
      return e.connect(biquad(ctx, 'highpass', 500)).connect(biquad(ctx, 'peaking', 1800, 8, 1.2)).connect(w).connect(biquad(ctx, 'lowpass', 5000)).connect(ganhoNo(ctx, 0.8));
    }) },
  { id: 'pan', nome: 'Posição (esquerda/direita)', grupo: 'Espaço', descricao: 'Põe o som mais para a esquerda ou para a direita.',
    ajustes: [{ id: 'pan', nome: 'Posição', tipo: 'numero', min: -100, max: 100, passo: 1, padrao: 0, unidade: '' }],
    aplicar: (s, v) => processarComGrafo(igualarCanais(s, 2), (ctx, e) => { const p = ctx.createStereoPanner(); p.pan.value = num(v, 'pan') / 100; return e.connect(p); }, 2) },

  // ——— Tempo e tom ———
  { id: 'tom', nome: 'Mudar o tom', grupo: 'Tempo e tom', descricao: 'Voz mais grossa ou mais fina, sem mudar a duração.',
    ajustes: [{ id: 'semitons', nome: 'Semitons', tipo: 'numero', min: -12, max: 12, passo: 0.5, padrao: 2, unidade: 'st' }],
    aplicar: (s, v) => mudarTom(s, num(v, 'semitons')) },
  { id: 'tempo', nome: 'Mudar a velocidade (mesmo tom)', grupo: 'Tempo e tom', descricao: 'Fala mais rápida ou mais lenta sem virar "voz de esquilo".', mudaDuracao: true,
    ajustes: [{ id: 'porcento', nome: 'Velocidade', tipo: 'numero', min: 50, max: 200, passo: 1, padrao: 110, unidade: '%' }],
    aplicar: (s, v) => mudarVelocidade(s, num(v, 'porcento'), true) },
  { id: 'velocidade', nome: 'Velocidade e tom juntos', grupo: 'Tempo e tom', descricao: 'Como acelerar o disco: mais rápido e mais fino (ou o contrário).', mudaDuracao: true,
    ajustes: [{ id: 'porcento', nome: 'Velocidade', tipo: 'numero', min: 25, max: 400, passo: 1, padrao: 120, unidade: '%' }],
    aplicar: (s, v) => mudarVelocidade(s, num(v, 'porcento'), false) },

  // ——— Utilidades ———
  { id: 'inverter', nome: 'De trás para frente', grupo: 'Utilidades', descricao: 'Toca o trecho ao contrário.', ajustes: [], aplicar: (s) => deTrasParaFrente(s) },
  { id: 'fase', nome: 'Inverter a fase', grupo: 'Utilidades', descricao: 'Vira a onda de cabeça para baixo (corrige microfones em oposição).', ajustes: [], aplicar: (s) => inverterFase(s) },
  { id: 'mono', nome: 'Converter para mono', grupo: 'Utilidades', descricao: 'Os dois lados com o mesmo som.', ajustes: [], aplicar: (s) => igualarCanais(paraMono(s), s.canais.length) },
  { id: 'trocar-canais', nome: 'Trocar esquerdo e direito', grupo: 'Utilidades', descricao: 'O que era da esquerda vai para a direita.', ajustes: [], aplicar: (s) => trocarCanais(s) },
  { id: 'dc', nome: 'Tirar deslocamento (DC)', grupo: 'Utilidades', descricao: 'Centraliza a onda no zero (corrige estalos no corte).', ajustes: [], aplicar: (s) => tirarDC(s) },
  { id: 'aparar-silencio', nome: 'Aparar silêncio das pontas', grupo: 'Utilidades', descricao: 'Tira o silêncio do começo e do fim.', mudaDuracao: true,
    ajustes: [
      { id: 'limiar', nome: 'Abaixo de', tipo: 'numero', min: -80, max: -10, passo: 1, padrao: -50, unidade: 'dB' },
      { id: 'folga', nome: 'Folga', tipo: 'numero', min: 0, max: 500, passo: 5, padrao: 30, unidade: 'ms' },
    ],
    aplicar: (s, v) => aparaSilencio(s, num(v, 'limiar'), num(v, 'folga')) },
];

export const GRUPOS: GrupoDeEfeito[] = ['Volume e dinâmica', 'Fades', 'Equalizador e filtros', 'Espaço', 'Tempo e tom', 'Utilidades'];
export const efeitoPorId = (id: string) => EFEITOS.find((e) => e.id === id) ?? null;
