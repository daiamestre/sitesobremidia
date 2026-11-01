// SOBRE MÍDIA STUDIO — animações simples por elemento, como as do Canva (F-225). A arte continua sendo uma imagem;
// quando algum elemento tem animação, o editor mostra o movimento e grava um VÍDEO (mesmo desenho do PNG, quadro a
// quadro). Entradas acontecem uma vez (surgir, subir, deslizar, zoom, girar, digitar); efeitos contínuos repetem
// durante todo o vídeo (pulsar, balançar, piscar, panorâmica lenta na foto).
import type { Camada, Documento } from './documento';

export type TipoDeAnimacao =
  | 'surgir' | 'subir' | 'descer' | 'esquerda' | 'direita' | 'zoom' | 'girar' | 'digitar'
  | 'pulsar' | 'balancar' | 'piscar' | 'panoramica' | 'flutuar';
export interface Animacao {
  tipo: TipoDeAnimacao; /** segundos até começar */ atraso: number; /** segundos da entrada */ duracao: number;
  /** F-234: efeito contínuo DEPOIS da entrada (ex.: o selo entra com zoom e fica pulsando; o produto sobe e fica flutuando) */
  depois?: TipoDeAnimacao | null;
}

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
  { id: 'flutuar', nome: 'Flutuar', continua: true },
];

/** Efeitos que repetem durante o vídeo (servem como "depois" de uma entrada). */
export const CONTINUAS: TipoDeAnimacao[] = ['pulsar', 'balancar', 'piscar', 'panoramica', 'flutuar'];

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
  const entrada = estadoDe(c, a, t, total);
  if (!a.depois || CONTINUAS.includes(a.tipo)) return entrada;
  // F-234: terminou de entrar → passa a se mexer com o efeito contínuo (os dois se somam sem salto)
  const inicioDepois = a.atraso + a.duracao;
  if (t < inicioDepois) return entrada;
  const d = estadoDe(c, { tipo: a.depois, atraso: inicioDepois, duracao: 1 }, t, total);
  return { alfa: entrada.alfa * d.alfa, dx: entrada.dx + d.dx, dy: entrada.dy + d.dy, escala: entrada.escala * d.escala, rot: entrada.rot + d.rot, letras: entrada.letras, zoom: entrada.zoom * d.zoom };
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
    case 'digitar': {
      const n = c.tipo === 'texto' ? c.texto.length : 0;
      return { ...PARADO, alfa: local < 0 ? 0 : 1, letras: Math.floor(n * p) };
    }
    case 'pulsar': return local < 0 ? PARADO : { ...PARADO, escala: 1 + 0.06 * Math.sin((local * 2 * Math.PI) / 1.2) };
    case 'balancar': return local < 0 ? PARADO : { ...PARADO, rot: 4 * Math.sin((local * 2 * Math.PI) / 1.6) };
    case 'piscar': return local < 0 ? PARADO : { ...PARADO, alfa: 0.55 + 0.45 * Math.cos((local * 2 * Math.PI) / 1.1) };
    case 'flutuar': return local < 0 ? PARADO : { ...PARADO, dy: -10 * Math.sin((local * 2 * Math.PI) / 2.4) };
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
