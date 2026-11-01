// SOBRE MÍDIA STUDIO — PALCO DE OFERTAS para mercado (F-234), no estilo do palco da Black Friday: um produto de cada vez
// em cima do pedestal, com o nome e o preço. Cada produto é uma arte de camadas (o mesmo editor do Studio) já animada:
// o pedestal sobe, o produto entra com zoom e fica flutuando, o nome sobe e o selo do preço entra com zoom e pulsa.
// O CARROSSEL vira um projeto do editor de vídeo: um clipe por produto, com transição deslizando — exporta MP4.
import { TAMANHO_DOC, forma, imagem, larguraDoTexto, selo, texto, type Camada, type Documento, type FormatoDoc } from './documento';
import { novoClipe, projetoVazio, type ProjetoDeVideo } from './video/linha';
import { formatarPreco, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';

export interface OpcoesDoPalco {
  titulo?: string; logoUrl?: string | null; segundos?: number;
  /** F-235: logo 3D (PNG) no lugar do título escrito */ logoTitulo?: { url: string; largura: number; altura: number } | null;
  /** F-237: fundo OFICIAL do dono (arte pronta com título 3D e palco): o produto entra em cima do palco dele */
  fundo?: FundoDoPalco | null;
  /** texto do botão no lugar do "YOUR LOGO" do fundo oficial */
  textoBotao?: string;
}

/** Caixa em frações da largura/altura da tela (0 a 1). */
export interface Caixa { x: number; y: number; w: number; h: number }
/**
 * F-237 — FUNDO OFICIAL do Palco de Ofertas (arte do dono, 16:9 e 9:16). Guarda, em frações da tela, onde fica o espaço do
 * produto (o pé dele encosta no tampo do palco), a faixa da frente do palco (nome do produto), o selo do preço e o lugar do
 * "YOUR LOGO" (vira o botão "OFERTAS"/"ALERTAS"). Fundo novo do dono = uma entrada nova aqui + as 2 imagens em
 * public/studio/palco/<id>-h.webp e <id>-v.webp.
 */
export interface FundoDoPalco {
  id: string; nome: string;
  /** espaço do produto: o pé encosta no tampo do palco (y + h = tampo) */
  produto: Record<FormatoDoc, Caixa>;
  /** F-238: área do NOME do produto (branco; em pé fica em cima do produto, deitado fica à esquerda, em cima) */
  nome_: Record<FormatoDoc, Caixa & { alinhamento: 'left' | 'center' }>;
  /** F-238: etiqueta de preço (retângulo), sem nada escrito em cima do valor */
  preco: Record<FormatoDoc, Caixa>;
  botao: Record<FormatoDoc, Caixa>;
  corBotao: string; bordaBotao: string;
  botoes: string[];
}
export const srcDoFundo = (f: FundoDoPalco, formato: FormatoDoc) => `/studio/palco/${f.id}-${formato === '9:16' ? 'v' : 'h'}.webp`;

export const FUNDOS_DO_PALCO: FundoDoPalco[] = [
  {
    id: 'alerta-de-oferta', nome: 'Alerta de Oferta (sirene)',
    produto: { '9:16': { x: 0.22, y: 0.445, w: 0.56, h: 0.3 }, '16:9': { x: 0.37, y: 0.475, w: 0.26, h: 0.27 } },
    nome_: { '9:16': { x: 0.07, y: 0.345, w: 0.86, h: 0.09, alinhamento: 'center' }, '16:9': { x: 0.03, y: 0.5, w: 0.21, h: 0.2, alinhamento: 'left' } },
    // em pé: a etiqueta fica na frente do palco; deitado: à direita do título
    preco: { '9:16': { x: 0.24, y: 0.756, w: 0.52, h: 0.074 }, '16:9': { x: 0.775, y: 0.5, w: 0.2, h: 0.15 } },
    botao: { '9:16': { x: 0.272, y: 0.872, w: 0.468, h: 0.072 }, '16:9': { x: 0.366, y: 0.877, w: 0.266, h: 0.1 } },
    corBotao: '#d90f1f', bordaBotao: '#ffd21f',
    botoes: ['OFERTAS', 'ALERTAS'],
  },
];
export const fundoDoPalcoPorId = (id: string | null | undefined) => FUNDOS_DO_PALCO.find((f) => f.id === id) ?? null;

/** Nome do produto em branco, no maior tamanho que cabe na área (até 3 linhas), com sombra para ler sobre o fundo. */
function nomeDoProduto(nome: string, b: Caixa & { alinhamento: 'left' | 'center' }): Camada {
  let tam = Math.round(b.h * 0.5);
  let t = texto('Nome do produto', nome, b.x, b.y, b.w, { fonte: 'poppins', peso: 800, tamanho: tam, maiusculas: true, alinhamento: b.alinhamento, cor: '#ffffff', entrelinha: 1.05, sombra: { cor: 'rgba(60,0,8,.65)', desfoque: 14, dx: 0, dy: 5 } });
  while ((t.h > b.h || Math.max(...nome.toUpperCase().split(/\s+/).map((p) => larguraDoTexto(p, 'poppins', tam, 800)), 0) > b.w) && tam > 18) {
    tam = Math.round(tam * 0.92);
    t = texto('Nome do produto', nome, b.x, b.y, b.w, { fonte: 'poppins', peso: 800, tamanho: tam, maiusculas: true, alinhamento: b.alinhamento, cor: '#ffffff', entrelinha: 1.05, sombra: { cor: 'rgba(60,0,8,.65)', desfoque: 14, dx: 0, dy: 5 } });
  }
  t.y = b.y + (b.h - t.h) / 2;
  return t;
}

/**
 * Etiqueta de preço profissional: placa vermelha com borda amarela; "R$" pequeno, o valor grande e os centavos em cima,
 * à direita (como nos encartes). O "de" (preço antigo) vai pequeno, ao lado do R$, nunca por cima do valor.
 */
function etiquetaDePreco(b: Caixa, p: Pick<ProdutoTabloide, 'preco' | 'precoDe' | 'unidade'>): Camada[] {
  if (p.preco == null) return [];
  const v = formatarPreco(p.preco);
  const de = p.precoDe != null && p.precoDe > p.preco ? formatarPreco(p.precoDe) : null;
  const un = p.unidade && p.unidade !== 'UN' ? p.unidade : '';
  const entrada = ani('zoom', 0.9, 0.5);
  const out: Camada[] = [{ ...forma('Preço', b.x, b.y, b.w, b.h, { cor: '#d90f1f', degrade: { de: '#ff2d40', para: '#a3001a', angulo: 180 }, raio: Math.round(b.h * 0.22), borda: { cor: '#ffd21f', largura: Math.max(5, Math.round(b.h * 0.07)) }, sombra: { cor: 'rgba(0,0,0,.35)', desfoque: 24, dx: 0, dy: 10 } }), animacao: entrada }];
  // tamanhos a partir da altura da placa; reduz junto se não couber na largura
  let k = 1;
  const medidas = () => {
    const tInt = b.h * 0.78 * k, tRs = b.h * 0.25 * k, tCent = b.h * 0.36 * k, tDe = b.h * 0.18 * k;
    const wInt = larguraDoTexto(v.inteiro, 'anton', tInt), wCent = larguraDoTexto(`,${v.centavos}`, 'anton', tCent);
    const wEsq = Math.max(larguraDoTexto('R$', 'anton', tRs), de ? larguraDoTexto(`DE ${de.inteiro},${de.centavos}`, 'poppins', tDe, 800) : 0);
    const wUn = un ? larguraDoTexto(un, 'poppins', tDe, 800) : 0;
    return { tInt, tRs, tCent, tDe, wInt, wCent, wEsq, wUn, total: wEsq + b.h * 0.1 * k + wInt + b.h * 0.04 * k + Math.max(wCent, wUn) };
  };
  let m = medidas();
  while (m.total > b.w * 0.86 && k > 0.4) { k *= 0.92; m = medidas(); }
  let x = b.x + (b.w - m.total) / 2;
  const yInt = b.y + (b.h - m.tInt * 1.02) / 2;
  const t = (nome: string, txt: string, fonte: string, tam: number, xx: number, yy: number, w: number, cor: string, peso?: number) =>
    ({ ...texto(nome, txt, xx, yy, w + 4, { fonte, peso, tamanho: Math.round(tam), alinhamento: 'left', cor, entrelinha: 1 }), animacao: entrada });
  if (de) {
    out.push(t('Preço — de', `DE ${de.inteiro},${de.centavos}`, 'poppins', m.tDe, x, b.y + b.h * 0.18, m.wEsq, '#ffe9a8', 800));
    out.push(t('Preço — R$', 'R$', 'anton', m.tRs, x, b.y + b.h * 0.46, m.wEsq, '#ffd21f'));
  } else out.push(t('Preço — R$', 'R$', 'anton', m.tRs, x, yInt + m.tInt * 0.42, m.wEsq, '#ffd21f'));
  x += m.wEsq + b.h * 0.1 * k;
  out.push(t('Preço — valor', v.inteiro, 'anton', m.tInt, x, yInt, m.wInt, '#ffffff'));
  x += m.wInt + b.h * 0.04 * k;
  out.push(t('Preço — centavos', `,${v.centavos}`, 'anton', m.tCent, x, yInt + m.tInt * 0.06, m.wCent, '#ffffff'));
  if (un) out.push(t('Preço — unidade', un, 'poppins', m.tDe, x, yInt + m.tInt * 0.52, m.wUn, '#ffe9a8', 800));
  return out;
}

/** O produto em cima do palco do fundo oficial: nome em branco por cima, produto inteiro com o pé no tampo, etiqueta de preço. */
function palcoOficial(p: Pick<ProdutoTabloide, 'nome' | 'preco' | 'precoDe' | 'unidade' | 'imagem'>, formato: FormatoDoc, f: FundoDoPalco, o: OpcoesDoPalco): Documento {
  const { w: W, h: H } = TAMANHO_DOC[formato];
  const px = <T extends Caixa>(b: T): T => ({ ...b, x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H });
  const c: Camada[] = [];
  c.push({ ...imagem('Fundo oficial', srcDoFundo(f, formato), 0, 0, W, H), bloqueada: true });
  // produto: 'conter' (inteiro, sem cortar) e focoY 100 = o pé encosta no tampo do palco
  const pr = px(f.produto[formato]);
  c.push({ ...imagem('Produto', p.imagem?.url ?? '', pr.x, pr.y, pr.w, pr.h, { ajuste: 'conter', focoX: 50, focoY: 100, sombra: null }), animacao: ani('subir', 0.25, 0.7, 'flutuar') });
  c.push({ ...nomeDoProduto(p.nome, px(f.nome_[formato])), animacao: ani(formato === '9:16' ? 'descer' : 'esquerda', 0.55, 0.55) });
  c.push(...etiquetaDePreco(px(f.preco[formato]), p));
  // botão no lugar do "YOUR LOGO" do fundo: cobre desde o 1º quadro (sem entrada) e pulsa
  const bb = px(f.botao[formato]);
  c.push({ ...forma('Botão', bb.x, bb.y, bb.w, bb.h, { cor: f.corBotao, raio: Math.round(bb.h * 0.32), borda: { cor: f.bordaBotao, largura: Math.max(6, Math.round(bb.h * 0.08)) } }), animacao: ani('pulsar', 0, 1) });
  const tb = texto('Botão — texto', (o.textoBotao ?? f.botoes[0]).toUpperCase(), bb.x, bb.y, bb.w, { fonte: 'anton', tamanho: Math.round(bb.h * 0.62), maiusculas: true, alinhamento: 'center', cor: '#ffffff' });
  tb.y = bb.y + (bb.h - tb.h) / 2;
  c.push({ ...tb, animacao: ani('pulsar', 0, 1) });
  return { versao: 2, formato, fundo: '#c40f24', camadas: c, video: { duracao: o.segundos ?? SEGUNDOS_POR_PRODUTO } };
}
export const SEGUNDOS_POR_PRODUTO = 4;
export const PASTA_PALCO = 'palco-de-ofertas';

type Ani = NonNullable<Camada['animacao']>;
const ani = (tipo: Ani['tipo'], atraso: number, duracao = 0.6, depois: Ani['depois'] = null): Ani => ({ tipo, atraso, duracao, depois });

/** A arte de UM produto no palco (16:9 ou 9:16), com as animações da coreografia do palco. */
export function palcoDoProduto(p: Pick<ProdutoTabloide, 'nome' | 'preco' | 'precoDe' | 'unidade' | 'imagem'>, formato: FormatoDoc, o: OpcoesDoPalco = {}): Documento {
  if (o.fundo) return palcoOficial(p, formato, o.fundo, o);
  const { w: W, h: H } = TAMANHO_DOC[formato];
  const em = formato === '9:16';
  const titulo = (o.titulo ?? 'SUPER OFERTAS').toUpperCase();
  const preco = p.preco != null ? formatarPreco(p.preco) : null;
  const c: Camada[] = [];

  // fundo vermelho de oferta com brilho no centro (parado) e halo de luz atrás do produto
  c.push({ ...forma('Fundo', 0, 0, W, H, { degrade: { de: '#ef1f35', meio: '#a00c1f', para: '#3a0209', angulo: 180 }, cor: '#a00c1f' }), bloqueada: true });
  const px = em ? W * 0.5 : W * 0.36; // meio do palco
  const halo = em ? W * 0.95 : H * 0.95;
  c.push({ ...forma('Brilho', px - halo / 2, (em ? H * 0.44 : H * 0.52) - halo / 2, halo, halo, { forma: 'elipse', cor: 'rgba(255,214,90,0.08)', degrade: { de: 'rgba(255,230,140,0.22)', para: 'rgba(255,214,90,0)', angulo: 90 } }), animacao: ani('surgir', 0, 0.8, 'pulsar') });

  // título e logo
  const tit = texto('Título', titulo, 0, 0, em ? W * 0.9 : W * 0.56, {
    fonte: 'anton', tamanho: em ? 168 : 150, maiusculas: true, alinhamento: 'center', cor: '#FFD21F', entrelinha: 0.95,
    contorno: { cor: '#6d0012', largura: 10 }, sombra: { cor: 'rgba(0,0,0,.45)', desfoque: 22, dx: 0, dy: 10 },
  });
  Object.assign(tit, em ? { x: (W - tit.w) / 2, y: 90 } : { x: W * 0.62 - tit.w * 0.08, y: 70 });
  if (o.logoTitulo) {
    // a logo 3D ocupa a caixa do título, inteira e na proporção dela
    const caixaW = em ? W * 0.9 : W * 0.56, caixaH = em ? H * 0.2 : H * 0.34;
    const r = Math.min(caixaW / o.logoTitulo.largura, caixaH / o.logoTitulo.altura);
    const lw = o.logoTitulo.largura * r, lh = o.logoTitulo.altura * r;
    const lx = em ? (W - lw) / 2 : W * 0.6 + (W * 0.38 - lw) / 2;
    c.push({ ...imagem('Título', o.logoTitulo.url, lx, em ? 60 : 50, lw, lh, { ajuste: 'conter' }), animacao: ani('zoom', 0.15, 0.7, 'flutuar') });
    tit.y = (em ? 60 : 50) + lh - tit.h; // a logo do mercado fica logo abaixo
  } else c.push({ ...tit, animacao: ani('descer', 0.15, 0.7) });
  const logoW = em ? W * 0.44 : W * 0.2, logoH = em ? 150 : 130;
  const logoX = em ? (W - logoW) / 2 : W - W * 0.04 - logoW, logoY = em ? tit.y + tit.h + 30 : H * 0.05;
  if (o.logoUrl) c.push({ ...imagem('Logo', o.logoUrl, logoX, logoY, logoW, logoH, { ajuste: 'conter' }), animacao: ani('zoom', 0.35, 0.5) });
  else {
    c.push({ ...forma('Logo', logoX, logoY, logoW, logoH, { cor: '#ffffff', raio: 26, borda: { cor: '#FFD21F', largura: 6 } }), animacao: ani('zoom', 0.35, 0.5) });
    const sl = texto('Sua logo', 'SUA LOGO AQUI', logoX, logoY, logoW, { fonte: 'anton', tamanho: em ? 54 : 44, alinhamento: 'center', cor: '#7a0010' });
    sl.y = logoY + (logoH - sl.h) / 2;
    c.push({ ...sl, animacao: ani('zoom', 0.35, 0.5) });
  }

  // pedestal: corpo vermelho, tampo dourado e a borda clara (sobe do chão)
  const pw = em ? W * 0.7 : W * 0.4, pAlt = em ? H * 0.11 : H * 0.17, py = em ? H * 0.69 : H * 0.72;
  const tampo = em ? H * 0.06 : H * 0.1;
  c.push({ ...forma('Palco — base', px - pw / 2, py + tampo / 2, pw, pAlt, { degrade: { de: '#d1142b', para: '#560513', angulo: 180 }, cor: '#a00c1f', raio: 18 }), animacao: ani('subir', 0.2, 0.6) });
  c.push({ ...forma('Palco — tampo', px - pw / 2, py, pw, tampo, { forma: 'elipse', degrade: { de: '#fff1b0', meio: '#f5c53a', para: '#c48a00', angulo: 90 }, cor: '#f5c53a' }), animacao: ani('subir', 0.2, 0.6) });
  c.push({ ...forma('Palco — centro', px - pw * 0.42, py + tampo * 0.15, pw * 0.84, tampo * 0.7, { forma: 'elipse', degrade: { de: '#ef1f35', para: '#8a0a1b', angulo: 90 }, cor: '#c40f24' }), animacao: ani('subir', 0.2, 0.6) });

  // o produto (foto inteira, recortada) em cima do pedestal: entra com zoom e fica flutuando
  const prodW = em ? W * 0.62 : W * 0.32, prodH = em ? H * 0.34 : H * 0.5;
  const fotoProduto = p.imagem?.url ?? '';
  c.push({ ...imagem('Produto', fotoProduto, px - prodW / 2, py - prodH + tampo * 0.35, prodW, prodH, { ajuste: 'conter', sombra: null }), animacao: ani('zoom', 0.45, 0.7, 'flutuar') });

  // nome do produto e preço
  const nome = texto('Nome do produto', p.nome, 0, 0, em ? W * 0.86 : W * 0.4, {
    fonte: 'poppins', peso: 800, tamanho: em ? 64 : 62, maiusculas: true, alinhamento: 'center', cor: '#ffffff', entrelinha: 1.05,
    fundo: { cor: 'rgba(60,0,10,.72)', raio: 22, margem: 18 },
  });
  Object.assign(nome, em ? { x: (W - nome.w) / 2, y: py + tampo + pAlt + 36 } : { x: W * 0.56, y: H * 0.42 });
  c.push({ ...nome, animacao: ani(em ? 'subir' : 'direita', 0.85, 0.6) });
  if (preco) {
    const d = em ? 330 : 300;
    const sx = em ? W - d - 40 : W * 0.56 + (W * 0.4 - d) / 2, sy = em ? py - d * 0.9 : nome.y + nome.h + 40;
    c.push({
      ...selo(sx, sy, d, { topo: p.precoDe != null && p.precoDe > p.preco! ? `DE ${formatarPreco(p.precoDe).inteiro},${formatarPreco(p.precoDe).centavos}` : 'POR', valor: preco.inteiro, sufixo: `,${preco.centavos}`, base: p.unidade && p.unidade !== 'UN' ? `R$ / ${p.unidade}` : 'R$', cor: '#FFD21F', corTexto: '#c40f24', borda: '#ffffff' }),
      nome: 'Preço', animacao: ani('zoom', 1.15, 0.55, 'pulsar'),
    });
  }
  const aviso = texto('Aviso', 'Ofertas válidas enquanto durarem os estoques · Imagens ilustrativas', 0, 0, W * 0.9, { tamanho: em ? 26 : 22, alinhamento: 'center', cor: 'rgba(255,255,255,.75)' });
  Object.assign(aviso, { x: (W - aviso.w) / 2, y: H - aviso.h - 26 });
  c.push({ ...aviso, animacao: ani('surgir', 1.3, 0.5) });

  return { versao: 2, formato, fundo: '#3a0209', camadas: c, video: { duracao: o.segundos ?? SEGUNDOS_POR_PRODUTO } };
}

/** O CARROSSEL: um clipe por produto (nome e preço de cada vez), deslizando de um para o outro. */
export function projetoDoCarrossel(produtos: Array<Pick<ProdutoTabloide, 'nome' | 'preco' | 'precoDe' | 'unidade' | 'imagem'>>, formato: FormatoDoc, o: OpcoesDoPalco = {}): ProjetoDeVideo {
  const seg = o.segundos ?? SEGUNDOS_POR_PRODUTO;
  return {
    ...projetoVazio(formato),
    fundo: '#3a0209',
    clipes: produtos.map((p) => novoClipe('arte', '', p.nome, {
      documento: palcoDoProduto(p, formato, { ...o, segundos: seg }), duracao: seg, zoomDe: 1, zoomPara: 1,
      transicao: { tipo: 'deslizar-esquerda', duracao: 0.5 },
    })),
  };
}
