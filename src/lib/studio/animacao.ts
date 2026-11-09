// SOBRE MÍDIA STUDIO — animações simples por elemento, como as do Canva (F-225). A arte continua sendo uma imagem;
// quando algum elemento tem animação, o editor mostra o movimento e grava um VÍDEO (mesmo desenho do PNG, quadro a
// quadro). Entradas acontecem uma vez (surgir, subir, deslizar, zoom, girar, digitar); efeitos contínuos repetem
// durante todo o vídeo (pulsar, balançar, piscar, panorâmica lenta na foto).
import type { Camada, Documento } from './documento';

export type TipoDeAnimacao =
  | 'surgir' | 'subir' | 'descer' | 'esquerda' | 'direita' | 'zoom' | 'girar' | 'digitar'
  /* F-290: entradas novas */ | 'quicar' | 'zoom-de-longe' | 'virar' | 'surgir-lento'
  | 'pulsar' | 'balancar' | 'piscar' | 'panoramica' | 'flutuar'
  /* F-290: movimentos contínuos novos */ | 'oscilar' | 'tremer' | 'respirar' | 'girar-sempre' | 'quicar-sempre' | 'brilhar';
/** F-290: como o elemento SAI no fim do tempo dele (antes da troca de produto/cena) */
export type TipoDeSaida = 'sumir' | 'subir' | 'descer' | 'esquerda' | 'direita' | 'diminuir' | 'aumentar' | 'girar';
export interface Animacao {
  tipo: TipoDeAnimacao; /** segundos até começar */ atraso: number; /** segundos da entrada */ duracao: number;
  /** F-234: efeito contínuo DEPOIS da entrada (ex.: o selo entra com zoom e fica pulsando; o produto sobe e fica flutuando) */
  depois?: TipoDeAnimacao | null;
  /** F-290: um SEGUNDO movimento contínuo junto com o primeiro (ex.: pulsar e balançar ao mesmo tempo) */
  depois2?: TipoDeAnimacao | null;
  /** F-290: efeito de SAÍDA no fim do tempo do elemento */
  saida?: { tipo: TipoDeSaida; duracao: number } | null;
}

export const ANIMACOES: { id: TipoDeAnimacao; nome: string; continua?: boolean; so?: Camada['tipo'][] }[] = [
  { id: 'surgir', nome: 'Surgir' },
  { id: 'subir', nome: 'Subir' },
  { id: 'descer', nome: 'Descer' },
  { id: 'esquerda', nome: 'Entrar da esquerda' },
  { id: 'direita', nome: 'Entrar da direita' },
  { id: 'zoom', nome: 'Zoom' },
  { id: 'girar', nome: 'Girar' },
  { id: 'quicar', nome: 'Quicar' },
  { id: 'zoom-de-longe', nome: 'Zoom de longe' },
  { id: 'virar', nome: 'Virar' },
  { id: 'surgir-lento', nome: 'Aparecer devagar (fade)' },
  { id: 'digitar', nome: 'Máquina de escrever', so: ['texto'] },
  { id: 'pulsar', nome: 'Pulsar', continua: true },
  { id: 'balancar', nome: 'Balançar', continua: true },
  { id: 'piscar', nome: 'Piscar', continua: true },
  { id: 'panoramica', nome: 'Panorâmica lenta', continua: true, so: ['imagem'] },
  { id: 'flutuar', nome: 'Flutuar', continua: true },
  { id: 'oscilar', nome: 'Ir e voltar (lados)', continua: true },
  { id: 'tremer', nome: 'Tremer', continua: true },
  { id: 'respirar', nome: 'Respirar', continua: true },
  { id: 'girar-sempre', nome: 'Girar sem parar', continua: true },
  { id: 'quicar-sempre', nome: 'Quicar sem parar', continua: true },
  { id: 'brilhar', nome: 'Brilhar', continua: true },
];

/** F-290: as saídas (no fim do tempo do elemento) */
export const SAIDAS: { id: TipoDeSaida; nome: string }[] = [
  { id: 'sumir', nome: 'Sumir (fade)' }, { id: 'subir', nome: 'Sair por cima' }, { id: 'descer', nome: 'Sair por baixo' },
  { id: 'esquerda', nome: 'Sair pela esquerda' }, { id: 'direita', nome: 'Sair pela direita' }, { id: 'diminuir', nome: 'Diminuir' },
  { id: 'aumentar', nome: 'Aumentar e sumir' }, { id: 'girar', nome: 'Girar e sumir' },
];

/** Efeitos que repetem durante o vídeo (servem como "depois" de uma entrada). */
export const CONTINUAS: TipoDeAnimacao[] = ['pulsar', 'balancar', 'piscar', 'panoramica', 'flutuar', 'oscilar', 'tremer', 'respirar', 'girar-sempre', 'quicar-sempre', 'brilhar'];

export const DURACAO_PADRAO = 8;
export const duracaoDoVideo = (d: Documento) => Math.min(30, Math.max(3, d.video?.duracao ?? DURACAO_PADRAO));
export const temAnimacao = (d: Documento) => d.camadas.some((c) => c.visivel && c.animacao);

/** `zoom`: aproximação DENTRO da moldura da foto (panorâmica), sem a foto crescer por cima do resto */
export interface EstadoAnimado { alfa: number; dx: number; dy: number; escala: number; rot: number; letras: number | null; zoom: number; /** F-290: largura (virar) */ ex: number }
const PARADO: EstadoAnimado = { alfa: 1, dx: 0, dy: 0, escala: 1, rot: 0, letras: null, zoom: 1, ex: 1 };
/** soma dois estados (os movimentos se somam sem salto) */
const somar = (a: EstadoAnimado, b: EstadoAnimado): EstadoAnimado => ({ alfa: a.alfa * b.alfa, dx: a.dx + b.dx, dy: a.dy + b.dy, escala: a.escala * b.escala, rot: a.rot + b.rot, letras: a.letras ?? b.letras, zoom: a.zoom * b.zoom, ex: a.ex * b.ex });
const suave = (p: number) => 1 - Math.pow(1 - p, 3);

/** Como a camada aparece no instante `t` (segundos). Sem animação: parada. */
export function estadoNoTempo(c: Camada, t: number, total = DURACAO_PADRAO): EstadoAnimado {
  const a = c.animacao;
  if (!a) return PARADO;
  let e = estadoDe(c, a, t, total);
  // F-234: terminou de entrar → passa a se mexer com o efeito contínuo; F-290: até DOIS movimentos juntos (somados, sem salto)
  const inicioDepois = CONTINUAS.includes(a.tipo) ? a.atraso : a.atraso + a.duracao;
  for (const dep of [CONTINUAS.includes(a.tipo) ? null : a.depois, a.depois2]) {
    if (dep && t >= inicioDepois) e = somar(e, estadoDe(c, { tipo: dep, atraso: inicioDepois, duracao: 1 }, t, total));
  }
  // F-290: saída no fim do tempo do elemento
  if (a.saida) {
    const ini = total - a.saida.duracao;
    if (t > ini) e = somar(e, saidaDe(c, a.saida.tipo, Math.min(1, (t - ini) / Math.max(0.1, a.saida.duracao))));
  }
  return e;
}

/** F-290: o estado da saída (p de 0 a 1), suave no começo */
function saidaDe(c: Camada, tipo: TipoDeSaida, p: number): EstadoAnimado {
  const e = p * p * (3 - 2 * p);
  switch (tipo) {
    case 'sumir': return { ...PARADO, alfa: 1 - e };
    case 'subir': return { ...PARADO, alfa: 1 - e, dy: -e * Math.max(160, c.h * 0.8) };
    case 'descer': return { ...PARADO, alfa: 1 - e, dy: e * Math.max(160, c.h * 0.8) };
    case 'esquerda': return { ...PARADO, alfa: 1 - e, dx: -e * Math.max(300, c.w) };
    case 'direita': return { ...PARADO, alfa: 1 - e, dx: e * Math.max(300, c.w) };
    case 'diminuir': return { ...PARADO, alfa: 1 - e, escala: 1 - 0.7 * e };
    case 'aumentar': return { ...PARADO, alfa: 1 - e, escala: 1 + 0.6 * e };
    case 'girar': return { ...PARADO, alfa: 1 - e, rot: 200 * e, escala: 1 - 0.5 * e };
  }
}

function estadoDe(c: Camada, a: Animacao, t: number, total: number): EstadoAnimado {
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
    // F-290: entradas novas
    case 'quicar': {
      // cai de cima e quica 2 vezes, cada vez mais baixo (curva lisa)
      const altura = Math.max(200, c.h * 0.9);
      const q = p < 0.55 ? 1 - Math.pow(p / 0.55, 2) : p < 0.8 ? 0.22 * Math.sin(((p - 0.55) / 0.25) * Math.PI) : 0.07 * Math.sin(((p - 0.8) / 0.2) * Math.PI);
      return { ...PARADO, alfa: Math.min(1, p * 4), dy: -q * altura };
    }
    case 'zoom-de-longe': return { ...PARADO, alfa: e, escala: 2.2 - 1.2 * e };
    case 'virar': return { ...PARADO, alfa: local < 0 ? 0 : 1, ex: Math.max(0.02, Math.abs(Math.cos((1 - e) * Math.PI / 2 * 1)) ) };
    case 'surgir-lento': { const q = Math.min(1, Math.max(0, local / Math.max(0.1, a.duracao * 2))); return { ...PARADO, alfa: q * q * (3 - 2 * q) }; }
    case 'digitar': {
      const n = c.tipo === 'texto' ? c.texto.length : 0;
      return { ...PARADO, alfa: local < 0 ? 0 : 1, letras: Math.floor(n * p) };
    }
    case 'pulsar': return local < 0 ? PARADO : { ...PARADO, escala: 1 + 0.06 * Math.sin((local * 2 * Math.PI) / 1.2) };
    case 'balancar': return local < 0 ? PARADO : { ...PARADO, rot: 4 * Math.sin((local * 2 * Math.PI) / 1.6) };
    case 'piscar': return local < 0 ? PARADO : { ...PARADO, alfa: 0.55 + 0.45 * Math.cos((local * 2 * Math.PI) / 1.1) };
    case 'flutuar': return local < 0 ? PARADO : { ...PARADO, dy: -10 * Math.sin((local * 2 * Math.PI) / 2.4) };
    // F-290: movimentos contínuos novos (todos por seno: lisos, sem salto)
    case 'oscilar': return local < 0 ? PARADO : { ...PARADO, dx: Math.max(10, c.w * 0.04) * Math.sin((local * 2 * Math.PI) / 2) };
    case 'tremer': return local < 0 ? PARADO : { ...PARADO, rot: 2.2 * Math.sin(local * 2 * Math.PI * 4) * (0.5 + 0.5 * Math.sin(local * 2 * Math.PI * 0.5)) };
    case 'respirar': return local < 0 ? PARADO : { ...PARADO, escala: 1 + 0.035 * Math.sin((local * 2 * Math.PI) / 3) };
    case 'girar-sempre': return local < 0 ? PARADO : { ...PARADO, rot: (local * 360) / 6 };
    case 'quicar-sempre': return local < 0 ? PARADO : { ...PARADO, dy: -Math.abs(Math.sin((local * Math.PI) / 0.9)) * Math.max(12, c.h * 0.06) };
    case 'brilhar': return local < 0 ? PARADO : { ...PARADO, alfa: 0.82 + 0.18 * (0.5 + 0.5 * Math.cos((local * 2 * Math.PI) / 1.4)), escala: 1 + 0.02 * Math.sin((local * 2 * Math.PI) / 1.4) };
    case 'panoramica': {
      const q = Math.min(1, Math.max(0, local / Math.max(1, total - a.atraso)));
      return { ...PARADO, zoom: 1 + 0.15 * suave(q) };
    }
  }
}

/**
 * F-234 — COREOGRAFIA: a versão em vídeo de qualquer arte, com os mesmos comandos de animação que o usuário usa à mão.
 * Todos os elementos se mexem em coerência: o fundo/foto abre com a panorâmica lenta; as faixas e formas surgem primeiro;
 * depois, de cima para baixo, cada texto entra pelo lado em que está (topo desce, esquerda entra da esquerda, direita da
 * direita, embaixo sobe), um após o outro; o selo de preço entra com zoom e fica pulsando; o botão sobe e pisca de leve;
 * fotos pequenas (produto, logo) entram com zoom e ficam flutuando. Nada entra junto: o olhar segue a leitura da arte.
 */
export function coreografia(d: Documento): Documento {
  const { w: W, h: H } = d.formato === '9:16' ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };
  const vivas = d.camadas.filter((c) => c.visivel && !c.bloqueada);
  const fotoPrincipal = vivas.filter((c) => c.tipo === 'imagem').sort((a, b) => b.w * b.h - a.w * a.h)[0];
  // ordem de leitura: de cima para baixo e, na mesma altura, da esquerda para a direita
  const leitura = vivas.filter((c) => c !== fotoPrincipal && c.tipo !== 'forma').sort((a, b) => (Math.abs(a.y - b.y) < 40 ? a.x - b.x : a.y - b.y));
  const ordem = new Map(leitura.map((c, i) => [c.id, i]));
  const r = (n: number) => Math.round(n * 100) / 100;
  const camadas = d.camadas.map((c) => {
    if (c.bloqueada || !c.visivel) return c;
    if (c === fotoPrincipal) return { ...c, animacao: { tipo: 'panoramica' as const, atraso: 0, duracao: 1 } };
    if (c.tipo === 'forma') {
      // faixas largas varrem a tela pelo lado em que estão; formas pequenas surgem
      const larga = c.w > W * 0.5;
      const tipo: TipoDeAnimacao = larga ? (c.x + c.w / 2 < W / 2 ? 'esquerda' : 'direita') : 'surgir';
      return { ...c, animacao: { tipo, atraso: r(Math.min(0.4, (c.y / H) * 0.4)), duracao: 0.6 } };
    }
    const i = ordem.get(c.id) ?? 0;
    const atraso = r(0.5 + 0.32 * i);
    const meioX = c.x + c.w / 2, meioY = c.y + c.h / 2;
    if (c.tipo === 'selo') return { ...c, animacao: { tipo: 'zoom' as const, atraso, duracao: 0.6, depois: 'pulsar' as const } };
    if (c.tipo === 'imagem') return { ...c, animacao: { tipo: 'zoom' as const, atraso, duracao: 0.7, depois: 'flutuar' as const } };
    if (c.nome === 'Botão' || /^cta|botão|preço/i.test(c.nome)) return { ...c, animacao: { tipo: 'subir' as const, atraso, duracao: 0.6, depois: 'pulsar' as const } };
    const tipo: TipoDeAnimacao = meioY < H * 0.28 ? 'descer' : meioY > H * 0.72 ? 'subir' : meioX < W * 0.38 ? 'esquerda' : meioX > W * 0.62 ? 'direita' : 'subir';
    return { ...c, animacao: { tipo, atraso, duracao: c.nome.startsWith('Título') ? 0.8 : 0.6 } };
  });
  const fim = camadas.reduce((m, c) => Math.max(m, c.animacao ? c.animacao.atraso + c.animacao.duracao : 0), 0);
  return { ...d, camadas, video: { duracao: Math.max(d.video?.duracao ?? DURACAO_PADRAO, Math.ceil(fim + 3)) } };
}

/** Sugestão pronta ("Animar tudo"): a coreografia coerente da arte inteira, como um "estilo" do Canva. */
export const animarTudo = (d: Documento): Documento => coreografia(d);

export const tirarAnimacoes = (d: Documento): Documento => ({ ...d, camadas: d.camadas.map((c) => ({ ...c, animacao: null })) });
