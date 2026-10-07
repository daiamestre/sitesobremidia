/**
 * F-147 — Player web: leitura do contrato get_player_layout_for_screen (divisão da tela em zonas).
 * Lógica pura; os itens de cada zona usam o MESMO mapeamento da playlist principal (mapRpcPayload).
 */
import { resolveMediaUrl, type MediaItem } from './playerPlaylist';
import type { ModoEncaixe } from '@/lib/layoutZonas';

/** Item de uma zona: mídia (imagem/vídeo) ou widget desenhado dentro da zona. */
export interface ItemDaZona extends Omit<MediaItem, 'type'> {
  type: MediaItem['type'] | 'widget';
  widgetType?: string;
  widgetConfig?: Record<string, unknown> | null;
}

export interface ZonaDoPlayer {
  id: string;
  /** F-154: giro da mídia dentro da zona (0, 90, 180 ou 270 graus) */
  rotacao: 0 | 90 | 180 | 270;
  numero: number;
  x: number;
  y: number;
  largura: number;
  altura: number;
  ordemZ: number;
  modoEncaixe: ModoEncaixe;
  principal: boolean;
  audio: boolean;
  itens: ItemDaZona[];
}

export interface LayoutDoPlayer {
  id: string;
  /** id da tela (para a prova de exibição quando a tela não tem playlist principal) */
  telaId: string | null;
  versao: number;
  largura: number;
  altura: number;
  corFundo: string;
  zonas: ZonaDoPlayer[];
}

interface ZonaBruta {
  id?: string; numero?: number; rotacao?: number; x?: number; y?: number; largura?: number; altura?: number; ordem_z?: number;
  modo_encaixe?: string; principal?: boolean; audio?: boolean;
  /** só na principal: itens da playlist da tela que são anúncios vendidos para OUTRA zona */
  excluir_itens?: string[];
  playlist?: { id?: string; playlist_items?: ItemBruto[] } | null;
}

interface ItemBruto {
  id?: string; position?: number; duration?: number;
  media?: { id?: string; file_url?: string | null; file_type?: string | null } | null;
  widget?: { id?: string; widget_type?: string; config?: Record<string, unknown> | null } | null;
}

/** Itens de uma zona: mídias como na playlist principal e, além disso, os widgets (desenhados dentro da zona). */
export function itensDaZona(brutos: ItemBruto[] | undefined, storageBaseUrl: string, widgetAceito: (tipo: string) => boolean): ItemDaZona[] {
  const itens: ItemDaZona[] = [];
  for (const it of Array.isArray(brutos) ? brutos : []) {
    const duracao = Number(it.duration) > 0 ? Number(it.duration) : 10;
    const url = resolveMediaUrl(it.media?.file_url, storageBaseUrl);
    if (it.media?.id && url) {
      const t = String(it.media.file_type ?? 'image').toLowerCase();
      itens.push({ id: it.id ?? `${it.media.id}:${it.position ?? itens.length}`, mediaId: it.media.id, url, type: t === 'video' ? 'video' : 'image', duration: duracao });
    } else if (it.widget?.id && it.widget.widget_type && widgetAceito(it.widget.widget_type)) {
      itens.push({ id: it.id ?? `w:${it.widget.id}:${it.position ?? itens.length}`, mediaId: `widget:${it.widget.id}`, url: '', type: 'widget', duration: duracao,
                   widgetType: it.widget.widget_type, widgetConfig: it.widget.config ?? null });
    }
  }
  return itens;
}

/**
 * Converte a resposta do servidor. Devolve null quando a tela não tem divisão (SEM_LAYOUT), o aparelho não tem
 * acesso ou a resposta é inválida — nesses casos o Player segue em tela cheia, como sempre.
 * `itensPrincipais` = itens da playlist da tela (a zona principal toca essa playlist).
 */
export function mapLayoutPayload(payloadRaw: unknown, itensPrincipais: MediaItem[], storageBaseUrl: string, widgetAceito: (tipo: string) => boolean = () => false): LayoutDoPlayer | null {
  let p: { status?: string; layout?: { id?: string; tela_id?: string; versao?: number; largura?: number; altura?: number; cor_fundo?: string; zonas?: ZonaBruta[] } };
  try { p = (typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : payloadRaw) as typeof p; } catch { return null; }
  const l = p?.layout;
  if (String(p?.status ?? '').toUpperCase() !== 'SUCCESS' || !l?.id) return null;
  const largura = Number(l.largura); const altura = Number(l.altura);
  if (!(largura > 0 && altura > 0) || !Array.isArray(l.zonas) || l.zonas.length === 0) return null;

  const zonas: ZonaDoPlayer[] = [];
  for (const z of l.zonas) {
    const w = Number(z.largura); const h = Number(z.altura);
    if (!z.id || !(w > 0 && h > 0)) continue;
    let itens: ItemDaZona[] = [];
    if (z.principal) {
      // anúncio vendido para outra zona não se repete na principal
      const fora = new Set(Array.isArray(z.excluir_itens) ? z.excluir_itens : []);
      itens = fora.size ? itensPrincipais.filter((i) => !fora.has(i.id)) : itensPrincipais;
    } else if (z.playlist?.id) itens = itensDaZona(z.playlist.playlist_items, storageBaseUrl, widgetAceito);
    const modo = String(z.modo_encaixe ?? 'CONTER').toUpperCase();
    zonas.push({
      id: z.id, rotacao: ([90, 180, 270] as number[]).includes(Number(z.rotacao)) ? (Number(z.rotacao) as 90 | 180 | 270) : 0, numero: Number(z.numero) || zonas.length + 1, x: Number(z.x) || 0, y: Number(z.y) || 0, largura: w, altura: h,
      ordemZ: Number(z.ordem_z) || 0, modoEncaixe: modo === 'COBRIR' || modo === 'ESTICAR' ? modo : 'CONTER',
      principal: z.principal === true, audio: z.audio === true, itens,
    });
  }
  if (zonas.length === 0) return null;
  return { id: l.id, telaId: l.tela_id ?? null, versao: Number(l.versao) || 1, largura, altura, corFundo: /^#[0-9A-Fa-f]{6}$/.test(String(l.cor_fundo)) ? String(l.cor_fundo) : '#000000', zonas };
}

/** Assinatura do layout: muda quando posição, tamanho ou conteúdo de alguma zona muda. */
export function assinaturaDoLayout(l: LayoutDoPlayer | null): string {
  if (!l) return '';
  return JSON.stringify([l.id, l.largura, l.altura, l.corFundo, l.zonas.map((z) => [z.id, z.x, z.y, z.largura, z.altura, z.ordemZ, z.modoEncaixe, z.rotacao, z.audio, z.itens.map((i) => [i.id, i.mediaId, i.url, i.duration, i.widgetType ?? '', i.widgetConfig ? JSON.stringify(i.widgetConfig).length : 0])])]);
}
