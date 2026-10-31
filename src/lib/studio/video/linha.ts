// SOBRE MÍDIA STUDIO — EDITOR DE VÍDEO (F-227): o projeto de vídeo e a matemática da LINHA DO TEMPO, sem tela.
// Faixa principal = clipes em sequência (vídeo, foto ou arte do Studio), cada um com corte (início/fim), velocidade,
// volume, filtro, ajustes, zoom (Ken Burns) e transição para o próximo. Por cima: textos/formas/figurinhas (camadas do
// Studio) com início e fim no tempo. Embaixo: músicas/áudios. Tudo em SEGUNDOS da linha do tempo.
import type { Camada, Documento, FormatoDoc } from '../documento';

export type TipoDeClipe = 'video' | 'imagem' | 'arte';
export type TipoDeTransicao = 'corte' | 'dissolver' | 'preto' | 'branco' | 'deslizar-esquerda' | 'deslizar-direita' | 'deslizar-cima' | 'zoom' | 'cortina' | 'circulo' | 'girar';
export type TipoDeFiltro = 'nenhum' | 'pb' | 'sepia' | 'vintage' | 'quente' | 'frio' | 'vivido' | 'drama' | 'desbotado' | 'noite' | 'neon' | 'pastel';

export interface Ajustes { brilho: number; contraste: number; saturacao: number; matiz: number; desfoque: number; vinheta: number }
export const AJUSTES_NEUTROS: Ajustes = { brilho: 100, contraste: 100, saturacao: 100, matiz: 0, desfoque: 0, vinheta: 0 };

export interface Clipe {
  id: string;
  tipo: TipoDeClipe;
  nome: string;
  /** endereço do vídeo/foto (blob: enquanto envia; depois o do R2) */
  src: string;
  /** arte do Studio (tipo 'arte'), com as animações dela */
  documento?: Documento | null;
  /** vídeo: duração do arquivo (s) */
  duracaoArquivo: number;
  /** vídeo: corte (segundos do arquivo) */
  inicio: number;
  fim: number;
  /** foto/arte: quanto tempo fica na tela (s) */
  duracao: number;
  velocidade: number;
  volume: number;
  mudo: boolean;
  filtro: TipoDeFiltro;
  ajustes: Ajustes;
  /** 'cobrir' corta para encher a tela; 'conter' mostra inteiro com fundo */
  ajuste: 'cobrir' | 'conter';
  /** aproximação lenta (Ken Burns): zoom no começo e no fim */
  zoomDe: number;
  zoomPara: number;
  focoX: number;
  focoY: number;
  girar: 0 | 90 | 180 | 270;
  espelhar: boolean;
  /** transição para o PRÓXIMO clipe */
  transicao: { tipo: TipoDeTransicao; duracao: number };
  /** áudio: entra e sai suave (s) */
  somEntra: number;
  somSai: number;
}

/** Texto, forma, figurinha, selo, lista ou foto por cima do vídeo, entre `de` e `ate` (s). */
export type Sobreposicao = Camada & { de: number; ate: number };

export interface FaixaDeAudio {
  id: string; nome: string; src: string;
  duracaoArquivo: number;
  /** onde começa na linha do tempo (s) */
  em: number;
  /** corte do arquivo (s) */
  inicio: number; fim: number;
  volume: number; somEntra: number; somSai: number; repetir: boolean;
}

export interface ProjetoDeVideo {
  versao: 1;
  tipo: 'video';
  formato: FormatoDoc;
  fundo: string;
  clipes: Clipe[];
  sobreposicoes: Sobreposicao[];
  audios: FaixaDeAudio[];
}

/** a arte do editor de imagens que vai para o editor de vídeo (guardada na aba do navegador) */
export const CHAVE_ARTE_PARA_VIDEO = 'studio-arte-para-video';

let seq = 0;
export const idNovo = (p = 'v') => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const projetoVazio = (formato: FormatoDoc = '16:9'): ProjetoDeVideo => ({ versao: 1, tipo: 'video', formato, fundo: '#000000', clipes: [], sobreposicoes: [], audios: [] });

export function novoClipe(tipo: TipoDeClipe, src: string, nome: string, o: Partial<Clipe> = {}): Clipe {
  const duracaoArquivo = o.duracaoArquivo ?? 0;
  return {
    id: idNovo('c'), tipo, nome, src, documento: null, duracaoArquivo,
    inicio: 0, fim: tipo === 'video' ? duracaoArquivo : 0, duracao: tipo === 'video' ? 0 : 4,
    velocidade: 1, volume: 1, mudo: false, filtro: 'nenhum', ajustes: { ...AJUSTES_NEUTROS },
    ajuste: 'cobrir', zoomDe: 1, zoomPara: tipo === 'imagem' ? 1.08 : 1, focoX: 50, focoY: 50, girar: 0, espelhar: false,
    transicao: { tipo: 'dissolver', duracao: 0.5 }, somEntra: 0, somSai: 0,
    ...o,
  };
}

/** Quanto o clipe dura na linha do tempo (vídeo: trecho cortado ÷ velocidade). */
export const duracaoDoClipe = (c: Clipe) => (c.tipo === 'video' ? Math.max(0.1, (c.fim - c.inicio) / Math.max(0.1, c.velocidade)) : Math.max(0.1, c.duracao));

/** Transição efetiva entre o clipe i e o próximo (nunca maior que metade de um deles). */
export function transicaoEntre(clipes: Clipe[], i: number): number {
  const a = clipes[i], b = clipes[i + 1];
  if (!a || !b || a.transicao.tipo === 'corte') return 0;
  return Math.max(0, Math.min(a.transicao.duracao, duracaoDoClipe(a) / 2, duracaoDoClipe(b) / 2));
}

/** Onde cada clipe começa na linha do tempo (a transição sobrepõe o fim de um com o começo do outro). */
export function inicios(clipes: Clipe[]): number[] {
  const out: number[] = [];
  let t = 0;
  clipes.forEach((c, i) => { out.push(t); t += duracaoDoClipe(c) - transicaoEntre(clipes, i); });
  return out;
}

export function duracaoTotal(p: Pick<ProjetoDeVideo, 'clipes' | 'sobreposicoes' | 'audios'>): number {
  const ini = inicios(p.clipes);
  const clipes = p.clipes.length ? ini[ini.length - 1] + duracaoDoClipe(p.clipes[p.clipes.length - 1]) : 0;
  const sob = p.sobreposicoes.reduce((m, s) => Math.max(m, s.ate), 0);
  return Math.max(clipes, sob, p.clipes.length ? 0 : 3);
}

export interface Quadro { clipe: Clipe; indice: number; local: number; progresso: number }
/** O que aparece no instante t: o clipe da vez e, durante uma transição, o próximo (com o progresso 0→1). */
export function noTempo(clipes: Clipe[], t: number): { atual: Quadro | null; proximo: Quadro | null; transicao: number } {
  const ini = inicios(clipes);
  for (let i = 0; i < clipes.length; i++) {
    const d = duracaoDoClipe(clipes[i]);
    if (t >= ini[i] && (t < ini[i] + d || i === clipes.length - 1)) {
      const local = Math.min(d, t - ini[i]);
      const tr = transicaoEntre(clipes, i);
      const atual: Quadro = { clipe: clipes[i], indice: i, local, progresso: local / d };
      if (tr > 0 && local > d - tr && clipes[i + 1]) {
        const lp = local - (d - tr);
        const dp = duracaoDoClipe(clipes[i + 1]);
        return { atual, proximo: { clipe: clipes[i + 1], indice: i + 1, local: lp, progresso: lp / dp }, transicao: lp / tr };
      }
      return { atual, proximo: null, transicao: 0 };
    }
  }
  return { atual: null, proximo: null, transicao: 0 };
}

/** Segundo do ARQUIVO de vídeo para um instante local do clipe. */
export const tempoNoArquivo = (c: Clipe, local: number) => Math.min(c.fim, c.inicio + local * c.velocidade);

/** Corta o clipe em dois no instante `local` (s do clipe): "Dividir" do CapCut. */
export function dividir(c: Clipe, local: number): [Clipe, Clipe] | null {
  const d = duracaoDoClipe(c);
  if (local <= 0.15 || local >= d - 0.15) return null;
  if (c.tipo === 'video') {
    const meio = tempoNoArquivo(c, local);
    return [{ ...c, fim: meio, transicao: { tipo: 'corte', duracao: 0 } }, { ...c, id: idNovo('c'), inicio: meio }];
  }
  return [{ ...c, duracao: local, transicao: { tipo: 'corte', duracao: 0 } }, { ...c, id: idNovo('c'), duracao: d - local }];
}

/** Ajusta o corte pelas pontas (s do arquivo), sem passar do arquivo nem deixar menos de 0,2 s. */
export function cortar(c: Clipe, ponta: 'inicio' | 'fim', valor: number): Clipe {
  if (c.tipo !== 'video') return ponta === 'fim' ? { ...c, duracao: Math.max(0.3, Math.min(120, valor)) } : c;
  if (ponta === 'inicio') return { ...c, inicio: Math.max(0, Math.min(valor, c.fim - 0.2)) };
  return { ...c, fim: Math.min(c.duracaoArquivo || c.fim, Math.max(valor, c.inicio + 0.2)) };
}

/** Volume do áudio do clipe no instante local (entrada e saída suaves). */
export function volumeNoTempo(volume: number, local: number, duracao: number, entra: number, sai: number) {
  let v = volume;
  if (entra > 0 && local < entra) v *= Math.max(0, local / entra);
  if (sai > 0 && local > duracao - sai) v *= Math.max(0, (duracao - local) / sai);
  return Math.max(0, Math.min(2, v));
}

export const formatarTempo = (s: number) => {
  const m = Math.floor(Math.max(0, s) / 60);
  const r = Math.max(0, s) - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
};
