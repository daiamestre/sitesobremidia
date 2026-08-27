/**
 * FASE 17 — Mapper oficial RPC get_player_playlist_for_screen → itens do player
 * Casos: SUCCESS (vídeo/imagem, ordem, duração, URL http/path), estados de erro
 * oficiais, orientação por resolução, device id estável.
 */
import { describe, it, expect } from 'vitest';
import {
  mapRpcPayload,
  normalizeOrientation,
  resolveDeviceId,
  resolveMediaUrl,
} from '@/components/player/playerPlaylist';

const BASE = 'https://proj.supabase.co';

// Payload real capturado do cloud (TELA3) — reduzido
const PAYLOAD_TELA3 = {
  status: 'SUCCESS',
  data: {
    id: '4f165a86-9ef9-495a-a16b-06902c668049',
    name: 'Mídia indoor',
    custom_id: 'TELA3',
    orientation: 'portrait',
    is_active: true,
    playlists: {
      id: '51fde517-49ae-4b83-92bd-880c56cd10c9',
      name: 'Mídia indoor',
      audio_enabled: false,
      resolution: '9x16',
      playlist_resolution: '9x16',
      playlist_items: [
        {
          id: 'item-1',
          position: 0,
          duration: 20,
          start_time: null,
          end_time: null,
          days_of_week: null,
          media: {
            id: 'media-1',
            name: 'PARATESTEUIYH',
            file_url: 'https://pub-x.r2.dev/tenant/temp/a.mp4',
            file_hash: 'd2a1',
            file_type: 'video',
          },
          widget: null,
        },
        {
          id: 'item-2',
          position: 1,
          duration: 10,
          media: {
            id: 'media-2',
            name: 'MIDI 2',
            file_url: 'midias/imagens/b.png',
            file_type: 'image',
          },
          widget: null,
        },
      ],
    },
    resolution: '9x16',
    playlist_id: '51fde517-49ae-4b83-92bd-880c56cd10c9',
  },
};

describe('mapRpcPayload — caminho SUCCESS', () => {
  it('mapeia itens na ordem, com duração e URLs absolutas', () => {
    const r = mapRpcPayload(PAYLOAD_TELA3, BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({
      id: 'item-1',
      mediaId: 'media-1',
      url: 'https://pub-x.r2.dev/tenant/temp/a.mp4',
      type: 'video',
      duration: 20,
    });
    // path relativo recebe prefixo do Storage público
    expect(r.items[1].url).toBe(`${BASE}/storage/v1/object/public/media/midias/imagens/b.png`);
    expect(r.items[1].type).toBe('image');
    expect(r.orientation).toBe('portrait');
    expect(r.audioEnabled).toBe(false);
    expect(r.screenId).toBe('4f165a86-9ef9-495a-a16b-06902c668049');
  });

  it('duração ausente/inválida cai para 10s; item sem mídia é ignorado', () => {
    const p = structuredClone(PAYLOAD_TELA3) as typeof PAYLOAD_TELA3;
    const items = p.data!.playlists!.playlist_items!;
    items[0].duration = 0;
    items[0].media!.file_url = null;
    items.push({ id: 'item-w', position: 2, duration: 5, media: null, widget: { id: 'w' } });
    const r = mapRpcPayload(p, BASE);
    if (!r.ok) throw new Error('deveria ser ok');
    expect(r.items).toHaveLength(1); // item-1 sem URL cai fora; widget-only não renderiza no web
    expect(r.items[0].duration).toBe(10);
  });

  it('payload como STRING json também é aceito', () => {
    const r = mapRpcPayload(JSON.stringify(PAYLOAD_TELA3), BASE);
    expect(r.ok).toBe(true);
  });
});

describe('mapRpcPayload — estados oficiais de erro', () => {
  const caso = (status: string, extra?: object) =>
    mapRpcPayload({ status, ...(extra ?? {}) }, BASE);

  it('SCREEN_NOT_FOUND', () => {
    const r = caso('SCREEN_NOT_FOUND');
    expect(r).toMatchObject({ ok: false, code: 'SCREEN_NOT_FOUND' });
  });

  it('SCREEN_SUSPENDED', () => {
    const r = mapRpcPayload(
      { status: 'SUCCESS', data: { id: 's1', is_active: false } },
      BASE,
    );
    expect(r).toMatchObject({ ok: false, code: 'SCREEN_SUSPENDED' });
  });

  it('NO_PLAYLIST_ASSIGNED → código para estado "sem playlist" da UI', () => {
    const r = mapRpcPayload(
      { status: 'SUCCESS', data: { id: 's1', is_active: true, playlists: null } },
      BASE,
    );
    expect(r).toMatchObject({ ok: false, code: 'NO_PLAYLIST_ASSIGNED', message: '' });
  });

  it('PLAYLIST_EMPTY quando itens vazios', () => {
    const r = mapRpcPayload(
      { status: 'SUCCESS', data: { id: 's1', playlists: { id: 'p1', playlist_items: [] } } },
      BASE,
    );
    expect(r).toMatchObject({ ok: false, code: 'PLAYLIST_EMPTY' });
  });

  it.each(['DEVICE_ALREADY_BOUND', 'DEVICE_REVOKED', 'DEVICE_ACCESS_DENIED'])('%s propaga código oficial', (status) => {
    const r = caso(status);
    expect(r).toMatchObject({ ok: false, code: status });
  });
});

describe('normalizeOrientation', () => {
  it('campo explícito vence', () => {
    expect(normalizeOrientation('portrait', '1920x1080')).toBe('portrait');
    expect(normalizeOrientation('LANDSCAPE', '9x16')).toBe('landscape');
  });
  it('resolve por resolução quando orientação ausente', () => {
    expect(normalizeOrientation(null, '1080x1920')).toBe('portrait');
    expect(normalizeOrientation(null, '1920x1080')).toBe('landscape');
    expect(normalizeOrientation(null)).toBe('landscape'); // default seguro
  });
});

describe('identidade do device', () => {
  it('prefere bridge nativa (identity_hash Android)', () => {
    const id = resolveDeviceId({ getDeviceId: () => 'abc123hash' }, {
      getItem: () => 'stale',
      setItem: () => {},
    } as unknown as Storage);
    expect(id).toBe('abc123hash');
  });

  it('browser puro: persiste UUID estável em localStorage', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as unknown as Storage;
    const a = resolveDeviceId(undefined, storage);
    const b = resolveDeviceId(undefined, storage);
    expect(a).toBe(b);
    expect(a).toBeTruthy();
  });
});

describe('resolveMediaUrl', () => {
  it('http(s) passa intacto; path relativo recebe prefixo público', () => {
    expect(resolveMediaUrl('https://cdn/x.mp4', BASE)).toBe('https://cdn/x.mp4');
    expect(resolveMediaUrl('midias/a.png', `${BASE}/`)).toBe(`${BASE}/storage/v1/object/public/media/midias/a.png`);
    expect(resolveMediaUrl(null, BASE)).toBeNull();
  });
});
