/**
 * Tabloide Digital (F-172) — segmentos do comércio, temas visuais e formatos.
 * Os temas são desenhos próprios do SOBRE MÍDIA (CSS), pensados por segmento.
 */

export type SegmentoId =
  | 'mercado' | 'acougue' | 'hortifruti' | 'padaria' | 'farmacia' | 'restaurante'
  | 'lanchonete' | 'clinica' | 'petshop' | 'construcao' | 'moda' | 'bar' | 'salao';

export interface Segmento {
  id: SegmentoId;
  nome: string;
  emoji: string;
  /** Texto sugerido para o título do cartaz. */
  titulo: string;
  subtitulo: string;
  /** Exemplo para o cliente ver como digitar. */
  exemplo: string;
  /** Emoji de reserva quando não achamos foto do produto. */
  emojiPadrao: string;
}

export const SEGMENTOS: Segmento[] = [
  { id: 'mercado', nome: 'Mercado', emoji: '🛒', titulo: 'SUPER OFERTAS DA SEMANA', subtitulo: 'Economize em toda a loja', emojiPadrao: '🛒', exemplo: 'Arroz 5kg 25,90\nFeijão carioca 1kg 7,49\nCoca-Cola 2L 9,99\nÓleo de soja 900ml de 8,99 por 6,99' },
  { id: 'acougue', nome: 'Açougue', emoji: '🥩', titulo: 'FESTIVAL DA CARNE', subtitulo: 'Cortes frescos todos os dias', emojiPadrao: '🥩', exemplo: 'Picanha kg 69,90\nContrafilé kg 39,90\nLinguiça toscana kg 21,90\nFrango inteiro kg 12,90' },
  { id: 'hortifruti', nome: 'Hortifruti', emoji: '🥬', titulo: 'QUARTA DA FEIRA', subtitulo: 'Fresquinhos do campo', emojiPadrao: '🥬', exemplo: 'Tomate kg 6,99\nBanana prata kg 5,49\nBatata kg 4,99\nAlface un 2,99' },
  { id: 'padaria', nome: 'Padaria', emoji: '🥖', titulo: 'PÃO QUENTINHO', subtitulo: 'Saindo do forno toda hora', emojiPadrao: '🥖', exemplo: 'Pão francês kg 14,90\nBolo de cenoura fatia 5,00\nCroissant un 6,50\nCafé com leite 4,50' },
  { id: 'farmacia', nome: 'Farmácia', emoji: '💊', titulo: 'OFERTAS DE SAÚDE', subtitulo: 'Cuide de você e da sua família', emojiPadrao: '💊', exemplo: 'Dipirona 500mg 7,90\nProtetor solar FPS 50 de 49,90 por 34,90\nVitamina C 30 cápsulas 19,90\nShampoo 350ml 14,90' },
  { id: 'restaurante', nome: 'Restaurante', emoji: '🍽️', titulo: 'PRATOS DO DIA', subtitulo: 'Almoço completo todos os dias', emojiPadrao: '🍽️', exemplo: 'Feijoada completa 32,90\nPicanha na chapa 54,90\nParmegiana de frango 36,90\nSuco natural 8,00' },
  { id: 'lanchonete', nome: 'Lanchonete / Pizzaria', emoji: '🍔', titulo: 'COMBOS IMPERDÍVEIS', subtitulo: 'Peça já o seu', emojiPadrao: '🍔', exemplo: 'X-Burger 18,90\nPizza calabresa 39,90\nBatata frita 14,90\nMilkshake 12,00' },
  { id: 'clinica', nome: 'Clínica / Saúde', emoji: '🩺', titulo: 'PROMOÇÕES DA CLÍNICA', subtitulo: 'Agende seu horário', emojiPadrao: '🩺', exemplo: 'Consulta clínica geral 120,00\nLimpeza dental 89,90\nExame de sangue completo 79,90\nMassagem relaxante 99,00' },
  { id: 'petshop', nome: 'Pet shop', emoji: '🐶', titulo: 'FESTA NO PET', subtitulo: 'Tudo para o seu melhor amigo', emojiPadrao: '🐶', exemplo: 'Ração premium 15kg 189,90\nBanho e tosa 59,90\nAreia higiênica 4kg 19,90\nBrinquedo mordedor 14,90' },
  { id: 'construcao', nome: 'Material de construção', emoji: '🧱', titulo: 'FEIRÃO DA OBRA', subtitulo: 'Preço de fábrica', emojiPadrao: '🧱', exemplo: 'Cimento 50kg 36,90\nTinta acrílica 18L 289,00\nPiso porcelanato m² 49,90\nTorneira cromada 34,90' },
  { id: 'moda', nome: 'Moda e variedades', emoji: '👗', titulo: 'LIQUIDAÇÃO DE ESTAÇÃO', subtitulo: 'Peças a partir de', emojiPadrao: '👗', exemplo: 'Camiseta básica 29,90\nCalça jeans de 129,90 por 89,90\nTênis casual 149,90\nVestido floral 99,90' },
  { id: 'bar', nome: 'Bar / Adega', emoji: '🍺', titulo: 'HAPPY HOUR', subtitulo: 'Gelada é aqui', emojiPadrao: '🍺', exemplo: 'Cerveja long neck 6,50\nCaipirinha 15,00\nPorção de calabresa 28,00\nVinho tinto 750ml 39,90' },
  { id: 'salao', nome: 'Salão e estética', emoji: '💇', titulo: 'DIA DE BELEZA', subtitulo: 'Agende e aproveite', emojiPadrao: '💇', exemplo: 'Corte feminino 60,00\nEscova progressiva 150,00\nManicure e pedicure 55,00\nLimpeza de pele 89,00' },
];

export interface Tema {
  id: string;
  nome: string;
  /** Segmento em que aparece primeiro; 'data' = data comemorativa. */
  grupo: SegmentoId | 'data';
  emoji: string;
  /** Fundo do cartaz inteiro (CSS background). */
  fundo: string;
  /** Faixa do título. */
  faixa: string;
  tituloCor: string;
  subtituloCor: string;
  /** Cartão de cada produto. */
  cartao: string;
  cartaoBorda: string;
  nomeCor: string;
  /** Selo de preço. */
  preco: string;
  precoCor: string;
  /** Preço antigo riscado e rodapé. */
  suave: string;
  rodape: string;
  rodapeCor: string;
  /** Emojis decorativos nos cantos do cabeçalho. */
  enfeite: string;
}

const T = (t: Tema): Tema => t;

export const TEMAS: Tema[] = [
  T({ id: 'ofertao', nome: 'Ofertão', grupo: 'mercado', emoji: '🔥', fundo: 'linear-gradient(160deg,#ffd400,#ffb300)', faixa: '#d90f1f', tituloCor: '#fff', subtituloCor: '#ffe9a8', cartao: '#fff', cartaoBorda: '#d90f1f', nomeCor: '#2a1a00', preco: '#d90f1f', precoCor: '#fff', suave: '#8a6a00', rodape: '#8f0a15', rodapeCor: '#fff', enfeite: '🔥' }),
  T({ id: 'show', nome: 'Super Show', grupo: 'mercado', emoji: '⭐', fundo: 'radial-gradient(circle at 50% 0%,#1d4ed8,#0b1f6b)', faixa: '#ffd400', tituloCor: '#0b1f6b', subtituloCor: '#dbe7ff', cartao: '#fff', cartaoBorda: '#ffd400', nomeCor: '#0b1f6b', preco: '#e11d2e', precoCor: '#fff', suave: '#64748b', rodape: '#06113a', rodapeCor: '#ffd400', enfeite: '⭐' }),
  T({ id: 'leve-pague', nome: 'Leve + Pague -', grupo: 'mercado', emoji: '🛍️', fundo: 'linear-gradient(135deg,#e11d2e,#9f0d1a)', faixa: '#fff', tituloCor: '#c4101f', subtituloCor: '#7a0a13', cartao: '#fff7e0', cartaoBorda: '#ffd400', nomeCor: '#5a0a12', preco: '#ffd400', precoCor: '#7a0a13', suave: '#8a6a00', rodape: '#5a0a12', rodapeCor: '#ffd400', enfeite: '🛍️' }),
  T({ id: 'acougue-brasa', nome: 'Brasa', grupo: 'acougue', emoji: '🥩', fundo: 'linear-gradient(160deg,#3b0a0a,#7f1d1d)', faixa: '#f5e6c8', tituloCor: '#7f1d1d', subtituloCor: '#f5d9a8', cartao: '#fff4e0', cartaoBorda: '#f5e6c8', nomeCor: '#3b0a0a', preco: '#b91c1c', precoCor: '#fff', suave: '#7a5a3a', rodape: '#220606', rodapeCor: '#f5e6c8', enfeite: '🥩' }),
  T({ id: 'acougue-clean', nome: 'Corte Fresco', grupo: 'acougue', emoji: '🔪', fundo: 'linear-gradient(160deg,#fff1f0,#ffd6d2)', faixa: '#b91c1c', tituloCor: '#fff', subtituloCor: '#ffe4e1', cartao: '#fff', cartaoBorda: '#b91c1c', nomeCor: '#450a0a', preco: '#b91c1c', precoCor: '#fff', suave: '#9a6a66', rodape: '#7f1d1d', rodapeCor: '#fff', enfeite: '🔪' }),
  T({ id: 'horta-verde', nome: 'Feira Verde', grupo: 'hortifruti', emoji: '🥬', fundo: 'linear-gradient(160deg,#16a34a,#14532d)', faixa: '#fde047', tituloCor: '#14532d', subtituloCor: '#dcfce7', cartao: '#fff', cartaoBorda: '#fde047', nomeCor: '#14532d', preco: '#ea580c', precoCor: '#fff', suave: '#64748b', rodape: '#0a2e17', rodapeCor: '#fde047', enfeite: '🍅' }),
  T({ id: 'horta-sol', nome: 'Sol da Roça', grupo: 'hortifruti', emoji: '🍊', fundo: 'linear-gradient(160deg,#fff7d6,#fed7aa)', faixa: '#15803d', tituloCor: '#fff', subtituloCor: '#dcfce7', cartao: '#fff', cartaoBorda: '#15803d', nomeCor: '#14532d', preco: '#ea580c', precoCor: '#fff', suave: '#7c6a4a', rodape: '#14532d', rodapeCor: '#fff', enfeite: '🍊' }),
  T({ id: 'padaria-forno', nome: 'Forno a Lenha', grupo: 'padaria', emoji: '🥖', fundo: 'linear-gradient(160deg,#fdf0d5,#f2c27b)', faixa: '#7c3f12', tituloCor: '#fff3df', subtituloCor: '#f7d9a8', cartao: '#fffaf0', cartaoBorda: '#7c3f12', nomeCor: '#4a2408', preco: '#b45309', precoCor: '#fff', suave: '#8a6a4a', rodape: '#4a2408', rodapeCor: '#fdf0d5', enfeite: '🥐' }),
  T({ id: 'padaria-cafe', nome: 'Café da Manhã', grupo: 'padaria', emoji: '☕', fundo: 'linear-gradient(160deg,#4a2c17,#2b170a)', faixa: '#f4b860', tituloCor: '#2b170a', subtituloCor: '#f4d9b0', cartao: '#fff7ea', cartaoBorda: '#f4b860', nomeCor: '#2b170a', preco: '#c2410c', precoCor: '#fff', suave: '#8a6a4a', rodape: '#1a0e06', rodapeCor: '#f4b860', enfeite: '☕' }),
  T({ id: 'farmacia-saude', nome: 'Saúde em Dia', grupo: 'farmacia', emoji: '💊', fundo: 'linear-gradient(160deg,#ecfdf5,#a7f3d0)', faixa: '#047857', tituloCor: '#fff', subtituloCor: '#d1fae5', cartao: '#fff', cartaoBorda: '#047857', nomeCor: '#064e3b', preco: '#047857', precoCor: '#fff', suave: '#64748b', rodape: '#064e3b', rodapeCor: '#fff', enfeite: '➕' }),
  T({ id: 'farmacia-azul', nome: 'Cuidado Azul', grupo: 'farmacia', emoji: '🩹', fundo: 'linear-gradient(160deg,#0369a1,#0c4a6e)', faixa: '#fff', tituloCor: '#0369a1', subtituloCor: '#075985', cartao: '#fff', cartaoBorda: '#7dd3fc', nomeCor: '#0c4a6e', preco: '#16a34a', precoCor: '#fff', suave: '#64748b', rodape: '#082f49', rodapeCor: '#bae6fd', enfeite: '➕' }),
  T({ id: 'rest-sabor', nome: 'Prato Cheio', grupo: 'restaurante', emoji: '🍽️', fundo: 'linear-gradient(160deg,#1f1410,#3d2418)', faixa: '#d4a13c', tituloCor: '#1f1410', subtituloCor: '#f1d9a3', cartao: '#fff8ee', cartaoBorda: '#d4a13c', nomeCor: '#2a1a10', preco: '#9a3412', precoCor: '#fff', suave: '#8a6a4a', rodape: '#120a07', rodapeCor: '#d4a13c', enfeite: '🍴' }),
  T({ id: 'rest-casa', nome: 'Comida de Casa', grupo: 'restaurante', emoji: '🍲', fundo: 'linear-gradient(160deg,#fff4e6,#fdba74)', faixa: '#c2410c', tituloCor: '#fff', subtituloCor: '#ffedd5', cartao: '#fff', cartaoBorda: '#c2410c', nomeCor: '#431407', preco: '#c2410c', precoCor: '#fff', suave: '#8a6a4a', rodape: '#7c2d12', rodapeCor: '#fff', enfeite: '🍲' }),
  T({ id: 'lanche-combo', nome: 'Combo Turbo', grupo: 'lanchonete', emoji: '🍔', fundo: 'linear-gradient(160deg,#facc15,#f97316)', faixa: '#7f1d1d', tituloCor: '#fde047', subtituloCor: '#fed7aa', cartao: '#fff', cartaoBorda: '#7f1d1d', nomeCor: '#431407', preco: '#dc2626', precoCor: '#fff', suave: '#7c6a4a', rodape: '#7f1d1d', rodapeCor: '#fde047', enfeite: '🍟' }),
  T({ id: 'lanche-noite', nome: 'Pizza Night', grupo: 'lanchonete', emoji: '🍕', fundo: 'linear-gradient(160deg,#18181b,#3f0d0d)', faixa: '#ef4444', tituloCor: '#fff', subtituloCor: '#fecaca', cartao: '#27272a', cartaoBorda: '#ef4444', nomeCor: '#fafafa', preco: '#facc15', precoCor: '#18181b', suave: '#a1a1aa', rodape: '#09090b', rodapeCor: '#facc15', enfeite: '🍕' }),
  T({ id: 'clinica-azul', nome: 'Clínica Azul', grupo: 'clinica', emoji: '🩺', fundo: 'linear-gradient(160deg,#eff6ff,#bfdbfe)', faixa: '#1d4ed8', tituloCor: '#fff', subtituloCor: '#dbeafe', cartao: '#fff', cartaoBorda: '#1d4ed8', nomeCor: '#1e3a8a', preco: '#1d4ed8', precoCor: '#fff', suave: '#64748b', rodape: '#1e3a8a', rodapeCor: '#fff', enfeite: '➕' }),
  T({ id: 'clinica-bemestar', nome: 'Bem-estar', grupo: 'clinica', emoji: '🌿', fundo: 'linear-gradient(160deg,#f0fdfa,#99f6e4)', faixa: '#0f766e', tituloCor: '#fff', subtituloCor: '#ccfbf1', cartao: '#fff', cartaoBorda: '#0f766e', nomeCor: '#134e4a', preco: '#0f766e', precoCor: '#fff', suave: '#64748b', rodape: '#134e4a', rodapeCor: '#fff', enfeite: '🌿' }),
  T({ id: 'pet-alegre', nome: 'Pet Alegre', grupo: 'petshop', emoji: '🐾', fundo: 'linear-gradient(160deg,#fb923c,#ea580c)', faixa: '#1e3a8a', tituloCor: '#fff', subtituloCor: '#bfdbfe', cartao: '#fff', cartaoBorda: '#1e3a8a', nomeCor: '#1e3a8a', preco: '#16a34a', precoCor: '#fff', suave: '#64748b', rodape: '#1e3a8a', rodapeCor: '#fff', enfeite: '🐾' }),
  T({ id: 'obra-forte', nome: 'Obra Forte', grupo: 'construcao', emoji: '🧱', fundo: 'linear-gradient(160deg,#fde047,#facc15)', faixa: '#18181b', tituloCor: '#facc15', subtituloCor: '#e4e4e7', cartao: '#fff', cartaoBorda: '#18181b', nomeCor: '#18181b', preco: '#dc2626', precoCor: '#fff', suave: '#52525b', rodape: '#18181b', rodapeCor: '#facc15', enfeite: '🔧' }),
  T({ id: 'moda-chic', nome: 'Moda Chic', grupo: 'moda', emoji: '👗', fundo: 'linear-gradient(160deg,#fdf2f8,#fbcfe8)', faixa: '#be185d', tituloCor: '#fff', subtituloCor: '#fce7f3', cartao: '#fff', cartaoBorda: '#be185d', nomeCor: '#500724', preco: '#be185d', precoCor: '#fff', suave: '#9d6b84', rodape: '#831843', rodapeCor: '#fff', enfeite: '✨' }),
  T({ id: 'bar-gelada', nome: 'Gelada', grupo: 'bar', emoji: '🍺', fundo: 'linear-gradient(160deg,#0f172a,#1e3a8a)', faixa: '#fbbf24', tituloCor: '#0f172a', subtituloCor: '#fde68a', cartao: '#fffbeb', cartaoBorda: '#fbbf24', nomeCor: '#1e293b', preco: '#d97706', precoCor: '#fff', suave: '#64748b', rodape: '#020617', rodapeCor: '#fbbf24', enfeite: '🍻' }),
  T({ id: 'salao-glam', nome: 'Glam', grupo: 'salao', emoji: '💇', fundo: 'linear-gradient(160deg,#4a044e,#86198f)', faixa: '#fdf4ff', tituloCor: '#86198f', subtituloCor: '#f5d0fe', cartao: '#fdf4ff', cartaoBorda: '#e879f9', nomeCor: '#4a044e', preco: '#c026d3', precoCor: '#fff', suave: '#86628a', rodape: '#2e0231', rodapeCor: '#f5d0fe', enfeite: '💅' }),
  // datas comemorativas
  T({ id: 'data-maes', nome: 'Dia das Mães', grupo: 'data', emoji: '💐', fundo: 'linear-gradient(160deg,#ffe4f1,#f9a8d4)', faixa: '#be185d', tituloCor: '#fff', subtituloCor: '#fce7f3', cartao: '#fff', cartaoBorda: '#be185d', nomeCor: '#500724', preco: '#be185d', precoCor: '#fff', suave: '#9d6b84', rodape: '#831843', rodapeCor: '#fff', enfeite: '💐' }),
  T({ id: 'data-pais', nome: 'Dia dos Pais', grupo: 'data', emoji: '👔', fundo: 'linear-gradient(160deg,#1e3a8a,#0f172a)', faixa: '#fbbf24', tituloCor: '#0f172a', subtituloCor: '#bfdbfe', cartao: '#fff', cartaoBorda: '#fbbf24', nomeCor: '#0f172a', preco: '#1d4ed8', precoCor: '#fff', suave: '#64748b', rodape: '#020617', rodapeCor: '#fbbf24', enfeite: '👔' }),
  T({ id: 'data-criancas', nome: 'Dia das Crianças', grupo: 'data', emoji: '🎈', fundo: 'linear-gradient(160deg,#38bdf8,#a78bfa)', faixa: '#fde047', tituloCor: '#4c1d95', subtituloCor: '#f5f3ff', cartao: '#fff', cartaoBorda: '#fde047', nomeCor: '#4c1d95', preco: '#ec4899', precoCor: '#fff', suave: '#7c6aa0', rodape: '#4c1d95', rodapeCor: '#fde047', enfeite: '🎈' }),
  T({ id: 'data-pascoa', nome: 'Páscoa', grupo: 'data', emoji: '🐰', fundo: 'linear-gradient(160deg,#4a2c17,#7c4a2a)', faixa: '#fde68a', tituloCor: '#4a2c17', subtituloCor: '#fde68a', cartao: '#fff8ee', cartaoBorda: '#fde68a', nomeCor: '#3b1f0f', preco: '#7c3aed', precoCor: '#fff', suave: '#8a6a4a', rodape: '#2b170a', rodapeCor: '#fde68a', enfeite: '🐰' }),
  T({ id: 'data-junina', nome: 'Festa Junina', grupo: 'data', emoji: '🌽', fundo: 'linear-gradient(160deg,#facc15,#dc2626)', faixa: '#14532d', tituloCor: '#fde047', subtituloCor: '#dcfce7', cartao: '#fffbeb', cartaoBorda: '#14532d', nomeCor: '#451a03', preco: '#dc2626', precoCor: '#fff', suave: '#7c6a4a', rodape: '#14532d', rodapeCor: '#fde047', enfeite: '🌽' }),
  T({ id: 'data-blackfriday', nome: 'Black Friday', grupo: 'data', emoji: '🖤', fundo: 'linear-gradient(160deg,#09090b,#27272a)', faixa: '#facc15', tituloCor: '#09090b', subtituloCor: '#fde68a', cartao: '#18181b', cartaoBorda: '#facc15', nomeCor: '#fafafa', preco: '#facc15', precoCor: '#09090b', suave: '#a1a1aa', rodape: '#000', rodapeCor: '#facc15', enfeite: '🖤' }),
  T({ id: 'data-natal', nome: 'Natal', grupo: 'data', emoji: '🎄', fundo: 'linear-gradient(160deg,#166534,#14532d)', faixa: '#dc2626', tituloCor: '#fff', subtituloCor: '#fecaca', cartao: '#fff', cartaoBorda: '#dc2626', nomeCor: '#14532d', preco: '#dc2626', precoCor: '#fff', suave: '#64748b', rodape: '#052e16', rodapeCor: '#fecaca', enfeite: '🎄' }),
];

export const temaPorId = (id: string): Tema => TEMAS.find((t) => t.id === id) ?? TEMAS[0];
export const segmentoPorId = (id: string): Segmento => SEGMENTOS.find((s) => s.id === id) ?? SEGMENTOS[0];
export const temasDoSegmento = (id: SegmentoId): Tema[] => TEMAS.filter((t) => t.grupo === id);
export const temasDeDatas = (): Tema[] => TEMAS.filter((t) => t.grupo === 'data');

export type FormatoId = 'feed' | 'story' | 'tv-h' | 'a4' | 'a4-h';

export interface Formato {
  id: FormatoId;
  nome: string;
  detalhe: string;
  largura: number;
  altura: number;
}

export const FORMATOS: Formato[] = [
  { id: 'tv-h', nome: 'TV horizontal', detalhe: '1920 × 1080 · telas e Player', largura: 1920, altura: 1080 },
  { id: 'story', nome: 'TV vertical / Story', detalhe: '1080 × 1920 · totem, stories, reels', largura: 1080, altura: 1920 },
  { id: 'feed', nome: 'Feed quadrado', detalhe: '1080 × 1080 · Instagram e Facebook', largura: 1080, altura: 1080 },
  { id: 'a4', nome: 'Cartaz A4 vertical', detalhe: '1240 × 1754 · impressão', largura: 1240, altura: 1754 },
  { id: 'a4-h', nome: 'Cartaz A4 horizontal', detalhe: '1754 × 1240 · impressão', largura: 1754, altura: 1240 },
];

export const formatoPorId = (id: string): Formato => FORMATOS.find((f) => f.id === id) ?? FORMATOS[0];
