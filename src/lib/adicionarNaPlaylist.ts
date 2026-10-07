/**
 * F-155 — "Adicionar à playlist": escolher VÁRIOS conteúdos de uma vez (mídias, conteúdo dinâmico, pastas da plataforma,
 * playlists inteiras e links), ver o que foi selecionado e decidir se entra no Início ou no Final da playlist.
 * Regras puras (sem tela): categorias do conteúdo dinâmico, widgets de um clique e inserção na posição escolhida.
 */
import type { ExternalLink, Media, PlaylistItem, Widget, WidgetConfig, WidgetType } from '@/types/models';
import type { PastaBiblioteca } from '@/lib/biblioteca';
import { COMPETICOES_ESPORTES, TIPO_LABEL, type WidgetTypeId } from '@/lib/widgetCatalog';
import { escolhaDePaleta, PALETA_PADRAO } from '@/lib/widgetPaletas';
import { DURACAO_WIDGET_ESPORTES } from '@/lib/esportesPaginas';
import { DURACAO_WIDGET_ESPORTES_NEWS } from '@/lib/esportesNews';
import { DURACAO_PADRAO_PASTA } from '@/lib/pastaNaPlaylist';
import { secondsForRealMs } from '@/lib/mediaDuration';
import { newTempItemId } from '@/lib/playlistItems';
import { supabase } from '@/integrations/supabase/client';

export type Posicao = 'inicio' | 'final';

/** Categorias do Conteúdo dinâmico (como "Geral / Futebol / ..." do modelo de referência). */
export const CATEGORIAS_DINAMICAS = ['Geral', 'Futebol', 'Notícias', 'Vídeo e redes', 'Comercial'] as const;
export type CategoriaDinamica = (typeof CATEGORIAS_DINAMICAS)[number];

const CATEGORIA_DO_TIPO: Record<string, CategoriaDinamica> = {
  clock: 'Geral', weather: 'Geral', institutional: 'Geral',
  sports: 'Futebol', sports_news: 'Futebol',
  rss: 'Notícias',
  youtube: 'Vídeo e redes', instagram: 'Vídeo e redes', social: 'Vídeo e redes',
  offer: 'Comercial', advertising: 'Comercial',
};

export const categoriaDoTipo = (tipo: string): CategoriaDinamica => CATEGORIA_DO_TIPO[tipo] ?? 'Geral';

/** Nome de um tipo de widget para o usuário. */
export const rotuloDoTipo = (tipo: string): string => TIPO_LABEL[tipo as WidgetTypeId] ?? 'Widget';

/** Widgets agrupados por categoria (só categorias com conteúdo, na ordem fixa). */
export function agruparWidgets<T extends { widget_type: string }>(widgets: T[]): Array<{ categoria: CategoriaDinamica; itens: T[] }> {
  return CATEGORIAS_DINAMICAS
    .map((categoria) => ({ categoria, itens: widgets.filter((w) => categoriaDoTipo(w.widget_type) === categoria) }))
    .filter((g) => g.itens.length > 0);
}

/**
 * Modelos de um clique: o widget é criado na hora (já com a configuração padrão) quando o usuário confirma.
 * Só entram modelos que funcionam sem dado do usuário — Clima precisa de cidade e Oferta/Publicidade precisam de cadastro,
 * então esses continuam pela tela de Widgets (nada é inventado).
 */
export interface ModeloPronto {
  id: string;
  nome: string;
  descricao: string;
  categoria: CategoriaDinamica;
  tipo: WidgetType;
  config: () => WidgetConfig;
}

const FEED_AGENCIA_BRASIL = 'agencia-brasil' as const;

export const MODELOS_PRONTOS: ModeloPronto[] = [
  {
    id: 'pronto-relogio', nome: 'Relógio e data', descricao: 'Hora e data no Horário de Brasília.', categoria: 'Geral', tipo: 'clock',
    config: () => ({ template: 'clock-futurista', ...escolhaDePaleta(PALETA_PADRAO), showDate: true, showSeconds: false, position: 'center', backgroundImageLandscape: null, backgroundImagePortrait: null }),
  },
  ...COMPETICOES_ESPORTES.map((c): ModeloPronto => ({
    id: `pronto-futebol-${c.slug}`, nome: `${c.nome} — resultados e próximos jogos`, descricao: 'Resultados dos 3 dias anteriores e jogos até 2 dias à frente, com escudos.', categoria: 'Futebol', tipo: 'sports',
    config: () => ({ template: 'sports-resultados', modo: 'resultados', competicoes: [c.slug], limite: 6, time: '', ...escolhaDePaleta(PALETA_PADRAO), backgroundImageLandscape: null, backgroundImagePortrait: null }),
  })),
  {
    id: 'pronto-esportes-news', nome: 'Esportes News', descricao: 'Notícias de esportes com a imagem e o crédito da foto.', categoria: 'Futebol', tipo: 'sports_news',
    config: () => ({ template: 'esportes-news', maxItems: 10 }),
  },
  {
    id: 'pronto-noticias-agencia-brasil', nome: 'Notícias — Agência Brasil', descricao: 'Últimas notícias com imagem, atualizadas sozinhas.', categoria: 'Notícias', tipo: 'rss',
    config: () => ({ template: 'rss-classic', origem: FEED_AGENCIA_BRASIL, maxItems: 5, scrollSpeed: 8, position: 'center', variant: 'full', backgroundImageLandscape: null, backgroundImagePortrait: null }),
  },
];

/** Um conteúdo marcado no diálogo. */
export type Escolha =
  | { chave: string; tipo: 'midia'; nome: string; midia: Media }
  | { chave: string; tipo: 'widget'; nome: string; widget: Widget }
  | { chave: string; tipo: 'modelo'; nome: string; modelo: ModeloPronto }
  | { chave: string; tipo: 'link'; nome: string; link: ExternalLink }
  | { chave: string; tipo: 'pasta'; nome: string; pasta: PastaBiblioteca }
  | { chave: string; tipo: 'playlist'; nome: string; playlist: { id: string; name: string } };

export const escolhaDeMidia = (m: Media): Escolha => ({ chave: `midia:${m.id}`, tipo: 'midia', nome: m.name, midia: m });
export const escolhaDeWidget = (w: Widget): Escolha => ({ chave: `widget:${w.id}`, tipo: 'widget', nome: w.name, widget: w });
export const escolhaDeModelo = (m: ModeloPronto): Escolha => ({ chave: `modelo:${m.id}`, tipo: 'modelo', nome: m.nome, modelo: m });
export const escolhaDeLink = (l: ExternalLink): Escolha => ({ chave: `link:${l.id}`, tipo: 'link', nome: l.title, link: l });
export const escolhaDePasta = (p: PastaBiblioteca): Escolha => ({ chave: `pasta:${p.id}`, tipo: 'pasta', nome: p.nome, pasta: p });
export const escolhaDePlaylist = (p: { id: string; name: string }): Escolha => ({ chave: `playlist:${p.id}`, tipo: 'playlist', nome: p.name, playlist: p });

/** Marca ou desmarca (clicar de novo tira da seleção). */
export function alternarEscolha(lista: Escolha[], escolha: Escolha): Escolha[] {
  return lista.some((e) => e.chave === escolha.chave) ? lista.filter((e) => e.chave !== escolha.chave) : [...lista, escolha];
}

/** Duração padrão de um widget na playlist (mesmas regras do editor da playlist e da tela). */
export function duracaoPadraoDoWidget(tipo: string): number {
  if (tipo === 'sports') return DURACAO_WIDGET_ESPORTES;
  if (tipo === 'sports_news') return DURACAO_WIDGET_ESPORTES_NEWS;
  if (tipo === 'rss') return 15;
  return 10;
}

/** Item temporário (ainda não salvo) para uma escolha já resolvida. 'modelo' e 'playlist' precisam ser resolvidos antes. */
export function itemTemporario(escolha: Exclude<Escolha, { tipo: 'modelo' } | { tipo: 'playlist' }>, playlistId: string): PlaylistItem {
  const base = { playlist_id: playlistId, position: 0, created_at: new Date().toISOString() };
  switch (escolha.tipo) {
    case 'midia': {
      const m = escolha.midia;
      return { ...base, id: newTempItemId('temp-m'), media_id: m.id, widget_id: null, external_link_id: null,
        // Vídeo entra com o tempo exato dele (segundo cheio para cima: a tela toca a duração real, sem cortar)
        duration: secondsForRealMs(m.duration_ms) ?? (m.duration ? Number(m.duration) : 10), media: m } as PlaylistItem;
    }
    case 'widget':
      return { ...base, id: newTempItemId('temp-w'), media_id: null, widget_id: escolha.widget.id, external_link_id: null,
        duration: duracaoPadraoDoWidget(escolha.widget.widget_type), widget: escolha.widget } as PlaylistItem;
    case 'link':
      return { ...base, id: newTempItemId('temp-l'), media_id: null, widget_id: null, external_link_id: escolha.link.id,
        duration: 30, external_link: escolha.link } as PlaylistItem;
    case 'pasta':
      return { ...base, id: newTempItemId('temp-p'), media_id: null, widget_id: null, external_link_id: null,
        biblioteca_pasta_id: escolha.pasta.id, duration: DURACAO_PADRAO_PASTA, pasta: { id: escolha.pasta.id, nome: escolha.pasta.nome } } as PlaylistItem;
  }
}

/** Copia um item de outra playlist (mantém mídia/widget/link/pasta, duração e agendamento) com id novo. */
export function copiaDoItem(item: PlaylistItem, playlistId: string): PlaylistItem {
  return { ...item, id: newTempItemId('temp-c'), playlist_id: playlistId, days: item.days ? [...item.days] : item.days, created_at: new Date().toISOString() };
}

/** Coloca os novos itens no início ou no final, mantendo a ordem em que foram marcados, e renumera as posições. */
export function inserirNaPosicao(atuais: PlaylistItem[], novos: PlaylistItem[], posicao: Posicao): PlaylistItem[] {
  const lista = posicao === 'inicio' ? [...novos, ...atuais] : [...atuais, ...novos];
  return lista.map((item, i) => ({ ...item, position: i }));
}

/** Texto do botão de confirmar. */
export function textoDoConfirmar(qtd: number): string {
  return qtd === 0 ? 'Adicionar à playlist' : `Adicionar ${qtd} ${qtd === 1 ? 'item' : 'itens'} à playlist`;
}

const SELECT_ITEM_COMPLETO = `*, media:media!playlist_items_media_id_fkey(id, name, file_url, file_path, file_type, thumbnail_url, duration_ms),
  widget:widgets!playlist_items_widget_id_fkey(id, name, widget_type, config, is_active),
  external_link:external_links!playlist_items_external_link_id_fkey(id, title, url, platform, thumbnail_url, is_active),
  pasta:biblioteca_pastas!playlist_items_biblioteca_pasta_id_fkey(id, nome)`;

/**
 * Transforma o que foi marcado em itens temporários (ainda não salvos), na ordem marcada: cria na hora os widgets de um
 * clique (com o usuário logado) e traz, como cópia, os itens das playlists escolhidas. Quem chama grava com "Salvar".
 */
export async function resolverEscolhas(escolhas: Escolha[], playlistId: string, userId: string): Promise<{ novos: PlaylistItem[]; widgetsCriados: Widget[] }> {
  const novos: PlaylistItem[] = [];
  const widgetsCriados: Widget[] = [];
  for (const e of escolhas) {
    if (e.tipo === 'modelo') {
      const { data, error } = await supabase.from('widgets')
        .insert({ user_id: userId, name: e.modelo.nome, widget_type: e.modelo.tipo, config: e.modelo.config(), is_active: true } as never)
        .select('*').single();
      if (error || !data) throw new Error(error?.message || 'Não foi possível criar o conteúdo dinâmico.');
      const widget = data as unknown as Widget;
      widgetsCriados.push(widget);
      novos.push(itemTemporario({ chave: e.chave, tipo: 'widget', nome: widget.name, widget }, playlistId));
    } else if (e.tipo === 'playlist') {
      const { data, error } = await supabase.from('playlist_items').select(SELECT_ITEM_COMPLETO).eq('playlist_id', e.playlist.id).order('position');
      if (error) throw new Error(error.message);
      for (const item of (data || []) as unknown as PlaylistItem[]) novos.push(copiaDoItem(item, playlistId));
    } else {
      novos.push(itemTemporario(e, playlistId));
    }
  }
  return { novos, widgetsCriados };
}
