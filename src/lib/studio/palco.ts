// SOBRE MÍDIA STUDIO — PALCO DE OFERTAS para mercado (F-234), no estilo do palco da Black Friday: um produto de cada vez
// em cima do pedestal, com o nome e o preço. Cada produto é uma arte de camadas (o mesmo editor do Studio) já animada:
// o pedestal sobe, o produto entra com zoom e fica flutuando, o nome sobe e o selo do preço entra com zoom e pulsa.
// O CARROSSEL vira um projeto do editor de vídeo: um clipe por produto, com transição deslizando — exporta MP4.
import { TAMANHO_DOC, forma, imagem, selo, texto, type Camada, type Documento, type FormatoDoc } from './documento';
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
  produto: Record<FormatoDoc, Caixa>;
  nome_: Record<FormatoDoc, Caixa>;
  preco: Record<FormatoDoc, { cx: number; cy: number; d: number }>;
  botao: Record<FormatoDoc, Caixa>;
  /** cores do nome do produto (sobre a faixa do palco) e do botão */
  corNome: string; corBotao: string; bordaBotao: string;
  botoes: string[];
}
export const srcDoFundo = (f: FundoDoPalco, formato: FormatoDoc) => `/studio/palco/${f.id}-${formato === '9:16' ? 'v' : 'h'}.webp`;

export const FUNDOS_DO_PALCO: FundoDoPalco[] = [
  {
    id: 'alerta-de-oferta', nome: 'Alerta de Oferta (sirene)',
    // o pé do produto encosta no tampo do palco (y + h = tampo); a largura acompanha o palco
    produto: { '9:16': { x: 0.16, y: 0.36, w: 0.68, h: 0.385 }, '16:9': { x: 0.34, y: 0.46, w: 0.32, h: 0.285 } },
    nome_: { '9:16': { x: 0.12, y: 0.757, w: 0.76, h: 0.07 }, '16:9': { x: 0.22, y: 0.772, w: 0.56, h: 0.075 } },
    preco: { '9:16': { cx: 0.8, cy: 0.5, d: 0.3 }, '16:9': { cx: 0.885, cy: 0.5, d: 0.3 } },
    botao: { '9:16': { x: 0.272, y: 0.872, w: 0.468, h: 0.072 }, '16:9': { x: 0.366, y: 0.877, w: 0.266, h: 0.1 } },
    corNome: '#7a0010', corBotao: '#d90f1f', bordaBotao: '#ffd21f',
    botoes: ['OFERTAS', 'ALERTAS'],
  },
];
export const fundoDoPalcoPorId = (id: string | null | undefined) => FUNDOS_DO_PALCO.find((f) => f.id === id) ?? null;

/** O produto em cima do palco do fundo oficial: proporção justa (foto inteira, pé no tampo, centrado no palco). */
function palcoOficial(p: Pick<ProdutoTabloide, 'nome' | 'preco' | 'precoDe' | 'unidade' | 'imagem'>, formato: FormatoDoc, f: FundoDoPalco, o: OpcoesDoPalco): Documento {
  const { w: W, h: H } = TAMANHO_DOC[formato];
  const px = (b: Caixa) => ({ x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H });
  const c: Camada[] = [];
  c.push({ ...imagem('Fundo oficial', srcDoFundo(f, formato), 0, 0, W, H), bloqueada: true });
  // produto: 'conter' (inteiro, sem cortar) e focoY 100 = o pé encosta no tampo do palco
  const pr = px(f.produto[formato]);
  c.push({ ...imagem('Produto', p.imagem?.url ?? '', pr.x, pr.y, pr.w, pr.h, { ajuste: 'conter', focoX: 50, focoY: 100, sombra: null }), animacao: ani('subir', 0.25, 0.7, 'flutuar') });
  // nome do produto escrito na faixa da frente do palco
  const nb = px(f.nome_[formato]);
  const tam = Math.min(nb.h * 0.62, (nb.w * 1.9) / Math.max(10, p.nome.length));
  const nome = texto('Nome do produto', p.nome, nb.x, nb.y, nb.w, { fonte: 'poppins', peso: 800, tamanho: Math.round(tam), maiusculas: true, alinhamento: 'center', cor: f.corNome, entrelinha: 1 });
  nome.y = nb.y + (nb.h - nome.h) / 2;
  c.push({ ...nome, animacao: ani('surgir', 0.7, 0.5) });
  // preço: selo amarelo com o vermelho do fundo
  const preco = p.preco != null ? formatarPreco(p.preco) : null;
  if (preco) {
    const s = f.preco[formato];
    const d = s.d * Math.min(W, H);
    c.push({
      ...selo(s.cx * W - d / 2, s.cy * H - d / 2, d, { topo: p.precoDe != null && p.precoDe > p.preco! ? `DE ${formatarPreco(p.precoDe).inteiro},${formatarPreco(p.precoDe).centavos}` : 'POR', valor: preco.inteiro, sufixo: `,${preco.centavos}`, base: p.unidade && p.unidade !== 'UN' ? `R$ / ${p.unidade}` : 'R$', cor: '#FFD21F', corTexto: '#c40f24', borda: '#ffffff' }),
      nome: 'Preço', animacao: ani('zoom', 0.95, 0.55, 'pulsar'),
    });
  }
  // botão no lugar do "YOUR LOGO" do fundo
  const bb = px(f.botao[formato]);
  c.push({ ...forma('Botão', bb.x, bb.y, bb.w, bb.h, { cor: f.corBotao, raio: Math.round(bb.h * 0.32), borda: { cor: f.bordaBotao, largura: Math.max(6, Math.round(bb.h * 0.08)) } }), animacao: ani('pulsar', 0, 1) });
  const tb = texto('Botão — texto', (o.textoBotao ?? f.botoes[0]).toUpperCase(), bb.x, bb.y, bb.w, { fonte: 'anton', tamanho: Math.round(bb.h * 0.62), maiusculas: true, alinhamento: 'center', cor: '#ffffff' });
  tb.y = bb.y + (bb.h - tb.h) / 2;
  // o botão cobre o "YOUR LOGO" desde o 1º quadro (sem entrada), e pulsa
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
