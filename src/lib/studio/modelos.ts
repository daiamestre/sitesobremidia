// SOBRE MÍDIA STUDIO (MG01/MG02) — modelos de arte PRÓPRIOS da Sobre Mídia (textos originais; fotos geradas por IA
// na conta Cloudflare do dono, sem pessoas reais nem marcas, em public/studio/fotos). Cada modelo é desenhado por
// src/components/studio/ArteModelo.tsx em qualquer tamanho, e a edição rápida (MG03) troca só estes campos.
import type { Formato, SegmentoId, TipoDeEdicao } from './catalogo';
import type { Documento } from './documento';

export type LayoutDaArte = 'faixa' | 'claro' | 'escuro' | 'vertical-foto' | 'vertical-painel' | 'neon';
export type FonteDaArte = 'anton' | 'bebas' | 'montserrat' | 'fira-condensed';

export interface SeloDaArte { topo?: string; valor: string; sufixo?: string; base?: string }

export interface TextosDaArte {
  sobretitulo?: string;
  /** cada item é uma linha do título */
  titulo: string[];
  subtitulo?: string;
  /** até 3 itens curtos com ícone */
  itens?: string[];
  cta?: string;
  rodape?: string;
  selo?: SeloDaArte;
}

export interface CoresDaArte {
  /** cor principal do painel/fundo */
  base: string;
  /** cor de destaque (selo, CTA, linha do título) */
  destaque: string;
  /** cor do texto principal */
  texto: string;
}

export interface ModeloDeArte {
  id: string;
  nome: string;
  segmento: SegmentoId;
  formato: Formato;
  edicao: TipoDeEdicao[];
  /** data de inclusão no catálogo (AAAA-MM-DD) */
  criadoEm: string;
  etiquetas: string[];
  layout: LayoutDaArte;
  foto: string;
  /** enquadramento da foto (object-position) */
  fotoPosicao?: string;
  fonte: FonteDaArte;
  textos: TextosDaArte;
  cores: CoresDaArte;
  /** F-221: documento de camadas gravado pelo owner/ADM (senão é montado a partir do layout) */
  documentos?: Partial<Record<'16:9' | '9:16', Documento>>;
  /** F-221: pasta (modelo de capa) em que o modelo aparece */
  pasta?: string;
}

export const PASTA_DAS_FOTOS = '/studio/fotos';
const foto = (nome: string) => `${PASTA_DAS_FOTOS}/${nome}.webp`;
const D = '2026-10-28';

export const MODELOS: ModeloDeArte[] = [
  // ── Supermercados
  { id: 'ofertas-da-semana', nome: 'Ofertas da Semana – Supermercado', segmento: 'supermercados', formato: '16:9', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['oferta', 'promoção', 'mercado', 'desconto'], layout: 'faixa', foto: foto('supermercado-cesta'), fotoPosicao: '50% 60%', fonte: 'anton',
    textos: { titulo: ['OFERTAS', 'DA SEMANA'], subtitulo: 'Qualidade e economia todo dia', selo: { topo: 'ATÉ', valor: '50', sufixo: '%', base: 'OFF' } },
    cores: { base: '#e3262e', destaque: '#ffd21f', texto: '#ffffff' } },
  { id: 'hortifruti-fresquinho', nome: 'Hortifrúti Fresquinho – Supermercado', segmento: 'supermercados', formato: '9:16', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['frutas', 'verduras', 'feira', 'hortifruti'], layout: 'vertical-foto', foto: foto('hortifruti'), fonte: 'bebas',
    textos: { sobretitulo: 'Chegou hoje', titulo: ['HORTIFRÚTI', 'FRESQUINHO'], subtitulo: 'Frutas e verduras selecionadas todos os dias', cta: 'Confira na loja' },
    cores: { base: '#0f5132', destaque: '#a3e635', texto: '#ffffff' } },
  { id: 'acougue-selecionado', nome: 'Açougue – Carnes Selecionadas', segmento: 'supermercados', formato: '16:9', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['carne', 'churrasco', 'açougue'], layout: 'escuro', foto: foto('acougue'), fotoPosicao: '60% 50%', fonte: 'anton',
    textos: { sobretitulo: 'Açougue', titulo: ['CORTES', 'SELECIONADOS'], subtitulo: 'Para o seu churrasco do fim de semana', itens: ['Corte na hora', 'Procedência', 'Preço justo'] },
    cores: { base: '#140707', destaque: '#f59e0b', texto: '#ffffff' } },

  // ── Alimentação
  { id: 'hamburguer-artesanal', nome: 'Hambúrguer Artesanal – Restaurante', segmento: 'alimentacao', formato: '16:9', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['lanche', 'burger', 'hamburgueria', 'delivery'], layout: 'escuro', foto: foto('hamburguer'), fotoPosicao: '50% 55%', fonte: 'anton',
    textos: { titulo: ['BURGER', 'ARTESANAL'], subtitulo: 'Sabor que conquista', cta: 'Peça já o seu' },
    cores: { base: '#0b0b0b', destaque: '#f59e0b', texto: '#ffffff' } },
  { id: 'pizza-em-dobro', nome: 'Pizza em Dobro – Pizzaria', segmento: 'alimentacao', formato: '9:16', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['pizza', 'pizzaria', 'promoção', 'delivery'], layout: 'vertical-painel', foto: foto('pizza'), fonte: 'anton',
    textos: { sobretitulo: 'Terça e quarta', titulo: ['PIZZA', 'EM DOBRO'], subtitulo: 'Na compra de uma grande, a segunda sai pela metade', cta: 'Peça pelo WhatsApp' },
    cores: { base: '#b91c1c', destaque: '#fde047', texto: '#ffffff' } },
  { id: 'cafe-da-manha', nome: 'Café da Manhã – Padaria', segmento: 'alimentacao', formato: '16:9', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['padaria', 'café', 'pão', 'manhã'], layout: 'faixa', foto: foto('cafe'), fonte: 'montserrat',
    textos: { sobretitulo: 'Padaria', titulo: ['CAFÉ DA', 'MANHÃ'], subtitulo: 'Pão quentinho saindo toda hora', cta: 'Das 6h às 10h' },
    cores: { base: '#7c4a1e', destaque: '#fbbf24', texto: '#fff7ed' } },

  // ── Saúde
  { id: 'clinica-medica', nome: 'Clínica Médica – Saúde', segmento: 'saude', formato: '16:9', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['médico', 'clínica', 'consulta', 'exames'], layout: 'claro', foto: foto('clinica-medica'), fotoPosicao: '50% 30%', fonte: 'fira-condensed',
    textos: { titulo: ['SUA SAÚDE', 'EM BOAS', 'MÃOS'], itens: ['Consultas', 'Exames', 'Especialistas'], cta: 'Agende sua consulta' },
    cores: { base: '#0b5cad', destaque: '#13b5a6', texto: '#0b3d7a' } },
  { id: 'sorriso-odonto', nome: 'Odontologia – Sorriso', segmento: 'saude', formato: '9:16', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['dentista', 'odontologia', 'sorriso', 'clareamento'], layout: 'vertical-foto', foto: foto('odonto'), fotoPosicao: '65% 40%', fonte: 'fira-condensed',
    textos: { sobretitulo: 'Odontologia', titulo: ['SEU SORRISO', 'MERECE', 'CUIDADO'], itens: ['Clareamento', 'Implantes', 'Ortodontia'], cta: 'Avaliação gratuita' },
    cores: { base: '#075985', destaque: '#22d3ee', texto: '#ffffff' } },

  // ── Beleza
  { id: 'salao-de-beleza', nome: 'Salão de Beleza – Estética', segmento: 'beleza', formato: '9:16', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['salão', 'cabelo', 'estética', 'beleza'], layout: 'vertical-foto', foto: foto('salao'), fotoPosicao: '50% 35%', fonte: 'montserrat',
    textos: { titulo: ['BELEZA', 'É AUTOCUIDADO'], itens: ['Cabelo', 'Unhas', 'Estética'], cta: 'Agende seu horário' },
    cores: { base: '#831843', destaque: '#f472b6', texto: '#ffffff' } },
  { id: 'barbearia-classica', nome: 'Barbearia – Corte e Barba', segmento: 'beleza', formato: '16:9', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['barbearia', 'barba', 'corte', 'masculino'], layout: 'escuro', foto: foto('barbearia'), fotoPosicao: '50% 30%', fonte: 'bebas',
    textos: { sobretitulo: 'Barbearia', titulo: ['ESTILO', 'NO DETALHE'], subtitulo: 'Corte + barba com hora marcada', itens: ['Corte', 'Barba', 'Sobrancelha'] },
    cores: { base: '#111111', destaque: '#d4a24c', texto: '#ffffff' } },

  // ── Serviços
  { id: 'oficina-mecanica', nome: 'Oficina Mecânica – Revisão', segmento: 'servicos', formato: '16:9', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['oficina', 'mecânica', 'carro', 'revisão'], layout: 'faixa', foto: foto('oficina'), fonte: 'anton',
    textos: { sobretitulo: 'Oficina', titulo: ['REVISÃO', 'COMPLETA'], subtitulo: 'Seu carro seguro na estrada', selo: { topo: 'A PARTIR DE', valor: 'R$ 199', base: 'EM ATÉ 3X' } },
    cores: { base: '#1e3a8a', destaque: '#facc15', texto: '#ffffff' } },
  { id: 'lavanderia', nome: 'Lavanderia – Roupas Limpas', segmento: 'servicos', formato: '9:16', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['lavanderia', 'roupa', 'limpeza'], layout: 'vertical-painel', foto: foto('lavanderia'), fonte: 'montserrat',
    textos: { sobretitulo: 'Lavanderia', titulo: ['ROUPA LIMPA', 'SEM ESFORÇO'], subtitulo: 'Lavamos, secamos e passamos para você', cta: 'Retire em 24 horas' },
    cores: { base: '#0e7490', destaque: '#a5f3fc', texto: '#ffffff' } },

  // ── Moda
  { id: 'nova-colecao', nome: 'Loja de Roupas – Nova Coleção', segmento: 'moda', formato: '16:9', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['moda', 'roupa', 'coleção', 'loja'], layout: 'faixa', foto: foto('moda-colecao'), fotoPosicao: '50% 25%', fonte: 'bebas',
    textos: { titulo: ['NOVA', 'COLEÇÃO'], subtitulo: 'Estilo • Conforto • Você', cta: 'Venha conferir' },
    cores: { base: '#7f1d1d', destaque: '#fca5a5', texto: '#ffffff' } },
  { id: 'liquidacao-moda', nome: 'Liquidação – Moda', segmento: 'moda', formato: '9:16', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['liquidação', 'promoção', 'roupa', 'desconto'], layout: 'vertical-painel', foto: foto('moda-liquidacao'), fonte: 'anton',
    textos: { titulo: ['LIQUIDA', 'ÇÃO'], subtitulo: 'Peças selecionadas com descontos imperdíveis', selo: { topo: 'ATÉ', valor: '70', sufixo: '%', base: 'OFF' } },
    cores: { base: '#111827', destaque: '#facc15', texto: '#ffffff' } },

  // ── Educação
  { id: 'matriculas-abertas', nome: 'Escola – Matrículas Abertas', segmento: 'educacao', formato: '16:9', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['escola', 'matrícula', 'educação', 'ensino'], layout: 'claro', foto: foto('educacao'), fonte: 'fira-condensed',
    textos: { titulo: ['MATRÍCULAS', 'ABERTAS'], itens: ['Ensino integral', 'Bilíngue', 'Esportes'], cta: 'Agende uma visita' },
    cores: { base: '#1d4ed8', destaque: '#f97316', texto: '#1e3a8a' } },
  { id: 'curso-de-idiomas', nome: 'Curso de Idiomas – Educação', segmento: 'educacao', formato: '9:16', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['inglês', 'idiomas', 'curso', 'online'], layout: 'vertical-foto', foto: foto('idiomas'), fonte: 'montserrat',
    textos: { sobretitulo: 'Curso de idiomas', titulo: ['FALE OUTRO', 'IDIOMA', 'EM 2026'], itens: ['Inglês', 'Espanhol', 'Online'], cta: 'Aula experimental grátis' },
    cores: { base: '#4c1d95', destaque: '#facc15', texto: '#ffffff' } },

  // ── Imobiliária
  { id: 'imovel-ideal', nome: 'Imobiliária – Imóveis', segmento: 'imobiliaria', formato: '16:9', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['imóvel', 'casa', 'imobiliária', 'venda'], layout: 'escuro', foto: foto('imovel'), fotoPosicao: '60% 50%', fonte: 'montserrat',
    textos: { titulo: ['O imóvel ideal', 'para sua família'], itens: ['Conforto', 'Segurança', 'Localização'], cta: 'Fale com um corretor' },
    cores: { base: '#0b1324', destaque: '#f59e0b', texto: '#ffffff' } },
  { id: 'lancamento-residencial', nome: 'Lançamento Residencial – Imobiliária', segmento: 'imobiliaria', formato: '9:16', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['lançamento', 'apartamento', 'imóvel'], layout: 'vertical-painel', foto: foto('lancamento'), fonte: 'bebas',
    textos: { sobretitulo: 'Lançamento', titulo: ['MORE NO', 'ALTO PADRÃO'], subtitulo: '2 e 3 quartos com lazer completo', cta: 'Visite o decorado' },
    cores: { base: '#0f172a', destaque: '#38bdf8', texto: '#ffffff' } },

  // ── Fitness
  { id: 'academia-disciplina', nome: 'Academia – Fitness', segmento: 'fitness', formato: '16:9', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['academia', 'treino', 'musculação'], layout: 'escuro', foto: foto('academia'), fotoPosicao: '50% 30%', fonte: 'anton',
    textos: { titulo: ['DISCIPLINA', 'É O CAMINHO', 'DO RESULTADO'], itens: ['Saúde', 'Força', 'Bem-estar'] },
    cores: { base: '#0b0b12', destaque: '#facc15', texto: '#ffffff' } },
  { id: 'aula-experimental', nome: 'Aula Experimental – Academia', segmento: 'fitness', formato: '9:16', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['academia', 'treino', 'aula', 'grátis'], layout: 'vertical-foto', foto: foto('aula-experimental'), fotoPosicao: '50% 25%', fonte: 'anton',
    textos: { titulo: ['SEU MELHOR', 'RESULTADO'], itens: ['Mais energia', 'Mais saúde', 'Mais você'], cta: 'Aula experimental grátis' },
    cores: { base: '#3b0764', destaque: '#c084fc', texto: '#ffffff' } },

  // ── Pet
  { id: 'banho-e-tosa', nome: 'Pet Shop – Banho e Tosa', segmento: 'pet', formato: '16:9', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['pet', 'cachorro', 'banho', 'tosa'], layout: 'claro', foto: foto('petshop'), fotoPosicao: '50% 40%', fonte: 'fira-condensed',
    textos: { titulo: ['BANHO', 'E TOSA'], itens: ['Com carinho', 'Produtos neutros', 'Leva e traz'], cta: 'Agende pelo WhatsApp' },
    cores: { base: '#0d9488', destaque: '#f97316', texto: '#115e59' } },
  { id: 'racao-em-oferta', nome: 'Ração em Oferta – Pet', segmento: 'pet', formato: '9:16', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['ração', 'pet', 'promoção', 'cachorro'], layout: 'vertical-painel', foto: foto('racao'), fonte: 'anton',
    textos: { sobretitulo: 'Pet shop', titulo: ['RAÇÃO', 'EM OFERTA'], subtitulo: 'Para cães e gatos de todas as idades', selo: { topo: 'ATÉ', valor: '30', sufixo: '%', base: 'OFF' } },
    cores: { base: '#ea580c', destaque: '#fde047', texto: '#ffffff' } },

  // ── Tecnologia
  { id: 'eletronicos-ofertas', nome: 'Tecnologia – Eletrônicos', segmento: 'tecnologia', formato: '16:9', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['celular', 'eletrônicos', 'tecnologia', 'oferta'], layout: 'faixa', foto: foto('eletronicos'), fonte: 'anton',
    textos: { titulo: ['APROVEITE', 'NOSSAS', 'OFERTAS'], subtitulo: 'Celulares, relógios e acessórios', selo: { valor: '50', sufixo: '%', base: 'OFF' } },
    cores: { base: '#4c1d95', destaque: '#facc15', texto: '#ffffff' } },
  { id: 'assistencia-tecnica', nome: 'Assistência Técnica – Celulares', segmento: 'tecnologia', formato: '9:16', edicao: ['rapida'], criadoEm: D,
    etiquetas: ['conserto', 'celular', 'assistência', 'tela'], layout: 'vertical-foto', foto: foto('assistencia'), fonte: 'bebas',
    textos: { sobretitulo: 'Assistência técnica', titulo: ['CELULAR', 'NOVO DE', 'NOVO'], itens: ['Troca de tela', 'Bateria', 'Garantia'], cta: 'Orçamento na hora' },
    cores: { base: '#0c4a6e', destaque: '#38bdf8', texto: '#ffffff' } },
];

export const modeloPorId = (id: string | undefined) => MODELOS.find((m) => m.id === id) ?? null;
