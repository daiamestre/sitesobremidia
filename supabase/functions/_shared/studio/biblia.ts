// SOBRE MÍDIA Studio — Bíblia visual v1 (conhecimento APROVADO, em texto, versionado no Git).
// Vem do estudo das referências (só como inspiração: nada de terceiros é copiado nem enviado ao gerador).
// Para mudar: edite, suba VERSAO_BIBLIA e registre em docs/studio-ai/OPERACAO_DO_STUDIO.md (seção "Estilos e prompts").
// Cada etapa grava a versão usada (studio_etapas.versao_diretriz).

export const VERSAO_BIBLIA = 'biblia.v1';

/** Linguagem visual base (inspirada no padrão de vídeos de oferta para TV: produto herói, fundo cinematográfico, preço grande). */
export const PRINCIPIOS = [
  'O produto real do cliente é o herói da cena: centralizado ou no terço forte, grande, nítido, nunca recriado.',
  'Fundo cinematográfico escuro com profundidade de campo rasa (bokeh), para o produto e o preço saltarem.',
  'Iluminação de estúdio publicitário: luz de recorte (rim light) nas bordas, luz principal suave, reflexos controlados.',
  'Elementos de apetite e frescor coerentes com o segmento (gotas de condensação, gelo, respingos, vapor, fumaça leve), sempre no CENÁRIO, nunca escritos.',
  'Texto grande, condensado e em caixa alta; no máximo 2 linhas de chamada por cena; preço em selo de alto contraste.',
  'Movimento constante e lento (aproximação, deslizamento): atenção na TV sem cansar.',
  'Formatos 16:9 e 9:16 compostos de verdade (nunca esticar): em 9:16 texto no topo, produto no centro, preço abaixo.',
];

/** Estilo por categoria: cenário, luz e elementos permitidos. */
export const ESTILOS: Record<string, { cenario: string; luz: string; elementos: string; paleta: string[] }> = {
  'Bebidas e adega': { cenario: 'dark premium bar counter, blurred bottles and warm bokeh lights in the background, wet reflective surface', luz: 'cold rim light with warm amber key light', elementos: 'ice cubes, condensation droplets, splashes of liquid, light mist', paleta: ['#0B0B12', '#C8102E', '#FFC400', '#FFFFFF'] },
  Supermercado: { cenario: 'clean bright supermarket aisle softly blurred, fresh atmosphere', luz: 'bright soft daylight key light', elementos: 'fresh produce bokeh, subtle sparkles', paleta: ['#0E3B2E', '#E1251B', '#FFD400', '#FFFFFF'] },
  'Açougue': { cenario: 'rustic dark wooden butcher board, warm smoky steakhouse ambience, blurred grill flames', luz: 'warm dramatic side light', elementos: 'coarse salt, rosemary sprigs, light smoke', paleta: ['#1A0E0A', '#B3121B', '#F2B705', '#FFFFFF'] },
  'Hortifrúti': { cenario: 'fresh market wooden crates, green leaves, morning light', luz: 'soft natural morning light', elementos: 'water droplets, fresh leaves', paleta: ['#0F3D1E', '#F28C28', '#FFE14D', '#FFFFFF'] },
  'Padaria e confeitaria': { cenario: 'cozy artisan bakery counter, warm blurred background', luz: 'warm golden window light', elementos: 'flour dust, light steam', paleta: ['#2B1A10', '#D9822B', '#FFE0A3', '#FFFFFF'] },
  'Restaurante e lanchonete': { cenario: 'stylish dark restaurant table, warm bokeh lights', luz: 'warm key light with soft rim', elementos: 'light steam, herbs', paleta: ['#140F0D', '#E1251B', '#FFC400', '#FFFFFF'] },
  Pizzaria: { cenario: 'wood-fired pizza oven glowing in the background, rustic dark table', luz: 'warm fire glow rim light', elementos: 'flour, basil leaves, light smoke', paleta: ['#1B0F0A', '#D7261E', '#F2C14E', '#FFFFFF'] },
  Hamburgueria: { cenario: 'dark urban burger joint, neon bokeh, slate board', luz: 'dramatic warm key light and cool rim light', elementos: 'sesame seeds, smoke, sparks', paleta: ['#0D0D0D', '#F25C05', '#FFC400', '#FFFFFF'] },
  'Açaiteria e sorveteria': { cenario: 'vibrant tropical setting, purple and pink bokeh', luz: 'bright cheerful light', elementos: 'frozen mist, fruit pieces, splashes', paleta: ['#2D0B3A', '#8E2DE2', '#FF4FA3', '#FFFFFF'] },
  'Farmácia e saúde': { cenario: 'clean minimal white and light blue clinical shelf, soft blur', luz: 'soft even light', elementos: 'subtle glow', paleta: ['#0B2545', '#13A89E', '#E0F2F1', '#FFFFFF'] },
  'Beleza e estética': { cenario: 'elegant marble surface, soft pastel bokeh', luz: 'soft beauty light', elementos: 'silk fabric, water ripples, petals', paleta: ['#1E1320', '#D4A5A5', '#F7E7CE', '#FFFFFF'] },
  'Moda e calçados': { cenario: 'minimal fashion studio set, colored backdrop with soft gradient', luz: 'editorial softbox light', elementos: 'subtle shadows, geometric shapes', paleta: ['#111111', '#E94560', '#F5F5F5', '#FFFFFF'] },
  'Academia e fitness': { cenario: 'dark modern gym, blurred equipment, dramatic atmosphere', luz: 'hard rim light, high contrast', elementos: 'chalk dust, light haze', paleta: ['#0A0A0A', '#FF3B30', '#FFD60A', '#FFFFFF'] },
  'Pet shop': { cenario: 'bright cozy home interior, soft blur', luz: 'soft warm light', elementos: 'playful soft shapes', paleta: ['#13315C', '#F9A826', '#FFF3E0', '#FFFFFF'] },
  'Eletrônicos e celulares': { cenario: 'futuristic dark tech surface, blue and purple light streaks', luz: 'cool rim light with glossy reflections', elementos: 'light streaks, subtle particles', paleta: ['#05060F', '#3A86FF', '#8338EC', '#FFFFFF'] },
  'Casa e construção': { cenario: 'modern home interior, warm wood and concrete, soft blur', luz: 'natural daylight', elementos: 'clean lines', paleta: ['#1F2933', '#F59E0B', '#E5E7EB', '#FFFFFF'] },
  Automotivo: { cenario: 'dark garage studio, wet floor reflections', luz: 'dramatic strip lights', elementos: 'light mist, reflections', paleta: ['#0B0C10', '#E63946', '#F1FAEE', '#FFFFFF'] },
  'Educação': { cenario: 'bright modern classroom or library, soft blur', luz: 'soft natural light', elementos: 'books, light particles', paleta: ['#14213D', '#FCA311', '#E5E5E5', '#FFFFFF'] },
  'Imobiliária': { cenario: 'elegant modern living room at golden hour', luz: 'warm golden hour light', elementos: 'large windows, plants', paleta: ['#1B263B', '#E0A458', '#F4F4F9', '#FFFFFF'] },
  'Serviços': { cenario: 'clean professional workspace, soft blur', luz: 'soft even light', elementos: 'subtle geometric shapes', paleta: ['#0F172A', '#2563EB', '#E2E8F0', '#FFFFFF'] },
  Institucional: { cenario: 'abstract elegant gradient space with soft light beams', luz: 'soft volumetric light', elementos: 'light beams, particles', paleta: ['#0B0718', '#7C3AED', '#FFC400', '#FFFFFF'] },
};
export const estiloDa = (categoria: string) => ESTILOS[categoria] ?? ESTILOS.Institucional;

/** Diretrizes por agente (o que cada um pode e não pode fazer). */
export const DIRETRIZ = {
  produtos: `Você é o Especialista em Produtos da SOBRE MÍDIA. Descreva SÓ o que vê na foto do produto: tipo de embalagem, cores principais, materiais, se há rótulo. Não leia, não invente e não corrija textos do rótulo. Não sugira mudar o produto.`,
  diretor: `Você é o Diretor Criativo da SOBRE MÍDIA, agência de mídia indoor (TVs em lojas). Interprete o briefing e defina conceito, estilo visual, linguagem e paleta. Princípios: ${PRINCIPIOS.join(' ')} Regras absolutas: nunca escreva preços, valores, porcentagens, nomes de lojas ou marcas que não estejam no briefing; os preços são aplicados depois por código.`,
  roteirista: `Você é o Roteirista Publicitário da SOBRE MÍDIA. Escreva o roteiro em português do Brasil e a sequência de cenas com início (atenção), desenvolvimento (produto/benefício) e encerramento (chamada para ação). Títulos curtos e fortes (até 5 palavras), subtítulos até 8 palavras. PROIBIDO: preço, "R$", números de valor, porcentagem, nome de loja ou marca que não veio do briefing. Cada cena de produto usa o id do produto (p1, p2…).`,
  fotografia: `Você é o Diretor de Fotografia da SOBRE MÍDIA. Para cada cena defina enquadramento, iluminação, lente simulada, profundidade de campo e movimento de câmera (um destes: estatica, aproximar, afastar, deslizar_esquerda, deslizar_direita, subir, descer), mantendo continuidade visual entre as cenas.`,
  prompts: `Você é o Especialista em Prompts da SOBRE MÍDIA. Escreva, em inglês, o prompt do CENÁRIO de cada cena para um gerador de imagem. O produto real do cliente será colocado por cima depois: o cenário NÃO pode conter o produto, pessoas, mãos, textos, letras, números, logos, rótulos ou marcas. Deixe espaço vazio no centro/terço indicado para o produto. Descreva ambiente, luz, lente, profundidade de campo e elementos de clima do segmento. Até 60 palavras por prompt.`,
};
