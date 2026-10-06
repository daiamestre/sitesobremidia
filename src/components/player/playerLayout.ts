/**
 * F-147 — Player web: leitura do contrato get_player_layout_for_screen (divisão da tela em zonas).
 * Lógica pura; os itens de cada zona usam o MESMO mapeamento da playlist principal (mapRpcPayload).
 */
import { mapRpcPayload, type MediaItem } from './playerPlaylist';
import type { ModoEncaixe } from '@/lib/layoutZonas';

export interface ZonaDoPlayer {
  id: string;
  numero: number;
  x: number;
  y: number;
  largura: number;
  altura: number;
  ordemZ: number;
  modoEncaixe: ModoEncaixe;
  principal: boolean;
  audio: boolean;
  itens: MediaItem[];
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
  id?: string; numero?: number; x?: number; y?: number; largura?: number; altura?: number; ordem_z?: number;
  modo_encaixe?: string; principal?: boolean; audio?: boolean;
  playlist?: { id?: string; playlist_items?: unknown[] } | null;
}

/**
 * Converte a resposta do servidor. Devolve null quando a tela não tem divisão (SEM_LAYOUT), o aparelho não tem
 * acesso ou a resposta é inválida — nesses casos o Player segue em tela cheia, como sempre.
 * `itensPrincipais` = itens da playlist da tela (a zona principal toca essa playlist).
 */
export function mapLayoutPayload(payloadRaw: unknown, itensPrincipais: MediaItem[], storageBaseUrl: string): LayoutDoPlayer | null {
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
    let itens: MediaItem[] = [];
    if (z.principal) itens = itensPrincipais;
    else if (z.playlist?.id) {
      const r = mapRpcPayload({ status: 'SUCCESS', data: { id: z.id, playlists: z.playlist } }, storageBaseUrl);
      if (r.ok === true) itens = r.items;
    }
    const modo = String(z.modo_encaixe ?? 'CONTER').toUpperCase();
    zonas.push({
      id: z.id, numero: Number(z.numero) || zonas.length + 1, x: Number(z.x) || 0, y: Number(z.y) || 0, largura: w, altura: h,
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
  return JSON.stringify([l.id, l.largura, l.altura, l.corFundo, l.zonas.map((z) => [z.id, z.x, z.y, z.largura, z.altura, z.ordemZ, z.modoEncaixe, z.audio, z.itens.map((i) => [i.id, i.mediaId, i.url, i.duration])])]);
}
