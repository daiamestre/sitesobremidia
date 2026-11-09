// F-277 — ENCARTES e PALCOS DE OFERTAS por SEGMENTO, no mesmo padrão do mercado e da farmácia. Uma linha por segmento:
// nome, textos da pasta, botões do palco, cores e a cesta de exemplo. As artes saem de scripts/studio/gerar-segmentos.mjs
// (mesmos ids). Estas pastas são para EXPOR produtos; as pastas de modelos de arte (anúncio/chamada) continuam separadas.

export type SegmentoNovo = 'padaria' | 'adega' | 'acougue' | 'suplementos' | 'hortifruti' | 'pet' | 'beleza' | 'eletronicos' | 'moda';

/** Propaganda de bebida alcoólica: advertência obrigatória (Lei 9.294/1996, art. 4º-A; Conar, anexo P). */
export const AVISO_DE_BEBIDA = 'BEBA COM MODERAÇÃO. VENDA PROIBIDA PARA MENORES DE 18 ANOS. Imagens ilustrativas · Ofertas válidas enquanto durarem os estoques.';

export interface SegmentoDeOferta {
  id: SegmentoNovo;
  /** "Padaria" → "Encartes de Padaria" e "Palco de Ofertas – Padaria" */
  nome: string;
  descricao: string;
  /** segmento do catálogo de modelos (filtro da tela inicial do Studio) */
  segmentoDoCatalogo: string;
  botoes: string[];
  corBotao: string;
  corTelefone: string; corEndereco: string;
  /** cor do detalhe dos ícones de redes (f do Facebook, play do YouTube) */
  corRedes: string;
  aviso?: string;
  cesta: string;
}

const C = (l: string[]) => l.join('\n');

export const SEGMENTOS_DE_OFERTA: SegmentoDeOferta[] = [
  { id: 'padaria', nome: 'Padaria', descricao: 'Padarias, confeitarias e cafés · pães, bolos, frios e café da manhã', segmentoDoCatalogo: 'alimentacao', botoes: ['PADARIA', 'OFERTAS', 'FRESQUINHO'], corBotao: '#b8661a', corTelefone: '#7a3e0b', corEndereco: '#7d1428', corRedes: '#7d1428',
    cesta: C(['Pão de Forma Wickbold 500g 7,99', 'Bolo de Coco Seven Boys 250g 9,49', 'Bolo de Laranja Seven Boys 250g 9,49', 'Wafer Chocolate 70g Bauducco 3,49', 'Wafer Morango 70g Bauducco 3,49', 'Hot Dog Wickbold 400g 6,99', 'Hamburger Original Wickbold 360g 7,49', 'Chantilly 1L Fleischmann 24,90', 'Bolo Formigueiro Seven Boys 250g 9,49', 'Panettone ZERO 400g Bauducco 29,90', 'Sem Glúten Wickbold 300g 14,90', '5 Zeros Wickbold 400g 9,99', 'Wafer Limão 70g Bauducco 3,49', 'Bolo Marmore Seven Boys 250g 9,49', 'Do Forno Brioche Wickbold 400g 12,90', 'Chocottone Lata 750g Bauducco 49,90']) },
  { id: 'adega', nome: 'Adega', descricao: 'Adegas, distribuidoras e conveniências · cervejas, vinhos, destilados e gelo · a advertência “beba com moderação” já vem no encarte', segmentoDoCatalogo: 'supermercados', botoes: ['ADEGA', 'OFERTAS', 'GELADA'], corBotao: '#6e0a26', corTelefone: '#6e0a26', corEndereco: '#16161c', corRedes: '#6e0a26', aviso: AVISO_DE_BEBIDA,
    cesta: C(['Whisky Johnnie Walker Red Label 1L 99,90', 'Whisky Johnnie Walker Black Label 1L 12 Anos 189,90', 'Vodka Smirnoff 998ml 39,90', 'Conhaque Dreher 900ml 19,90', 'Cerveja Heineken Lata 350ml 4,99', 'Whisky Escocês Blended Red Label Johnnie Walker 750ml 89,90', 'Whisky Johnnie Walker Blonde 750ml 99,90', 'Whisky Johnnie Walker Double Black 1L 229,90']) },
  { id: 'acougue', nome: 'Açougue', descricao: 'Açougues e casas de carne · carnes, aves, embutidos e churrasco', segmentoDoCatalogo: 'supermercados', botoes: ['AÇOUGUE', 'CHURRASCO', 'OFERTAS'], corBotao: '#b3121f', corTelefone: '#b3121f', corEndereco: '#1f1f1f', corRedes: '#b3121f',
    cesta: C(['Picanha Masterboi kg 69,90', 'Alcatra Masterboi kg 42,90', 'Patinho Masterboi kg 38,90', 'Acém Masterboi kg 29,90', 'Fraldinha Masterboi kg 44,90', 'Maminha Masterboi kg 46,90', 'Cupim Masterboi kg 36,90', 'Músculo Masterboi kg 27,90', 'Coxão Duro Masterboi kg 34,90', 'Lagarto Masterboi kg 39,90', 'Coxa 1kg Seara 13,90', 'Mortadela Seara kg 9,90', 'Paio 370g Perdigão 12,90', 'Kibe 500g Perdigão 14,90', 'Charque Masterboi 500g 39,90', 'Baby Beef Masterboi kg 54,90']) },
  { id: 'suplementos', nome: 'Suplementos', descricao: 'Lojas de suplementos, academias e nutrição esportiva · whey, creatina, pré-treino e vitaminas', segmentoDoCatalogo: 'fitness', botoes: ['SUPLEMENTOS', 'OFERTAS', 'TREINO'], corBotao: '#e85600', corTelefone: '#a33800', corEndereco: '#17171c', corRedes: '#e85600',
    cesta: C(['Whey Pro 1kg — Max Titanium 129,90', 'Creatina Power 300g 3VS Nutrition 89,90', 'Whey Isolado 900g 3VS Nutrition 189,90', 'Beef Protein 900g Integralmédica 119,90', 'Glutamina 3VS Nutrition 300g 59,90', 'BCAA HYDRO 300g 3VS Nutrition 69,90', 'Horus 300g Amora Max Titanium 99,90', '2Hot 200G Uva Max Titanium 79,90', 'Beta Alanina 200g 3VS Nutrition 79,90', 'Cafeína 200mg 3VS Nutrition 34,90', 'Vitamina C 1000mg 3VS Nutrition 29,90', 'ZMA Testo Booster Integralmédica 90 cápsulas 49,90', 'Whey Zero Lactose 3VS Nutrition 900g 159,90', 'Termogênico Hell 3VS Nutrition 60 cápsulas 69,90', 'MCT em Pó 200g 3VS Nutrition 59,90', 'ÔMEGA 3 Growth Supplements 120 cápsulas 49,90']) },
  { id: 'hortifruti', nome: 'Quitanda e Hortifrúti', descricao: 'Quitandas, hortifrútis e sacolões · frutas, legumes, verduras, temperos e ovos', segmentoDoCatalogo: 'supermercados', botoes: ['HORTIFRÚTI', 'FRESQUINHO', 'OFERTAS'], corBotao: '#2c9a27', corTelefone: '#176412', corEndereco: '#b04f00', corRedes: '#2c9a27',
    cesta: C(['Maçã Gala kg 9,99', 'Laranja Pera kg 3,99', 'Tomate kg 5,99', 'Cebola kg 4,99', 'Banana Prata kg 4,49', 'Batata kg 3,99', 'Cenoura kg 4,49', 'Alface Crespa un 2,99', 'Mamão Formosa kg 5,99', 'Melancia kg 2,99', 'Limão Taiti kg 4,99', 'Abacaxi Pérola un 6,99', 'Manga Palmer kg 6,99', 'Uva Thompson kg 12,99', 'Pimentão Verde kg 7,99', 'Chuchu kg 3,99']) },
  { id: 'pet', nome: 'Pet Shop', descricao: 'Pet shops e agropecuárias · rações, petiscos, higiene e acessórios', segmentoDoCatalogo: 'pet', botoes: ['PET SHOP', 'OFERTAS', 'RAÇÃO'], corBotao: '#6a2fd6', corTelefone: '#0a5d75', corEndereco: '#3f1491', corRedes: '#6a2fd6',
    cesta: C(['Cat Chow Castrados sabor frango Purina 1kg 39,90', 'Pro Plan Hipoalergênico Adulto Purina 2kg 189,90', 'Fancy Feast Supremo Carne Purina 85g 4,99', 'Friskies Purina 1kg 29,90', 'Pate Adultos sabor Carne Special Dog 280g 3,99', 'Carne Adultos Special Dog 15kg 99,90', 'Dentalife Gatos Adultos Frango Purina 40g 14,90', 'Fancy Feast Petit Filet Salmão Purina 85g 4,99', 'Pate Filhotes sabor Carne Special Dog 280g 3,99', 'Cat Chow Carne para gato adulto Purina 1kg 39,90', 'Pro Plan Cuidado Urinário Adulto Purina 2kg 199,90', 'Fancy Feast Demi Glace Frango Purina 85g 4,99', 'Super Premium Natural Special Dog 10kg 149,90', 'Pate Adultos sabor Frango Special Dog 280g 3,99', 'Fancy Feast Casserole Atum e Salmão Purina 85g 4,99', 'Vegetales Adultos Special Dog 15kg 99,90']) },
  { id: 'beleza', nome: 'Beleza e Perfumaria', descricao: 'Perfumarias, lojas de cosméticos e salões · perfumes, cabelos, pele e maquiagem', segmentoDoCatalogo: 'beleza', botoes: ['BELEZA', 'OFERTAS', 'PERFUMARIA'], corBotao: '#e5257a', corTelefone: '#a00f52', corEndereco: '#6a1b9a', corRedes: '#e5257a',
    cesta: C(['Empire Deo Colônia 100ml Hinode 159,90', 'Grace Deo Colônia 100ml Hinode 149,90', 'Dream Cream 450g Lola Cosmetics 69,90', 'Purple Oil 50ml Lola Cosmetics 49,90', 'Sabonete líquido Nivea 250ml 19,90', 'Grand Deo Colônia 100ml Hinode 159,90', 'Joyful Deo Colônia 100ml Hinode 139,90', 'Venyx Deo Colônia 100ml Hinode 149,90', 'Sérum Grace la Rose 40g Hinode 89,90', 'H Men Deo Colônia 75ml Hinode 119,90', 'Rebelle Deo Colônia 75ml Hinode 119,90', 'Kajal Retratil Hinode un 29,90', 'Blossy Deo Colônia 75 ml Hinode 99,90', 'Dazzle Deo Colônia 60ml Hinode 89,90', 'Aerosol Nivea 150ml 16,90', 'Gel Dental Pró Basic 90g Hinode 12,90']) },
  { id: 'eletronicos', nome: 'Eletrônicos e Tecnologia', descricao: 'Lojas de celulares, informática e eletrônicos · aparelhos, acessórios e assistência', segmentoDoCatalogo: 'tecnologia', botoes: ['TECNOLOGIA', 'OFERTAS', 'CELULARES'], corBotao: '#1450d4', corTelefone: '#0a2f8f', corEndereco: '#121628', corRedes: '#1450d4',
    cesta: C(['Fone de Ouvido Bluetooth JBL un 89,90', 'Carregador Turbo USB-C Samsung un 49,90', 'Cabo USB-C 1m 19,90', 'Caixa de Som Bluetooth JBL un 129,90', 'Power Bank 10000mAh Xiaomi un 99,90', 'Película de Vidro 3D un 19,90', 'Capinha Antichoque un 29,90', 'Smartwatch Xiaomi un 199,90']) },
  { id: 'moda', nome: 'Moda', descricao: 'Lojas de roupas, calçados e acessórios · coleção, liquidação e promoções', segmentoDoCatalogo: 'moda', botoes: ['MODA', 'LIQUIDAÇÃO', 'OFERTAS'], corBotao: '#e3245a', corTelefone: '#9c0f3a', corEndereco: '#151515', corRedes: '#e3245a',
    cesta: C(['Camiseta Básica Algodão un 39,90', 'Calça Jeans Masculina un 119,90', 'Vestido Midi Floral un 149,90', 'Tênis Casual Masculino un 199,90', 'Bermuda Masculina Sarja un 79,90', 'Blusa Feminina Manga Curta un 59,90', 'Jaqueta Jeans Feminina un 179,90', 'Sandália Feminina Rasteira un 89,90']) },
];

export const segmentoDeOferta = (id: string) => SEGMENTOS_DE_OFERTA.find((s) => s.id === id) ?? null;
/** ids e pastas (os mesmos arquivos de public/studio/{encartes-oficiais,palco,logos}) */
export const idDaArte = (s: SegmentoNovo) => `${s}-em-oferta`;
export const pastaDeEncartesDe = (s: SegmentoNovo) => `encartes-de-${s}`;
export const pastaDoPalcoDe = (s: SegmentoNovo) => `palco-de-ofertas-${s}`;
export const chaveDosProdutosDe = (s: SegmentoNovo) => `studio-encarte-produtos-${s}`;
export const logoDoSegmento = (s: SegmentoNovo) => `/studio/logos/ofertas-${s}.webp`;
