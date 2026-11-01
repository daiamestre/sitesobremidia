// SOBRE MÍDIA STUDIO — ENCARTES OFICIAIS (F-240): fundos prontos do dono (arte dele) na pasta "Encartes de Mercado".
// O sistema só organiza o que o cliente põe: os produtos se dividem entre as colunas do fundo (no Mega Oferta, lado
// vermelho e lado azul, alternando), a logo do cliente vai no lugar do "SUA LOGO AQUI" e o rodapé recebe telefone e
// endereço. O resultado é uma arte de camadas do Studio (abre no editor, anima, vira vídeo e vai para as telas).
// Fundo novo do dono = uma entrada em ENCARTES_OFICIAIS + as imagens em public/studio/encartes-oficiais/.
import { TAMANHO_DOC, forma, imagem, larguraDoTexto, texto, type Camada, type Documento, type FormatoDoc } from './documento';
import { ETIQUETA_AMARELA, ETIQUETA_VERMELHA, etiquetaDePreco, nomeDoProduto, type Caixa, type CoresDaEtiqueta } from './palco';
import type { ProdutoTabloide } from '@/lib/tabloide/parseProdutos';

/** Logo (ou foto) do cliente. `recortada` = PNG sem fundo, logo redonda ou vetor: fica solta, como a logo "MEGA OFERTA". */
export interface LogoDoCliente { url: string; largura: number; altura: number; recortada: boolean }
export interface DadosDoEncarte { logo?: LogoDoCliente | null; telefone?: string; endereco?: string }

export interface ColunaDoEncarte extends Caixa { etiqueta: CoresDaEtiqueta; sombraNome: string }
/** O desenho de UM formato do encarte (em pé ou deitado), em pixels do documento. */
export interface LayoutDoEncarte {
  /** fundo com a caixa "SUA LOGO AQUI" (sem logo) e sem ela (com a logo do cliente) */
  fundo: string; fundoLimpo: string;
  /** colunas de produtos; os produtos alternam entre elas */
  colunas: ColunaDoEncarte[];
  logo: Caixa;
  rodape: Caixa;
  /** formato preferido de cada cartão de produto (largura ÷ altura): em pé, cartões deitados; deitado, cartões em pé */
  cartao: number;
}
export interface EncarteOficial {
  id: string; nome: string;
  /** F-240: o mesmo encarte em pé (9:16) e deitado (16:9), cada um com o fundo do dono */
  formatos: Partial<Record<FormatoDoc, LayoutDoEncarte>>;
  corTelefone: string; corEndereco: string;
}

export const MAX_POR_COLUNA = 8;
export const PASTA_ENCARTES_OFICIAIS = 'encartes-de-mercado';

const VERMELHO = { etiqueta: ETIQUETA_AMARELA, sombraNome: 'rgba(70,0,6,.7)' };
const AZUL = { etiqueta: ETIQUETA_VERMELHA, sombraNome: 'rgba(0,10,70,.7)' };

export const ENCARTES_OFICIAIS: EncarteOficial[] = [
  {
    id: 'mega-oferta-bicolor', nome: 'Mega Oferta – vermelho e azul',
    formatos: {
      // 1080×1920: a curva entre o vermelho e o azul passa entre x 513 e 581; o rodapé amarelo começa em 1693
      '9:16': {
        fundo: '/studio/encartes-oficiais/mega-oferta-bicolor-v.webp',
        fundoLimpo: '/studio/encartes-oficiais/mega-oferta-bicolor-v-limpo.webp',
        colunas: [
          { x: 26, y: 505, w: 468, h: 1160, ...VERMELHO }, // lado vermelho (abaixo da logo MEGA OFERTA)
          { x: 602, y: 455, w: 454, h: 1210, ...AZUL }, // lado azul (abaixo dos ícones)
        ],
        logo: { x: 650, y: 66, w: 386, h: 290 },
        rodape: { x: 40, y: 1700, w: 1000, h: 210 },
        cartao: 1.3,
      },
      // 1920×1080: a curva passa entre x 907 e 983; o rodapé amarelo começa em 954
      '16:9': {
        fundo: '/studio/encartes-oficiais/mega-oferta-bicolor-h.webp',
        fundoLimpo: '/studio/encartes-oficiais/mega-oferta-bicolor-h-limpo.webp',
        colunas: [
          { x: 30, y: 468, w: 848, h: 474, ...VERMELHO },
          { x: 1012, y: 380, w: 878, h: 562, ...AZUL },
        ],
        logo: { x: 1125, y: 40, w: 400, h: 252 },
        rodape: { x: 40, y: 960, w: 1840, h: 112 },
        cartao: 0.8,
      },
    },
    corTelefone: '#d90f1f', corEndereco: '#0b2a8f',
  },
];
export const encarteOficialPorId = (id: string | null | undefined) => ENCARTES_OFICIAIS.find((e) => e.id === id) ?? null;
export const formatosDoEncarte = (e: EncarteOficial) => (['9:16', '16:9'] as FormatoDoc[]).filter((f) => e.formatos[f]);
export const layoutDoEncarte = (e: EncarteOficial, formato?: FormatoDoc): LayoutDoEncarte => e.formatos[formato ?? formatosDoEncarte(e)[0]] ?? e.formatos[formatosDoEncarte(e)[0]]!;
export const maxDeProdutos = (e: EncarteOficial) => Math.min(...formatosDoEncarte(e).map((f) => e.formatos[f]!.colunas.length)) * MAX_POR_COLUNA;

type Ani = NonNullable<Camada['animacao']>;
const ani = (tipo: Ani['tipo'], atraso: number, duracao = 0.6, depois: Ani['depois'] = null): Ani => ({ tipo, atraso, duracao, depois });
type Produto = Pick<ProdutoTabloide, 'nome' | 'preco' | 'precoDe' | 'unidade' | 'imagem'>;

/** Divide os produtos entre as colunas alternando (1º vermelho, 2º azul, 3º vermelho…), até o máximo do fundo. */
export function dividirProdutos<T>(produtos: T[], colunas: number): T[][] {
  const out: T[][] = Array.from({ length: colunas }, () => []);
  produtos.slice(0, colunas * MAX_POR_COLUNA).forEach((p, i) => out[i % colunas].push(p));
  return out;
}

/** Um produto na sua célula: placa translúcida, foto inteira, nome em branco e etiqueta de preço sem nada sobre o valor. */
function celula(p: Produto, b: Caixa, col: ColunaDoEncarte, n: number, atraso: number): Camada[] {
  const out: Camada[] = [];
  const pad = Math.max(10, Math.round(Math.min(b.w, b.h) * 0.05));
  const nomear = (c: Camada) => ({ ...c, nome: `${c.nome} ${n}` });
  out.push({ ...forma('Placa', b.x, b.y, b.w, b.h, { cor: 'rgba(255,255,255,.10)', raio: Math.round(Math.min(b.w, b.h) * 0.08), borda: { cor: 'rgba(255,255,255,.28)', largura: 2 } }), nome: `Placa ${n}`, animacao: ani('surgir', atraso, 0.5) });
  const vertical = b.h >= b.w * 0.8;
  let foto: Caixa, nomeB: Caixa, preco: Caixa;
  if (vertical) {
    const th = Math.min(b.h * 0.2, b.w * 0.3), nh = Math.min(b.h * 0.17, b.w * 0.3);
    foto = { x: b.x + pad, y: b.y + pad, w: b.w - 2 * pad, h: b.h - 2 * pad - th - nh - pad * 0.6 };
    nomeB = { x: b.x + pad, y: foto.y + foto.h + pad * 0.3, w: b.w - 2 * pad, h: nh };
    const tw = Math.min(b.w - 2 * pad, th * 3.2);
    preco = { x: b.x + (b.w - tw) / 2, y: b.y + b.h - pad - th, w: tw, h: th };
  } else {
    const fw = Math.min(b.h - 2 * pad, b.w * 0.42);
    foto = { x: b.x + pad, y: b.y + pad, w: fw, h: b.h - 2 * pad };
    const rx = foto.x + fw + pad, rw = b.x + b.w - pad - rx;
    nomeB = { x: rx, y: b.y + pad, w: rw, h: (b.h - 2 * pad) * 0.48 };
    const th = Math.min((b.h - 2 * pad) * 0.46, rw * 0.42);
    preco = { x: rx, y: b.y + b.h - pad - th, w: rw, h: th };
  }
  if (p.imagem?.url) out.push({ ...imagem(`Produto ${n}`, p.imagem.url, foto.x, foto.y, foto.w, foto.h, { ajuste: 'conter', focoX: 50, focoY: vertical ? 100 : 50, sombra: null }), animacao: ani('zoom', atraso + 0.15, 0.55) });
  const nome = nomeDoProduto(p.nome, { ...nomeB, alinhamento: vertical ? 'center' : 'left' });
  out.push({ ...nome, nome: `Nome do produto ${n}`, sombra: { cor: col.sombraNome, desfoque: 10, dx: 0, dy: 4 }, animacao: ani('subir', atraso + 0.3, 0.5) });
  out.push(...etiquetaDePreco(preco, p, col.etiqueta).map((c) => ({ ...nomear(c), animacao: ani('zoom', atraso + 0.45, 0.5) })));
  return out;
}

/**
 * Os produtos de UMA área: o sistema escolhe quantas colunas usar para cada cartão ficar mais perto do formato preferido
 * do layout (campo cartao) — na área alta do 9:16, 1 coluna até 6 produtos e depois 2; na área larga e baixa do 16:9, até 4.
 */
function produtosDaColuna(ps: Produto[], col: ColunaDoEncarte, alvo: number, inicio: number, passo: number, atraso0: number): Camada[] {
  if (!ps.length) return [];
  const gap = 16;
  let melhor = { cols: 1, nota: Infinity };
  for (let c = 1; c <= Math.min(ps.length, 4); c++) {
    const l = Math.ceil(ps.length / c);
    const w = (col.w - gap * (c - 1)) / c, h = (col.h - gap * (l - 1)) / l;
    const nota = Math.abs(Math.log(w / h / alvo));
    if (nota < melhor.nota - 1e-9) melhor = { cols: c, nota };
  }
  const cols = melhor.cols;
  const linhas = Math.ceil(ps.length / cols);
  const cw = (col.w - gap * (cols - 1)) / cols;
  // poucos produtos: células com altura proporcional (não esticam até o rodapé); a sobra vai para cima e para baixo
  const chMax = (col.h - gap * (linhas - 1)) / linhas;
  const ch = Math.min(chMax, cw * 1.35);
  const usado = ch * linhas + gap * (linhas - 1);
  const y0 = col.y + (col.h - usado) / 2;
  return ps.flatMap((p, i) => {
    const l = Math.floor(i / cols), k = i % cols;
    // a última linha incompleta fica centralizada
    const naLinha = l === linhas - 1 ? ps.length - l * cols : cols;
    const x = col.x + ((cols - naLinha) * (cw + gap)) / 2 + k * (cw + gap);
    return celula(p, { x, y: y0 + l * (ch + gap), w: cw, h: ch }, col, inicio + i * passo, atraso0 + i * 0.25);
  });
}

/** A logo do cliente: recortada (PNG sem fundo, redonda, vetor) fica solta com sombra; com fundo, vai num cartão. */
function camadasDaLogo(l: LogoDoCliente, b: Caixa): Camada[] {
  const s = Math.min(b.w / l.largura, b.h / l.altura);
  const w = l.largura * s, h = l.altura * s;
  const x = b.x + (b.w - w) / 2, y = b.y + (b.h - h) / 2;
  if (l.recortada) return [{ ...imagem('Sua logo', l.url, b.x, b.y, b.w, b.h, { ajuste: 'conter', sombra: { cor: 'rgba(0,0,0,.45)', desfoque: 26, dx: 0, dy: 12 } }), animacao: ani('zoom', 0.1, 0.6) }];
  const m = 12, raio = Math.round(Math.min(w, h) * 0.12);
  const iw = w - 2 * m, ih = h - 2 * m;
  return [
    { ...forma('Sua logo — cartão', x, y, w, h, { cor: '#ffffff', raio: raio + m, borda: { cor: '#ffd21f', largura: 5 }, sombra: { cor: 'rgba(0,0,0,.4)', desfoque: 24, dx: 0, dy: 10 } }), animacao: ani('zoom', 0.1, 0.6) },
    { ...imagem('Sua logo', l.url, x + m, y + m, iw, ih, { raio }), animacao: ani('zoom', 0.1, 0.6) },
  ];
}

/**
 * Telefone em pílula vermelha e endereço, centralizados na faixa amarela do rodapé: um embaixo do outro quando a faixa
 * é alta (em pé), lado a lado quando ela é baixa (deitado).
 */
function camadasDoRodape(e: EncarteOficial, r: Caixa, d: DadosDoEncarte): Camada[] {
  const tel = d.telefone?.trim(), end = d.endereco?.trim();
  if (!tel && !end) return [];
  const out: Camada[] = [];
  if (r.h < 160) {
    const tTel = Math.round(r.h * 0.44), m = Math.round(tTel * 0.4);
    let tEnd = Math.round(r.h * 0.3);
    const wTel = tel ? larguraDoTexto(tel, 'anton', tTel) + 2 * m + 8 : 0;
    const espaco = tel && end ? 44 : 0;
    while (end && wTel + espaco + larguraDoTexto(end, 'poppins', tEnd, 700) > r.w && tEnd > 20) tEnd -= 2;
    const wEnd = end ? Math.min(r.w - wTel - espaco, larguraDoTexto(end, 'poppins', tEnd, 700) + 8) : 0;
    let x = r.x + (r.w - (wTel + espaco + wEnd)) / 2;
    if (tel) {
      const t = texto('Telefone', tel, x, 0, wTel, { fonte: 'anton', tamanho: tTel, alinhamento: 'center', cor: '#ffffff', entrelinha: 1.1, fundo: { cor: e.corTelefone, raio: 50, margem: m } });
      out.push({ ...t, y: r.y + (r.h - t.h) / 2, animacao: ani('subir', 0.4, 0.5) });
      x += wTel + espaco;
    }
    if (end) {
      const t = texto('Endereço', end, x, 0, wEnd, { fonte: 'poppins', peso: 700, tamanho: tEnd, alinhamento: tel ? 'left' : 'center', cor: e.corEndereco, entrelinha: 1.1 });
      out.push({ ...t, y: r.y + (r.h - t.h) / 2, animacao: ani('subir', 0.55, 0.5) });
    }
    return out;
  }
  const tTel = 64;
  let tEnd = 40;
  while (end && larguraDoTexto(end, 'poppins', tEnd, 700) > r.w * 1.9 && tEnd > 24) tEnd -= 2;
  const telH = tel ? tTel * 1.1 + 2 * 18 : 0;
  const endT = end ? texto('Endereço', end, r.x, 0, r.w, { fonte: 'poppins', peso: 700, tamanho: tEnd, alinhamento: 'center', cor: e.corEndereco, entrelinha: 1.1 }) : null;
  const gap = tel && end ? 18 : 0;
  let y = r.y + (r.h - (telH + gap + (endT?.h ?? 0))) / 2;
  if (tel) {
    const t = texto('Telefone', tel, r.x, y + 18, r.w, { fonte: 'anton', tamanho: tTel, alinhamento: 'center', cor: '#ffffff', entrelinha: 1.1, fundo: { cor: e.corTelefone, raio: 50, margem: 26 } });
    out.push({ ...t, animacao: ani('subir', 0.4, 0.5) });
    y += telH + gap;
  }
  if (endT) out.push({ ...endT, y, animacao: ani('subir', 0.55, 0.5) });
  return out;
}

/** A arte do encarte oficial com os produtos, a logo e os contatos do cliente. */
export function documentoDoEncarteOficial(e: EncarteOficial, produtos: Produto[], d: DadosDoEncarte = {}, formato?: FormatoDoc): Documento {
  const f = formato && e.formatos[formato] ? formato : formatosDoEncarte(e)[0];
  const lay = layoutDoEncarte(e, f);
  const { w: W, h: H } = TAMANHO_DOC[f];
  const c: Camada[] = [{ ...imagem('Fundo oficial', d.logo ? lay.fundoLimpo : lay.fundo, 0, 0, W, H), bloqueada: true }];
  if (d.logo) c.push(...camadasDaLogo(d.logo, lay.logo));
  const grupos = dividirProdutos(produtos, lay.colunas.length);
  grupos.forEach((ps, k) => c.push(...produtosDaColuna(ps, lay.colunas[k], lay.cartao, k + 1, lay.colunas.length, 0.3 + k * 0.12)));
  c.push(...camadasDoRodape(e, lay.rodape, d));
  return { versao: 2, formato: f, fundo: '#1e3fd0', camadas: c, video: { duracao: 8 } };
}
