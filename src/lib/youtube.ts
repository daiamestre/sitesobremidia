/**
 * Widget YouTube: só pelo player OFICIAL (embed youtube-nocookie). Nada de baixar ou raspar vídeo.
 * Mesma regra no Player Android (widget/YoutubeLink.kt).
 */
export interface YoutubeRef {
  tipo: 'video' | 'playlist';
  /** id do vídeo (11 caracteres) ou da playlist (PL..., UU..., etc.) */
  id: string;
}

const VIDEO = /^[A-Za-z0-9_-]{11}$/;
const LISTA = /^[A-Za-z0-9_-]{10,64}$/;

/**
 * Aceita: youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /live/ID, /embed/ID, playlist?list=ID
 * e o id de canal "UC..." (vira a playlist de envios "UU..."). @handle não é aceito (exige API).
 */
export function lerYoutube(entrada: string | null | undefined): YoutubeRef | null {
  const t = (entrada || '').trim();
  if (!t) return null;
  if (/^UC[A-Za-z0-9_-]{22}$/.test(t)) return { tipo: 'playlist', id: 'UU' + t.slice(2) };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  const partes = u.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be') return VIDEO.test(partes[0] || '') ? { tipo: 'video', id: partes[0] } : null;
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  const v = u.searchParams.get('v');
  if (v && VIDEO.test(v)) return { tipo: 'video', id: v };
  if (['shorts', 'live', 'embed'].includes(partes[0]) && VIDEO.test(partes[1] || '')) return { tipo: 'video', id: partes[1] };
  if (partes[0] === 'channel' && /^UC[A-Za-z0-9_-]{22}$/.test(partes[1] || '')) return { tipo: 'playlist', id: 'UU' + partes[1].slice(2) };
  const list = u.searchParams.get('list');
  if (list && LISTA.test(list)) return { tipo: 'playlist', id: list };
  return null;
}

/** URL do player oficial: sem som (autoplay só é permitido mudo), sem controles, repetindo. */
export function youtubeEmbedUrl(ref: YoutubeRef): string {
  const p = new URLSearchParams({ autoplay: '1', mute: '1', controls: '0', rel: '0', playsinline: '1', modestbranding: '1', loop: '1' });
  if (ref.tipo === 'video') {
    p.set('playlist', ref.id); // necessário para o loop de um vídeo só
    return `https://www.youtube-nocookie.com/embed/${ref.id}?${p}`;
  }
  p.set('list', ref.id);
  return `https://www.youtube-nocookie.com/embed/videoseries?${p}`;
}
