// SOBRE MÍDIA STUDIO — ENCARTES OFICIAIS (F-240): fundos prontos do dono (arte dele) na pasta "Encartes de Mercado".
// O sistema só organiza o que o cliente põe: os produtos se dividem entre as colunas do fundo (no Mega Oferta, lado
// vermelho e lado azul, alternando), a logo do cliente vai no lugar do "SUA LOGO AQUI" e o rodapé recebe telefone e
// endereço. O resultado é uma arte de camadas do Studio (abre no editor, anima, vira vídeo e vai para as telas).
// Fundo novo do dono = uma entrada em ENCARTES_OFICIAIS + as imagens em public/studio/encartes-oficiais/.
import { TAMANHO_DOC, forma, imagem, larguraDoTexto, redesSociais, texto, vagaDaLogo, type Camada, type Documento, type FormatoArte, type FormatoDoc } from './documento';
import { AVISO_DE_REMEDIO, ESTILOS_DE_BALAO, avisoLegal, etiquetaDePreco, nomeDoProduto, type Caixa, type CoresDaEtiqueta, type SegmentoDoStudio } from './palco';
import { LOGO_MEGA_OFERTA, LOGO_OFERTAS_DE_FARMACIA, LOGO_SEMANA_DO_FRANGO, logoOficialDoSegmento, type LogoDaPasta } from './logos';
import { SEGMENTOS_DE_OFERTA, idDaArte, pastaDeEncartesDe } from './segmentosDeOferta';
import { camadasDaLogoDoSegmento, ehSegmentoComLogoEditavel, type SegmentoComLogo } from './logoEditavel';
import { QUANTIDADE_PADRAO, dividirPorCotas, planejarAreas, quantidadeCompleta, type GradeDaArea } from './gradeInteligente';
import type { ProdutoTabloide } from '@/lib/tabloide/parseProdutos';

/** Logo (ou foto) do cliente. `recortada` = PNG sem fundo, logo redonda ou vetor: fica solta, como a logo "MEGA OFERTA". */
export interface LogoDoCliente { url: string; largura: number; altura: number; recortada: boolean }
export interface DadosDoEncarte { logo?: LogoDoCliente | null; telefone?: string; endereco?: string; /** F-244: quantos produtos o cliente quer mostrar (padrão 16) */ quantos?: number; /** F-248: logo do encarte escolhida na pasta Logos (padrão: a logo oficial dele) */ logoDoEncarte?: LogoDaPasta | null }

export interface ColunaDoEncarte extends Caixa {
  etiqueta: CoresDaEtiqueta; sombraNome: string;
  /** F-243: sobre fundo claro (cartão amarelo) o nome e a placa mudam de cor para continuar legíveis */
  corNome?: string; corPlaca?: string; bordaPlaca?: string;
}
/** O desenho de UM formato do encarte (em pé ou deitado), em pixels do documento. */
export interface LayoutDoEncarte {
  /** fundo com a caixa "SUA LOGO AQUI" (sem logo) e sem ela (com a logo do cliente) */
  fundo: string; fundoLimpo: string;
  /** F-248: onde fica a logo do encarte (ela é uma camada: o fundo não tem mais título gravado) */
  titulo: Caixa;
  /** colunas de produtos; os produtos alternam entre elas */
  colunas: ColunaDoEncarte[];
  logo: Caixa;
  rodape: Caixa;
  /** formato preferido de cada cartão de produto (largura ÷ altura): em pé, cartões deitados; deitado, cartões em pé */
  cartao: number;
  /** F-259: faixa do aviso obrigatório (remédios) */
  aviso?: Caixa;
  /** F-278: onde nasce a linha das redes sociais (elemento próprio; o fundo não tem mais os ícones) */
  redes?: Caixa;
}
export interface EncarteOficial {
  id: string; nome: string;
  /** F-240: o mesmo encarte em pé (9:16) e deitado (16:9), cada um com o fundo do dono; F-246: e os formatos adaptados */
  formatos: Partial<Record<FormatoArte, LayoutDoEncarte>>;
  /** F-248: a logo padrão do encarte */
  logoPadrao: LogoDaPasta;
  corTelefone: string; corEndereco: string;
  /** F-245: sombra nos contatos quando eles ficam sobre o fundo azul */
  sombraContato?: boolean;
  /** F-259: de que pasta é o encarte (padrão: mercado) */
  segmento?: SegmentoDoStudio;
  /** F-259: aviso obrigatório (farmácia: "a persistirem os sintomas…"), escrito na faixa `aviso` do layout */
  aviso?: string;
  /** F-278: cor do detalhe dos ícones de redes (f do Facebook, play do YouTube) */
  corRedes?: string;
}

export const PASTA_ENCARTES_OFICIAIS = 'encartes-de-mercado';
/** F-259: a pasta dos encartes de farmácia */
export const PASTA_ENCARTES_FARMACIA = 'encartes-de-farmacia';
/** F-259: pasta, nome e segmento de cada tipo de encarte */
export const PASTAS_DE_ENCARTE: Record<SegmentoDoStudio, { chave: string; nome: string; segmento: string }> = {
  mercado: { chave: PASTA_ENCARTES_OFICIAIS, nome: 'Encartes de Mercado', segmento: 'supermercados' },
  farmacia: { chave: PASTA_ENCARTES_FARMACIA, nome: 'Encartes de Farmácia', segmento: 'farmacias' },
  // F-277: um tipo de encarte por segmento
  ...Object.fromEntries(SEGMENTOS_DE_OFERTA.map((sg) => [sg.id, { chave: pastaDeEncartesDe(sg.id), nome: `Encartes de ${sg.nome}`, segmento: sg.segmentoDoCatalogo }])),
} as Record<SegmentoDoStudio, { chave: string; nome: string; segmento: string }>;

const VERMELHO = { etiqueta: ESTILOS_DE_BALAO['placa-amarela'], sombraNome: 'rgba(70,0,6,.7)' };
const AZUL = { etiqueta: ESTILOS_DE_BALAO['placa-vermelha'], sombraNome: 'rgba(0,10,70,.7)' };
// F-243: fundo azul-claro e cartão amarelo (nome escuro) da Semana do Frango; F-245: balão oval da referência do dono
const AZUL_CLARO = { etiqueta: ESTILOS_DE_BALAO['oval-vermelho'], sombraNome: 'rgba(0,30,90,.75)', corPlaca: 'rgba(0,40,120,.22)', bordaPlaca: 'rgba(255,255,255,.4)' };
// F-259: farmácia — lado verde com placa amarela e lado azul com placa vermelha (os mesmos balões do Mega Oferta)
const VERDE = { etiqueta: ESTILOS_DE_BALAO['placa-amarela'], sombraNome: 'rgba(0,50,20,.75)' };
const CARTAO_AMARELO = { etiqueta: ESTILOS_DE_BALAO['oval-vermelho'], sombraNome: 'transparent', corNome: '#6e0010', corPlaca: 'rgba(255,255,255,.5)', bordaPlaca: 'rgba(255,255,255,.75)' };

const BASES: EncarteOficial[] = [
  {
    id: 'mega-oferta-bicolor', nome: 'Mega Oferta – vermelho e azul',
    formatos: {
      // 1080×1920: a curva entre o vermelho e o azul passa entre x 513 e 581; o rodapé amarelo começa em 1693
      '9:16': {
        fundo: '/studio/encartes-oficiais/mega-oferta-bicolor-v-st.webp',
        fundoLimpo: '/studio/encartes-oficiais/mega-oferta-bicolor-v-st-limpo.webp',
        titulo: { x: 14, y: 20, w: 640, h: 476 },
        colunas: [
          { x: 26, y: 505, w: 468, h: 1160, ...VERMELHO }, // lado vermelho (abaixo da logo MEGA OFERTA)
          { x: 602, y: 455, w: 454, h: 1210, ...AZUL }, // lado azul (abaixo dos ícones)
        ],
        logo: { x: 650, y: 66, w: 386, h: 290 },
        redes: { x: 660, y: 368, w: 376, h: 84 },
        rodape: { x: 40, y: 1700, w: 1000, h: 210 },
        cartao: 1,
      },
      // 1920×1080: a curva passa entre x 907 e 983; o rodapé amarelo começa em 954
      '16:9': {
        fundo: '/studio/encartes-oficiais/mega-oferta-bicolor-h-st.webp',
        fundoLimpo: '/studio/encartes-oficiais/mega-oferta-bicolor-h-st-limpo.webp',
        titulo: { x: 150, y: 10, w: 730, h: 456 },
        colunas: [
          { x: 30, y: 468, w: 848, h: 474, ...VERMELHO },
          { x: 1012, y: 380, w: 878, h: 562, ...AZUL },
        ],
        logo: { x: 1125, y: 40, w: 400, h: 252 },
        redes: { x: 1140, y: 302, w: 370, h: 76 },
        rodape: { x: 40, y: 960, w: 1840, h: 112 },
        cartao: 0.8,
      },
    },
    logoPadrao: LOGO_MEGA_OFERTA,
    corTelefone: '#c4001d', corEndereco: '#0b2a8f',
  },
  {
    id: 'semana-do-frango', nome: 'Semana do Frango – azul e amarelo',
    formatos: {
      // 1080×1920: o cartão amarelo vai de y 606 a 1468, com a beira esquerda indo de x 726 (y 700) a 592 (y 1400);
      // moedas: em cima à esquerda até y 635, à direita até y 643 e embaixo à direita a partir de y 1578
      '9:16': {
        fundo: '/studio/encartes-oficiais/semana-do-frango-v-st.webp',
        fundoLimpo: '/studio/encartes-oficiais/semana-do-frango-v-st-limpo.webp',
        titulo: { x: 110, y: 40, w: 640, h: 486 },
        colunas: [
          { x: 24, y: 645, w: 552, h: 1140, ...AZUL_CLARO },
          { x: 745, y: 660, w: 319, h: 780, ...CARTAO_AMARELO },
        ],
        logo: { x: 804, y: 322, w: 156, h: 136 },
        redes: { x: 762, y: 468, w: 240, h: 60 },
        rodape: { x: 24, y: 1798, w: 776, h: 104 },
        cartao: 1,
      },
      // 1920×1080: o cartão amarelo começa em y 290, com a beira esquerda indo de x 1234 a 1083; moedas à direita até
      // y 367 e a partir de y 827
      '16:9': {
        fundo: '/studio/encartes-oficiais/semana-do-frango-h-st.webp',
        fundoLimpo: '/studio/encartes-oficiais/semana-do-frango-h-st-limpo.webp',
        titulo: { x: 268, y: 14, w: 700, h: 490 },
        colunas: [
          { x: 30, y: 545, w: 1035, h: 425, ...AZUL_CLARO },
          { x: 1245, y: 375, w: 655, h: 445, ...CARTAO_AMARELO },
        ],
        logo: { x: 1366, y: 74, w: 214, h: 164 },
        redes: { x: 1336, y: 248, w: 274, h: 62 },
        rodape: { x: 30, y: 985, w: 1040, h: 86 },
        cartao: 0.8,
      },
    },
    logoPadrao: LOGO_SEMANA_DO_FRANGO,
    corTelefone: '#ffffff', corEndereco: '#ffffff', sombraContato: true,
  },
  {
    // F-259: o encarte de FARMÁCIA, com a mesma divisão do Mega Oferta (arte em scripts/studio/gerar-farmacia.mjs): lado
    // verde e lado azul, rodapé branco para os contatos e a faixa verde do aviso obrigatório dos remédios embaixo
    id: 'saude-em-oferta', nome: 'Ofertas de Farmácia – verde e azul', segmento: 'farmacia', aviso: AVISO_DE_REMEDIO,
    formatos: {
      // 1080×1920: a curva passa entre x 520 e 590; o rodapé branco vai de 1700 a 1860 e a faixa do aviso de 1860 a 1920
      '9:16': {
        fundo: '/studio/encartes-oficiais/saude-em-oferta-v-st.webp',
        fundoLimpo: '/studio/encartes-oficiais/saude-em-oferta-v-st-limpo.webp',
        titulo: { x: 14, y: 20, w: 640, h: 476 },
        colunas: [
          { x: 26, y: 505, w: 468, h: 1160, ...VERDE },
          { x: 610, y: 455, w: 446, h: 1210, ...AZUL },
        ],
        logo: { x: 650, y: 66, w: 386, h: 290 },
        redes: { x: 660, y: 368, w: 376, h: 84 },
        rodape: { x: 40, y: 1712, w: 1000, h: 140 },
        aviso: { x: 30, y: 1866, w: 1020, h: 48 },
        cartao: 1,
      },
      // 1920×1080: a curva passa entre x 935 e 1000; o rodapé branco vai de 966 a 1040 e a faixa do aviso de 1040 a 1080
      '16:9': {
        fundo: '/studio/encartes-oficiais/saude-em-oferta-h-st.webp',
        fundoLimpo: '/studio/encartes-oficiais/saude-em-oferta-h-st-limpo.webp',
        titulo: { x: 150, y: 10, w: 730, h: 456 },
        colunas: [
          { x: 30, y: 468, w: 848, h: 474, ...VERDE },
          { x: 1022, y: 380, w: 868, h: 562, ...AZUL },
        ],
        logo: { x: 1125, y: 40, w: 400, h: 252 },
        redes: { x: 1140, y: 302, w: 370, h: 76 },
        rodape: { x: 40, y: 970, w: 1840, h: 66 },
        aviso: { x: 30, y: 1044, w: 1860, h: 34 },
        cartao: 0.8,
      },
    },
    logoPadrao: LOGO_OFERTAS_DE_FARMACIA,
    corTelefone: '#078a46', corEndereco: '#0b2a8f',
  },
  // F-277: um encarte por segmento (arte em scripts/studio/gerar-segmentos.mjs), com a mesma divisão do Mega Oferta e da farmácia:
  // área A (esquerda, placa amarela) e área B (direita, placa vermelha), rodapé branco dos contatos e, na adega, a faixa do aviso
  ...SEGMENTOS_DE_OFERTA.map((sg): EncarteOficial => {
    const id = idDaArte(sg.id), A = { etiqueta: ESTILOS_DE_BALAO['placa-amarela'], sombraNome: 'rgba(0,0,0,.6)' };
    return {
      id, nome: `Ofertas – ${sg.nome}`, segmento: sg.id, ...(sg.aviso ? { aviso: sg.aviso } : {}),
      formatos: {
        '9:16': {
          fundo: `/studio/encartes-oficiais/${id}-v-st-limpo.webp`, fundoLimpo: `/studio/encartes-oficiais/${id}-v-st-limpo.webp`,
          titulo: { x: 14, y: 20, w: 640, h: 476 },
          colunas: [{ x: 26, y: 505, w: 468, h: 1160, ...A }, { x: 610, y: 455, w: 446, h: 1210, ...AZUL }],
          logo: { x: 650, y: 66, w: 386, h: 290 }, redes: { x: 660, y: 368, w: 376, h: 84 },
          rodape: sg.aviso ? { x: 40, y: 1712, w: 1000, h: 140 } : { x: 40, y: 1712, w: 1000, h: 190 },
          ...(sg.aviso ? { aviso: { x: 30, y: 1866, w: 1020, h: 48 } } : {}),
          cartao: 1,
        },
        '16:9': {
          fundo: `/studio/encartes-oficiais/${id}-h-st-limpo.webp`, fundoLimpo: `/studio/encartes-oficiais/${id}-h-st-limpo.webp`,
          titulo: { x: 150, y: 10, w: 730, h: 456 },
          colunas: [{ x: 30, y: 468, w: 848, h: 474, ...A }, { x: 1022, y: 380, w: 868, h: 562, ...AZUL }],
          logo: { x: 1125, y: 40, w: 400, h: 252 }, redes: { x: 1140, y: 302, w: 370, h: 76 },
          rodape: sg.aviso ? { x: 40, y: 970, w: 1840, h: 66 } : { x: 40, y: 968, w: 1840, h: 104 },
          ...(sg.aviso ? { aviso: { x: 30, y: 1044, w: 1860, h: 34 } } : {}),
          cartao: 0.8,
        },
      },
      logoPadrao: logoOficialDoSegmento(sg.id),
      corTelefone: sg.corTelefone, corEndereco: sg.corEndereco, corRedes: sg.corRedes,
    };
  }),
];
/**
 * F-246 — o MESMO encarte nos outros tamanhos: título, logo e rodapé só mudam de escala (por igual); apenas a faixa de fundo
 * entre y1 e y2 da arte de origem ajusta a altura. São as faixas de scripts/studio/adaptar-encartes.mjs, que gera as imagens.
 */
const ADAPTACOES: Record<string, Partial<Record<FormatoArte, [FormatoDoc, number, number]>>> = {
  'mega-oferta-bicolor': { a4: ['9:16', 500, 1690], a3: ['9:16', 500, 1690], '4:5': ['9:16', 500, 1690], 'a4-h': ['16:9', 470, 945], '1:1': ['16:9', 470, 945] },
  'semana-do-frango': { a4: ['9:16', 650, 1570], a3: ['9:16', 650, 1570], '4:5': ['16:9', 540, 820], 'a4-h': ['16:9', 540, 820], '1:1': ['16:9', 540, 820] },
  'saude-em-oferta': { a4: ['9:16', 500, 1690], a3: ['9:16', 500, 1690], '4:5': ['9:16', 500, 1690], 'a4-h': ['16:9', 470, 945], '1:1': ['16:9', 470, 945] },
  ...Object.fromEntries(SEGMENTOS_DE_OFERTA.map((sg) => [idDaArte(sg.id), { a4: ['9:16', 500, 1690], a3: ['9:16', 500, 1690], '4:5': ['9:16', 500, 1690], 'a4-h': ['16:9', 470, 945], '1:1': ['16:9', 470, 945] }])),
};
const SUFIXO: Partial<Record<FormatoArte, string>> = { '1:1': '1x1', '4:5': '4x5', a4: 'a4', 'a4-h': 'a4-h', a3: 'a3' };
function adaptarLayout(id: string, base: LayoutDoEncarte, de: FormatoDoc, y1: number, y2: number, alvo: FormatoArte): LayoutDoEncarte {
  const { w: W0, h: H0 } = TAMANHO_DOC[de];
  const { w: W, h: H } = TAMANHO_DOC[alvo];
  const s = W / W0;
  const k = (H - y1 * s - (H0 - y2) * s) / (y2 - y1);
  const y = (v: number) => (v <= y1 ? v * s : v <= y2 ? y1 * s + (v - y1) * k : H - (H0 - v) * s);
  const caixa = <T extends Caixa>(b: T): T => ({ ...b, x: b.x * s, y: y(b.y), w: b.w * s, h: y(b.y + b.h) - y(b.y) });
  return {
    fundo: `/studio/encartes-oficiais/${id}-${SUFIXO[alvo]}.webp`, fundoLimpo: `/studio/encartes-oficiais/${id}-${SUFIXO[alvo]}-limpo.webp`,
    titulo: caixa(base.titulo), colunas: base.colunas.map(caixa), logo: caixa(base.logo), rodape: caixa(base.rodape), cartao: base.cartao,
    ...(base.aviso ? { aviso: caixa(base.aviso) } : {}),
    ...(base.redes ? { redes: caixa(base.redes) } : {}),
  };
}
/** Todo fundo oficial sai nos 7 tamanhos: fundo novo do dono = uma entrada em BASES e outra em ADAPTACOES. */
export const ENCARTES_OFICIAIS: EncarteOficial[] = BASES.map((e) => ({
  ...e,
  formatos: {
    ...e.formatos,
    ...Object.fromEntries(Object.entries(ADAPTACOES[e.id] ?? {}).map(([alvo, [de, y1, y2]]) => [alvo, adaptarLayout(e.id, e.formatos[de]!, de, y1, y2, alvo as FormatoArte)])),
  },
}));
/** F-259: os encartes de uma pasta (mercado ou farmácia) */
export const encartesDoSegmento = (s: SegmentoDoStudio) => ENCARTES_OFICIAIS.filter((e) => (e.segmento ?? 'mercado') === s);
export const encarteOficialPorId = (id: string | null | undefined) => ENCARTES_OFICIAIS.find((e) => e.id === id) ?? null;
export const formatosDoEncarte = (e: EncarteOficial) => (['9:16', '16:9', '1:1', '4:5', 'a4', 'a4-h', 'a3'] as FormatoArte[]).filter((f) => e.formatos[f]);
export const layoutDoEncarte = (e: EncarteOficial, formato?: FormatoArte): LayoutDoEncarte => e.formatos[formato ?? formatosDoEncarte(e)[0]] ?? e.formatos[formatosDoEncarte(e)[0]]!;

type Ani = NonNullable<Camada['animacao']>;
const ani = (tipo: Ani['tipo'], atraso: number, duracao = 0.6, depois: Ani['depois'] = null): Ani => ({ tipo, atraso, duracao, depois });
type Produto = Pick<ProdutoTabloide, 'nome' | 'preco' | 'precoDe' | 'unidade' | 'imagem'>;

/** Um produto na sua célula: placa translúcida, foto inteira, nome em branco e etiqueta de preço sem nada sobre o valor. */
function celula(p: Produto, b: Caixa, col: ColunaDoEncarte, n: number, atraso: number): Camada[] {
  const out: Camada[] = [];
  const pad = Math.max(10, Math.round(Math.min(b.w, b.h) * 0.05));
  const nomear = (c: Camada) => ({ ...c, nome: `${c.nome} ${n}` });
  out.push({ ...forma('Placa', b.x, b.y, b.w, b.h, { cor: col.corPlaca ?? 'rgba(255,255,255,.10)', raio: Math.round(Math.min(b.w, b.h) * 0.08), borda: { cor: col.bordaPlaca ?? 'rgba(255,255,255,.28)', largura: 2 } }), nome: `Placa ${n}`, animacao: ani('surgir', atraso, 0.5) });
  const vertical = b.h >= b.w * 0.8;
  const oval = col.etiqueta.formato === 'oval'; // o balão oval precisa de mais altura e não estica até a largura toda
  let foto: Caixa, nomeB: Caixa, preco: Caixa;
  if (vertical) {
    const th = oval ? Math.min(b.h * 0.25, b.w * 0.38) : Math.min(b.h * 0.2, b.w * 0.3), nh = Math.min(b.h * 0.17, b.w * 0.3);
    foto = { x: b.x + pad, y: b.y + pad, w: b.w - 2 * pad, h: b.h - 2 * pad - th - nh - pad * 0.6 };
    nomeB = { x: b.x + pad, y: foto.y + foto.h + pad * 0.3, w: b.w - 2 * pad, h: nh };
    const tw = Math.min(b.w - 2 * pad, th * (oval ? 2.2 : 3.2));
    preco = { x: b.x + (b.w - tw) / 2, y: b.y + b.h - pad - th, w: tw, h: th };
  } else {
    const fw = Math.min(b.h - 2 * pad, b.w * 0.42);
    foto = { x: b.x + pad, y: b.y + pad, w: fw, h: b.h - 2 * pad };
    const rx = foto.x + fw + pad, rw = b.x + b.w - pad - rx;
    nomeB = { x: rx, y: b.y + pad, w: rw, h: (b.h - 2 * pad) * 0.48 };
    const th = oval ? Math.min((b.h - 2 * pad) * 0.52, rw * 0.46) : Math.min((b.h - 2 * pad) * 0.46, rw * 0.42);
    const tw = oval ? Math.min(rw, th * 2.2) : rw;
    preco = { x: rx + (rw - tw) / 2, y: b.y + b.h - pad - th, w: tw, h: th };
  }
  out.push({ ...imagem(`Produto ${n}`, p.imagem?.url ?? '', foto.x, foto.y, foto.w, foto.h, { ajuste: 'conter', focoX: 50, focoY: vertical ? 100 : 50, sombra: null }), animacao: ani('zoom', atraso + 0.15, 0.55) });
  const nome = nomeDoProduto(p.nome, { ...nomeB, alinhamento: vertical ? 'center' : 'left' });
  out.push({ ...nome, nome: `Nome do produto ${n}`, ...(col.corNome ? { cor: col.corNome } : {}), sombra: col.corNome ? null : { cor: col.sombraNome, desfoque: 10, dx: 0, dy: 4 }, animacao: ani('subir', atraso + 0.3, 0.5) } as Camada);
  out.push(...etiquetaDePreco(preco, p, col.etiqueta).map((c) => ({ ...nomear(c), animacao: ani('zoom', atraso + 0.45, 0.5) })));
  return out;
}

/** Os produtos de UMA área numa grade completa, preenchendo toda a área: poucos produtos ficam grandes; muitos, menores. */
function produtosDaColuna(ps: Produto[], col: ColunaDoEncarte, g: GradeDaArea, numero: () => number, atraso0: number): Camada[] {
  const gap = 16;
  const cw = (col.w - gap * (g.cols - 1)) / g.cols;
  const ch = (col.h - gap * (g.rows - 1)) / g.rows;
  return ps.flatMap((p, i) => celula(p, { x: col.x + (i % g.cols) * (cw + gap), y: col.y + Math.floor(i / g.cols) * (ch + gap), w: cw, h: ch }, col, numero(), atraso0 + i * 0.25));
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

const ICONE_FONE = '/studio/encartes-oficiais/icone-whatsapp.svg';
const ICONE_LOCAL = '/studio/encartes-oficiais/icone-local.svg';
/**
 * F-245 — contatos como na referência do dono: ícone verde com o telefone e ícone de localização com o endereço, centralizados
 * na faixa: lado a lado quando ela é baixa e um embaixo do outro quando é alta. O endereço usa até 2 linhas.
 */
function camadasDoRodape(e: EncarteOficial, r: Caixa, d: DadosDoEncarte): Camada[] {
  const tel = d.telefone?.trim(), end = d.endereco?.trim();
  if (!tel && !end) return [];
  const emLinha = r.h < 160;
  const icone = Math.round(emLinha ? r.h * 0.62 : r.h * 0.3), vao = Math.round(icone * 0.22);
  const tTel = Math.round(emLinha ? r.h * 0.5 : r.h * 0.3);
  const sombra = e.sombraContato ? { cor: 'rgba(0,30,90,.7)', desfoque: 6, dx: 0, dy: 3 } : null;
  const wTelTexto = tel ? larguraDoTexto(tel, 'anton', tTel) + 8 : 0;
  const wTel = tel ? icone + vao + wTelTexto : 0;
  const espaco = tel && end ? Math.round(r.w * 0.04) : 0;
  // o endereço diminui até caber em 2 linhas no que sobra da faixa
  const larguraEnd = Math.max(120, (emLinha ? r.w - wTel - espaco : r.w) - icone - vao);
  let tEnd = Math.round(emLinha ? r.h * 0.3 : r.h * 0.18);
  const textoEnd = (x: number) => texto('Endereço', end ?? '', x, 0, larguraEnd, { fonte: 'poppins', peso: 800, tamanho: tEnd, maiusculas: true, alinhamento: 'left', cor: e.corEndereco, entrelinha: 1.1, sombra });
  const alturaEnd = emLinha ? r.h : r.h * 0.46;
  while (end && textoEnd(0).h > alturaEnd && tEnd > 16) tEnd -= 2;
  const wEndTexto = end ? Math.min(larguraEnd, larguraDoTexto(end.toUpperCase(), 'poppins', tEnd, 800) + 8) : 0;
  const wEnd = end ? icone + vao + wEndTexto : 0;
  const out: Camada[] = [];
  const telefone = (x: number, cy: number) => {
    const t = texto('Telefone', tel!, x + icone + vao, 0, wTelTexto, { fonte: 'anton', tamanho: tTel, alinhamento: 'left', cor: e.corTelefone, entrelinha: 1.1, sombra });
    out.push({ ...imagem('Ícone do telefone', ICONE_FONE, x, cy - icone / 2, icone, icone, { ajuste: 'conter' }), animacao: ani('zoom', 0.4, 0.5) }, { ...t, y: cy - t.h / 2, animacao: ani('subir', 0.4, 0.5) });
  };
  const endereco = (x: number, cy: number) => {
    const t = { ...textoEnd(x + icone + vao), w: wEndTexto };
    out.push({ ...imagem('Ícone do endereço', ICONE_LOCAL, x, cy - icone / 2, icone, icone, { ajuste: 'conter' }), animacao: ani('zoom', 0.55, 0.5) }, { ...t, y: cy - t.h / 2, animacao: ani('subir', 0.55, 0.5) });
  };
  if (emLinha) {
    let x = r.x + (r.w - (wTel + espaco + wEnd)) / 2;
    const cy = r.y + r.h / 2;
    if (tel) { telefone(x, cy); x += wTel + espaco; }
    if (end) endereco(x, cy);
  } else {
    const cx = r.x + r.w / 2;
    if (tel) telefone(cx - wTel / 2, end ? r.y + r.h * 0.3 : r.y + r.h / 2);
    if (end) endereco(cx - wEnd / 2, tel ? r.y + r.h * 0.74 : r.y + r.h / 2);
  }
  return out;
}

/** A arte do encarte oficial com os produtos, a logo e os contatos do cliente. */
export function documentoDoEncarteOficial(e: EncarteOficial, produtos: Produto[], d: DadosDoEncarte = {}, formato?: FormatoArte): Documento {
  const f = formato && e.formatos[formato] ? formato : formatosDoEncarte(e)[0];
  const lay = layoutDoEncarte(e, f);
  const { w: W, h: H } = TAMANHO_DOC[f];
  // F-278: o fundo não traz mais a caixa "SUA LOGO AQUI" nem os ícones: os dois são elementos que se arrastam e se editam
  const c: Camada[] = [{ ...imagem('Fundo oficial', lay.fundoLimpo, 0, 0, W, H), bloqueada: true }];
  // F-248: a logo do encarte é uma camada (troca pela pasta Logos e fica nítida em qualquer tamanho)
  const logoTitulo = d.logoDoEncarte ?? e.logoPadrao;
  // F-286: nos segmentos a logo é EDITÁVEL (textos e o círculo para a logo do cliente); a logo escolhida na pasta Logos vale inteira
  if (!d.logoDoEncarte && ehSegmentoComLogoEditavel(e.segmento)) c.push(...camadasDaLogoDoSegmento(e.segmento, lay.titulo));
  else c.push({ ...imagem('Logo do encarte', logoTitulo.url, lay.titulo.x, lay.titulo.y, lay.titulo.w, lay.titulo.h, { ajuste: 'conter' }), animacao: ani('zoom', 0, 0.6) });
  if (d.logo) c.push(...camadasDaLogo(d.logo, lay.logo));
  else c.push({ ...vagaDaLogo(lay.logo.x, lay.logo.y, lay.logo.w, lay.logo.h), animacao: ani('zoom', 0.1, 0.6) });
  if (lay.redes) c.push({ ...redesSociais(lay.redes.x, lay.redes.y, lay.redes.w, lay.redes.h, e.corRedes ?? '#1046c8'), animacao: ani('subir', 0.2, 0.5) });
  // F-244: grade completa e inteligente para a quantidade escolhida (vale para todo fundo oficial novo)
  const lista = produtos.slice(0, quantidadeCompleta(d.quantos ?? QUANTIDADE_PADRAO, produtos.length));
  const plano = planejarAreas(lay.colunas, lista.length, lay.cartao);
  const grupos = dividirPorCotas(lista, plano.map((g) => g.n));
  let n = 0;
  grupos.forEach((ps, k) => c.push(...produtosDaColuna(ps, lay.colunas[k], plano[k], () => ++n, 0.3 + k * 0.12)));
  c.push(...camadasDoRodape(e, lay.rodape, d));
  if (e.aviso && lay.aviso) c.push({ ...avisoLegal(e.aviso, lay.aviso), animacao: ani('surgir', 0.5, 0.5) });
  return { versao: 2, formato: f, fundo: '#1e3fd0', camadas: c, video: { duracao: 8 } };
}
