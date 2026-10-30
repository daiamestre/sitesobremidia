// SOBRE MÍDIA STUDIO — documento de CAMADAS (F-221). Todo modelo vira uma lista de camadas livres (foto, formas,
// textos, selo, lista com ícones) em 16:9 (1920×1080) E 9:16 (1080×1920). Cada camada pode ser arrastada, girada,
// redimensionada, recolorida e trocada de fonte no editor; o mesmo desenho (desenhar.ts) faz a prévia e o PNG.
// A foto sempre ocupa uma área quadrada (1080×1080) nos dois formatos: a foto quadrada 1024 px não perde qualidade.
import { fonteCanvas, fonteDoStudio } from './fontes';
import type { ModeloDeArte } from './modelos';

export type FormatoDoc = '16:9' | '9:16';
export const TAMANHO_DOC: Record<FormatoDoc, { w: number; h: number }> = { '16:9': { w: 1920, h: 1080 }, '9:16': { w: 1080, h: 1920 } };

export interface Sombra { cor: string; desfoque: number; dx: number; dy: number }
/** degradê linear; ângulo 0 = da esquerda para a direita, 90 = de cima para baixo */
export interface Degrade { de: string; meio?: string | null; para: string; angulo: number }

interface CamadaBase {
  id: string; nome: string;
  x: number; y: number; w: number; h: number;
  /** graus, no sentido horário */
  rot: number; opacidade: number; visivel: boolean; bloqueada: boolean;
  sombra?: Sombra | null;
}
export interface CamadaTexto extends CamadaBase {
  tipo: 'texto'; texto: string; fonte: string; peso?: number; italico: boolean; tamanho: number;
  cor: string; degrade?: Degrade | null; corUltimaLinha?: string | null;
  alinhamento: 'left' | 'center' | 'right'; entrelinha: number; espacamento: number; maiusculas: boolean;
  contorno?: { cor: string; largura: number } | null;
  /** caixa/pílula atrás do texto */
  fundo?: { cor: string; raio: number; margem: number } | null;
}
export interface CamadaForma extends CamadaBase {
  tipo: 'forma'; forma: 'retangulo' | 'elipse'; cor: string; degrade?: Degrade | null; raio: number;
  /** inclinação horizontal em graus (painel inclinado) */
  inclinacao: number; borda?: { cor: string; largura: number } | null;
}
export interface CamadaImagem extends CamadaBase {
  tipo: 'imagem'; src: string; zoom: number; focoX: number; focoY: number; espelhar: boolean;
  brilho: number; contraste: number; saturacao: number; desfoque: number; raio: number;
}
export interface CamadaSelo extends CamadaBase {
  tipo: 'selo'; topo: string; valor: string; sufixo: string; base: string; fonte: string; cor: string; corTexto: string; borda: string;
}
export interface CamadaItens extends CamadaBase {
  tipo: 'itens'; itens: string[]; fonte: string; cor: string; destaque: string; tamanho: number; vertical: boolean;
}
export type Camada = CamadaTexto | CamadaForma | CamadaImagem | CamadaSelo | CamadaItens;
export type TipoDeCamada = Camada['tipo'];

export interface Documento { versao: 2; formato: FormatoDoc; fundo: string; camadas: Camada[] }

// ───────────────────────────────────────────────────────────── medida de texto (canvas; reserva por estimativa)
let ctxMedida: CanvasRenderingContext2D | null | undefined;
function contexto() {
  if (ctxMedida === undefined) {
    try { ctxMedida = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null; } catch { ctxMedida = null; }
  }
  return ctxMedida;
}

export function larguraDoTexto(t: string, fonte: string, tamanho: number, peso?: number, italico = false, espacamento = 0) {
  const ctx = contexto();
  if (ctx) {
    ctx.font = fonteCanvas(fonte, tamanho, peso, italico);
    return ctx.measureText(t).width + espacamento * tamanho * Math.max(0, t.length - 1);
  }
  return t.length * tamanho * (fonteDoStudio(fonte).fator + espacamento);
}

/** Quebra o texto em linhas que cabem na largura (respeita as quebras de linha digitadas). */
export function linhasDoTexto(c: Pick<CamadaTexto, 'texto' | 'fonte' | 'tamanho' | 'peso' | 'italico' | 'espacamento' | 'maiusculas' | 'w' | 'fundo'>): string[] {
  const largura = Math.max(10, c.w - 2 * (c.fundo?.margem ?? 0));
  const texto = c.maiusculas ? c.texto.toLocaleUpperCase('pt-BR') : c.texto;
  const saida: string[] = [];
  for (const paragrafo of texto.split('\n')) {
    const palavras = paragrafo.split(/\s+/).filter(Boolean);
    if (!palavras.length) { saida.push(''); continue; }
    let linha = '';
    for (const p of palavras) {
      const tentativa = linha ? `${linha} ${p}` : p;
      if (linha && larguraDoTexto(tentativa, c.fonte, c.tamanho, c.peso, c.italico, c.espacamento) > largura) { saida.push(linha); linha = p; } else linha = tentativa;
    }
    saida.push(linha);
  }
  return saida;
}

/** Altura que o texto ocupa (a caixa do texto cresce com o conteúdo, como no Canva). */
export function alturaDoTexto(c: CamadaTexto) {
  return linhasDoTexto(c).length * c.tamanho * c.entrelinha + 2 * (c.fundo?.margem ?? 0) * (c.fundo ? 0.55 : 0);
}

export function alturaDosItens(c: Pick<CamadaItens, 'itens' | 'tamanho' | 'vertical'>) {
  return c.vertical ? c.itens.length * c.tamanho * 1.75 - c.tamanho * 0.3 : c.tamanho * 1.5;
}

// ───────────────────────────────────────────────────────────── fábrica de camadas
let seq = 0;
export const novoId = (prefixo = 'c') => `${prefixo}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const base = (nome: string, x: number, y: number, w: number, h: number): CamadaBase => ({ id: novoId(), nome, x, y, w, h, rot: 0, opacidade: 1, visivel: true, bloqueada: false, sombra: null });

export function texto(nome: string, t: string, x: number, y: number, w: number, o: Partial<CamadaTexto> = {}): CamadaTexto {
  const c: CamadaTexto = {
    ...base(nome, x, y, w, 0), tipo: 'texto', texto: t, fonte: 'poppins', italico: false, tamanho: 48, cor: '#ffffff',
    alinhamento: 'left', entrelinha: 1.15, espacamento: 0, maiusculas: false, ...o,
  };
  c.h = Math.round(alturaDoTexto(c));
  return c;
}
export const forma = (nome: string, x: number, y: number, w: number, h: number, o: Partial<CamadaForma> = {}): CamadaForma =>
  ({ ...base(nome, x, y, w, h), tipo: 'forma', forma: 'retangulo', cor: '#ffffff', raio: 0, inclinacao: 0, ...o });
export const imagem = (nome: string, src: string, x: number, y: number, w: number, h: number, o: Partial<CamadaImagem> = {}): CamadaImagem =>
  ({ ...base(nome, x, y, w, h), tipo: 'imagem', src, zoom: 1, focoX: 50, focoY: 50, espelhar: false, brilho: 100, contraste: 100, saturacao: 100, desfoque: 0, raio: 0, ...o });
export const selo = (x: number, y: number, d: number, o: Partial<CamadaSelo> = {}): CamadaSelo =>
  ({ ...base('Selo', x, y, d, d), tipo: 'selo', topo: '', valor: '50', sufixo: '%', base: 'OFF', fonte: 'anton', cor: '#ffd21f', corTexto: '#e3262e', borda: '#ffffff', sombra: { cor: 'rgba(0,0,0,.4)', desfoque: 30, dx: 0, dy: 12 }, ...o });
export function itens(lista: string[], x: number, y: number, w: number, o: Partial<CamadaItens> = {}): CamadaItens {
  const c: CamadaItens = { ...base('Lista', x, y, w, 0), tipo: 'itens', itens: lista, fonte: 'poppins', cor: '#ffffff', destaque: '#ffd21f', tamanho: 36, vertical: false, ...o };
  c.h = Math.round(alturaDosItens(c));
  return c;
}

const transparente = (cor: string) => (/^#[0-9a-f]{6}$/i.test(cor) ? `${cor}00` : 'rgba(0,0,0,0)');
const comAlfa = (cor: string, a: number) => (/^#[0-9a-f]{6}$/i.test(cor) ? `${cor}${Math.round(a * 255).toString(16).padStart(2, '0')}` : cor);
const SOMBRA_TEXTO: Sombra = { cor: 'rgba(0,0,0,.35)', desfoque: 18, dx: 0, dy: 6 };

// ───────────────────────────────────────────────────────────── modelo → documento
/** Tamanho do título para a linha mais longa caber na coluna. */
function tamanhoDoTitulo(m: ModeloDeArte, largura: number, maximo: number, maiusculas: boolean) {
  const linhas = m.textos.titulo.map((l) => (maiusculas ? l.toLocaleUpperCase('pt-BR') : l));
  const maior = Math.max(...linhas.map((l) => larguraDoTexto(l, m.fonte, 100)));
  return Math.max(40, Math.min(maximo, Math.floor((largura / Math.max(1, maior)) * 100 * 0.96)));
}

interface Coluna { x: number; w: number; topo: number; base: number; alinhar: 'centro' | 'topo' | 'base'; centralizado?: boolean; escala: number }

/** Empilha sobretítulo, título, subtítulo, lista e botão numa coluna (posições finais já medidas). */
function coluna(m: ModeloDeArte, col: Coluna, estilo: { corPilula: string; textoPilula: string; corSub?: string; subMaiusculo?: boolean; vertical?: boolean }): Camada[] {
  const { textos, cores } = m;
  const e = col.escala;
  const maiusculas = m.fonte !== 'montserrat' || textos.titulo.join('').length < 18;
  const alinhamento = col.centralizado ? 'center' : 'left';
  const out: Camada[] = [];
  const gap = 26 * e;
  if (textos.sobretitulo) out.push(texto('Chamada', textos.sobretitulo, col.x, 0, col.w, { fonte: 'poppins', peso: 800, tamanho: 30 * e, cor: estilo.textoPilula, maiusculas: true, espacamento: 0.12, alinhamento, fundo: { cor: estilo.corPilula, raio: 10 * e, margem: 22 * e } }));
  const tt = tamanhoDoTitulo(m, col.w, (textos.titulo.length > 2 ? 150 : 180) * e, maiusculas);
  out.push(texto('Título', textos.titulo.join('\n'), col.x, 0, col.w, { fonte: m.fonte, tamanho: tt, entrelinha: 1.0, cor: cores.texto, corUltimaLinha: maiusculas ? cores.destaque : null, maiusculas, alinhamento, sombra: SOMBRA_TEXTO }));
  if (textos.subtitulo) out.push(texto('Subtítulo', textos.subtitulo, col.x, 0, col.w, { fonte: 'poppins', peso: estilo.subMaiusculo ? 700 : 600, tamanho: (estilo.subMaiusculo ? 32 : 40) * e, cor: estilo.corSub ?? cores.texto, maiusculas: !!estilo.subMaiusculo, espacamento: estilo.subMaiusculo ? 0.05 : 0, alinhamento }));
  if (textos.itens?.length) {
    const c = itens(textos.itens, col.x, 0, col.w, { cor: cores.texto, destaque: cores.destaque, tamanho: (estilo.vertical ? 44 : 34) * e, vertical: !!estilo.vertical });
    out.push(c);
  }
  if (textos.cta) out.push(texto('Botão', textos.cta, col.x, 0, col.w, { fonte: 'poppins', peso: 800, tamanho: 38 * e, cor: estilo.textoPilula, alinhamento, fundo: { cor: estilo.corPilula, raio: 60 * e, margem: 34 * e }, sombra: { cor: 'rgba(0,0,0,.3)', desfoque: 24, dx: 0, dy: 8 } }));
  if (textos.rodape) out.push(texto('Rodapé', textos.rodape, col.x, 0, col.w, { fonte: 'poppins', peso: 600, tamanho: 28 * e, cor: cores.texto, alinhamento }));
  const total = out.reduce((s, c) => s + c.h, 0) + gap * (out.length - 1);
  let y = col.alinhar === 'topo' ? col.topo : col.alinhar === 'base' ? col.base - total : col.topo + (col.base - col.topo - total) / 2;
  for (const c of out) { c.y = Math.round(y); y += c.h + gap; }
  return out;
}

const seloDo = (m: ModeloDeArte, x: number, y: number, d: number) =>
  m.textos.selo ? [selo(x, y, d, { topo: m.textos.selo.topo ?? '', valor: m.textos.selo.valor, sufixo: m.textos.selo.sufixo ?? '', base: m.textos.selo.base ?? '', cor: m.cores.destaque, corTexto: m.cores.base })] : [];

function horizontal(m: ModeloDeArte): Documento {
  const { cores } = m;
  const L = m.layout === 'vertical-foto' ? 'escuro' : m.layout === 'vertical-painel' ? 'faixa' : m.layout;
  const foto = imagem('Foto', m.foto, 840, 0, 1080, 1080, { focoX: 50, focoY: posY(m) });
  const c: Camada[] = [];
  if (L === 'faixa') {
    c.push(foto,
      forma('Painel', -230, 0, 1150, 1080, { cor: cores.base, inclinacao: -12 }),
      forma('Linha de destaque', 906, 0, 30, 1080, { cor: cores.destaque, inclinacao: -12 }),
      ...coluna(m, { x: 130, w: 760, topo: 90, base: 990, alinhar: 'centro', escala: 1 }, { corPilula: cores.destaque, textoPilula: cores.base }),
      ...seloDo(m, 1400, 110, 400));
  } else if (L === 'claro') {
    c.push(forma('Fundo claro', 0, 0, 1920, 1080, { bloqueada: true, cor: '#ffffff', degrade: { de: '#ffffff', meio: '#f1f7ff', para: '#e3efff', angulo: 25 } }),
      foto,
      forma('Esfumado', 780, 0, 420, 1080, { bloqueada: true, cor: '#f1f7ff', degrade: { de: '#f1f7ff', para: 'rgba(241,247,255,0)', angulo: 0 } }),
      forma('Faixa', 1800, 0, 200, 1080, { cor: cores.base, inclinacao: -12 }),
      ...coluna(m, { x: 130, w: 800, topo: 90, base: 990, alinhar: 'centro', escala: 1 }, { corPilula: cores.base, textoPilula: '#ffffff' }),
      ...seloDo(m, 1380, 120, 380));
  } else if (L === 'neon') {
    return neonHorizontal(m);
  } else {
    c.push(foto,
      forma('Sombra da foto', 0, 0, 1920, 1080, { bloqueada: true, cor: cores.base, degrade: { de: cores.base, meio: comAlfa(cores.base, 0.85), para: transparente(cores.base), angulo: 0 } }),
      forma('Sombra de baixo', 0, 760, 1920, 320, { bloqueada: true, cor: cores.base, degrade: { de: transparente(cores.base), para: comAlfa(cores.base, 0.7), angulo: 90 } }),
      ...coluna(m, { x: 130, w: 860, topo: 90, base: 990, alinhar: 'centro', escala: 1 }, { corPilula: cores.destaque, textoPilula: cores.base, corSub: cores.destaque, subMaiusculo: true }),
      ...seloDo(m, 1420, 120, 380));
    // o esfumado começa mais à esquerda para a coluna de texto ficar sobre o fundo liso
    (c[1] as CamadaForma).w = 1500;
  }
  return { versao: 2, formato: '16:9', fundo: cores.base, camadas: c };
}

function vertical(m: ModeloDeArte): Documento {
  const { cores } = m;
  const L = m.layout === 'escuro' ? 'vertical-foto' : m.layout === 'faixa' ? 'vertical-painel' : m.layout;
  const foto = imagem('Foto', m.foto, 0, 0, 1080, 1080, { focoX: 50, focoY: posY(m) });
  const c: Camada[] = [];
  if (L === 'vertical-painel') {
    c.push(foto,
      forma('Faixa inclinada', -100, 980, 1280, 300, { cor: cores.base, inclinacao: 0, rot: -8 }),
      forma('Linha de destaque', -100, 960, 1280, 26, { cor: cores.destaque, rot: -8 }),
      ...coluna(m, { x: 90, w: 900, topo: 1180, base: 1820, alinhar: 'centro', escala: 1.05 }, { corPilula: cores.destaque, textoPilula: cores.base }),
      ...seloDo(m, 640, 700, 380));
  } else if (L === 'claro') {
    c.push(forma('Fundo claro', 0, 0, 1080, 1920, { bloqueada: true, cor: '#ffffff', degrade: { de: '#ffffff', meio: '#f1f7ff', para: '#e3efff', angulo: 90 } }),
      foto,
      forma('Esfumado', 0, 780, 1080, 320, { bloqueada: true, cor: '#f1f7ff', degrade: { de: 'rgba(241,247,255,0)', para: '#f1f7ff', angulo: 90 } }),
      forma('Faixa', 0, 1860, 1080, 60, { cor: cores.base }),
      ...coluna(m, { x: 90, w: 900, topo: 1110, base: 1820, alinhar: 'centro', escala: 1.05 }, { corPilula: cores.base, textoPilula: '#ffffff', vertical: true }),
      ...seloDo(m, 660, 640, 360));
  } else if (L === 'neon') {
    return neonVertical(m);
  } else {
    c.push(foto,
      forma('Esfumado', 0, 520, 1080, 580, { bloqueada: true, cor: cores.base, degrade: { de: transparente(cores.base), meio: comAlfa(cores.base, 0.85), para: cores.base, angulo: 90 } }),
      ...coluna(m, { x: 90, w: 900, topo: 1000, base: 1820, alinhar: 'centro', escala: 1.1 }, { corPilula: cores.destaque, textoPilula: cores.base, vertical: true }),
      ...seloDo(m, 660, 120, 340));
  }
  return { versao: 2, formato: '9:16', fundo: cores.base, camadas: c };
}

function posY(m: ModeloDeArte) {
  const p = (m.fotoPosicao ?? '50% 50%').split(' ')[1];
  return parseInt(p ?? '50', 10) || 50;
}

// ── Black Friday (composição de vitrine com neon): título cromado, faixa de neon, cubos de desconto e produtos
const CROMADO: Degrade = { de: '#ffffff', meio: '#7d838c', para: '#f2f3f5', angulo: 90 };
const neonBarra = (nome: string, x: number, y: number, w: number, h: number, cor: string) => forma(nome, x, y, w, h, { cor, raio: Math.min(w, h) / 2, sombra: { cor, desfoque: 40, dx: 0, dy: 0 } });
function cubo(valor: string, x: number, y: number, lado: number, rot: number, cor: string): Camada[] {
  return [
    forma('Cubo', x, y, lado, lado, { cor: '#121214', degrade: { de: '#26262b', para: '#0b0b0d', angulo: 90 }, raio: lado * 0.08, rot, borda: { cor: comAlfa(cor, 0.5), largura: 3 }, sombra: { cor: 'rgba(0,0,0,.6)', desfoque: 30, dx: 0, dy: 16 } }),
    { ...texto('Desconto', valor, x, y + lado * 0.3, lado, { fonte: 'anton', tamanho: lado * 0.34, alinhamento: 'center', cor: cor, degrade: { de: '#ffd08a', para: cor, angulo: 90 }, entrelinha: 1, sombra: { cor, desfoque: 24, dx: 0, dy: 0 } }), rot },
  ];
}
function neonHorizontal(m: ModeloDeArte): Documento {
  const { cores, textos } = m;
  const [l1 = 'BLACK', l2 = 'FRIDAY'] = textos.titulo;
  const t1 = texto('Título 1', l1, 110, 170, 860, { fonte: m.fonte, tamanho: 220, entrelinha: 0.95, maiusculas: true, cor: '#e9eaee', degrade: CROMADO, contorno: { cor: '#1d1f23', largura: 6 }, sombra: { cor: comAlfa(cores.destaque, 0.55), desfoque: 30, dx: 0, dy: 8 } });
  const t2 = texto('Título 2', l2, 150, 450, 780, { fonte: m.fonte, tamanho: 150, entrelinha: 1, maiusculas: true, alinhamento: 'center', cor: cores.destaque, degrade: { de: '#ffd08a', para: cores.destaque, angulo: 90 }, sombra: { cor: cores.destaque, desfoque: 28, dx: 0, dy: 0 } });
  return {
    versao: 2, formato: '16:9', fundo: cores.base, camadas: [
      imagem('Foto', m.foto, 840, 0, 1080, 1080, { focoY: posY(m) }),
      forma('Sombra da foto', 760, 0, 520, 1080, { bloqueada: true, cor: cores.base, degrade: { de: cores.base, para: transparente(cores.base), angulo: 0 } }),
      neonBarra('Neon esquerdo', 46, 90, 14, 900, cores.destaque), neonBarra('Neon do meio', 1000, 140, 12, 800, cores.destaque),
      t1,
      forma('Moldura de neon', 120, 430, 840, 210, { cor: 'rgba(0,0,0,0)', raio: 26, borda: { cor: cores.destaque, largura: 10 }, sombra: { cor: cores.destaque, desfoque: 36, dx: 0, dy: 0 } }),
      t2,
      ...(textos.subtitulo ? [texto('Subtítulo', textos.subtitulo, 120, 690, 860, { fonte: 'poppins', peso: 700, tamanho: 44, cor: cores.texto, alinhamento: 'left' as const })] : []),
      ...(textos.cta ? [texto('Botão', textos.cta, 120, 800, 860, { fonte: 'poppins', peso: 800, tamanho: 40, cor: '#111111', fundo: { cor: cores.destaque, raio: 60, margem: 36 }, sombra: { cor: cores.destaque, desfoque: 30, dx: 0, dy: 0 } })] : []),
      ...cubo(textos.selo ? `${textos.selo.valor}${textos.selo.sufixo ?? ''}` : '60%', 1250, 700, 230, -10, cores.destaque),
      ...cubo('10%', 1560, 760, 180, 12, cores.destaque),
    ],
  };
}
function neonVertical(m: ModeloDeArte): Documento {
  const { cores, textos } = m;
  const [l1 = 'BLACK', l2 = 'FRIDAY'] = textos.titulo;
  return {
    versao: 2, formato: '9:16', fundo: cores.base, camadas: [
      imagem('Foto', m.foto, 0, 840, 1080, 1080, { focoY: posY(m) }),
      forma('Sombra da foto', 0, 820, 1080, 360, { bloqueada: true, cor: cores.base, degrade: { de: cores.base, para: transparente(cores.base), angulo: 90 } }),
      neonBarra('Neon esquerdo', 40, 120, 14, 1500, cores.destaque), neonBarra('Neon direito', 1026, 120, 14, 1500, cores.destaque),
      texto('Título 1', l1, 70, 120, 940, { fonte: m.fonte, tamanho: 250, entrelinha: 0.95, maiusculas: true, alinhamento: 'center', cor: '#e9eaee', degrade: CROMADO, contorno: { cor: '#1d1f23', largura: 7 }, sombra: { cor: comAlfa(cores.destaque, 0.55), desfoque: 34, dx: 0, dy: 8 } }),
      forma('Moldura de neon', 110, 420, 860, 230, { cor: 'rgba(0,0,0,0)', raio: 28, borda: { cor: cores.destaque, largura: 11 }, sombra: { cor: cores.destaque, desfoque: 40, dx: 0, dy: 0 } }),
      texto('Título 2', l2, 130, 445, 820, { fonte: m.fonte, tamanho: 165, entrelinha: 1, maiusculas: true, alinhamento: 'center', cor: cores.destaque, degrade: { de: '#ffd08a', para: cores.destaque, angulo: 90 }, sombra: { cor: cores.destaque, desfoque: 30, dx: 0, dy: 0 } }),
      ...(textos.subtitulo ? [texto('Subtítulo', textos.subtitulo, 90, 700, 900, { fonte: 'poppins', peso: 700, tamanho: 46, cor: cores.texto, alinhamento: 'center' as const })] : []),
      ...(textos.cta ? [texto('Botão', textos.cta, 90, 1790, 900, { fonte: 'poppins', peso: 800, tamanho: 44, cor: '#111111', alinhamento: 'center' as const, fundo: { cor: cores.destaque, raio: 60, margem: 38 }, sombra: { cor: cores.destaque, desfoque: 30, dx: 0, dy: 0 } })] : []),
      ...cubo(textos.selo ? `${textos.selo.valor}${textos.selo.sufixo ?? ''}` : '60%', 120, 1300, 250, -10, cores.destaque),
      ...cubo('10%', 760, 1360, 200, 12, cores.destaque),
    ],
  };
}

/** Documento editável do modelo no formato pedido (usa o documento salvo do modelo, se o owner/ADM gravou um). */
export function modeloParaDocumento(m: ModeloDeArte, formato: FormatoDoc = m.formato as FormatoDoc): Documento {
  const salvo = m.documentos?.[formato];
  if (salvo?.versao === 2) return clonar(salvo);
  return formato === '16:9' ? horizontal(m) : vertical(m);
}

export const clonar = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Lista das fotos/imagens do documento (para pré-carregar antes de desenhar). */
export const imagensDo = (d: Documento) => [...new Set(d.camadas.filter((c): c is CamadaImagem => c.tipo === 'imagem').map((c) => c.src))];
export const fontesDo = (d: Documento) => [...new Set(d.camadas.flatMap((c) => ('fonte' in c ? [c.fonte] : [])).concat('poppins'))];
