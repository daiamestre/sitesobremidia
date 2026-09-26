import type { WidgetConfig } from '@/types/models';

/**
 * Galeria de Widgets = catálogo de MODELOS (tipo + template). "Meus Widgets" são as instâncias salvas na tabela
 * `widgets` (mesma tabela de sempre: o modelo escolhido vai em `config.template`, sem tabela nova).
 *
 * `noPlayer`: o Android Player já desenha este modelo. Modelos ainda não suportados aparecem como "Em breve" e não
 * podem ser criados — nada é dado como pronto só por existir na tela.
 */
export type WidgetTypeId =
  | 'clock' | 'weather' | 'rss' | 'institutional' | 'offer' | 'advertising' | 'social' | 'youtube' | 'instagram' | 'sports';

export interface WidgetTemplateDef {
  id: string;
  tipo: WidgetTypeId;
  nome: string;
  descricao: string;
  suportaFundo: boolean;
  noPlayer: boolean;
}

export const WIDGET_TEMPLATES: WidgetTemplateDef[] = [
  // Relógio e Clima: modelo ÚNICO (Futurista), com cores à escolha e imagem de fundo opcional
  { id: 'clock-futurista', tipo: 'clock', nome: 'Relógio Futurista', descricao: 'Hora e data no Horário de Brasília com glow; escolha a cor ou use uma imagem de fundo.', suportaFundo: true, noPlayer: true },
  { id: 'weather-futurista', tipo: 'weather', nome: 'Clima Futurista', descricao: 'Temperatura, máxima, mínima e próximos dias; escolha a cor ou use uma imagem de fundo.', suportaFundo: true, noPlayer: true },
  // Esportes (Sports Engine): só placares/jogos confirmados por duas fontes (openfootball + Wikipédia); sem placar ao vivo
  { id: 'sports-resultados', tipo: 'sports', nome: 'Resultados do Futebol', descricao: 'Placares finais confirmados do Brasileirão, Premier League, La Liga e Champions League.', suportaFundo: true, noPlayer: true },
  { id: 'sports-proximos', tipo: 'sports', nome: 'Próximos Jogos', descricao: 'Confrontos, datas e horários de Brasília dos próximos jogos, atualizados sozinhos.', suportaFundo: true, noPlayer: true },
  { id: 'sports-hoje', tipo: 'sports', nome: 'Jogos de Hoje', descricao: 'Os jogos do dia com horário de Brasília e os resultados confirmados.', suportaFundo: true, noPlayer: true },
  { id: 'rss-classic', tipo: 'rss', nome: 'Notícias (RSS)', descricao: 'Manchetes reais de um feed, em rotação, com barra de tempo.', suportaFundo: true, noPlayer: true },
  { id: 'rss-esportes', tipo: 'rss', nome: 'Notícias de Esportes', descricao: 'Manchetes de esportes da Agência Brasil, atualizadas automaticamente.', suportaFundo: true, noPlayer: true },
  { id: 'institutional-aviso', tipo: 'institutional', nome: 'Institucional / Aviso', descricao: 'Horário de funcionamento, comunicados, contato e QR Code.', suportaFundo: true, noPlayer: true },
  { id: 'offer-destaque', tipo: 'offer', nome: 'Oferta em destaque', descricao: 'Produto, preço "de/por" e QR Code a partir do cadastro de ofertas.', suportaFundo: true, noPlayer: true },
  { id: 'advertising-campanha', tipo: 'advertising', nome: 'Publicidade', descricao: 'Criativo da campanha com logo, CTA e QR Code.', suportaFundo: true, noPlayer: true },
  { id: 'social-post', tipo: 'social', nome: 'Conteúdo Social', descricao: 'Título, texto, imagem, autor e QR Code.', suportaFundo: true, noPlayer: true },
  { id: 'youtube-video', tipo: 'youtube', nome: 'YouTube', descricao: 'Vídeo, playlist ou canal do YouTube pelo player oficial.', suportaFundo: false, noPlayer: true },
  { id: 'instagram-post', tipo: 'instagram', nome: 'Instagram', descricao: 'Publicações do Instagram por meio oficial ou imagem enviada.', suportaFundo: true, noPlayer: true },
];

export const TIPO_LABEL: Record<WidgetTypeId, string> = {
  clock: 'Relógio', weather: 'Clima', rss: 'Notícias (RSS)', institutional: 'Institucional', offer: 'Ofertas',
  advertising: 'Publicidade', social: 'Conteúdo Social', youtube: 'YouTube', instagram: 'Instagram', sports: 'Esportes',
};

/** Tipos de modelo ÚNICO com cores à escolha (Relógio/Clima: sempre o Futurista). */
export const TIPOS_COM_PALETA = ['clock', 'weather'];

/** Tipos com cores à escolha (paleta) na lateral da prévia; o Player lê config.cores. */
export const TIPOS_COM_CORES = [...TIPOS_COM_PALETA, 'sports'];

/** Esportes: o modelo define o modo (Resultados, Próximos jogos, Jogos de hoje). */
export const MODO_DO_MODELO_ESPORTES: Record<string, 'resultados' | 'proximos' | 'hoje'> = {
  'sports-resultados': 'resultados', 'sports-proximos': 'proximos', 'sports-hoje': 'hoje',
};

export const COMPETICOES_ESPORTES = [
  { slug: 'brasileirao', nome: 'Brasileirão Série A' },
  { slug: 'premier-league', nome: 'Premier League' },
  { slug: 'la-liga', nome: 'La Liga' },
  { slug: 'champions-league', nome: 'Champions League' },
] as const;

/** Feed oficial de esportes da Agência Brasil (CC BY 4.0): o servidor guarda e entrega as manchetes; Players antigos leem o feed. */
export const FEED_AGENCIA_BRASIL_ESPORTES = 'https://agenciabrasil.ebc.com.br/rss/esportes/feed.xml';

/** Modelo padrão do tipo (o primeiro do catálogo). Relógio e Clima: sempre o Futurista. */
export function templatePadrao(tipo: string): string {
  return WIDGET_TEMPLATES.find((t) => t.tipo === tipo)?.id ?? `${tipo}-classic`;
}

/** Modelo de um widget salvo: o gravado em config.template, ou o padrão do tipo (Relógio/Clima: sempre Futurista). */
export function templateDoWidget(tipo: string, config: WidgetConfig | null | undefined): WidgetTemplateDef | undefined {
  const id = TIPOS_COM_PALETA.includes(tipo) ? templatePadrao(tipo) : (config as { template?: string } | null | undefined)?.template;
  return WIDGET_TEMPLATES.find((t) => t.id === id) ?? WIDGET_TEMPLATES.find((t) => t.tipo === tipo);
}

/** Chave do objeto no armazenamento (R2) a partir da URL pública: é a identidade do fundo (um arquivo, muitos widgets). */
export function chaveDoFundo(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const key = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    return key || null;
  } catch {
    return null;
  }
}

/** Widgets que usam o fundo (pela chave do arquivo): exclusão do fundo é bloqueada enquanto houver uso. */
export function widgetsQueUsamFundo<T extends { name: string; config: WidgetConfig | null }>(widgets: T[], chave: string): T[] {
  return widgets.filter((w) => {
    const c = w.config || {};
    return [c.backgroundImageLandscape, c.backgroundImagePortrait, c.backgroundImage, c.imagemPost].some((u) => chaveDoFundo(u) === chave);
  });
}

/** Cópia de um widget para "Duplicar": mesma configuração e fundo (o arquivo não é copiado), nome "(cópia)". */
export function copiaDoWidget<T extends { name: string; widget_type: string; config: WidgetConfig; is_active: boolean; thumbnail_url?: string | null }>(w: T) {
  return {
    name: `${w.name} (cópia)`,
    widget_type: w.widget_type,
    config: JSON.parse(JSON.stringify(w.config ?? {})) as WidgetConfig,
    is_active: w.is_active,
    thumbnail_url: w.thumbnail_url ?? null,
  };
}
