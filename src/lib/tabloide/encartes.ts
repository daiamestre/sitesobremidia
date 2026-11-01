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
}

/** Cesta de mercado de exemplo: 3 destaques com "de/por" e 12 produtos na grade. */
const CESTA_MERCADO = [
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

export const encartePorId = (id: string | undefined): ModeloDeEncarte | null => ENCARTES.find((e) => e.id === id) ?? null;

/** Endereço da arte pronta da faixa (null enquanto a IA ainda não criou). */
export function arteDoEncarte(e: ModeloDeEncarte): ConfigCartaz['faixaArte'] {
  const a = ARTES_PRONTAS[e.id];
  return a ? { url: `/studio/encartes/${e.id}.webp?v=${a.v}`, largura: a.largura, altura: a.altura } : null;
}

/** O que o modelo muda no Cartaz Digital: folha em pé, 3 destaques, grade 4 × 3, título 3D sobre a arte e a caixa da logo. */
export const ENCARTE_FORMATO = 'a4';
export const ENCARTE_GRADE = '4x3';
export function configDoEncarte(e: ModeloDeEncarte, c: ConfigCartaz): ConfigCartaz {
  return {
    ...c,
    titulo: e.titulo,
    regras: { ...c.regras, frase: e.frase, mostrarFrase: true, imagensIlustrativas: true, enquantoDurarem: true },
    destaques: 3,
    faixaArte: arteDoEncarte(e),
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
