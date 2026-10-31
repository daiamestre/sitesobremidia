// SOBRE MÍDIA Studio de IA — contrato único entre o navegador, o orquestrador (Edge Function) e a montagem (Actions).
// Sem dependências: roda no Deno, no Vite e no Node 24 (importado com a extensão .ts).
// Regra central: preço, loja, marca e condições são DADOS do pedido. Nenhum gerador de IA escreve esses textos.

export type Formato = '16:9' | '9:16' | '1:1';
export const RESOLUCAO: Record<Formato, { w: number; h: number }> = {
  '16:9': { w: 1920, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
};
export const FORMATOS: { id: Formato; nome: string }[] = [
  { id: '16:9', nome: 'Horizontal 16:9 (TV)' },
  { id: '9:16', nome: 'Vertical 9:16 (TV em pé, totem, stories)' },
  { id: '1:1', nome: 'Quadrado 1:1 (redes sociais)' },
];

/** O que é entregue. O rótulo vai junto com o arquivo e nunca promete mais do que foi feito. */
export type TipoProducao = 'imagens' | 'video_montado' | 'video_ia' | 'modelo_editavel';
export const ROTULO: Record<TipoProducao, string> = {
  imagens: 'Imagem gerada por IA com o produto real',
  video_montado: 'Vídeo montado a partir de imagens',
  video_ia: 'Vídeo gerado por IA',
  modelo_editavel: 'Modelo editável',
};

export type Estado =
  | 'recebido' | 'planejando' | 'aguardando_aprovacao_plano' | 'gerando_imagens' | 'aguardando_aprovacao_imagens'
  | 'montando' | 'conferindo' | 'pronto' | 'entregue' | 'reprovado' | 'erro' | 'cancelado';

export const ESTADOS: { id: Estado; nome: string }[] = [
  { id: 'recebido', nome: 'Pedido recebido' },
  { id: 'planejando', nome: 'Agentes planejando' },
  { id: 'aguardando_aprovacao_plano', nome: 'Aguardando sua aprovação do plano' },
  { id: 'gerando_imagens', nome: 'Gerando imagens' },
  { id: 'aguardando_aprovacao_imagens', nome: 'Aguardando sua aprovação das imagens' },
  { id: 'montando', nome: 'Montando' },
  { id: 'conferindo', nome: 'Conferindo qualidade' },
  { id: 'pronto', nome: 'Pronto' },
  { id: 'entregue', nome: 'Enviado para as mídias' },
  { id: 'reprovado', nome: 'Reprovado na conferência' },
  { id: 'erro', nome: 'Erro' },
  { id: 'cancelado', nome: 'Cancelado' },
];

/** Transições permitidas (o banco aplica a mesma tabela em studio_mudar_estado). */
export const TRANSICOES: Record<Estado, Estado[]> = {
  recebido: ['planejando', 'cancelado', 'erro'],
  planejando: ['aguardando_aprovacao_plano', 'erro', 'cancelado'],
  aguardando_aprovacao_plano: ['gerando_imagens', 'planejando', 'cancelado'],
  gerando_imagens: ['aguardando_aprovacao_imagens', 'erro', 'cancelado'],
  aguardando_aprovacao_imagens: ['gerando_imagens', 'montando', 'pronto', 'cancelado'],
  montando: ['conferindo', 'erro', 'cancelado'],
  conferindo: ['pronto', 'reprovado', 'erro'],
  pronto: ['entregue', 'montando', 'aguardando_aprovacao_imagens'],
  entregue: ['montando', 'aguardando_aprovacao_imagens'],
  reprovado: ['montando', 'aguardando_aprovacao_imagens', 'cancelado'],
  erro: ['recebido', 'gerando_imagens', 'montando', 'cancelado'],
  cancelado: [],
};
export const podeMudar = (de: Estado, para: Estado) => TRANSICOES[de]?.includes(para) ?? false;

// ---------------------------------------------------------------- briefing

export const CATEGORIAS = [
  'Bebidas e adega', 'Supermercado', 'Açougue', 'Hortifrúti', 'Padaria e confeitaria', 'Restaurante e lanchonete',
  'Pizzaria', 'Hamburgueria', 'Açaiteria e sorveteria', 'Farmácia e saúde', 'Beleza e estética', 'Moda e calçados',
  'Academia e fitness', 'Pet shop', 'Eletrônicos e celulares', 'Casa e construção', 'Automotivo', 'Educação',
  'Imobiliária', 'Serviços', 'Institucional',
] as const;

export const OBJETIVOS = ['Vender um produto', 'Divulgar ofertas', 'Lançamento', 'Data comemorativa', 'Fortalecer a marca', 'Informar um serviço'] as const;
export const TONS = ['Impactante', 'Premium e sofisticado', 'Alegre e popular', 'Familiar e acolhedor', 'Jovem e moderno', 'Sério e confiável'] as const;

export interface FotoProduto {
  /** endereço público do arquivo original (R2) */
  url: string;
  /** recorte com fundo transparente feito no navegador (opcional) */
  recorte_url?: string | null;
  path: string;
}

export interface ProdutoPedido {
  id: string; // p1, p2…
  nome: string;
  marca?: string | null;
  /** preço em centavos (inteiro): é o ÚNICO preço que vai para a arte */
  preco_centavos: number | null;
  /** preço promocional em centavos (opcional, menor que o preço) */
  preco_promo_centavos?: number | null;
  unidade?: string | null; // "un", "kg", "cada"…
  fotos: FotoProduto[];
}

export interface Briefing {
  titulo: string;
  objetivo: string;
  categoria: string;
  segmento?: string | null;
  estabelecimento?: string | null;
  marca?: string | null;
  condicoes?: string | null;
  periodo?: string | null;
  texto_publicitario?: string | null;
  publico?: string | null;
  tom: string;
  ideia: string;
}

export interface PedidoStudio {
  briefing: Briefing;
  produtos: ProdutoPedido[];
  formato: Formato;
  duracao_s: number;
  cenas: number;
  tipo: TipoProducao;
}

export const LIMITES = { produtos: 6, fotosPorProduto: 4, cenasMin: 1, cenasMax: 8, duracaoMin: 5, duracaoMax: 60, texto: 400, ideia: 1200 } as const;

const vazio = (t: unknown) => typeof t !== 'string' || t.trim() === '';
const curto = (t: unknown, max: number) => typeof t !== 'string' || t.length <= max;

/** Converte "19,90", "R$ 1.299,90" ou "19.90" em centavos. Devolve null se não for um preço válido. */
export function precoEmCentavos(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === 'number') return Number.isFinite(texto) && texto >= 0 ? Math.round(texto * 100) : null;
  let t = texto.replace(/R\$\s*/i, '').replace(/\s/g, '');
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d+(,\d{1,2})?$/.test(t)) t = t.replace(',', '.');
  else if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const v = Math.round(Number(t) * 100);
  return Number.isFinite(v) && v >= 0 && v <= 99_999_999 ? v : null;
}

/** Centavos → texto brasileiro exato ("1.299,90"). É a única forma de um preço virar texto no Studio. */
export function formatarPreco(centavos: number): { inteiro: string; centavos: string; completo: string } {
  const c = Math.round(centavos);
  const inteiro = Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cent = String(c % 100).padStart(2, '0');
  return { inteiro, centavos: cent, completo: `${inteiro},${cent}` };
}

export function validarPedido(p: PedidoStudio): string[] {
  const erros: string[] = [];
  const b = p?.briefing;
  if (!b) return ['Briefing ausente.'];
  if (vazio(b.titulo) || !curto(b.titulo, 80)) erros.push('Dê um nome à campanha (até 80 caracteres).');
  if (vazio(b.objetivo)) erros.push('Escolha o objetivo.');
  if (vazio(b.categoria)) erros.push('Escolha a categoria.');
  if (vazio(b.tom)) erros.push('Escolha o tom da comunicação.');
  if (vazio(b.ideia) || b.ideia.trim().length < 10) erros.push('Descreva a ideia do anúncio (pelo menos 10 caracteres).');
  if (!curto(b.ideia, LIMITES.ideia)) erros.push(`A ideia pode ter até ${LIMITES.ideia} caracteres.`);
  for (const k of ['estabelecimento', 'marca', 'condicoes', 'periodo', 'texto_publicitario', 'publico', 'segmento'] as const) {
    if (!curto(b[k] ?? '', LIMITES.texto)) erros.push(`O campo ${k} passou de ${LIMITES.texto} caracteres.`);
  }
  if (!FORMATOS.some((f) => f.id === p.formato)) erros.push('Formato inválido.');
  if (!Number.isInteger(p.duracao_s) || p.duracao_s < LIMITES.duracaoMin || p.duracao_s > LIMITES.duracaoMax) erros.push(`A duração vai de ${LIMITES.duracaoMin} a ${LIMITES.duracaoMax} segundos.`);
  if (!Number.isInteger(p.cenas) || p.cenas < LIMITES.cenasMin || p.cenas > LIMITES.cenasMax) erros.push(`As cenas vão de ${LIMITES.cenasMin} a ${LIMITES.cenasMax}.`);
  if (Number.isInteger(p.cenas) && Number.isInteger(p.duracao_s) && p.duracao_s / Math.max(1, p.cenas) < 2) erros.push('Cada cena precisa de pelo menos 2 segundos.');
  if (!(p.tipo in ROTULO)) erros.push('Tipo de produção inválido.');
  if (!Array.isArray(p.produtos)) erros.push('Produtos inválidos.'); // 0 produto vale (serviço/campanha: o Creative Core cria as cenas — MG-STUDIO-03)
  else if (p.produtos.length > LIMITES.produtos) erros.push(`No máximo ${LIMITES.produtos} produtos por produção.`);
  const ids = new Set<string>();
  (p.produtos ?? []).forEach((pr, i) => {
    const n = i + 1;
    if (!/^p\d{1,2}$/.test(pr.id) || ids.has(pr.id)) erros.push(`Produto ${n}: identificação inválida.`);
    ids.add(pr.id);
    if (vazio(pr.nome) || !curto(pr.nome, 60)) erros.push(`Produto ${n}: informe o nome (até 60 caracteres).`);
    if (pr.preco_centavos !== null && (!Number.isInteger(pr.preco_centavos) || pr.preco_centavos <= 0)) erros.push(`Produto ${n}: preço inválido.`);
    if (pr.preco_promo_centavos != null) {
      if (!Number.isInteger(pr.preco_promo_centavos) || pr.preco_promo_centavos <= 0) erros.push(`Produto ${n}: preço promocional inválido.`);
      else if (pr.preco_centavos == null || pr.preco_promo_centavos >= pr.preco_centavos) erros.push(`Produto ${n}: o preço promocional precisa ser menor que o preço normal.`);
    }
    if (!Array.isArray(pr.fotos) || pr.fotos.length > LIMITES.fotosPorProduto) erros.push(`Produto ${n}: até ${LIMITES.fotosPorProduto} fotos.`);
    for (const f of pr.fotos ?? []) if (!/^https:\/\//.test(f.url ?? '')) erros.push(`Produto ${n}: foto com endereço inválido.`);
  });
  return erros;
}

/** Preço que vai para a tela: o promocional quando existe, senão o normal. */
export const precoDeVenda = (p: ProdutoPedido) => p.preco_promo_centavos ?? p.preco_centavos;

/** Todos os textos comerciais que PODEM aparecer na arte (o validador do plano recusa qualquer outro número de preço). */
export function textosComerciaisPermitidos(p: PedidoStudio): string[] {
  const t: string[] = [];
  for (const pr of p.produtos) {
    if (pr.preco_centavos) t.push(formatarPreco(pr.preco_centavos).completo);
    if (pr.preco_promo_centavos) t.push(formatarPreco(pr.preco_promo_centavos).completo);
  }
  return t;
}

/** Chave de idempotência: o mesmo conteúdo enviado duas vezes (clique duplo, rede lenta) não vira duas produções. */
export async function chaveDoPedido(userId: string, p: PedidoStudio): Promise<string> {
  const texto = JSON.stringify({ u: userId, b: p.briefing, pr: p.produtos.map((x) => [x.id, x.nome, x.preco_centavos, x.preco_promo_centavos, x.fotos.map((f) => f.path)]), f: p.formato, d: p.duracao_s, c: p.cenas, t: p.tipo });
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(dig)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

// ---------------------------------------------------------------- plano (saída dos agentes)

export type Camera = 'estatica' | 'aproximar' | 'afastar' | 'deslizar_esquerda' | 'deslizar_direita' | 'subir' | 'descer';
export const CAMERAS: { id: Camera; nome: string }[] = [
  { id: 'estatica', nome: 'Câmera parada' },
  { id: 'aproximar', nome: 'Aproximação lenta (dolly-in)' },
  { id: 'afastar', nome: 'Afastamento lento (dolly-out)' },
  { id: 'deslizar_esquerda', nome: 'Deslizar para a esquerda' },
  { id: 'deslizar_direita', nome: 'Deslizar para a direita' },
  { id: 'subir', nome: 'Subir (pedestal)' },
  { id: 'descer', nome: 'Descer (pedestal)' },
];

export interface CenaPlano {
  numero: number;
  duracao_s: number;
  /** produto em destaque nesta cena (id do pedido) ou null para cena de abertura/fechamento */
  produto_id: string | null;
  objetivo: string;
  /** chamada curta escrita pelo Roteirista (sem preço, sem loja, sem marca inventada) */
  titulo: string;
  subtitulo?: string | null;
  enquadramento: string;
  iluminacao: string;
  lente: string;
  camera: Camera;
  /** cenário em inglês para o gerador de imagem: só ambiente, SEM produto, SEM texto */
  prompt_cenario: string;
  negativo?: string | null;
}

export interface PlanoCriativo {
  conceito: string;
  estilo_visual: string;
  linguagem: string;
  paleta: string[];
  roteiro: string;
  cenas: CenaPlano[];
  produtos_analise?: Record<string, { descricao: string; cores: string[]; tem_rotulo: boolean }>;
}

const RE_PRECO = /(r\$|\d+[.,]\d{2}\b|\d+\s*(reais|real)\b)/i;
const RE_PORCENTO = /\d+\s*%/;

/**
 * Validador do plano dos agentes. Recusa:
 * - cenas que não somam a duração pedida (±1 s) ou quantidade errada;
 * - qualquer preço, R$ ou porcentagem nos textos (preço é só por código);
 * - nome de loja ou marca que não veio do pedido;
 * - produto inexistente; prompt de cenário que peça texto, logo ou o próprio produto.
 */
export function validarPlano(plano: PlanoCriativo, pedido: PedidoStudio): string[] {
  const erros: string[] = [];
  if (!plano || !Array.isArray(plano.cenas)) return ['Plano sem cenas.'];
  if (vazio(plano.conceito) || vazio(plano.roteiro)) erros.push('Plano sem conceito ou roteiro.');
  if (plano.cenas.length !== pedido.cenas) erros.push(`O plano tem ${plano.cenas.length} cenas; o pedido tem ${pedido.cenas}.`);
  const soma = plano.cenas.reduce((s, c) => s + (Number(c.duracao_s) || 0), 0);
  if (Math.abs(soma - pedido.duracao_s) > 1) erros.push(`As cenas somam ${soma} s; o pedido tem ${pedido.duracao_s} s.`);
  const ids = new Set(pedido.produtos.map((p) => p.id));
  const permitidos = [pedido.briefing.estabelecimento, pedido.briefing.marca, ...pedido.produtos.map((p) => p.marca), ...pedido.produtos.map((p) => p.nome)]
    .filter((x): x is string => !!x && x.trim().length > 1).map((x) => x.toLowerCase());
  for (const c of plano.cenas) {
    const n = c.numero;
    if (!(c.duracao_s >= 2)) erros.push(`Cena ${n}: duração mínima de 2 s.`);
    if (c.produto_id !== null && !ids.has(c.produto_id)) erros.push(`Cena ${n}: produto "${c.produto_id}" não existe no pedido.`);
    if (!CAMERAS.some((k) => k.id === c.camera)) erros.push(`Cena ${n}: movimento de câmera inválido.`);
    for (const [campo, txt] of [['título', c.titulo], ['subtítulo', c.subtitulo ?? '']] as const) {
      if (RE_PRECO.test(txt) || RE_PORCENTO.test(txt)) erros.push(`Cena ${n}: o ${campo} tem preço ou porcentagem ("${txt}"); preço só entra por código.`);
      if (txt.length > 70) erros.push(`Cena ${n}: ${campo} longo demais para a tela.`);
    }
    if (vazio(c.titulo)) erros.push(`Cena ${n}: sem título.`);
    const promptBaixo = (c.prompt_cenario ?? '').toLowerCase();
    if (promptBaixo.length < 20) erros.push(`Cena ${n}: prompt de cenário curto demais.`);
    if (/\b(text|logo|label|lettering|typography|sign with|words?)\b/.test(promptBaixo.replace(/\bno (text|logo|labels?|lettering|typography|words?)\b/g, ''))) erros.push(`Cena ${n}: o prompt de cenário pede texto ou logo.`);
    // nomes próprios suspeitos: palavra com Maiúscula no meio de uma frase (título e subtítulo separados) que não veio do pedido
    for (const frase of [c.titulo, c.subtitulo ?? ''].flatMap((t) => t.split(/[.!?:;—–]+/))) {
      const palavras = frase.split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);
      palavras.slice(1).forEach((w) => {
        if (/^\p{Lu}\p{Ll}+$/u.test(w) && w.length > 3 && !permitidos.some((p) => p.includes(w.toLowerCase())) && !PALAVRAS_COMUNS.has(w.toLowerCase())) {
          erros.push(`Cena ${n}: possível nome de loja/marca inventado ("${w}").`);
        }
      });
    }
  }
  return erros;
}

/** palavras comuns que podem vir com maiúscula num título publicitário sem ser marca */
const PALAVRAS_COMUNS = new Set(['oferta', 'ofertas', 'promoção', 'promoções', 'novo', 'nova', 'aproveite', 'imperdível', 'qualidade', 'sabor', 'hoje', 'agora', 'gelada', 'gelado', 'combo', 'combos', 'especial', 'semana', 'fim', 'dia', 'mês', 'natal', 'páscoa', 'carnaval', 'black', 'friday', 'verão', 'inverno', 'confira', 'peça', 'venha', 'garanta', 'só', 'aqui', 'você', 'sua', 'seu', 'para', 'com', 'mais', 'melhor', 'melhores', 'preço', 'preços', 'brasil', 'família', 'fresco', 'fresca', 'premium', 'exclusivo', 'exclusiva', 'lançamento', 'chegou', 'delivery', 'loja', 'casa']);

// ---------------------------------------------------------------- cenas, imagens e edição

export interface VersaoImagem {
  versao: number;
  url: string;
  path: string;
  provedor: string;
  modelo: string;
  prompt: string;
  instrucao?: string | null;
  criada_em: string;
  decisao: 'pendente' | 'aprovada' | 'rejeitada';
}

/** Camadas editáveis de uma cena (o editor interno muda só isto; preço continua vindo do produto). */
export interface EdicaoCena {
  titulo: string;
  subtitulo: string;
  mostrar_preco: boolean;
  /** posição do bloco de texto */
  texto_pos: 'esquerda' | 'direita' | 'centro' | 'topo' | 'base';
  /** produto: centro x/y em % da tela e altura em % */
  produto_x: number;
  produto_y: number;
  produto_altura: number;
  usar_recorte: boolean;
  cor_destaque: string;
  cor_texto: string;
  cor_selo: string;
  fonte: 'anton' | 'bebas' | 'montserrat' | 'fira-condensed' | 'poppins';
  escurecer_fundo: number; // 0..0.8
  /** enquadramento do fundo dentro da tela (0..100, 50 = centro) */
  fundo_x: number;
  fundo_y: number;
  duracao_s: number;
  camera: Camera;
}

export const EDICAO_PADRAO: Omit<EdicaoCena, 'titulo' | 'subtitulo' | 'duracao_s' | 'camera'> = {
  mostrar_preco: true, texto_pos: 'esquerda', produto_x: 68, produto_y: 55, produto_altura: 62, usar_recorte: true,
  cor_destaque: '#FFC400', cor_texto: '#FFFFFF', cor_selo: '#E1251B', fonte: 'anton', escurecer_fundo: 0.35, fundo_x: 50, fundo_y: 50,
};

export function edicaoInicial(c: CenaPlano, formato: Formato): EdicaoCena {
  const vertical = formato === '9:16';
  return {
    ...EDICAO_PADRAO,
    titulo: c.titulo, subtitulo: c.subtitulo ?? '', duracao_s: c.duracao_s, camera: c.camera,
    ...(vertical ? { texto_pos: 'topo' as const, produto_x: 50, produto_y: 60, produto_altura: 42 } : {}),
    ...(formato === '1:1' ? { produto_x: 66, produto_y: 58, produto_altura: 58 } : {}),
    ...(c.produto_id === null ? { mostrar_preco: false, texto_pos: 'centro' as const } : {}),
  };
}

export function validarEdicao(e: EdicaoCena): string[] {
  const erros: string[] = [];
  const cor = /^#[0-9a-fA-F]{6}$/;
  if (RE_PRECO.test(e.titulo) || RE_PRECO.test(e.subtitulo)) erros.push('Preço não vai no título: use o campo de preço do produto.');
  if (e.titulo.length > 70 || e.subtitulo.length > 90) erros.push('Texto longo demais para a tela.');
  for (const c of [e.cor_destaque, e.cor_texto, e.cor_selo]) if (!cor.test(c)) erros.push('Cor inválida.');
  for (const [v, min, max] of [[e.produto_x, 0, 100], [e.produto_y, 0, 100], [e.produto_altura, 10, 95], [e.escurecer_fundo, 0, 0.8], [e.fundo_x, 0, 100], [e.fundo_y, 0, 100], [e.duracao_s, 2, 30]] as const) {
    if (typeof v !== 'number' || Number.isNaN(v) || v < min || v > max) erros.push('Valor de posição, tamanho ou duração fora do limite.');
  }
  if (!CAMERAS.some((k) => k.id === e.camera)) erros.push('Movimento de câmera inválido.');
  return erros;
}

// ---------------------------------------------------------------- cotas e custos

export type Modalidade = 'plano' | 'imagem' | 'montagem' | 'imagem_paga' | 'video_ia' | 'voz';
/** limites diários (por pessoa / por empresa). Mudam aqui e no banco (studio_consumir_cota) juntos. */
export const COTA_DIARIA: Record<Modalidade, { pessoa: number; empresa: number }> = {
  plano: { pessoa: 10, empresa: 60 },
  imagem: { pessoa: 40, empresa: 200 },
  montagem: { pessoa: 10, empresa: 60 },
  imagem_paga: { pessoa: 0, empresa: 0 },
  video_ia: { pessoa: 0, empresa: 0 },
  voz: { pessoa: 0, empresa: 0 },
};

/** Estimativa honesta: neurons da Cloudflare (10.000/dia grátis na conta do dono; acima disso US$ 0,011 por 1.000). */
export const CUSTO = {
  neuronsPorImagemSchnell: 96, // 4 blocos 512² × 4,8 + 8 passos × 9,6
  neuronsPorImagemLucid1080: 7_872, // 12 blocos × 636 + 20 passos × 12
  usdPorMilNeurons: 0.011,
  neuronsPorMilhaoEntradaScout: 24_545,
  neuronsPorMilhaoSaidaScout: 77_273,
};
export const neuronsDoTexto = (entrada: number, saida: number) =>
  Math.ceil((entrada * CUSTO.neuronsPorMilhaoEntradaScout + saida * CUSTO.neuronsPorMilhaoSaidaScout) / 1_000_000);
export const usdDosNeurons = (n: number) => Math.round(n * CUSTO.usdPorMilNeurons * 10) / 10_000;
