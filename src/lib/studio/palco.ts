// SOBRE MÍDIA STUDIO — PALCO DE OFERTAS para mercado (F-234), no estilo do palco da Black Friday: um produto de cada vez
// em cima do pedestal, com o nome e o preço. Cada produto é uma arte de camadas (o mesmo editor do Studio) já animada:
// o pedestal sobe, o produto entra com zoom e fica flutuando, o nome sobe e o selo do preço entra com zoom e pulsa.
// O CARROSSEL vira um projeto do editor de vídeo: um clipe por produto, com transição deslizando — exporta MP4.
import { TAMANHO_DOC, forma, imagem, selo, texto, type Camada, type Documento, type FormatoDoc } from './documento';
import { novoClipe, projetoVazio, type ProjetoDeVideo } from './video/linha';
import { formatarPreco, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';

export interface OpcoesDoPalco { titulo?: string; logoUrl?: string | null; segundos?: number }
export const SEGUNDOS_POR_PRODUTO = 4;
export const PASTA_PALCO = 'palco-de-ofertas';

type Ani = NonNullable<Camada['animacao']>;
const ani = (tipo: Ani['tipo'], atraso: number, duracao = 0.6, depois: Ani['depois'] = null): Ani => ({ tipo, atraso, duracao, depois });

/** A arte de UM produto no palco (16:9 ou 9:16), com as animações da coreografia do palco. */
export function palcoDoProduto(p: Pick<ProdutoTabloide, 'nome' | 'preco' | 'precoDe' | 'unidade' | 'imagem'>, formato: FormatoDoc, o: OpcoesDoPalco = {}): Documento {
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
  c.push({ ...tit, animacao: ani('descer', 0.15, 0.7) });
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
