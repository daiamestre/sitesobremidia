// SOBRE MÍDIA CREATIVE CORE — TAXONOMIA de segmentos (MG-STUDIO-02). Extensível: o banco (studio_conhecimento,
// tipo 'segmento') pode acrescentar ou substituir segmentos sem mexer no núcleo; estes são os de fábrica (Git).
// `palavras` servem para o Core reconhecer o segmento no pedido; `estilosBiblia` liga às categorias da Bíblia v1
// (biblia.ts ESTILOS) e `catalogo` aos segmentos do catálogo de modelos (src/lib/studio/catalogo.ts).

export interface Categoria { id: string; nome: string; subcategorias: string[]; palavras: string[] }
export interface Segmento {
  id: string;
  nome: string;
  descricao: string;
  categorias: Categoria[];
  publico: string[];
  objetivos: string[];
  estilos: string[];
  paletas: string[][];
  ambientes: string[];
  promptsBase: { imagem: string; video: string };
  regrasQualidade: string[];
  regrasSeguranca: string[];
  provedores: { imagem: string[]; video: string[] };
  palavras: string[];
  estilosBiblia: string[];
  catalogo: string[];
}

const S = (s: Segmento) => s;

export const SEGMENTOS_DE_FABRICA: Segmento[] = [
  S({
    id: 'esportes', nome: 'Esportes', descricao: 'Clubes, modalidades, eventos e lojas esportivas.',
    categorias: [
      { id: 'coletivos', nome: 'Esportes coletivos', subcategorias: ['Futebol', 'Basquete', 'Vôlei'], palavras: ['futebol', 'basquete', 'volei', 'time', 'campeonato', 'jogo'] },
      { id: 'individuais', nome: 'Esportes individuais', subcategorias: ['Corrida', 'Ciclismo', 'Artes marciais'], palavras: ['corrida', 'ciclismo', 'bike', 'luta', 'jiu', 'karate', 'boxe', 'maratona'] },
      { id: 'eventos', nome: 'Eventos esportivos', subcategorias: ['Torneios', 'Escolinhas'], palavras: ['torneio', 'escolinha', 'evento esportivo'] },
    ],
    publico: ['atletas amadores', 'torcedores', 'pais de alunos'], objetivos: ['inscrições', 'divulgar evento', 'vender material esportivo'],
    estilos: ['energia', 'velocidade', 'movimento', 'competição', 'iluminação de estádio', 'fotografia esportiva'],
    paletas: [['#0A0A0A', '#00C853', '#FFD400', '#FFFFFF'], ['#0B1E3F', '#FF3B30', '#FFFFFF', '#FFD400']],
    ambientes: ['estádio à noite com refletores', 'quadra coberta', 'pista de corrida ao amanhecer'],
    promptsBase: { imagem: 'dynamic sports scene, stadium floodlights, motion blur, high contrast, energetic atmosphere', video: 'fast tracking camera, motion blur, sparks of light, energetic rhythm' },
    regrasQualidade: ['movimento e energia visíveis', 'nada de escudo/uniforme de clube real sem autorização'],
    regrasSeguranca: ['sem marcas de clubes ou atletas reais'],
    provedores: { imagem: ['cf-flux-schnell'], video: ['motion'] },
    palavras: ['esporte', 'esportivo', 'atleta', 'futebol', 'basquete', 'volei', 'corrida', 'ciclismo', 'luta', 'campeonato'],
    estilosBiblia: ['Academia e fitness'], catalogo: ['fitness'],
  }),
  S({
    id: 'fitness', nome: 'Academia e Fitness', descricao: 'Academias, musculação, funcional, pilates, yoga, dança, suplementos.',
    categorias: [
      { id: 'academia', nome: 'Academias', subcategorias: ['Musculação', 'Funcional', 'Cross training'], palavras: ['academia', 'musculacao', 'funcional', 'crossfit', 'cross training', 'matricula', 'treino'] },
      { id: 'bem-estar', nome: 'Corpo e mente', subcategorias: ['Pilates', 'Yoga', 'Dança'], palavras: ['pilates', 'yoga', 'danca', 'zumba'] },
      { id: 'suplementos', nome: 'Suplementação e personal', subcategorias: ['Suplementos', 'Personal trainer'], palavras: ['suplemento', 'whey', 'creatina', 'personal'] },
    ],
    publico: ['adultos que querem treinar', 'iniciantes', 'atletas'], objetivos: ['matrículas', 'aula experimental', 'planos anuais'],
    estilos: ['performance', 'motivacional', 'fitness premium', 'ambiente de academia'],
    paletas: [['#0A0A0A', '#FF3B30', '#FFD60A', '#FFFFFF'], ['#0A0A0A', '#A3E635', '#FFFFFF', '#1F2937']],
    ambientes: ['academia moderna escura com equipamentos desfocados', 'estúdio de pilates claro'],
    promptsBase: { imagem: 'modern dark gym interior, blurred weight machines, dramatic rim light, light haze', video: 'slow dolly through gym equipment, dramatic light, chalk dust particles' },
    regrasQualidade: ['ambiente de academia reconhecível', 'sem corpos deformados'],
    regrasSeguranca: ['sem promessas de resultado corporal garantido'],
    provedores: { imagem: ['cf-flux-schnell'], video: ['motion'] },
    palavras: ['academia', 'fitness', 'musculacao', 'treino', 'matricula', 'pilates', 'yoga', 'crossfit', 'personal', 'suplemento'],
    estilosBiblia: ['Academia e fitness'], catalogo: ['fitness'],
  }),
  S({
    id: 'saude', nome: 'Saúde', descricao: 'Clínicas, odontologia, dermatologia, fisioterapia, estética, laboratórios.',
    categorias: [
      { id: 'clinicas', nome: 'Clínicas e consultórios', subcategorias: ['Clínica geral', 'Odontologia', 'Fisioterapia', 'Dermatologia'], palavras: ['clinica', 'consultorio', 'dentista', 'odonto', 'fisioterapia', 'dermatologia', 'medico', 'consulta'] },
      { id: 'estetica', nome: 'Estética clínica', subcategorias: ['Depilação a laser', 'Harmonização', 'Tratamentos de pele'], palavras: ['depilacao a laser', 'laser', 'estetica', 'harmonizacao', 'botox', 'limpeza de pele'] },
      { id: 'exames', nome: 'Laboratórios e exames', subcategorias: ['Exames', 'Check-up'], palavras: ['exame', 'laboratorio', 'check-up', 'checkup'] },
    ],
    publico: ['pacientes', 'famílias', 'adultos'], objetivos: ['agendamentos', 'divulgar serviço', 'campanha de prevenção'],
    estilos: ['clean', 'clínico', 'premium', 'humanizado', 'tecnológico'],
    paletas: [['#0B2545', '#13A89E', '#E0F2F1', '#FFFFFF'], ['#FFFFFF', '#1D4ED8', '#E0F2FE', '#0F172A']],
    ambientes: ['clínica estética clara e moderna', 'consultório limpo com luz natural', 'sala de procedimento com equipamento discreto'],
    promptsBase: { imagem: 'clean modern aesthetic clinic room, soft even daylight, white and light blue tones, minimal equipment, calm professional atmosphere', video: 'slow smooth camera glide through a bright clinic, soft light' },
    regrasQualidade: ['ambiente clínico/estético, nunca loja de roupas ou cosméticos', 'comunicação profissional e acolhedora'],
    regrasSeguranca: ['sem promessa de cura, resultado clínico ou eficácia', 'sem antes/depois não fornecido pelo anunciante', 'respeitar normas do setor (conselhos profissionais)'],
    provedores: { imagem: ['cf-flux-schnell'], video: ['motion'] },
    palavras: ['saude', 'clinica', 'medico', 'dentista', 'odonto', 'fisioterapia', 'dermatologia', 'laser', 'depilacao a laser', 'exame', 'laboratorio', 'estetica clinica', 'consulta'],
    estilosBiblia: ['Farmácia e saúde'], catalogo: ['saude'],
  }),
  S({
    id: 'educacao', nome: 'Educação', descricao: 'Escolas, cursos, faculdades, idiomas, educação infantil e tecnológica.',
    categorias: [
      { id: 'escolas', nome: 'Escolas', subcategorias: ['Educação infantil', 'Ensino fundamental e médio'], palavras: ['escola', 'colegio', 'infantil', 'creche', 'matricula escolar'] },
      { id: 'cursos', nome: 'Cursos', subcategorias: ['Idiomas', 'Profissionalizantes', 'Tecnologia', 'Faculdade'], palavras: ['curso', 'idioma', 'ingles', 'espanhol', 'faculdade', 'graduacao', 'profissionalizante', 'aula'] },
    ],
    publico: ['pais', 'jovens', 'profissionais'], objetivos: ['matrículas', 'aula experimental', 'vestibular'],
    estilos: ['educativo', 'moderno', 'jovem', 'institucional', 'infantil', 'tecnológico'],
    paletas: [['#14213D', '#FCA311', '#E5E5E5', '#FFFFFF'], ['#1E3A8A', '#22C55E', '#FDE047', '#FFFFFF']],
    ambientes: ['sala de aula moderna e iluminada', 'biblioteca com luz natural', 'laboratório de informática'],
    promptsBase: { imagem: 'bright modern classroom, soft natural light, books and notebooks, optimistic atmosphere', video: 'gentle camera push into a bright classroom, floating light particles' },
    regrasQualidade: ['ambiente educativo coerente com a idade do público'],
    regrasSeguranca: ['crianças só como ilustração estilizada, nunca rosto realista identificável'],
    provedores: { imagem: ['cf-flux-schnell'], video: ['motion'] },
    palavras: ['escola', 'curso', 'educacao', 'faculdade', 'idioma', 'aula', 'matricula escolar', 'colegio', 'ensino'],
    estilosBiblia: ['Educação'], catalogo: ['educacao'],
  }),
  S({
    id: 'alimentacao', nome: 'Alimentação', descricao: 'Restaurantes, lanchonetes, pizzarias, hamburguerias, padarias, confeitarias, cafés, delivery.',
    categorias: [
      { id: 'restaurantes', nome: 'Restaurantes e lanchonetes', subcategorias: ['Restaurante', 'Lanchonete', 'Delivery', 'Food truck'], palavras: ['restaurante', 'lanchonete', 'delivery', 'marmita', 'prato', 'almoco', 'food truck'] },
      { id: 'pizza-burger', nome: 'Pizzarias e hamburguerias', subcategorias: ['Pizzaria', 'Hamburgueria'], palavras: ['pizza', 'pizzaria', 'hamburguer', 'burger', 'lanche'] },
      { id: 'padaria-cafe', nome: 'Padarias, confeitarias e cafés', subcategorias: ['Padaria', 'Confeitaria', 'Cafeteria'], palavras: ['padaria', 'pao', 'confeitaria', 'bolo', 'doce', 'cafe', 'cafeteria'] },
    ],
    publico: ['famílias', 'trabalhadores no almoço', 'jovens'], objetivos: ['pedido/delivery', 'prato do dia', 'combo'],
    estilos: ['fotografia gastronômica', 'close-up', 'texturas', 'vapor', 'iluminação de estúdio'],
    paletas: [['#140F0D', '#E1251B', '#FFC400', '#FFFFFF'], ['#2B1A10', '#D9822B', '#FFE0A3', '#FFFFFF']],
    ambientes: ['mesa escura de restaurante com bokeh quente', 'balcão de padaria artesanal', 'forno a lenha ao fundo'],
    promptsBase: { imagem: 'gourmet food photography, dark rustic table, warm bokeh lights, light steam, shallow depth of field', video: 'slow push-in on food, rising steam, warm light flicker' },
    regrasQualidade: ['comida apetitosa e reconhecível', 'sem ingredientes inventados que mudem o prato do cliente'],
    regrasSeguranca: ['sem alegações nutricionais não fornecidas'],
    provedores: { imagem: ['cf-flux-schnell'], video: ['motion'] },
    palavras: ['restaurante', 'lanchonete', 'pizza', 'hamburguer', 'burger', 'padaria', 'confeitaria', 'cafe', 'delivery', 'comida', 'prato', 'lanche', 'gastronomia'],
    estilosBiblia: ['Restaurante e lanchonete', 'Pizzaria', 'Hamburgueria', 'Padaria e confeitaria', 'Açaiteria e sorveteria'], catalogo: ['alimentacao'],
  }),
  S({
    id: 'beleza', nome: 'Autocuidado e Beleza', descricao: 'Salões, barbearias, cosméticos, perfumes, skincare, maquiagem, cuidados pessoais.',
    categorias: [
      { id: 'saloes', nome: 'Salões e barbearias', subcategorias: ['Salão', 'Barbearia', 'Manicure'], palavras: ['salao', 'barbearia', 'barba', 'cabelo', 'corte', 'manicure', 'unha'] },
      { id: 'cosmeticos', nome: 'Cosméticos e perfumes', subcategorias: ['Perfumes', 'Skincare', 'Maquiagem'], palavras: ['perfume', 'cosmetico', 'skincare', 'maquiagem', 'batom', 'creme', 'hidratante'] },
    ],
    publico: ['mulheres e homens adultos', 'jovens'], objetivos: ['agendamento', 'lançamento de produto', 'promoção'],
    estilos: ['luxo', 'beleza editorial', 'clean', 'glamour', 'fotografia de cosméticos'],
    paletas: [['#1E1320', '#D4A5A5', '#F7E7CE', '#FFFFFF'], ['#0A0A0A', '#C9A227', '#F5F5F5', '#FFFFFF']],
    ambientes: ['superfície de mármore com bokeh pastel', 'salão moderno com luz suave', 'barbearia vintage escura'],
    promptsBase: { imagem: 'elegant marble surface, soft pastel bokeh, silk fabric, soft beauty light, luxury editorial mood', video: 'slow orbit around product, soft light sweep, petals drifting' },
    regrasQualidade: ['acabamento editorial', 'produto do cliente preservado'],
    regrasSeguranca: ['sem promessa de resultado estético garantido'],
    provedores: { imagem: ['cf-flux-schnell'], video: ['motion'] },
    palavras: ['beleza', 'salao', 'barbearia', 'perfume', 'cosmetico', 'skincare', 'maquiagem', 'cabelo', 'unha', 'autocuidado'],
    estilosBiblia: ['Beleza e estética'], catalogo: ['beleza'],
  }),
  S({
    id: 'varejo', nome: 'Mercado e Varejo', descricao: 'Supermercados, mercadinhos, atacarejos, hortifrúti, conveniência, distribuidoras, farmácias, lojas.',
    categorias: [
      { id: 'supermercado', nome: 'Supermercados e atacarejos', subcategorias: ['Supermercado', 'Mercadinho', 'Atacarejo', 'Açougue', 'Hortifrúti'], palavras: ['supermercado', 'mercado', 'mercadinho', 'atacarejo', 'acougue', 'hortifruti', 'oferta', 'tabloide', 'encarte'] },
      { id: 'conveniencia', nome: 'Conveniência e bebidas', subcategorias: ['Conveniência', 'Distribuidora', 'Adega'], palavras: ['conveniencia', 'distribuidora', 'adega', 'cerveja', 'bebida'] },
      { id: 'lojas', nome: 'Lojas e farmácias', subcategorias: ['Farmácia', 'Moda', 'Calçados', 'Utilidades'], palavras: ['farmacia', 'loja', 'roupa', 'calcado', 'liquidacao', 'moda'] },
    ],
    publico: ['famílias', 'donas e donos de casa'], objetivos: ['ofertas do dia', 'ofertas da semana', 'liquidação', 'datas comemorativas'],
    estilos: ['oferta comercial', 'liquidação', 'tabloide', 'produto em destaque', 'preço em destaque', 'selos promocionais'],
    paletas: [['#0E3B2E', '#E1251B', '#FFD400', '#FFFFFF'], ['#C8102E', '#FFD400', '#FFFFFF', '#111111']],
    ambientes: ['corredor de supermercado iluminado e desfocado', 'balcão de açougue rústico', 'caixas de feira com verduras'],
    promptsBase: { imagem: 'clean bright supermarket aisle softly blurred, fresh atmosphere, empty space for products', video: 'products sliding in, price badge pop, light sparkles' },
    regrasQualidade: ['preço e produto iguais aos dados', 'hierarquia promocional clara'],
    regrasSeguranca: ['nenhum preço, desconto ou validade inventado', 'bebida alcoólica: sem apelo a menores'],
    provedores: { imagem: ['composicao', 'cf-flux-schnell'], video: ['motion'] },
    palavras: ['supermercado', 'mercado', 'oferta', 'ofertas', 'promocao', 'tabloide', 'encarte', 'liquidacao', 'acougue', 'hortifruti', 'atacarejo', 'farmacia', 'preco'],
    estilosBiblia: ['Supermercado', 'Açougue', 'Hortifrúti', 'Bebidas e adega', 'Farmácia e saúde', 'Moda e calçados'], catalogo: ['supermercados', 'moda'],
  }),
  S({
    id: 'automotivo', nome: 'Automotivo', descricao: 'Concessionárias, oficinas, lava-jatos, autopeças, pneus, estética automotiva.',
    categorias: [
      { id: 'servicos-auto', nome: 'Serviços', subcategorias: ['Oficina', 'Lava-jato', 'Estética automotiva', 'Pneus'], palavras: ['oficina', 'mecanica', 'lava jato', 'lavagem', 'polimento', 'pneu', 'revisao'] },
      { id: 'vendas-auto', nome: 'Vendas', subcategorias: ['Concessionária', 'Autopeças'], palavras: ['concessionaria', 'carro', 'veiculo', 'moto', 'autopecas'] },
    ],
    publico: ['motoristas', 'frotistas'], objetivos: ['agendar serviço', 'vender veículo', 'promoção de peças'],
    estilos: ['automotivo premium', 'movimento', 'iluminação de estúdio'],
    paletas: [['#0B0C10', '#E63946', '#F1FAEE', '#FFFFFF'], ['#111827', '#3B82F6', '#E5E7EB', '#FFFFFF']],
    ambientes: ['garagem estúdio escura com piso molhado', 'oficina limpa e organizada'],
    promptsBase: { imagem: 'dark studio garage, wet reflective floor, dramatic strip lights, light mist', video: 'slow tracking shot along reflective floor, strip lights sweep' },
    regrasQualidade: ['sem marca/modelo de veículo real sem autorização'], regrasSeguranca: ['sem logotipos de montadoras'],
    provedores: { imagem: ['cf-flux-schnell'], video: ['motion'] },
    palavras: ['automotivo', 'carro', 'veiculo', 'oficina', 'lava jato', 'pneu', 'autopecas', 'concessionaria', 'moto', 'mecanica'],
    estilosBiblia: ['Automotivo'], catalogo: ['servicos'],
  }),
  S({
    id: 'tecnologia', nome: 'Tecnologia', descricao: 'Eletrônicos, informática, celulares, acessórios, software e serviços digitais.',
    categorias: [
      { id: 'eletronicos', nome: 'Eletrônicos e celulares', subcategorias: ['Celulares', 'Informática', 'Acessórios', 'Assistência técnica'], palavras: ['celular', 'smartphone', 'notebook', 'computador', 'informatica', 'fone', 'assistencia tecnica', 'eletronico'] },
      { id: 'digital', nome: 'Software e serviços digitais', subcategorias: ['Software', 'Internet', 'Apps'], palavras: ['software', 'app', 'aplicativo', 'internet', 'fibra', 'sistema'] },
    ],
    publico: ['jovens', 'profissionais', 'empresas'], objetivos: ['lançamento', 'promoção', 'assistência'],
    estilos: ['futurista', 'minimalista', 'tecnológico', '3D', 'motion graphics'],
    paletas: [['#05060F', '#3A86FF', '#8338EC', '#FFFFFF'], ['#0F172A', '#22D3EE', '#E2E8F0', '#FFFFFF']],
    ambientes: ['superfície escura futurista com riscos de luz azul e roxa', 'mesa minimalista com luz fria'],
    promptsBase: { imagem: 'futuristic dark tech surface, blue and purple light streaks, glossy reflections, subtle particles', video: 'light streaks sweeping, slow orbit, glossy reflections' },
    regrasQualidade: ['produto do cliente preservado', 'sem logotipos de fabricantes'], regrasSeguranca: ['sem marcas de terceiros'],
    provedores: { imagem: ['cf-flux-schnell'], video: ['motion'] },
    palavras: ['tecnologia', 'celular', 'smartphone', 'notebook', 'informatica', 'eletronico', 'software', 'internet', 'assistencia tecnica', 'acessorio'],
    estilosBiblia: ['Eletrônicos e celulares'], catalogo: ['tecnologia'],
  }),
  S({
    id: 'servicos', nome: 'Serviços e negócios locais', descricao: 'Hotéis, pousadas, imobiliárias, escritórios, consultorias, eventos, turismo, pet shops e comércio local.',
    categorias: [
      { id: 'hospedagem', nome: 'Hotéis e turismo', subcategorias: ['Hotel', 'Pousada', 'Turismo'], palavras: ['hotel', 'pousada', 'turismo', 'viagem', 'hospedagem'] },
      { id: 'imoveis', nome: 'Imobiliárias', subcategorias: ['Venda', 'Aluguel', 'Lançamentos'], palavras: ['imobiliaria', 'imovel', 'apartamento', 'casa', 'aluguel', 'lote'] },
      { id: 'profissionais', nome: 'Serviços profissionais', subcategorias: ['Escritório', 'Consultoria', 'Eventos', 'Pet shop'], palavras: ['escritorio', 'consultoria', 'advocacia', 'contabilidade', 'evento', 'buffet', 'pet', 'petshop'] },
    ],
    publico: ['moradores da região', 'turistas', 'empresas'], objetivos: ['contato/agendamento', 'reservas', 'visitas'],
    estilos: ['institucional', 'acolhedor', 'premium local'],
    paletas: [['#0F172A', '#2563EB', '#E2E8F0', '#FFFFFF'], ['#1B263B', '#E0A458', '#F4F4F9', '#FFFFFF']],
    ambientes: ['sala de estar elegante na hora dourada', 'escritório limpo e profissional', 'recepção de hotel aconchegante'],
    promptsBase: { imagem: 'elegant modern interior at golden hour, warm light, large windows, plants, inviting atmosphere', video: 'slow walk-through camera, warm golden light' },
    regrasQualidade: ['coerência com o tipo de negócio'], regrasSeguranca: ['sem garantias contratuais inventadas'],
    provedores: { imagem: ['cf-flux-schnell'], video: ['motion'] },
    palavras: ['hotel', 'pousada', 'imobiliaria', 'imovel', 'escritorio', 'consultoria', 'evento', 'turismo', 'servico', 'pet shop', 'petshop'],
    estilosBiblia: ['Imobiliária', 'Serviços', 'Pet shop', 'Casa e construção', 'Institucional'], catalogo: ['servicos', 'imobiliaria', 'pet'],
  }),
];

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Junta os segmentos de fábrica com os do banco (o do banco com o mesmo id substitui; id novo é acrescentado). */
export function taxonomia(extras: Segmento[] = []): Segmento[] {
  const mapa = new Map(SEGMENTOS_DE_FABRICA.map((s) => [s.id, s]));
  for (const e of extras) if (e?.id && e?.nome) mapa.set(e.id, { ...(mapa.get(e.id) ?? {} as Segmento), ...e });
  return [...mapa.values()];
}

export interface Reconhecimento { segmento: Segmento; categoria: Categoria | null; confianca: number; pontos: Record<string, number> }

/**
 * Reconhece o segmento do pedido (sem IA): pontua palavras do segmento e das categorias; termos de várias palavras valem
 * mais (ex.: "depilação a laser" → Saúde/Estética clínica). Categoria escolhida pelo cliente no formulário pesa forte.
 */
export function reconhecerSegmento(texto: string, segs: Segmento[] = SEGMENTOS_DE_FABRICA, dica?: string | null): Reconhecimento {
  const t = ` ${sem(texto)} `;
  const conta = (p: string) => {
    const termo = sem(p);
    if (!t.includes(termo)) return 0;
    return termo.includes(' ') ? 3 : 1;
  };
  const pontos: Record<string, number> = {};
  let melhor: Reconhecimento | null = null;
  for (const s of segs) {
    let n = s.palavras.reduce((a, p) => a + conta(p), 0);
    let cat: Categoria | null = null, catPts = 0;
    for (const c of s.categorias) {
      const pc = c.palavras.reduce((a, p) => a + conta(p), 0);
      if (pc > catPts) { catPts = pc; cat = c; }
    }
    n += catPts;
    if (dica && (s.estilosBiblia.includes(dica) || s.catalogo.includes(dica) || s.id === dica || s.nome === dica)) n += 4;
    pontos[s.id] = n;
    if (!melhor || n > melhor.confianca) melhor = { segmento: s, categoria: cat, confianca: n, pontos };
  }
  const total = Object.values(pontos).reduce((a, b) => a + b, 0);
  const r = melhor ?? { segmento: segs.find((s) => s.id === 'servicos')!, categoria: null, confianca: 0, pontos };
  if (!r.confianca) return { segmento: segs.find((s) => s.id === 'servicos') ?? segs[0], categoria: null, confianca: 0, pontos };
  return { ...r, confianca: Math.round((r.confianca / Math.max(1, total)) * 100) / 100 };
}
