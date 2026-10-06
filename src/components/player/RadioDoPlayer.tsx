/**
 * F-150 — Rádio Comércio no Player web: toca a playlist de áudio da tela em segundo plano, enquanto as mídias seguem na
 * tela (os vídeos ficam mudos pelo servidor quando a rádio está ligada). Sem nada desenhado na área de exibição.
 */
import { useEffect, useRef, useState } from 'react';
import { proximaFaixa } from '@/lib/radio';

export interface FaixaTocavel { id: string; url: string }
export interface RadioDoPlayerDados { playlistId: string; volume: number; embaralhar: boolean; faixas: FaixaTocavel[] }

/** Lê a resposta de get_player_radio_for_screen. Sem rádio, sem acesso ou resposta inválida: null (silêncio). */
export function mapRadioPayload(payloadRaw: unknown): RadioDoPlayerDados | null {
  let p: { status?: string; radio?: { playlist_id?: string; volume?: number; embaralhar?: boolean; faixas?: Array<{ id?: string; url?: string | null }> } };
  try { p = (typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : payloadRaw) as typeof p; } catch { return null; }
  const r = p?.radio;
  if (String(p?.status ?? '').toUpperCase() !== 'SUCCESS' || !r?.playlist_id || !Array.isArray(r.faixas)) return null;
  const faixas = r.faixas.filter((f) => f?.id && typeof f.url === 'string' && /^https?:\/\//.test(f.url)).map((f) => ({ id: f.id as string, url: f.url as string }));
  if (faixas.length === 0) return null;
  const volume = Number.isFinite(Number(r.volume)) ? Math.min(Math.max(Number(r.volume), 0), 100) : 70;
  return { playlistId: r.playlist_id, volume, embaralhar: r.embaralhar === true, faixas };
}

export const assinaturaDaRadio = (r: RadioDoPlayerDados | null) => (r ? `${r.playlistId}|${r.embaralhar}|${r.faixas.map((f) => f.id + f.url).join(',')}` : '');

export function RadioDoPlayer({ radio }: { radio: RadioDoPlayerDados | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [indice, setIndice] = useState(0);
  const assinatura = assinaturaDaRadio(radio);

  useEffect(() => { setIndice(0); }, [assinatura]);
  useEffect(() => { if (audio.current && radio) audio.current.volume = radio.volume / 100; }, [radio?.volume, radio, indice]);

  const faixa = radio ? radio.faixas[Math.min(indice, radio.faixas.length - 1)] : null;

  useEffect(() => {
    const el = audio.current;
    if (!el || !faixa) return;
    let cancelado = false;
    const tocar = () => { el.play().catch(() => { /* o navegador pode exigir um toque antes do primeiro som */ }); };
    tocar();
    // navegador comum bloqueia som sem interação: o primeiro toque na tela libera a rádio
    const liberar = () => { if (!cancelado) tocar(); };
    document.addEventListener('pointerdown', liberar, { once: true });
    return () => { cancelado = true; document.removeEventListener('pointerdown', liberar); };
  }, [faixa?.id, faixa?.url, faixa]);

  if (!radio || !faixa) return null;
  const avancar = () => setIndice((i) => { const n = proximaFaixa(radio.faixas.length, i, radio.embaralhar); return n < 0 ? 0 : n; });
  return (
    <audio ref={audio} key={`${faixa.id}-${indice}`} src={faixa.url} autoPlay preload="auto" loop={radio.faixas.length === 1}
      onEnded={avancar} onError={() => { if (radio.faixas.length > 1) avancar(); }} style={{ display: 'none' }} data-testid="radio-do-player" />
  );
}
