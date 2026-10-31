// SOBRE MÍDIA STUDIO — animações simples por elemento, como as do Canva (F-225). A arte continua sendo uma imagem;
// quando algum elemento tem animação, o editor mostra o movimento e grava um VÍDEO (mesmo desenho do PNG, quadro a
// quadro). Entradas acontecem uma vez (surgir, subir, deslizar, zoom, girar, digitar); efeitos contínuos repetem
// durante todo o vídeo (pulsar, balançar, piscar, panorâmica lenta na foto).
import type { Camada, Documento } from './documento';

export type TipoDeAnimacao =
  | 'surgir' | 'subir' | 'descer' | 'esquerda' | 'direita' | 'zoom' | 'girar' | 'digitar'
  | 'pulsar' | 'balancar' | 'piscar' | 'panoramica';
export interface Animacao { tipo: TipoDeAnimacao; /** segundos até começar */ atraso: number; /** segundos da entrada */ duracao: number }

export const ANIMACOES: { id: TipoDeAnimacao; nome: string; continua?: boolean; so?: Camada['tipo'][] }[] = [
  { id: 'surgir', nome: 'Surgir' },
  { id: 'subir', nome: 'Subir' },
  { id: 'descer', nome: 'Descer' },
  { id: 'esquerda', nome: 'Entrar da esquerda' },
  { id: 'direita', nome: 'Entrar da direita' },
  { id: 'zoom', nome: 'Zoom' },
  { id: 'girar', nome: 'Girar' },
  { id: 'digitar', nome: 'Máquina de escrever', so: ['texto'] },
  { id: 'pulsar', nome: 'Pulsar', continua: true },
  { id: 'balancar', nome: 'Balançar', continua: true },
  { id: 'piscar', nome: 'Piscar', continua: true },
  { id: 'panoramica', nome: 'Panorâmica lenta', continua: true, so: ['imagem'] },
];

export const DURACAO_PADRAO = 8;
export const duracaoDoVideo = (d: Documento) => Math.min(30, Math.max(3, d.video?.duracao ?? DURACAO_PADRAO));
export const temAnimacao = (d: Documento) => d.camadas.some((c) => c.visivel && c.animacao);

/** `zoom`: aproximação DENTRO da moldura da foto (panorâmica), sem a foto crescer por cima do resto */
export interface EstadoAnimado { alfa: number; dx: number; dy: number; escala: number; rot: number; letras: number | null; zoom: number }
const PARADO: EstadoAnimado = { alfa: 1, dx: 0, dy: 0, escala: 1, rot: 0, letras: null, zoom: 1 };
const suave = (p: number) => 1 - Math.pow(1 - p, 3);

/** Como a camada aparece no instante `t` (segundos). Sem animação: parada. */
export function estadoNoTempo(c: Camada, t: number, total = DURACAO_PADRAO): EstadoAnimado {
  const a = c.animacao;
  if (!a) return PARADO;
  const local = t - a.atraso;
  const p = Math.min(1, Math.max(0, local / Math.max(0.1, a.duracao)));
  const e = suave(p);
  switch (a.tipo) {
    case 'surgir': return { ...PARADO, alfa: e };
    case 'subir': return { ...PARADO, alfa: e, dy: (1 - e) * Math.max(120, c.h * 0.6) };
    case 'descer': return { ...PARADO, alfa: e, dy: -(1 - e) * Math.max(120, c.h * 0.6) };
    case 'esquerda': return { ...PARADO, alfa: e, dx: -(1 - e) * Math.max(240, c.w * 0.8) };
    case 'direita': return { ...PARADO, alfa: e, dx: (1 - e) * Math.max(240, c.w * 0.8) };
    case 'zoom': return { ...PARADO, alfa: e, escala: 0.4 + 0.6 * e };
    case 'girar': return { ...PARADO, alfa: e, rot: (1 - e) * -180, escala: 0.6 + 0.4 * e };
    case 'digitar': {
      const n = c.tipo === 'texto' ? c.texto.length : 0;
      return { ...PARADO, alfa: local < 0 ? 0 : 1, letras: Math.floor(n * p) };
    }
    case 'pulsar': return local < 0 ? PARADO : { ...PARADO, escala: 1 + 0.06 * Math.sin((local * 2 * Math.PI) / 1.2) };
    case 'balancar': return local < 0 ? PARADO : { ...PARADO, rot: 4 * Math.sin((local * 2 * Math.PI) / 1.6) };
    case 'piscar': return local < 0 ? PARADO : { ...PARADO, alfa: 0.55 + 0.45 * Math.cos((local * 2 * Math.PI) / 1.1) };
    case 'panoramica': {
      const q = Math.min(1, Math.max(0, local / Math.max(1, total - a.atraso)));
      return { ...PARADO, zoom: 1 + 0.15 * suave(q) };
    }
  }
}

/** Sugestão pronta: anima a arte inteira em sequência (foto, título, textos, botão), como um "estilo" do Canva. */
export function animarTudo(d: Documento): Documento {
  let ordem = 0;
  const camadas = d.camadas.map((c) => {
    if (c.bloqueada || !c.visivel) return c;
    if (c.tipo === 'imagem') return { ...c, animacao: { tipo: 'panoramica' as const, atraso: 0, duracao: 1 } };
    const tipo: TipoDeAnimacao = c.nome.startsWith('Título') ? 'subir' : c.nome === 'Botão' ? 'zoom' : c.tipo === 'selo' ? 'zoom' : c.tipo === 'forma' ? 'surgir' : 'subir';
    const atraso = c.tipo === 'forma' ? 0 : 0.3 + 0.35 * ordem++;
    return { ...c, animacao: { tipo, atraso: Math.round(atraso * 100) / 100, duracao: 0.7 } };
  });
  return { ...d, camadas, video: { duracao: d.video?.duracao ?? DURACAO_PADRAO } };
}

export const tirarAnimacoes = (d: Documento): Documento => ({ ...d, camadas: d.camadas.map((c) => ({ ...c, animacao: null })) });
