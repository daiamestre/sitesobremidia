/**
 * F-303 (pedido do dono, 12/11/2026: "grave os vídeos e deixe salvos para rodar em loop como capa, num formato leve") —
 * o ÍNDICE das capas em vídeo: um MP4 leve (H.264, 360 px, 20 qps, sem som, ~250–350 KB) + uma imagem fixa por modelo
 * de encarte e de palco, gravados por `scripts/studio/gravar-capas.mjs` em public/studio/capas/.
 * As capas do Studio TOCAM esses vídeos (o chip de vídeo do aparelho decodifica; quase nada de processador) em vez de
 * desenhar a arte ao vivo quadro a quadro — era isso que travava o tablet. Modelo mudou → rodar o script de novo.
 */
import indice from './capasEmVideo.json';

export interface CapaEmVideo { video: string; poster: string; largura: number; altura: number; segundos: number; kb?: number; nome?: string; segmento?: string; tipo?: 'encarte' | 'palco' }
const CAPAS = indice as Record<string, CapaEmVideo>;

/** a capa gravada do modelo (`encarte-<id>` ou `palco-<id>`), se existir */
export const capaEmVideo = (id: string): CapaEmVideo | null => CAPAS[id] ?? null;
export const capaDoEncarte = (idDoModelo: string) => capaEmVideo(`encarte-${idDoModelo}`);
export const capaDoPalco = (idDoFundo: string) => capaEmVideo(`palco-${idDoFundo}`);
/** F-303: todas as capas gravadas (a Biblioteca de Loop) */
export const todasAsCapas = () => Object.entries(CAPAS).map(([id, c]) => ({ id, ...c }));
