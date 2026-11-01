// SOBRE MÍDIA STUDIO — PALCO DE OFERTAS para mercado (F-234), no estilo do palco da Black Friday: um produto de cada vez
// em cima do pedestal, com o nome e o preço. Cada produto é uma arte de camadas (o mesmo editor do Studio) já animada:
// o pedestal sobe, o produto entra com zoom e fica flutuando, o nome sobe e o selo do preço entra com zoom e pulsa.
// O CARROSSEL vira um projeto do editor de vídeo: um clipe por produto, com transição deslizando — exporta MP4.
import { TAMANHO_DOC, forma, imagem, larguraDoTexto, selo, texto, type Camada, type Documento, type FormatoDoc } from './documento';
import { novoClipe, projetoVazio, type ProjetoDeVideo, type TipoDeTransicao } from './video/linha';
import type { TipoDeAnimacao } from './animacao';
import { LOGO_ALERTA_DE_OFERTA, type LogoDaPasta } from './logos';
import { formatarPreco, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';

export interface OpcoesDoPalco {
  titulo?: string; logoUrl?: string | null; segundos?: number;
  /** F-235: logo 3D (PNG) no lugar do título escrito */ logoTitulo?: { url: string; largura: number; altura: number } | null;
  /** F-237: fundo OFICIAL do dono (arte pronta com título 3D e palco): o produto entra em cima do palco dele */
  fundo?: FundoDoPalco | null;
  /** texto do botão no lugar do "YOUR LOGO" do fundo oficial */
  textoBotao?: string;
  /** F-248: logo do palco escolhida na pasta Logos (padrão: a logo oficial do fundo) */
  logoDoPalco?: LogoDaPasta | null;
  /** F-242: de que lado cada elemento entra (escolha do cliente) e para que lado o carrossel passa de um produto ao outro */
  movimento?: MovimentoDoPalco;
}

export interface MovimentoDoPalco { produto?: TipoDeAnimacao; nome?: TipoDeAnimacao; preco?: TipoDeAnimacao; transicao?: TipoDeTransicao }
/** opções que o cliente escolhe na tela do palco */
export const ENTRADAS: Array<{ id: TipoDeAnimacao; nome: string }> = [
  { id: 'subir', nome: 'De baixo' }, { id: 'descer', nome: 'De cima' }, { id: 'esquerda', nome: 'Da esquerda' }, { id: 'direita', nome: 'Da direita' }, { id: 'zoom', nome: 'Zoom' }, { id: 'surgir', nome: 'Aparecer' },
];
export const TRANSICOES_DO_CARROSSEL: Array<{ id: TipoDeTransicao; nome: string }> = [
  { id: 'deslizar-esquerda', nome: 'Sai pela esquerda' }, { id: 'deslizar-direita', nome: 'Sai pela direita' }, { id: 'deslizar-cima', nome: 'Sai por cima' }, { id: 'zoom', nome: 'Zoom' }, { id: 'dissolver', nome: 'Dissolver' },
];

/**
 * F-242: o balão de preço de TODO palco — amarelo forte, R$ e valor em BRANCO com contorno vermelho (lê bem no amarelo),
 * "DE x POR" em vermelho na promoção e "POR APENAS" em verde fora dela; tudo centralizado no balão.
 */
export function seloDoPreco(p: Pick<ProdutoTabloide, 'preco' | 'precoDe' | 'unidade'>, x: number, y: number, d: number): Camada | null {
  if (p.preco == null) return null;
  const v = formatarPreco(p.preco);
  const de = p.precoDe != null && p.precoDe > p.preco ? formatarPreco(p.precoDe) : null;
  return {
    ...selo(x, y, d, {
      topo: de ? `DE ${de.inteiro},${de.centavos} POR` : 'POR APENAS', corTopo: de ? '#d90f1f' : '#0a8a3a',
      moeda: 'R$', valor: v.inteiro, sufixo: `,${v.centavos}`, base: p.unidade && p.unidade !== 'UN' ? p.unidade : '',
      cor: '#FFC400', corTexto: '#b3001b', corValor: '#ffffff', contornoValor: { cor: '#c4001d', largura: 9 }, borda: '#ffffff', realista: true,
      sombra: { cor: 'rgba(0,0,0,.45)', desfoque: 34, dx: 0, dy: 16 },
    }),
    nome: 'Preço',
  };
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
  nome_: Record<FormatoDoc, Caixa & { alinhamento: 'left' | 'center' | 'right' }>;
  /** F-239: balão AMARELO de preço na lateral (centro e diâmetro em frações; d = fração do lado menor), pulsando */
  preco: Record<FormatoDoc, { cx: number; cy: number; d: number }>;
  botao: Record<FormatoDoc, Caixa>;
  /** F-248: a logo é uma camada: o fundo não tem título gravado */
  titulo: Record<FormatoDoc, Caixa>; logoPadrao: LogoDaPasta;
  corBotao: string; bordaBotao: string;
  botoes: string[];
}
export const srcDoFundo = (f: FundoDoPalco, formato: FormatoDoc) => `/studio/palco/${f.id}-${formato === '9:16' ? 'v' : 'h'}-st.webp`;

export const FUNDOS_DO_PALCO: FundoDoPalco[] = [
  {
    id: 'alerta-de-oferta', nome: 'Alerta de Oferta (sirene)',
    titulo: { '9:16': { x: 0.05, y: 0.012, w: 0.9, h: 0.325 }, '16:9': { x: 0.235, y: 0.012, w: 0.53, h: 0.49 } }, logoPadrao: LOGO_ALERTA_DE_OFERTA,
    produto: { '9:16': { x: 0.22, y: 0.445, w: 0.56, h: 0.3 }, '16:9': { x: 0.415, y: 0.475, w: 0.17, h: 0.27 } },
    nome_: { '9:16': { x: 0.07, y: 0.345, w: 0.86, h: 0.09, alinhamento: 'center' }, '16:9': { x: 0.19, y: 0.5, w: 0.215, h: 0.2, alinhamento: 'right' } },
    // F-240: balão amarelo de tamanho normal, proporcional ao produto; deitado: nome colado à esquerda do produto e balão à direita
    preco: { '9:16': { cx: 0.8, cy: 0.585, d: 0.24 }, '16:9': { cx: 0.66, cy: 0.6, d: 0.2 } },
    botao: { '9:16': { x: 0.272, y: 0.872, w: 0.468, h: 0.072 }, '16:9': { x: 0.366, y: 0.877, w: 0.266, h: 0.1 } },
    corBotao: '#d90f1f', bordaBotao: '#ffd21f',
    botoes: ['OFERTAS', 'ALERTAS'],
  },
];
export const fundoDoPalcoPorId = (id: string | null | undefined) => FUNDOS_DO_PALCO.find((f) => f.id === id) ?? null;

/** Nome do produto em branco, no maior tamanho que cabe na área (até 3 linhas), com sombra para ler sobre o fundo. */
export function nomeDoProduto(nome: string, b: Caixa & { alinhamento: 'left' | 'center' | 'right' }): Camada {
  let tam = Math.round(b.h * 0.5);
  let t = texto('Nome do produto', nome, b.x, b.y, b.w, { fonte: 'poppins', peso: 800, tamanho: tam, maiusculas: true, alinhamento: b.alinhamento, cor: '#ffffff', entrelinha: 1.05, sombra: { cor: 'rgba(60,0,8,.65)', desfoque: 14, dx: 0, dy: 5 } });
  while ((t.h > b.h || Math.max(...nome.toUpperCase().split(/\s+/).map((p) => larguraDoTexto(p, 'poppins', tam, 800)), 0) > b.w) && tam > 18) {
    tam = Math.round(tam * 0.92);
    t = texto('Nome do produto', nome, b.x, b.y, b.w, { fonte: 'poppins', peso: 800, tamanho: tam, maiusculas: true, alinhamento: b.alinhamento, cor: '#ffffff', entrelinha: 1.05, sombra: { cor: 'rgba(60,0,8,.65)', desfoque: 14, dx: 0, dy: 5 } });
  }
  t.y = b.y + (b.h - t.h) / 2;
  return t;
}

/** F-245: estilo de um balão de preço: forma, cores e aro externo. */
export interface CoresDaEtiqueta { de: string; para: string; borda: string; valor: string; moeda: string; detalhe: string; formato?: 'placa' | 'oval'; aroFora?: string }
export const ETIQUETA_VERMELHA: CoresDaEtiqueta = { de: '#ff2d40', para: '#a3001a', borda: '#ffd21f', valor: '#ffffff', moeda: '#ffd21f', detalhe: '#ffe9a8' };
export const ETIQUETA_AMARELA: CoresDaEtiqueta = { de: '#ffe45c', para: '#f2a900', borda: '#ffffff', valor: '#c40f24', moeda: '#c40f24', detalhe: '#7a0010' };
export const BALAO_OVAL_VERMELHO: CoresDaEtiqueta = { formato: 'oval', de: '#ff3a2e', para: '#c40015', borda: '#ffd21f', aroFora: '#ffffff', valor: '#ffffff', moeda: '#ffd21f', detalhe: '#ffe9a8' };
/**
 * F-245 — CATÁLOGO DE BALÕES DE PREÇO: cada encarte escolhe o seu aqui (o do palco é o `seloDoPreco`, redondo).
 * Referência nova do dono = um estilo novo nesta lista.
 */
export const ESTILOS_DE_BALAO = {
  'placa-vermelha': ETIQUETA_VERMELHA, // Mega Oferta, lado azul
  'placa-amarela': ETIQUETA_AMARELA, // Mega Oferta, lado vermelho
  'oval-vermelho': BALAO_OVAL_VERMELHO, // Semana do Frango
} as const;

/**
 * Etiqueta de preço profissional: placa vermelha com borda amarela; "R$" pequeno, o valor grande e os centavos em cima,
 * à direita (como nos encartes). O "de" (preço antigo) vai pequeno, ao lado do R$, nunca por cima do valor.
 */
export function etiquetaDePreco(b: Caixa, p: Pick<ProdutoTabloide, 'preco' | 'precoDe' | 'unidade'>, cores: CoresDaEtiqueta = ETIQUETA_VERMELHA): Camada[] {
  if (p.preco == null) return [];
  const v = formatarPreco(p.preco);
  const de = p.precoDe != null && p.precoDe > p.preco ? formatarPreco(p.precoDe) : null;
  const un = p.unidade && p.unidade !== 'UN' ? p.unidade : '';
  return balaoDePreco(b, v, de, un, cores, ani('zoom', 0.9, 0.5));
}

/**
 * REGRA DO DONO (F-247), obrigatória em todo encarte: texto e valor SEMPRE organizados e centralizados dentro do balão.
 * É o único desenho de balão retangular ou oval: "de" centralizado em cima, R$ + valor + centavos centralizados como um
 * conjunto, e de/valor juntos no meio da altura. Estilo novo entra em ESTILOS_DE_BALAO, nunca com texto posicionado à mão.
 * O teste regraBaloesCentralizados.test.ts reprova qualquer encarte fora disso.
 */
function balaoDePreco(b: Caixa, v: { inteiro: string; centavos: string }, de: { inteiro: string; centavos: string } | null, un: string, cores: CoresDaEtiqueta, entrada: NonNullable<Camada['animacao']>): Camada[] {
  const oval = cores.formato === 'oval';
  const aro = cores.aroFora ? Math.max(3, Math.round(b.h * 0.04)) : 0;
  const out: Camada[] = [];
  if (cores.aroFora) out.push({ ...forma('Preço — aro', b.x, b.y, b.w, b.h, { forma: oval ? 'elipse' : 'retangulo', cor: cores.aroFora, raio: Math.round(b.h * 0.22), sombra: { cor: 'rgba(0,0,0,.35)', desfoque: 20, dx: 0, dy: 8 } }), animacao: entrada });
  const c = { x: b.x + aro, y: b.y + aro, w: b.w - 2 * aro, h: b.h - 2 * aro };
  const borda = { cor: cores.borda, largura: Math.max(3, Math.round(b.h * (oval ? 0.05 : 0.06))) };
  const degrade = { de: cores.de, para: cores.para, angulo: 180 };
  out.push({ ...forma('Preço', c.x, c.y, c.w, c.h, oval ? { forma: 'elipse', cor: cores.de, degrade, borda } : { cor: cores.de, degrade, borda, raio: Math.round(c.h * 0.22), sombra: { cor: 'rgba(0,0,0,.35)', desfoque: 24, dx: 0, dy: 10 } }), animacao: entrada });
  // os tamanhos descem juntos até o conjunto caber (o oval tem menos largura útil que a placa)
  const util = oval ? 0.74 : 0.86;
  const base = oval ? (de ? 0.54 : 0.64) : de ? 0.6 : 0.76;
  const tDe = Math.max(13, c.h * 0.16);
  let k = 1;
  const medidas = () => {
    const tInt = c.h * base * k, tRs = tInt * 0.34, tCent = tInt * 0.44;
    const wInt = larguraDoTexto(v.inteiro, 'anton', tInt), wCent = larguraDoTexto(`,${v.centavos}`, 'anton', tCent), wRs = larguraDoTexto('R$', 'anton', tRs);
    return { tInt, tRs, tCent, wInt, wCent, wRs, total: wRs + tInt * 0.08 + wInt + tInt * 0.03 + wCent };
  };
  let m = medidas();
  while (m.total > c.w * util && k > 0.4) { k *= 0.93; m = medidas(); }
  const t = (nome: string, txt: string, fonte: string, tam: number, xx: number, yy: number, w: number, cor: string, peso?: number, alinhamento: 'left' | 'center' = 'left') =>
    ({ ...texto(nome, txt, xx, yy, w, { fonte, peso, tamanho: Math.round(tam), alinhamento, cor, entrelinha: 1 }), animacao: entrada });
  // de + valor formam um bloco, e o bloco fica no meio da altura
  const vao = de ? c.h * 0.03 : 0;
  const altura = (de ? tDe + vao : 0) + m.tInt;
  const yBloco = c.y + (c.h - altura) / 2;
  const yInt = yBloco + (de ? tDe + vao : 0);
  if (de) out.push(t('Preço — de', `DE ${de.inteiro},${de.centavos}`, 'poppins', tDe, c.x, yBloco, c.w, cores.detalhe, 800, 'center'));
  let x = c.x + (c.w - m.total) / 2;
  out.push(t('Preço — R$', 'R$', 'anton', m.tRs, x, yInt + m.tInt * 0.34, m.wRs + 4, cores.moeda));
  x += m.wRs + m.tInt * 0.08;
  out.push(t('Preço — valor', v.inteiro, 'anton', m.tInt, x, yInt, m.wInt + 4, cores.valor));
  x += m.wInt + m.tInt * 0.03;
  out.push(t('Preço — centavos', `,${v.centavos}`, 'anton', m.tCent, x, yInt + m.tInt * 0.02, m.wCent + 4, cores.valor));
  if (un) out.push(t('Preço — unidade', un, 'poppins', Math.max(13, m.tInt * 0.24), x, yInt + m.tInt * 0.56, m.wCent + 4, cores.detalhe, 800));
  return out;
}

/** O produto em cima do palco do fundo oficial: nome em branco por cima, produto inteiro com o pé no tampo, etiqueta de preço. */
function palcoOficial(p: Pick<ProdutoTabloide, 'nome' | 'preco' | 'precoDe' | 'unidade' | 'imagem'>, formato: FormatoDoc, f: FundoDoPalco, o: OpcoesDoPalco): Documento {
  const { w: W, h: H } = TAMANHO_DOC[formato];
  const px = <T extends Caixa>(b: T): T => ({ ...b, x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H });
  const c: Camada[] = [];
  c.push({ ...imagem('Fundo oficial', srcDoFundo(f, formato), 0, 0, W, H), bloqueada: true });
  const ti = px(f.titulo[formato]);
  c.push({ ...imagem('Logo do palco', (o.logoDoPalco ?? f.logoPadrao).url, ti.x, ti.y, ti.w, ti.h, { ajuste: 'conter' }), animacao: ani('surgir', 0, 0.4) });
  // produto: 'conter' (inteiro, sem cortar) e focoY 100 = o pé encosta no tampo do palco
  const pr = px(f.produto[formato]);
  const mov = o.movimento ?? {};
  c.push({ ...imagem('Produto', p.imagem?.url ?? '', pr.x, pr.y, pr.w, pr.h, { ajuste: 'conter', focoX: 50, focoY: 100, sombra: null }), animacao: ani(mov.produto ?? 'subir', 0.25, 0.7, 'flutuar') });
  c.push({ ...nomeDoProduto(p.nome, px(f.nome_[formato])), animacao: ani(mov.nome ?? (formato === '9:16' ? 'descer' : 'esquerda'), 0.55, 0.55) });
  // F-239: balão AMARELO realista na lateral, pulsando — "POR"/"DE" em cima, R$ + valor + centavos no centro, unidade embaixo
  const s = f.preco[formato];
  const d = s.d * Math.min(W, H);
  const balao = seloDoPreco(p, s.cx * W - d / 2, s.cy * H - d / 2, d);
  if (balao) c.push({ ...balao, animacao: ani(mov.preco ?? 'zoom', 0.9, 0.55, 'pulsar') });
  // botão no lugar do "YOUR LOGO" do fundo: cobre desde o 1º quadro (sem entrada) e pulsa
  const bb = px(f.botao[formato]);
  c.push({ ...forma('Botão', bb.x, bb.y, bb.w, bb.h, { cor: f.corBotao, raio: Math.round(bb.h * 0.32), borda: { cor: f.bordaBotao, largura: Math.max(6, Math.round(bb.h * 0.08)) } }), animacao: ani('pulsar', 0, 1) });
  const tb = texto('Botão — texto', (o.textoBotao ?? f.botoes[0]).toUpperCase(), bb.x, bb.y, bb.w, { fonte: 'anton', tamanho: Math.round(bb.h * 0.62), maiusculas: true, alinhamento: 'center', cor: '#ffffff' });
  tb.y = bb.y + (bb.h - tb.h) / 2;
  c.push({ ...tb, animacao: ani('pulsar', 0, 1) });
  return { versao: 2, formato, fundo: '#c40f24', camadas: c, video: { duracao: o.segundos ?? SEGUNDOS_POR_PRODUTO } };
}
/** F-242: regra do dono — cada produto fica 8 s no palco */
export const SEGUNDOS_POR_PRODUTO = 8;
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
    const balao = seloDoPreco(p, sx, sy, d);
    if (balao) c.push({ ...balao, animacao: ani(o.movimento?.preco ?? 'zoom', 1.15, 0.55, 'pulsar') });
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
      transicao: { tipo: o.movimento?.transicao ?? 'deslizar-esquerda', duracao: 0.5 },
    })),
  };
}
