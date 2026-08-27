/**
 * FASE 17 — Ponte oficial Player ↔ RPC get_player_playlist_for_screen
 *
 * O endurecimento de RLS (20260827) revogou grants anon das tabelas de
 * conteúdo; REST direto anônimo passou a retornar 401 em todas as chamadas
 * do PlayerEngine. A fonte correta é a RPC SECURITY DEFINER oficial
 * (grant anon), que também aplica binding/tenancy server-side.
 */

export interface MediaItem {
    id: string;
    /** UUID real da mídia (para stats/playback_logs) */
    mediaId: string;
    url: string;
    type: 'video' | 'image' | 'web';
    duration: number;
}

export interface RpcPlaylistSuccess {
    ok: true;
    screenId: string;
    screenName?: string;
    customId?: string;
    orientation: 'landscape' | 'portrait';
    audioEnabled: boolean;
    items: MediaItem[];
}

export interface RpcPlaylistFailure {
    ok: false;
    /** Código oficial retornado pela RPC (ex.: DEVICE_ALREADY_BOUND) */
    code: string;
    message: string;
}

export type RpcMapResult = RpcPlaylistSuccess | RpcPlaylistFailure;

interface RpcMediaRef {
    id?: string;
    name?: string;
    file_url?: string | null;
    file_type?: string | null;
}

interface RpcItem {
    id?: string;
    position?: number;
    duration?: number;
    media?: RpcMediaRef | null;
    widget?: unknown | null;
}

interface RpcPayload {
    status?: string;
    message?: string;
    data?: {
        id?: string;
        name?: string;
        custom_id?: string;
        orientation?: string | null;
        is_active?: boolean;
        playlists?: {
            id?: string;
            name?: string;
            audio_enabled?: boolean | null;
            resolution?: string | null;
            playlist_resolution?: string | null;
            playlist_items?: RpcItem[] | null;
        } | null;
    } | null;
}

/** Mensagens de UI espelhando o contrato anterior do PlayerEngine */
const UI_MESSAGES: Record<string, string> = {
    SCREEN_NOT_FOUND: 'Tela não encontrada no painel.',
    SCREEN_SUSPENDED: 'Tela desativada pelo administrador no painel.',
    NO_PLAYLIST_ASSIGNED: '',
    PLAYLIST_EMPTY: 'Playlist vazia.',
    DEVICE_ALREADY_BOUND: 'Tela vinculada a outro dispositivo. Solicite o despareamento no painel.',
    DEVICE_REVOKED: 'Vínculo do dispositivo foi revogado. Pareie novamente.',
    DEVICE_ACCESS_DENIED: 'Dispositivo sem autorização para esta tela.',
};

function uiMessageFor(code: string): string {
    return UI_MESSAGES[code] ?? `Falha na distribuição da playlist (${code}).`;
}

/** Normaliza orientação priorizando o campo da tela; resolução como fallback */
export function normalizeOrientation(
    orientation?: string | null,
    resolution?: string | null,
): 'landscape' | 'portrait' {
    const o = String(orientation ?? '').toLowerCase();
    if (o === 'portrait' || o === 'landscape') return o;
    const r = String(resolution ?? '').toLowerCase().trim(); // ex.: "9x16", "1920x1080"
    const m = r.match(/^(\d+)\s*x\s*(\d+)$/);
    if (m) return Number(m[2]) > Number(m[1]) ? 'portrait' : 'landscape';
    if (r.includes('9x16')) return 'portrait';
    if (r.includes('16x9')) return 'landscape';
    return 'landscape';
}

/** Prefixa URL pública do Storage quando o banco guarda apenas o path */
export function resolveMediaUrl(fileUrl: string | null | undefined, baseUrl: string): string | null {
    if (!fileUrl) return null;
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
    const base = baseUrl.replace(/\/$/, '');
    return `${base}/storage/v1/object/public/media/${fileUrl.replace(/^\//, '')}`;
}

/**
 * Converte o payload oficial da RPC em itens renderizáveis.
 * Itens somente-widget são ignorados no player web (paridade com o comportamento anterior).
 */
export function mapRpcPayload(payloadRaw: unknown, storageBaseUrl: string): RpcMapResult {
    let payload: RpcPayload;
    try {
        payload = (typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : payloadRaw) as RpcPayload;
    } catch {
        return { ok: false, code: 'PAYLOAD_INVALIDO', message: 'Resposta inválida do servidor.' };
    }

    const status = String(payload?.status ?? '').toUpperCase();

    if (status !== 'SUCCESS') {
        return { ok: false, code: status || 'ERRO', message: uiMessageFor(status) };
    }

    const data = payload.data;
    if (!data?.id) {
        return { ok: false, code: 'SCREEN_NOT_FOUND', message: uiMessageFor('SCREEN_NOT_FOUND') };
    }
    if (data.is_active === false) {
        return { ok: false, code: 'SCREEN_SUSPENDED', message: uiMessageFor('SCREEN_SUSPENDED') };
    }
    if (!data.playlists?.id) {
        return { ok: false, code: 'NO_PLAYLIST_ASSIGNED', message: '' };
    }

    const rawItems = Array.isArray(data.playlists.playlist_items) ? data.playlists.playlist_items : [];
    const items: MediaItem[] = [];

    for (const item of rawItems) {
        const media = item.media;
        const url = resolveMediaUrl(media?.file_url, storageBaseUrl);
        if (!media?.id || !url) continue;

        const t = String(media.file_type ?? 'image').toLowerCase();
        items.push({
            id: item.id ?? `${media.id}:${item.position ?? items.length}`,
            mediaId: media.id,
            url,
            type: t === 'video' ? 'video' : t === 'web' ? 'web' : 'image',
            duration: Number(item.duration) > 0 ? Number(item.duration) : 10,
        });
    }

    if (items.length === 0) {
        return { ok: false, code: 'PLAYLIST_EMPTY', message: uiMessageFor('PLAYLIST_EMPTY') };
    }

    return {
        ok: true,
        screenId: data.id,
        screenName: data.name,
        customId: data.custom_id,
        orientation: normalizeOrientation(data.orientation, data.playlists.playlist_resolution ?? data.playlists.resolution),
        audioEnabled: data.playlists.audio_enabled === true,
        items,
    };
}

/**
 * Identidade estável do device para a RPC (p_device_id):
 * 1) Bridge nativa Android (identity_hash = SHA-256 de androidId+fingerprint)
 * 2) UUID persistido em localStorage (browser puro)
 */
export function resolveDeviceId(nativeBridge?: {
    getDeviceId?: () => string;
}, storage: Pick<Storage, 'getItem' | 'setItem'> = globalThis.localStorage): string {
    try {
        const nativeId = typeof nativeBridge?.getDeviceId === 'function'
            ? nativeBridge.getDeviceId()
            : null;
        if (nativeId && typeof nativeId === 'string' && nativeId.trim()) {
            return nativeId.trim();
        }
    } catch { /* bridge indisponível */ }

    const KEY = 'player_device_id_codemidia';
    try {
        const existing = storage.getItem(KEY);
        if (existing && existing.trim()) return existing.trim();
        const fresh = (globalThis.crypto?.randomUUID?.() ??
            `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`);
        storage.setItem(KEY, fresh);
        return fresh;
    } catch {
        // localStorage bloqueado — identidade efêmera por sessão
        return (globalThis.crypto?.randomUUID?.() ?? `ephemeral-${Date.now()}`);
    }
}
