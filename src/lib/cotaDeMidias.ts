/**
 * F-166 — Textos da cota de mídias do anunciante (mídia grátis da 1ª playlist, mídias liberadas pelo Owner/ADM e valor da
 * próxima mídia). Só texto: quem decide grátis/pago é o banco (adicionar_midia_playlist).
 */
import type { CotaDeMidias, LiberacaoDeMidias, OrigemDoItem } from '@/modules/crm/services/playlistCliente.service';

export const MOTIVO_DA_LIBERACAO: Record<LiberacaoDeMidias['motivo'], string> = {
  PROMOCAO: 'Promoção',
  DATA_COMEMORATIVA: 'Data comemorativa',
  CORTESIA: 'Cortesia',
  OUTRO: 'Outro motivo',
};

export const brl = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Quanto a próxima mídia custa depois das grátis. */
export function avisoDepoisDasGratis(cota: Pick<CotaDeMidias, 'valor'>): string {
  return cota.valor > 0
    ? `Quando as mídias grátis acabarem, cada mídia adicional custa ${brl(cota.valor)}.`
    : 'Neste momento suas mídias adicionais não têm custo.';
}

/** O que acontece se o anunciante adicionar uma mídia NESTA playlist agora. */
export function dicaDeCusto(
  cota: CotaDeMidias | undefined,
  playlistId: string | null,
): { tipo: 'gratis' | 'liberada' | 'paga' | 'sem-custo'; texto: string } | null {
  if (!cota) return null;
  if (cota.gratisPrimeiraPlaylist === 'DISPONIVEL' && (!cota.primeiraPlaylistId || cota.primeiraPlaylistId === playlistId)) {
    return { tipo: 'gratis', texto: 'A primeira mídia desta playlist é grátis (vale uma vez, só na sua primeira playlist).' };
  }
  if (cota.restantesLiberadas > 0) {
    return {
      tipo: 'liberada',
      texto: `Você tem ${cota.restantesLiberadas} ${cota.restantesLiberadas === 1 ? 'mídia grátis liberada' : 'mídias grátis liberadas'}. ${avisoDepoisDasGratis(cota)}`,
    };
  }
  if (cota.valor <= 0) return { tipo: 'sem-custo', texto: 'As mídias adicionadas à sua playlist não têm custo.' };
  return { tipo: 'paga', texto: `Cada mídia adicionada custa ${brl(cota.valor)} (PIX). A mídia grátis vale só na primeira playlist.` };
}

/** Etiqueta do item da playlist. */
export function etiquetaDoItem(origem: OrigemDoItem | null | undefined, temCobranca: boolean): { texto: string; cor: 'verde' | 'ambar' | 'azul' } | null {
  if (origem === 'GRATIS_PRIMEIRA') return { texto: 'grátis · 1ª playlist', cor: 'verde' };
  if (origem === 'CORTESIA') return { texto: 'grátis · liberada', cor: 'verde' };
  if (origem === 'VALOR_ZERO') return { texto: 'sem custo', cor: 'azul' };
  if (origem === 'PAGA' || temCobranca) return { texto: 'pago', cor: 'ambar' };
  return null;
}
