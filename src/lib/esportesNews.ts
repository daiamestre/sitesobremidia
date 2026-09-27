import { supabase } from '@/integrations/supabase/client';
import type { WidgetConfig } from '@/types/models';

/**
 * Widget "Esportes News" (F-90, migração 20261260) — separado de "Notícias (RSS)".
 * Regra do proprietário: notícia de esporte só aparece COM a imagem da notícia. O servidor já entrega só itens com
 * imagem (fn_widget_esportes_news_dados); aqui e no Player, notícia cuja imagem não carrega também sai da exibição.
 * Mesma lógica do Android Player (widget/EsportesNews.kt).
 */
export interface NoticiaEsporte {
  id: string;
  titulo: string;
  resumo: string | null;
  imagem: string;
  creditoImagem: string | null;
  fonte: string;
  licenca: string | null;
  publicadoEm: string | null;
}
export interface DadosEsportesNews { geradoEm: string; itens: NoticiaEsporte[] }

export const SEGUNDOS_POR_NOTICIA = 8;
export const NOTICIAS_POR_EXIBICAO = 3;
/** 3 notícias x 8 s por exibição na playlist. */
export const DURACAO_WIDGET_ESPORTES_NEWS = SEGUNDOS_POR_NOTICIA * NOTICIAS_POR_EXIBICAO;

export async function buscarEsportesNews(config: WidgetConfig): Promise<DadosEsportesNews> {
  const { data, error } = await supabase.rpc('content_esportes_news_preview' as never, {
    p_config: { maxItems: config.maxItems ?? 10 },
  } as never);
  if (error) throw new Error(error.message);
  return (data as unknown as DadosEsportesNews) ?? { geradoEm: '', itens: [] };
}

/** Só notícia com título e imagem https (defesa extra: nunca notícia sem imagem na tela). */
export function noticiasComImagem(itens: NoticiaEsporte[] | null | undefined): NoticiaEsporte[] {
  return (itens ?? []).filter((n) => !!n && typeof n.titulo === 'string' && n.titulo.trim() !== ''
    && typeof n.imagem === 'string' && /^https:\/\/\S+$/i.test(n.imagem));
}

/** Índices desta exibição: até 3, a partir da notícia `proximaId` (continua de onde a anterior parou). */
export function indicesDaExibicao(itens: NoticiaEsporte[], proximaId: string | null | undefined, porExibicao = NOTICIAS_POR_EXIBICAO): number[] {
  const total = itens.length;
  if (!total) return [];
  const ini = Math.max(0, itens.findIndex((n) => n.id === proximaId));
  return Array.from({ length: Math.min(porExibicao, total) }, (_, k) => (ini + k) % total);
}

/** Depois de mostrar o índice `i`, a próxima exibição começa na notícia seguinte. */
export function proximaDepois(itens: NoticiaEsporte[], i: number): string | null {
  return itens.length ? itens[(i + 1) % itens.length].id : null;
}

/** Crédito da imagem na tela: "Foto: Tânia Rêgo/Agência Brasil"; arte: "Arte/EBC · Agência Brasil"; sem crédito: "Imagem: <fonte>". */
export function creditoDaNoticia(n: Pick<NoticiaEsporte, 'creditoImagem' | 'fonte'>): string {
  const c = (n.creditoImagem ?? '').trim();
  if (!c) return `Imagem: ${n.fonte}`;
  const base = /^arte\b/i.test(c) ? c : `Foto: ${c}`;
  return n.fonte && !c.toLowerCase().includes(n.fonte.toLowerCase()) ? `${base} · ${n.fonte}` : base;
}

const BRASILIA_MS = -3 * 3600e3; // Brasil sem horário de verão desde 2019
const diaBr = (ms: number) => new Date(ms + BRASILIA_MS).toISOString().slice(0, 10);

/** "Hoje, 14:30" / "Ontem, 09:10" / "25/09, 18:00" (Brasília). Data inválida -> "". */
export function quandoPublicada(iso: string | null | undefined, agoraMs = Date.now()): string {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '';
  const br = new Date(t + BRASILIA_MS).toISOString();
  const hora = br.slice(11, 16);
  const dia = diaBr(t);
  if (dia === diaBr(agoraMs)) return `Hoje, ${hora}`;
  if (dia === diaBr(agoraMs - 86400e3)) return `Ontem, ${hora}`;
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}, ${hora}`;
}
