// F-296 (pedido do dono, 10/11/2026): MODELOS COMPLEMENTARES de encarte e de palco para a farmácia e cada segmento.
// Os modelos de antes (F-259/F-277) continuam EXATAMENTE como eram; estes são modelos A MAIS, cada um com composição e cenário
// próprios, que aparecem na GALERIA DE MODELOS da pasta do segmento para o cliente escolher qual editar.
// A MESMA tabela desenha a arte (scripts/studio/gerar-segmentos.mjs lê este arquivo) e monta o modelo no site
// (encartesOficiais.ts e palco.ts), então arte e montagem nunca se desencontram. Arquivos: <id>-*.webp.
// Sem imports de propósito: o gerador (Node) lê este arquivo direto.

export interface CaixaPx { x: number; y: number; w: number; h: number }
/** área de produtos: `claro` = fundo claro (nome escuro); `escuro` = fundo escuro (nome branco com sombra) */
export interface AreaDaComposicao extends CaixaPx { tom: 'claro' | 'escuro'; balao: string; corNome?: string }
export interface FormatoDaComposicao {
  titulo: CaixaPx; logo: CaixaPx; redes: CaixaPx; rodape: CaixaPx; aviso?: CaixaPx;
  areas: AreaDaComposicao[];
  /** faixa da arte (y1, y2) que estica nos outros tamanhos (A4, A3, 4:5 saem do em pé; 1:1 e A4 deitado, do deitado) */
  faixa: [number, number];
  /** formato preferido de cada cartão de produto (largura ÷ altura) */
  cartao: number;
}
export interface ComposicaoDoEncarte {
  /** id da arte (= arquivos em public/studio/encartes-oficiais/<id>-*.webp) */
  id: string;
  /** desenho próprio (cada estilo é desenhado de um jeito no gerador) */
  estilo: string;
  /** a cor do encarte: fundo do documento, do vídeo e dos efeitos de flash/luz/brilho */
  corTema: string;
  corTelefone: string; corEndereco: string; sombraContato?: boolean;
  /** cor do detalhe dos ícones de redes */
  corRedes: string;
  v: FormatoDaComposicao; h: FormatoDaComposicao;
}

const E = (x: number, y: number, w: number, h: number, balao: string, corNome?: string): AreaDaComposicao => ({ x, y, w, h, tom: 'escuro', balao, ...(corNome ? { corNome } : {}) });
const C = (x: number, y: number, w: number, h: number, balao: string, corNome: string): AreaDaComposicao => ({ x, y, w, h, tom: 'claro', balao, corNome });
const b = (x: number, y: number, w: number, h: number): CaixaPx => ({ x, y, w, h });

/** farmácia + os 9 segmentos (F-277), cada um com a sua composição */
export const COMPOSICOES_DOS_ENCARTES: Record<string, ComposicaoDoEncarte> = {
  // FARMÁCIA — "vitrine clínica": cabeçalho verde com a logo no centro, UM cartão branco para os produtos, rodapé verde com a vaga à esquerda
  farmacia: {
    id: 'saude-em-oferta-clinica', estilo: 'clinica', corTema: '#0a9a50', corTelefone: '#ffffff', corEndereco: '#ffffff', sombraContato: true, corRedes: '#0a9a50',
    v: { titulo: b(260, 16, 560, 392), redes: b(340, 420, 400, 66), areas: [C(70, 615, 940, 1000, 'placa-verde', '#0b4a2a')], logo: b(40, 1668, 250, 184), rodape: b(310, 1672, 740, 176), aviso: b(30, 1866, 1020, 48), faixa: [640, 1600], cartao: 1 },
    h: { titulo: b(20, 30, 520, 364), redes: b(80, 420, 400, 66), logo: b(140, 520, 280, 205), rodape: b(600, 940, 1290, 92), areas: [C(615, 60, 1250, 840, 'placa-verde', '#0b4a2a')], aviso: b(30, 1040, 1860, 34), faixa: [60, 900], cartao: 0.85 },
  },
  // PADARIA — "lousa de padaria": cabeçalho de madeira (vaga num quadro creme à esquerda, logo à direita), lousa com moldura de madeira, rodapé kraft
  padaria: {
    id: 'padaria-em-oferta-lousa', estilo: 'lousa', corTema: '#8a4a12', corTelefone: '#7a3e0b', corEndereco: '#4f2a0a', corRedes: '#8a4a12',
    v: { logo: b(40, 70, 330, 245), redes: b(40, 345, 330, 62), titulo: b(400, 20, 660, 462), areas: [E(70, 545, 940, 1110, 'placa-caramelo')], rodape: b(40, 1725, 1000, 180), faixa: [560, 1640], cartao: 1 },
    h: { logo: b(40, 40, 330, 250), redes: b(410, 130, 330, 62), titulo: b(1400, 6, 460, 322), areas: [E(70, 380, 870, 520, 'placa-caramelo'), E(980, 380, 870, 520, 'placa-caramelo')], rodape: b(40, 968, 1840, 104), faixa: [360, 930], cartao: 0.8 },
  },
  // ADEGA — "adega de luxo": logo no centro do alto, DUAS áreas empilhadas (vinho e grafite) com a vaga na fita dourada entre elas, aviso de bebida
  adega: {
    id: 'adega-em-oferta-adega', estilo: 'adega', corTema: '#7a0a2a', corTelefone: '#ffd76a', corEndereco: '#ffffff', sombraContato: true, corRedes: '#7a0a2a',
    v: { titulo: b(220, 10, 640, 448), areas: [E(40, 490, 1000, 520, 'placa-dourada'), E(40, 1210, 1000, 450, 'placa-dourada')], logo: b(390, 1030, 300, 160), rodape: b(40, 1688, 690, 165), redes: b(750, 1738, 290, 64), aviso: b(30, 1866, 1020, 48), faixa: [500, 1650], cartao: 1 },
    h: { titulo: b(670, 6, 580, 406), areas: [E(30, 430, 800, 510, 'placa-dourada'), E(1090, 430, 800, 510, 'placa-dourada')], logo: b(860, 520, 200, 150), redes: b(850, 720, 220, 50), rodape: b(40, 958, 1840, 76), aviso: b(30, 1044, 1860, 34), faixa: [440, 940], cartao: 0.8 },
  },
  // AÇOUGUE — "casa de carnes": faixa preta vertical à esquerda (vaga e redes), logo no bloco vermelho, produtos sobre o azulejo branco
  acougue: {
    id: 'acougue-em-oferta-acougue', estilo: 'acougue', corTema: '#b3121f', corTelefone: '#ffffff', corEndereco: '#ffffff', sombraContato: true, corRedes: '#b3121f',
    v: { logo: b(25, 50, 250, 190), redes: b(20, 270, 260, 58), titulo: b(320, 20, 740, 462), areas: [C(330, 520, 720, 1150, 'placa-vermelha', '#5c0710')], rodape: b(40, 1720, 1000, 185), faixa: [540, 1650], cartao: 1 },
    h: { logo: b(60, 40, 320, 240), redes: b(60, 310, 320, 66), titulo: b(900, 4, 460, 322), areas: [C(470, 350, 1420, 590, 'placa-vermelha', '#5c0710')], rodape: b(40, 965, 1840, 105), faixa: [360, 940], cartao: 0.8 },
  },
  // SUPLEMENTOS — "pôster de treino": produtos em cima, a logo EMBAIXO sobre a faixa laranja inclinada, vaga e redes no alto
  suplementos: {
    id: 'suplementos-em-oferta-energia', estilo: 'energia', corTema: '#e85600', corTelefone: '#ffffff', corEndereco: '#ffffff', sombraContato: true, corRedes: '#e85600',
    v: { logo: b(30, 30, 300, 220), redes: b(700, 110, 350, 66), areas: [E(40, 290, 1000, 990, 'oval-laranja')], titulo: b(220, 1300, 640, 448), rodape: b(40, 1770, 1000, 140), faixa: [320, 1250], cartao: 1 },
    h: { logo: b(40, 40, 300, 220), redes: b(360, 120, 310, 60), titulo: b(40, 330, 620, 434), areas: [E(700, 30, 1190, 900, 'oval-laranja')], rodape: b(40, 955, 1840, 110), faixa: [60, 920], cartao: 0.85 },
  },
  // HORTIFRÚTI — "feira": céu e sol no alto, a logo no centro, DOIS caixotes de madeira lado a lado, gramado com a vaga à direita
  hortifruti: {
    id: 'hortifruti-em-oferta-feira', estilo: 'feira', corTema: '#2c9a27', corTelefone: '#ffffff', corEndereco: '#ffffff', sombraContato: true, corRedes: '#2c9a27',
    v: { titulo: b(240, 10, 600, 420), redes: b(340, 440, 400, 66), areas: [C(40, 540, 490, 1100, 'oval-verde', '#3b2205'), C(550, 540, 490, 1100, 'oval-verde', '#3b2205')], rodape: b(30, 1680, 750, 175), logo: b(800, 1668, 250, 190), faixa: [560, 1630], cartao: 0.95 },
    h: { logo: b(60, 40, 330, 250), titulo: b(720, 0, 480, 336), redes: b(1500, 130, 340, 62), areas: [C(30, 350, 920, 590, 'oval-verde', '#3b2205'), C(970, 350, 920, 590, 'oval-verde', '#3b2205')], rodape: b(40, 962, 1840, 108), faixa: [370, 930], cartao: 0.8 },
  },
  // PET SHOP — "balão de conversa": um balão branco grande com os produtos, a logo embaixo à esquerda e a vaga embaixo à direita
  pet: {
    id: 'pet-em-oferta-bolhas', estilo: 'bolhas', corTema: '#6a2fd6', corTelefone: '#ffffff', corEndereco: '#ffffff', sombraContato: true, corRedes: '#6a2fd6',
    v: { areas: [C(60, 60, 960, 1110, 'oval-roxo', '#2a0f5c')], titulo: b(20, 1230, 620, 434), logo: b(670, 1250, 370, 275), redes: b(670, 1560, 370, 66), rodape: b(40, 1700, 1000, 190), faixa: [90, 1150], cartao: 1 },
    h: { titulo: b(20, 40, 600, 420), logo: b(150, 490, 340, 250), redes: b(140, 770, 360, 62), areas: [C(670, 50, 1200, 870, 'oval-roxo', '#2a0f5c')], rodape: b(40, 960, 1840, 105), faixa: [70, 900], cartao: 0.85 },
  },
  // BELEZA — "arco de perfumaria": um arco claro com a logo no topo e os produtos dentro, mármore rosa ao redor, rodapé ameixa
  beleza: {
    id: 'beleza-em-oferta-arco', estilo: 'arco', corTema: '#e5257a', corTelefone: '#ffffff', corEndereco: '#ffffff', sombraContato: true, corRedes: '#e5257a',
    v: { titulo: b(200, 60, 680, 476), areas: [C(190, 560, 700, 1040, 'placa-rosa', '#6e0a38')], redes: b(40, 1680, 330, 60), logo: b(800, 1668, 240, 180), rodape: b(40, 1748, 740, 160), faixa: [580, 1580], cartao: 0.95 },
    h: { titulo: b(10, 30, 440, 308), logo: b(60, 370, 340, 250), redes: b(60, 650, 340, 60), areas: [C(540, 200, 1300, 710, 'placa-rosa', '#6e0a38')], rodape: b(40, 955, 1840, 110), faixa: [220, 900], cartao: 0.85 },
  },
  // ELETRÔNICOS — "painel neon": vaga e redes nos cantos do alto, a logo no meio, duas áreas com moldura neon
  eletronicos: {
    id: 'eletronicos-em-oferta-neon', estilo: 'neon', corTema: '#1450d4', corTelefone: '#ffffff', corEndereco: '#7fd8ff', sombraContato: true, corRedes: '#1450d4',
    v: { logo: b(24, 40, 260, 195), titulo: b(300, 8, 480, 336), redes: b(790, 150, 270, 56), areas: [E(40, 370, 1000, 600, 'placa-neon'), E(40, 1000, 1000, 680, 'placa-neon')], rodape: b(40, 1712, 1000, 190), faixa: [390, 1660], cartao: 1 },
    h: { titulo: b(20, 10, 480, 336), logo: b(110, 380, 300, 220), redes: b(100, 640, 320, 58), areas: [E(540, 30, 665, 910, 'placa-neon'), E(1225, 30, 665, 910, 'placa-neon')], rodape: b(40, 960, 1840, 105), faixa: [50, 930], cartao: 0.8 },
  },
  // MODA — "editorial": fundo creme com o rasgo rosa, faixa preta vertical à DIREITA (vaga e redes), a logo no alto à esquerda
  moda: {
    id: 'moda-em-oferta-editorial', estilo: 'editorial', corTema: '#e3245a', corTelefone: '#ffffff', corEndereco: '#ffffff', sombraContato: true, corRedes: '#e3245a',
    v: { titulo: b(20, 20, 740, 518), logo: b(805, 60, 250, 190), redes: b(800, 280, 260, 58), areas: [C(40, 560, 720, 1110, 'oval-preto', '#1a1a1a')], rodape: b(40, 1720, 1000, 185), faixa: [580, 1650], cartao: 1 },
    h: { titulo: b(30, 10, 500, 350), logo: b(1560, 60, 300, 220), redes: b(1550, 320, 320, 60), areas: [C(40, 380, 1440, 550, 'oval-preto', '#1a1a1a')], rodape: b(40, 958, 1840, 110), faixa: [60, 930], cartao: 0.85 },
  },
};

// ---------------------------------------------------------------- PALCO (frações da tela, 0 a 1)
export interface CaixaFr { x: number; y: number; w: number; h: number }
export interface FormatoDoPalco {
  titulo: CaixaFr;
  /** o pé do produto encosta no pedestal (y + h = tampo) */
  produto: CaixaFr;
  nome: CaixaFr & { alinhamento: 'left' | 'center' | 'right' };
  preco: { cx: number; cy: number; d: number };
  botao: CaixaFr;
  aviso?: CaixaFr;
}
/** cores do balão redondo de preço do palco (cada palco com o seu) */
export interface SeloDoPalco { cor: string; corTexto: string; corValor: string; contorno: string; borda: string }
export interface ComposicaoDoPalco {
  id: string;
  /** pedestal/cenário próprio (desenhado de um jeito no gerador) */
  estilo: string;
  corTema: string;
  selo: SeloDoPalco;
  v: FormatoDoPalco; h: FormatoDoPalco;
}
const n = (x: number, y: number, w: number, h: number, alinhamento: 'left' | 'center' | 'right' = 'center') => ({ x, y, w, h, alinhamento });
const AVISO_V = { x: 0.04, y: 0.95, w: 0.92, h: 0.04 }, AVISO_H = { x: 0.04, y: 0.945, w: 0.92, h: 0.045 };

export const COMPOSICOES_DOS_PALCOS: Record<string, ComposicaoDoPalco> = {
  // vitrine de vidro à esquerda, preço à direita, botão embaixo à direita
  farmacia: {
    id: 'saude-em-oferta-vitrine', estilo: 'vitrine', corTema: '#0a9a50', selo: { cor: '#ffffff', corTexto: '#0a7a3e', corValor: '#0a9a50', contorno: '#ffffff', borda: '#0a9a50' },
    v: { titulo: b(0.04, 0.015, 0.64, 0.25), nome: n(0.06, 0.275, 0.88, 0.085), produto: b(0.08, 0.39, 0.56, 0.3), preco: { cx: 0.8, cy: 0.52, d: 0.25 }, botao: b(0.5, 0.79, 0.44, 0.065), aviso: AVISO_V },
    h: { titulo: b(0.02, 0.02, 0.4, 0.42), nome: n(0.03, 0.48, 0.38, 0.16, 'left'), produto: b(0.47, 0.3, 0.22, 0.45), preco: { cx: 0.84, cy: 0.45, d: 0.3 }, botao: b(0.05, 0.72, 0.3, 0.1), aviso: AVISO_H },
  },
  // tábua de pão de madeira no centro, preço à esquerda
  padaria: {
    id: 'padaria-em-oferta-tabua', estilo: 'tabua', corTema: '#8a4a12', selo: { cor: '#f6c56a', corTexto: '#5a2c06', corValor: '#ffffff', contorno: '#8a4a12', borda: '#ffffff' },
    v: { titulo: b(0.1, 0.01, 0.8, 0.3), nome: n(0.06, 0.32, 0.88, 0.08), produto: b(0.22, 0.42, 0.56, 0.31), preco: { cx: 0.17, cy: 0.64, d: 0.24 }, botao: b(0.27, 0.86, 0.46, 0.065) },
    h: { titulo: b(0.6, 0.03, 0.38, 0.4), nome: n(0.6, 0.46, 0.38, 0.16), produto: b(0.2, 0.24, 0.26, 0.52), preco: { cx: 0.1, cy: 0.3, d: 0.28 }, botao: b(0.64, 0.74, 0.3, 0.1) },
  },
  // barril de carvalho à direita, preço à esquerda, botão embaixo à esquerda
  adega: {
    id: 'adega-em-oferta-barril', estilo: 'barril', corTema: '#7a0a2a', selo: { cor: '#e8c068', corTexto: '#4a0418', corValor: '#ffffff', contorno: '#7a0a2a', borda: '#2a0410' },
    v: { titulo: b(0.1, 0.01, 0.8, 0.28), nome: n(0.05, 0.3, 0.9, 0.08), produto: b(0.38, 0.4, 0.56, 0.32), preco: { cx: 0.22, cy: 0.56, d: 0.26 }, botao: b(0.08, 0.83, 0.46, 0.06), aviso: AVISO_V },
    h: { titulo: b(0.02, 0.03, 0.36, 0.4), nome: n(0.04, 0.5, 0.4, 0.18, 'left'), produto: b(0.58, 0.25, 0.24, 0.5), preco: { cx: 0.45, cy: 0.62, d: 0.26 }, botao: b(0.06, 0.76, 0.26, 0.09), aviso: AVISO_H },
  },
  // tábua de corte com a lousa, preço no alto à direita
  acougue: {
    id: 'acougue-em-oferta-cepo', estilo: 'cepo', corTema: '#b3121f', selo: { cor: '#ffffff', corTexto: '#b3121f', corValor: '#b3121f', contorno: '#ffffff', borda: '#1a1a1a' },
    v: { titulo: b(0.02, 0.01, 0.6, 0.22), nome: n(0.05, 0.24, 0.9, 0.09), produto: b(0.18, 0.36, 0.64, 0.34), preco: { cx: 0.82, cy: 0.12, d: 0.26 }, botao: b(0.27, 0.85, 0.46, 0.065) },
    h: { titulo: b(0.01, 0.02, 0.34, 0.38), nome: n(0.36, 0.04, 0.4, 0.18), produto: b(0.38, 0.28, 0.24, 0.48), preco: { cx: 0.82, cy: 0.32, d: 0.3 }, botao: b(0.68, 0.78, 0.26, 0.1) },
  },
  // plataforma hexagonal no alto, logo embaixo
  suplementos: {
    id: 'suplementos-em-oferta-hexagono', estilo: 'hexagono', corTema: '#e85600', selo: { cor: '#111111', corTexto: '#ff8126', corValor: '#ffffff', contorno: '#e85600', borda: '#ff8126' },
    v: { nome: n(0.06, 0.02, 0.88, 0.1), produto: b(0.2, 0.14, 0.6, 0.36), preco: { cx: 0.8, cy: 0.44, d: 0.24 }, titulo: b(0.1, 0.63, 0.8, 0.24), botao: b(0.27, 0.9, 0.46, 0.06) },
    h: { nome: n(0.02, 0.05, 0.38, 0.2, 'left'), titulo: b(0.02, 0.55, 0.36, 0.4), produto: b(0.5, 0.12, 0.26, 0.56), preco: { cx: 0.88, cy: 0.3, d: 0.28 }, botao: b(0.55, 0.82, 0.26, 0.1) },
  },
  // caixote de feira no centro, preço à esquerda, botão embaixo à direita
  hortifruti: {
    id: 'hortifruti-em-oferta-caixote', estilo: 'caixote', corTema: '#2c9a27', selo: { cor: '#ffd21f', corTexto: '#176412', corValor: '#ffffff', contorno: '#2c9a27', borda: '#ffffff' },
    v: { titulo: b(0.12, 0.01, 0.76, 0.27), nome: n(0.06, 0.29, 0.88, 0.08), produto: b(0.22, 0.39, 0.56, 0.3), preco: { cx: 0.2, cy: 0.6, d: 0.24 }, botao: b(0.48, 0.86, 0.46, 0.065) },
    h: { titulo: b(0.3, 0, 0.4, 0.34), nome: n(0.03, 0.36, 0.3, 0.2, 'right'), produto: b(0.38, 0.38, 0.24, 0.38), preco: { cx: 0.8, cy: 0.55, d: 0.32 }, botao: b(0.04, 0.7, 0.28, 0.1) },
  },
  // almofada redonda, logo no alto à direita, botão embaixo à esquerda
  pet: {
    id: 'pet-em-oferta-almofada', estilo: 'almofada', corTema: '#6a2fd6', selo: { cor: '#2cc6e6', corTexto: '#3f1491', corValor: '#ffffff', contorno: '#3f1491', borda: '#ffffff' },
    v: { titulo: b(0.36, 0.01, 0.62, 0.22), nome: n(0.04, 0.25, 0.92, 0.08), produto: b(0.2, 0.35, 0.6, 0.34), preco: { cx: 0.82, cy: 0.6, d: 0.24 }, botao: b(0.06, 0.85, 0.46, 0.065) },
    h: { titulo: b(0.62, 0.02, 0.36, 0.4), nome: n(0.04, 0.06, 0.5, 0.16), produto: b(0.2, 0.26, 0.24, 0.48), preco: { cx: 0.53, cy: 0.5, d: 0.28 }, botao: b(0.66, 0.74, 0.28, 0.1) },
  },
  // coluna de mármore sob um arco, preço à direita
  beleza: {
    id: 'beleza-em-oferta-coluna', estilo: 'coluna', corTema: '#e5257a', selo: { cor: '#ffd1e4', corTexto: '#a00f52', corValor: '#e5257a', contorno: '#ffffff', borda: '#e5257a' },
    v: { titulo: b(0.08, 0.01, 0.84, 0.28), nome: n(0.06, 0.3, 0.88, 0.08), produto: b(0.25, 0.4, 0.5, 0.3), preco: { cx: 0.8, cy: 0.44, d: 0.22 }, botao: b(0.27, 0.87, 0.46, 0.065) },
    h: { titulo: b(0.02, 0.3, 0.34, 0.4), nome: n(0.38, 0.04, 0.3, 0.16), produto: b(0.42, 0.26, 0.22, 0.48), preco: { cx: 0.8, cy: 0.44, d: 0.3 }, botao: b(0.7, 0.76, 0.26, 0.1) },
  },
  // anel holográfico neon, preço embaixo à esquerda
  eletronicos: {
    id: 'eletronicos-em-oferta-holograma', estilo: 'holograma', corTema: '#1450d4', selo: { cor: '#0a1a4a', corTexto: '#7fd8ff', corValor: '#ffffff', contorno: '#1450d4', borda: '#36c8ff' },
    v: { titulo: b(0.02, 0.01, 0.56, 0.2), nome: n(0.04, 0.22, 0.92, 0.08), produto: b(0.2, 0.34, 0.6, 0.34), preco: { cx: 0.2, cy: 0.77, d: 0.22 }, botao: b(0.48, 0.84, 0.46, 0.065) },
    h: { titulo: b(0.01, 0.01, 0.32, 0.36), nome: n(0.62, 0.06, 0.36, 0.18), produto: b(0.36, 0.2, 0.26, 0.5), preco: { cx: 0.8, cy: 0.54, d: 0.28 }, botao: b(0.04, 0.78, 0.28, 0.1) },
  },
  // cubo preto de vitrine à esquerda, rasgo rosa, preço à direita
  moda: {
    id: 'moda-em-oferta-cubo', estilo: 'cubo', corTema: '#e3245a', selo: { cor: '#111111', corTexto: '#ff5a82', corValor: '#ffffff', contorno: '#e3245a', borda: '#ffffff' },
    v: { titulo: b(0.38, 0.01, 0.6, 0.21), nome: n(0.04, 0.24, 0.62, 0.12, 'left'), produto: b(0.06, 0.38, 0.6, 0.34), preco: { cx: 0.8, cy: 0.5, d: 0.26 }, botao: b(0.5, 0.87, 0.44, 0.065) },
    h: { titulo: b(0.66, 0.02, 0.32, 0.36), nome: n(0.66, 0.42, 0.32, 0.18, 'left'), produto: b(0.08, 0.18, 0.26, 0.56), preco: { cx: 0.45, cy: 0.4, d: 0.28 }, botao: b(0.66, 0.76, 0.28, 0.1) },
  },
};
