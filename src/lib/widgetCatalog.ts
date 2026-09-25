import type { WidgetConfig } from '@/types/models';

/**
 * Galeria de Widgets = catálogo de MODELOS (tipo + template). "Meus Widgets" são as instâncias salvas na tabela
 * `widgets` (mesma tabela de sempre: o modelo escolhido vai em `config.template`, sem tabela nova).
 *
 * `noPlayer`: o Android Player já desenha este modelo. Modelos ainda não suportados aparecem como "Em breve" e não
 * podem ser criados — nada é dado como pronto só por existir na tela.
 */
export type WidgetTypeId =
  | 'clock' | 'weather' | 'rss' | 'institutional' | 'offer' | 'advertising' | 'social' | 'youtube' | 'instagram';

export interface WidgetTemplateDef {
  id: string;
  tipo: WidgetTypeId;
  nome: string;
  descricao: string;
  suportaFundo: boolean;
  noPlayer: boolean;
}

export const WIDGET_TEMPLATES: WidgetTemplateDef[] = [
  { id: 'clock-classic', tipo: 'clock', nome: 'Relógio + Data', descricao: 'Hora e data grandes no Horário de Brasília, com saudação do dia.', suportaFundo: true, noPlayer: true },
  { id: 'weather-classic', tipo: 'weather', nome: 'Clima', descricao: 'Temperatura atual, sensação, umidade e vento da cidade escolhida.', suportaFundo: true, noPlayer: true },
  { id: 'rss-classic', tipo: 'rss', nome: 'Notícias (RSS)', descricao: 'Manchetes reais de um feed, em rotação, com barra de tempo.', suportaFundo: true, noPlayer: true },
  { id: 'weather-futurista', tipo: 'weather', nome: 'Clima Futurista', descricao: 'Peça vibrante com máxima, mínima e previsão dos próximos dias.', suportaFundo: true, noPlayer: true },
  { id: 'clock-futurista', tipo: 'clock', nome: 'Relógio Futurista', descricao: 'Relógio com glow e gradiente da identidade SOBRE MÍDIA.', suportaFundo: true, noPlayer: true },
  { id: 'institutional-aviso', tipo: 'institutional', nome: 'Institucional / Aviso', descricao: 'Horário de funcionamento, comunicados, contato e QR Code.', suportaFundo: true, noPlayer: true },
  { id: 'offer-destaque', tipo: 'offer', nome: 'Oferta em destaque', descricao: 'Produto, preço "de/por" e QR Code a partir do cadastro de ofertas.', suportaFundo: true, noPlayer: false },
  { id: 'advertising-campanha', tipo: 'advertising', nome: 'Publicidade', descricao: 'Criativo da campanha com logo, CTA e QR Code.', suportaFundo: true, noPlayer: false },
  { id: 'social-post', tipo: 'social', nome: 'Conteúdo Social', descricao: 'Título, texto, imagem, autor e QR Code.', suportaFundo: true, noPlayer: false },
  { id: 'youtube-video', tipo: 'youtube', nome: 'YouTube', descricao: 'Vídeo, playlist ou canal do YouTube pelo player oficial.', suportaFundo: false, noPlayer: false },
  { id: 'instagram-post', tipo: 'instagram', nome: 'Instagram', descricao: 'Publicações do Instagram por meio oficial ou imagem enviada.', suportaFundo: true, noPlayer: false },
];

export const TIPO_LABEL: Record<WidgetTypeId, string> = {
  clock: 'Relógio', weather: 'Clima', rss: 'Notícias (RSS)', institutional: 'Institucional', offer: 'Ofertas',
  advertising: 'Publicidade', social: 'Conteúdo Social', youtube: 'YouTube', instagram: 'Instagram',
};

/** Modelo de um widget salvo: o gravado em config.template, ou o clássico do tipo (widgets criados antes do catálogo). */
export function templateDoWidget(tipo: string, config: WidgetConfig | null | undefined): WidgetTemplateDef | undefined {
  const id = (config as { template?: string } | null | undefined)?.template;
  return WIDGET_TEMPLATES.find((t) => t.id === id) ?? WIDGET_TEMPLATES.find((t) => t.tipo === tipo && t.id.endsWith('-classic'));
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
    return [c.backgroundImageLandscape, c.backgroundImagePortrait, c.backgroundImage].some((u) => chaveDoFundo(u) === chave);
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
