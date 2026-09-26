import { supabase } from '@/integrations/supabase/client';
import type { WidgetConfig } from '@/types/models';

/**
 * Esportes e notícias prontos para os widgets (Sports Engine / motor de notícias — migração 20261251).
 * O painel pede a mesma resolução que o servidor entrega ao Player (fn_widget_esportes_dados / fn_widget_noticias_dados).
 * Só aparecem jogos publicados: confirmados por duas fontes (openfootball + Wikipédia) ou duas revisões (Champions).
 */
export interface JogoEsporte {
  competicao: string;
  codigo: string;
  slug: string;
  rodada: string | null;
  mandante: string;
  visitante: string;
  placarMandante: number | null;
  placarVisitante: number | null;
  status: 'SCHEDULED' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  data: string;          // YYYY-MM-DD (Brasília)
  hora: string | null;   // HH:MM (Brasília) ou null = a definir
  kickoffUtc: string | null;
}

export interface DadosEsportes {
  modo: 'resultados' | 'proximos' | 'hoje';
  fuso: string;
  geradoEm: string;
  competicoes: Array<{ slug: string; nome: string; codigo: string; cobertura: 'FULL' | 'PARTIAL' | 'UNAVAILABLE' }>;
  jogos: JogoEsporte[];
  creditos: string;
}

export interface NoticiaWidget { titulo: string; resumo: string | null; fonte: string; publicadoEm: string | null }
export interface DadosNoticias { categoria: string; geradoEm: string; creditos: string; itens: NoticiaWidget[] }

export const ROTULO_MODO: Record<DadosEsportes['modo'], string> = {
  resultados: 'RESULTADOS', proximos: 'PRÓXIMOS JOGOS', hoje: 'JOGOS DE HOJE',
};

function configParaServidor(config: WidgetConfig) {
  return { competicoes: config.competicoes ?? [], modo: config.modo ?? 'resultados', limite: config.limite ?? 6, time: config.time ?? '' };
}

export async function buscarEsportes(config: WidgetConfig): Promise<DadosEsportes> {
  const { data, error } = await supabase.rpc('content_esportes_preview' as never, { p_config: configParaServidor(config) } as never);
  if (error) throw new Error(error.message);
  return data as unknown as DadosEsportes;
}

export async function buscarNoticias(config: WidgetConfig): Promise<DadosNoticias> {
  const { data, error } = await supabase.rpc('content_noticias_preview' as never, {
    p_config: { origem: 'agencia-brasil', categoria: config.categoria ?? 'esportes', maxItems: config.maxItems ?? 8 },
  } as never);
  if (error) throw new Error(error.message);
  return data as unknown as DadosNoticias;
}

/** "2026-10-03" -> "sáb 03/10" (a data já vem em Brasília; formata sem mudar o dia). */
export function dataCurta(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return data;
  const dia = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(d).replace('.', '');
  return `${dia} ${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/** Placar ("2 × 1") para jogo encerrado; horário ("18:30" / "a definir") para os demais. */
export function centroDoJogo(j: JogoEsporte): { principal: string; encerrado: boolean } {
  if (j.status === 'FINISHED' && j.placarMandante !== null && j.placarVisitante !== null) {
    return { principal: `${j.placarMandante} × ${j.placarVisitante}`, encerrado: true };
  }
  return { principal: j.hora ?? 'a definir', encerrado: false };
}

/** Jogos a exibir agora: no modo "próximos", o que já começou sai da lista (sem placar ao vivo), mesmo com dado antigo em cache. */
export function jogosVisiveis(dados: DadosEsportes | null, agora = new Date()): JogoEsporte[] {
  if (!dados) return [];
  if (dados.modo !== 'proximos') return dados.jogos;
  return dados.jogos.filter((j) => !j.kickoffUtc || Date.parse(j.kickoffUtc) > agora.getTime());
}
