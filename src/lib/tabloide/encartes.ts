/**
 * F-231 — ENCARTES DE MERCADO do SOBRE MÍDIA Studio.
 * Cada modelo é um Cartaz Digital pronto (mesmo motor, mesmas opções): folha em pé (A4), faixa de tema no topo com o
 * título 3D e a caixa "Sua logo aqui", 3 produtos em destaque com "de/por" e a grade 4 × 3 — 15 produtos.
 * A arte da faixa é própria da SOBRE MÍDIA (criada pela IA da Cloudflare, sem texto/marca; ver scripts/studio/gerar-artes-encartes.mjs);
 * sem a arte pronta, a faixa sai nas cores do tema (o encarte funciona do mesmo jeito).
 * O cliente troca produtos, nomes e preços e a foto do produto vem sozinha (catálogo → código de barras → bases abertas).
 */
import type { SegmentoId as SegmentoDoStudio } from '@/lib/studio/catalogo';
import type { ConfigCartaz, CoresCartaz, EstiloBox } from './cartaz';
import type { LayoutDoCartaz } from './grade';
import type { SegmentoId } from './temas';
import { ARTES_PRONTAS } from './encartes-artes';

export interface ModeloDeEncarte {
  id: string;
  /** nome no catálogo do Studio */
  nome: string;
  /** título 3D desenhado pelo sistema sobre a arte */
  titulo: string;
  frase: string;
  segmento: SegmentoId;
  /** segmento do Studio (Creative Core) em que o encarte aparece */
  segmentoStudio: SegmentoDoStudio;
  /** cores dos boxes, selos de preço e rodapé (TEMAS do Cartaz Digital) */
  temaId: string;
  cores?: CoresCartaz;
  boxes?: EstiloBox;
  /** pedido da arte da faixa (para a IA; sempre sem texto, marca ou preço) */
  arte: string;
  /** produtos de exemplo, um por linha (o cliente troca tudo) */
  produtos: string;
  /** F-235: logo 3D da galeria (criada no Studio) no lugar do título desenhado */
  logoCabecalhoId?: string | null;
  /** F-236: estrutura das referências de encarte de mercado */
  layout?: LayoutDoCartaz;
  grade?: string;
  destaques?: 0 | 1 | 2 | 3;
  /** título como logo 3D (estilo do Criador de Logos) */
  estiloTitulo?: string;
  /** fundo moderno em CSS (diagonal, raios, retícula) e cor da coluna/metade */
  fundoCss?: string;
  corPainel?: string;
}

// ───── F-236: fundos modernos (só gradientes CSS: diagonais, raios de luz e retícula), como nas referências de mercado
const RETICULA = 'radial-gradient(rgba(255,255,255,.14) 1.5px, transparent 1.7px) 0 0 / 18px 18px';
const raiosDe = (centro: string, de: string, para: string) => `repeating-conic-gradient(from 0deg at ${centro}, rgba(255,255,255,.10) 0deg 6deg, transparent 6deg 12deg), radial-gradient(circle at ${centro}, ${de}, ${para} 72%)`;
export const FUNDOS = {
  diagonalAmareloVermelho: `${RETICULA}, linear-gradient(118deg, #e3122a 0 30%, #ffd21f 30.2% 100%)`,
  diagonalVermelhoAmarelo: `${RETICULA}, linear-gradient(160deg, #d90f1f 0 46%, #ffd21f 46.2% 100%)`,
  raiosVermelho: `${raiosDe('50% 8%', '#ff4d4d', '#7a0712')}`,
  raiosVerde: `${raiosDe('50% 8%', '#3ccf4a', '#0b5d1e')}`,
  raiosAmarelo: `${raiosDe('50% 10%', '#fff176', '#f29a00')}`,
  vinho: `${RETICULA}, radial-gradient(circle at 50% 8%, #c4142a, #3d0008 78%)`,
  azulLaranja: `${RETICULA}, linear-gradient(165deg, #1e8fe0 0 58%, #ff8a00 58.2% 100%)`,
  azulAmarelo: `${RETICULA}, linear-gradient(170deg, #1e3fd0 0 40%, #ffd21f 40.2% 100%)`,
  verdeAmarelo: `${RETICULA}, linear-gradient(165deg, #2f9e2a 0 42%, #ffe14a 42.2% 100%)`,
  dividido: `${RETICULA}, linear-gradient(180deg, #ef1f35, #a00c1f)`,
} as const;

/** Cesta de mercado de exemplo: 3 destaques com "de/por" e 12 produtos na grade. */
export const CESTA_MERCADO = [
  'Arroz Tipo 1 Camil 1kg de 6,99 por 4,99',
  'Feijão Carioca Camil 1kg de 8,99 por 6,49',
  'Leite Integral Piracanjuba 1L de 5,49 por 3,99',
  'Macarrão Espaguete Renata 500g 3,49',
  'Óleo de Soja Liza 900ml 6,99',
  'Lasanha Adria 500g 6,49',
  'Macarrão Penne Renata 500g 3,79',
  'Azeite Gallo 500ml 29,90',
  'Café Pilão 500g 18,90',
  'Ketchup Heinz 397g 9,99',
  'Maionese Hellmann\'s 500g 9,49',
  'Extrato de Tomate Elefante 340g 5,99',
  'Molho de Tomate Fugini 340g 2,49',
  'Açúcar Refinado União 1kg 4,79',
  'Biscoito Recheado Passatempo 130g 2,99',
].join('\n');

const CESTA_ACOUGUE = [
  'Picanha kg de 89,90 por 69,90',
  'Contrafilé kg de 49,90 por 39,90',
  'Costela Bovina kg de 32,90 por 26,90',
  'Alcatra kg 42,90', 'Patinho kg 38,90', 'Acém kg 29,90', 'Músculo kg 27,90',
  'Linguiça Toscana Sadia kg 21,90', 'Frango Inteiro kg 12,90', 'Coxa e Sobrecoxa kg 13,90', 'Filé de Peito de Frango kg 22,90',
  'Bisteca Suína kg 19,90', 'Pernil Suíno kg 18,90', 'Carvão Vegetal 3kg 19,90', 'Sal Grosso Cisne 1kg 4,49',
].join('\n');

const CESTA_HORTIFRUTI = [
  'Tomate kg de 8,99 por 5,99', 'Banana Prata kg de 6,99 por 4,49', 'Batata kg de 6,49 por 3,99',
  'Cebola kg 4,99', 'Cenoura kg 4,49', 'Alface un 2,99', 'Maçã Gala kg 9,99', 'Laranja Pera kg 3,99',
  'Mamão Formosa kg 5,99', 'Melancia kg 2,99', 'Limão Taiti kg 4,99', 'Pimentão Verde kg 7,99',
  'Abacaxi un 6,99', 'Uva Thompson 500g 9,99', 'Manga Palmer kg 6,99',
].join('\n');

const SEM_TEXTO = 'wide horizontal banner background for a supermarket promotional flyer header, empty space in the center for a title, vibrant and festive, high quality advertising illustration, no text, no letters, no numbers, no logo, no brand, no watermark, no people';

export const ENCARTES: ModeloDeEncarte[] = [
  { id: 'encarte-quinzena-economia', nome: 'Quinzena da Economia – Encarte Grande', titulo: 'QUINZENA DA ECONOMIA', frase: 'Preço baixo todo dia', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'ofertao',
    arte: `red and yellow sunburst rays, flying golden coins, confetti and a small shopping cart on the side, ${SEM_TEXTO}`, produtos: CESTA_MERCADO },
  { id: 'encarte-dia-comerciante', nome: 'Dia do Comerciante – Encarte Grande', titulo: 'DIA DO COMERCIANTE', frase: 'Com descontos especiais', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'horta-verde', cores: 'amarelo',
    arte: `deep green background with yellow light rays, gift ribbons, shopping bags and a striped store awning, ${SEM_TEXTO}`, produtos: CESTA_MERCADO },
  { id: 'encarte-semana-consumidor', nome: 'Semana do Consumidor – Encarte Grande', titulo: 'SEMANA DO CONSUMIDOR', frase: 'Descontos em toda a loja', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'leve-pague',
    arte: `blurred bright supermarket aisle with shelves full of colorful products, red tones, bokeh lights, ${SEM_TEXTO}`, produtos: CESTA_MERCADO },
  { id: 'encarte-promocao-inverno', nome: 'Promoção de Inverno – Encarte Grande', titulo: 'PROMOÇÃO DE INVERNO', frase: 'Ofertas quentinhas para o frio', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'show',
    arte: `snowy winter landscape in blue tones, falling snowflakes, frosted pine branches, a steaming cup of hot chocolate on the side, ${SEM_TEXTO}`, produtos: CESTA_MERCADO },
  { id: 'encarte-aniversario-mercado', nome: 'Aniversário do Mercado – Encarte Grande', titulo: 'ANIVERSÁRIO DO MERCADO', frase: 'A festa é nossa, o desconto é seu', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'data-cliente',
    arte: `blue festive background with colorful balloons, streamers, confetti and gift boxes, ${SEM_TEXTO}`, produtos: CESTA_MERCADO },
  { id: 'encarte-feirao-ofertas', nome: 'Feirão de Ofertas – Encarte Grande', titulo: 'FEIRÃO DE OFERTAS', frase: 'Só esta semana', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'ofertao', cores: 'claro',
    arte: `orange and red explosion of light, price tag shapes without text, sparkles and confetti, dynamic energy, ${SEM_TEXTO}`, produtos: CESTA_MERCADO },
  { id: 'encarte-black-friday', nome: 'Black Friday – Encarte Grande', titulo: 'BLACK FRIDAY', frase: 'Os menores preços do ano', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'data-blackfriday',
    arte: `black background with golden glitter, gold ribbons and neon yellow light streaks, luxury mood, ${SEM_TEXTO}`, produtos: CESTA_MERCADO },
  { id: 'encarte-natal', nome: 'Natal de Ofertas – Encarte Grande', titulo: 'NATAL DE OFERTAS', frase: 'Ceia completa com preço baixo', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'data-natal',
    arte: `christmas decorations, red and green bokeh lights, ornaments, pine branches and golden stars, ${SEM_TEXTO}`, produtos: CESTA_MERCADO },
  { id: 'encarte-arraia', nome: 'Arraiá de Ofertas – Encarte Grande', titulo: 'ARRAIÁ DE OFERTAS', frase: 'Tudo para a sua festa junina', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'data-junina',
    arte: `brazilian festa junina scene, colorful paper flag bunting, straw hat, bonfire glow, corn cobs, warm night sky, ${SEM_TEXTO}`, produtos: CESTA_MERCADO },
  { id: 'encarte-pascoa', nome: 'Páscoa de Ofertas – Encarte Grande', titulo: 'PÁSCOA DE OFERTAS', frase: 'Chocolates e ofertas para a família', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'data-pascoa',
    arte: `easter chocolate eggs wrapped in colorful foil, pastel ribbons, spring flowers on a chocolate brown background, ${SEM_TEXTO}`, produtos: CESTA_MERCADO },
  { id: 'encarte-festival-carne', nome: 'Festival da Carne – Encarte Grande', titulo: 'FESTIVAL DA CARNE', frase: 'Cortes selecionados para o seu churrasco', segmento: 'acougue', segmentoStudio: 'supermercados', temaId: 'acougue-brasa',
    arte: `barbecue grill with glowing embers and flames on rustic dark wood, smoke, warm red light, ${SEM_TEXTO}`, produtos: CESTA_ACOUGUE },
  { id: 'encarte-quarta-verde', nome: 'Quarta Verde – Encarte Grande', titulo: 'QUARTA VERDE', frase: 'Hortifruti fresquinho do campo', segmento: 'hortifruti', segmentoStudio: 'supermercados', temaId: 'horta-verde',
    arte: `fresh colorful vegetables and fruits on a wooden market table, green leaves, sunny farm light, ${SEM_TEXTO}`, produtos: CESTA_HORTIFRUTI },
];

/**
 * F-236 — ENCARTES MODERNOS: as estruturas das referências de encarte de mercado que o dono mandou (palco com 1 produto,
 * grade com coluna de destaques à direita, tela dividida em duas cores, grade com destaques em cima), com o título em
 * LOGO 3D (Criador de Logos), fundos com diagonal/raios/retícula e painéis coloridos. Arte própria da SOBRE MÍDIA.
 */
const CESTA_15 = CESTA_MERCADO;
const linhas = (texto: string, n: number) => texto.split('\n').slice(0, n).join('\n');
const CESTA_FRANGO = [
  'Frango Inteiro Congelado kg de 13,99 por 9,99', 'Coxa e Sobrecoxa kg de 15,99 por 12,49',
  'Filé de Peito de Frango kg 19,99', 'Asa de Frango kg 14,99', 'Coxinha da Asa kg 17,99', 'Moela de Frango kg 9,99', 'Frango a Passarinho kg 13,49', 'Linguiça de Frango kg 16,99',
].join('\n');
const CESTA_BEBIDAS = [
  'Vinho Tinto Suave 750ml de 19,99 por 14,99', 'Vinho Branco Seco 750ml de 21,99 por 16,99', 'Espumante Brut 750ml de 34,99 por 26,99',
  'Margarina Delícia 500g 2,99', 'Margarina Qualy 500g 6,99', 'Requeijão Catupiry 200g 8,99', 'Manteiga Aviação 200g 12,90',
].join('\n');

export const ENCARTES_MODERNOS: ModeloDeEncarte[] = [
  { id: 'moderno-show-de-ofertas', nome: 'Show de Ofertas – Encarte Moderno', titulo: 'SHOW DE OFERTAS', frase: 'Ofertas válidas enquanto durarem os estoques', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'ofertao', cores: 'claro',
    layout: 'lateral', grade: '2x2', destaques: 3, estiloTitulo: 'show-de-ofertas', fundoCss: FUNDOS.raiosVerde, corPainel: '#b30d20',
    arte: `stage spotlights and red balloons over green background, ${SEM_TEXTO}`, produtos: CESTA_BEBIDAS },
  { id: 'moderno-dia-de-economia', nome: 'Dia de Economia – Encarte Moderno', titulo: 'DIA DE ECONOMIA', frase: 'Economize muito com ofertas especiais', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'ofertao', cores: 'amarelo',
    layout: 'lateral', grade: '3x4', destaques: 3, estiloTitulo: 'dia-de-economia', fundoCss: FUNDOS.vinho, corPainel: '#ffd21f',
    arte: `golden coins and dollar signs over dark red background, ${SEM_TEXTO}`, produtos: CESTA_15 },
  { id: 'moderno-semana-do-frango', nome: 'Semana do Frango – Encarte Moderno', titulo: 'SEMANA DO FRANGO', frase: 'Descontos, ofertas e promoções para você', segmento: 'acougue', segmentoStudio: 'supermercados', temaId: 'show', cores: 'claro',
    layout: 'lateral', grade: '2x3', destaques: 2, estiloTitulo: 'semana-do-frango', fundoCss: FUNDOS.azulLaranja, corPainel: '#ff8a00',
    arte: `blue sky and orange sun rays, ${SEM_TEXTO}`, produtos: CESTA_FRANGO },
  { id: 'moderno-mega-oferta', nome: 'Mega Oferta – Encarte Moderno', titulo: 'MEGA OFERTA', frase: 'Ofertas válidas enquanto durarem os estoques', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'ofertao', cores: 'claro',
    layout: 'dividido', grade: '1x8', estiloTitulo: 'mega-oferta', fundoCss: FUNDOS.dividido, corPainel: '#1e3fd0',
    arte: `red and blue split background with golden coins, ${SEM_TEXTO}`, produtos: linhas(CESTA_15, 8) },
  { id: 'moderno-explosao-de-ofertas', nome: 'Explosão de Ofertas – Encarte Moderno', titulo: 'EXPLOSÃO DE OFERTAS', frase: 'Preços que estouram de baratos', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'ofertao', cores: 'claro',
    layout: 'lateral', grade: '3x2', destaques: 1, estiloTitulo: 'explosao-de-ofertas', fundoCss: FUNDOS.raiosAmarelo, corPainel: '#ffd21f',
    arte: `yellow explosion of light with red sparks, ${SEM_TEXTO}`, produtos: linhas(CESTA_15, 7) },
  { id: 'moderno-hora-de-economizar', nome: 'Hora de Economizar – Encarte Moderno', titulo: 'HORA DE ECONOMIZAR', frase: 'A melhor hora para economizar é todos os dias', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'show', cores: 'claro',
    layout: 'padrao', grade: '4x2', destaques: 0, estiloTitulo: 'hora-de-economizar', fundoCss: FUNDOS.azulAmarelo,
    arte: `blue background with golden clock and coins, ${SEM_TEXTO}`, produtos: linhas(CESTA_15, 8) },
  { id: 'moderno-super-ofertas', nome: 'Super Ofertas – Encarte Moderno', titulo: 'SUPER OFERTAS', frase: 'Os melhores preços estão aqui', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'ofertao', cores: 'claro',
    layout: 'padrao', grade: '4x2', destaques: 0, estiloTitulo: 'super-ofertas', fundoCss: FUNDOS.raiosVermelho,
    arte: `red background with silver shopping carts, ${SEM_TEXTO}`, produtos: linhas(CESTA_15, 8) },
  { id: 'moderno-hortifruti', nome: 'Hortifruti – Encarte Moderno', titulo: 'HORTIFRUTI', frase: 'Frutas, verduras e legumes fresquinhos', segmento: 'hortifruti', segmentoStudio: 'supermercados', temaId: 'horta-verde', cores: 'claro',
    layout: 'padrao', grade: '4x1', destaques: 3, estiloTitulo: 'hortifruti', fundoCss: FUNDOS.verdeAmarelo,
    arte: `green and yellow fresh market awning, ${SEM_TEXTO}`, produtos: linhas(CESTA_HORTIFRUTI, 7) },
  { id: 'moderno-aqui-tem-economia', nome: 'Aqui Tem Economia – Encarte Moderno', titulo: 'AQUI TEM ECONOMIA', frase: 'Qualidade na sua mesa, economia para o seu bolso', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'ofertao', cores: 'claro',
    layout: 'padrao', grade: '4x2', destaques: 3, estiloTitulo: 'aqui-tem-economia', fundoCss: FUNDOS.diagonalAmareloVermelho,
    arte: `yellow and red diagonal background with coins, ${SEM_TEXTO}`, produtos: linhas(CESTA_15, 11) },
  { id: 'moderno-ofertas-da-semana', nome: 'Ofertas da Semana – Encarte Moderno', titulo: 'OFERTAS DA SEMANA', frase: 'Ofertas válidas enquanto durarem os estoques', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'ofertao', cores: 'claro',
    layout: 'padrao', grade: '4x3', destaques: 3, estiloTitulo: 'ofertas-da-semana', fundoCss: FUNDOS.diagonalVermelhoAmarelo,
    arte: `red and yellow background with shopping cart and basket, ${SEM_TEXTO}`, produtos: CESTA_15 },
  { id: 'moderno-quinta-da-carne', nome: 'Quinta da Carne – Encarte Moderno', titulo: 'QUINTA DA CARNE', frase: 'Cortes selecionados para o seu churrasco', segmento: 'acougue', segmentoStudio: 'supermercados', temaId: 'acougue-brasa', cores: 'claro',
    layout: 'lateral', grade: '3x3', destaques: 2, estiloTitulo: 'quinta-da-carne', fundoCss: FUNDOS.raiosVermelho, corPainel: '#ffd21f',
    arte: `red background with butcher cleavers and yellow wave, ${SEM_TEXTO}`, produtos: linhas(CESTA_ACOUGUE, 11) },
  { id: 'moderno-alerta-de-oferta', nome: 'Alerta de Oferta – Encarte Moderno', titulo: 'ALERTA DE OFERTA', frase: 'Corra, é por tempo limitado', segmento: 'mercado', segmentoStudio: 'supermercados', temaId: 'ofertao', cores: 'amarelo',
    layout: 'padrao', grade: '4x2', destaques: 3, estiloTitulo: 'alerta-de-oferta', fundoCss: FUNDOS.raiosVermelho,
    arte: `red background with warning siren light and caution tape, ${SEM_TEXTO}`, produtos: linhas(CESTA_15, 11) },
];
ENCARTES.unshift(...ENCARTES_MODERNOS);

export const encartePorId = (id: string | undefined): ModeloDeEncarte | null => ENCARTES.find((e) => e.id === id) ?? null;

/** Endereço da arte pronta da faixa (null enquanto a IA ainda não criou). */
export function arteDoEncarte(e: ModeloDeEncarte): ConfigCartaz['faixaArte'] {
  const a = ARTES_PRONTAS[e.id];
  return a ? { url: `/studio/encartes/${e.id}.webp?v=${a.v}`, largura: a.largura, altura: a.altura } : null;
}

/** O que o modelo muda no Cartaz Digital: folha em pé, 3 destaques, grade 4 × 3, título 3D sobre a arte e a caixa da logo. */
export const ENCARTE_FORMATO = 'a4';
export const ENCARTE_GRADE = '4x3';
export const gradeDoEncarte = (e: ModeloDeEncarte) => e.grade ?? ENCARTE_GRADE;
export function configDoEncarte(e: ModeloDeEncarte, c: ConfigCartaz): ConfigCartaz {
  return {
    ...c,
    titulo: e.titulo,
    regras: { ...c.regras, frase: e.frase, mostrarFrase: true, imagensIlustrativas: true, enquantoDurarem: true },
    destaques: e.destaques ?? 3,
    faixaArte: e.fundoCss ? null : arteDoEncarte(e),
    estiloTitulo: e.estiloTitulo ?? null,
    layout: e.layout ?? 'padrao',
    fundoCss: e.fundoCss ?? null,
    corPainel: e.corPainel ?? null,
    temaModo: 'cabecalho',
    cabecalhoEmTexto: !e.logoCabecalhoId,
    logoCabecalhoId: e.logoCabecalhoId ?? null,
    logoAqui: true,
    boxes: e.boxes ?? 'coluna',
    cores: e.cores ?? 'inteligente',
    rodapeEstilo: 'faixa',
    texto: e.produtos,
  };
}
