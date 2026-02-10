import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { supabaseConfig } from "@/supabaseConfig";
import { usePlayerHeartbeat } from "@/hooks/usePlayerHeartbeat";
import "./Player.css";

interface MediaItem {
    id: string;
    url: string;
    type: 'video' | 'image' | 'web';
    duration: number;
}

const PLAYLIST_CACHE_KEY = "player_playlist_codemidia";
const SCREEN_ID_CACHE_KEY = "player_screen_id_codemidia";
const POLL_INTERVAL_MS = 30000;
const DIAG = true;

// Force clear stale Service Worker caches that block API calls
async function nukeStaleSwCaches() {
    try {
        // Delete the old api-cache that stored broken responses
        await caches.delete('api-cache');
        await caches.delete('player-media-v1');

        // Force SW to update
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) {
            await reg.update();
            if (reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
        }
    } catch { /* ignore */ }
}

export const PlayerEngine = () => {
    const { screenId: routeId } = useParams();

    const [diagLog, setDiagLog] = useState<string[]>([]);
    const diagLogRef = useRef<string[]>([]);
    const addDiag = useCallback((msg: string) => {
        const ts = new Date().toLocaleTimeString();
        const entry = `[${ts}] ${msg}`;
        console.log(`[DIAG] ${entry}`);
        diagLogRef.current = [...diagLogRef.current, entry];
        setDiagLog([...diagLogRef.current]);
    }, []);

    const [playlist, setPlaylist] = useState<MediaItem[]>([]);
    const [pendingPlaylist, setPendingPlaylist] = useState<MediaItem[] | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [nextIndex, setNextIndex] = useState(1);
    const [activeScreenId, setActiveScreenId] = useState<string | null>(null);
    const [audioEnabled, setAudioEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    usePlayerHeartbeat(activeScreenId);

    const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
    const playlistRef = useRef<MediaItem[]>([]);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { playlistRef.current = playlist; }, [playlist]);

    // ============================================================
    // DIRECT FETCH — completely bypass Supabase client AND Service Worker
    // ============================================================
    const directFetch = useCallback(async (table: string, queryParams: string, token: string | null): Promise<any[]> => {
        const url = `${supabaseConfig.url}/rest/v1/${table}?${queryParams}`;
        const headers: Record<string, string> = {
            'apikey': supabaseConfig.key,
            'Authorization': `Bearer ${token || supabaseConfig.key}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        try {
            const resp = await fetch(url, {
                headers,
                signal: controller.signal,
                // CRITICAL: bypass Service Worker cache
                cache: 'no-store',
            });
            clearTimeout(timeoutId);

            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`HTTP ${resp.status}: ${text.substring(0, 80)}`);
            }
            return await resp.json();
        } catch (e: any) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') throw new Error('TIMEOUT 6s');
            throw e;
        }
    }, []);

    const fetchPlaylist = useCallback(async (isBackgroundUpdate = false) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || null;
            addDiag(`🔑 ${session ? `uid=${session.user.id.substring(0, 8)}` : 'anon'}`);

            const screenId = routeId || new URLSearchParams(window.location.search).get('screen_id') || localStorage.getItem(SCREEN_ID_CACHE_KEY);
            if (!screenId) { setError("Nenhuma tela selecionada."); setIsLoading(false); return; }
            localStorage.setItem(SCREEN_ID_CACHE_KEY, screenId);
            addDiag(`🔍 screen="${screenId}"`);

            // ALL queries via direct fetch with cache:no-store
            addDiag(`📡 Fetching screen...`);
            let screens = await directFetch('screens', `select=*&custom_id=eq.${screenId}`, token);
            if (!screens.length) {
                screens = await directFetch('screens', `select=*&id=eq.${screenId}`, token);
            }
            if (!screens.length) { setError("Tela não encontrada."); setIsLoading(false); return; }

            const screen = screens[0];
            setActiveScreenId(screen.id);
            addDiag(`✅ screen found: ${screen.id.substring(0, 8)}`);

            if (!screen.playlist_id) { setError("Nenhuma playlist definida."); setIsLoading(false); return; }

            addDiag(`📡 Fetching playlist items...`);
            const items = await directFetch(
                'playlist_items',
                `select=id,position,duration,media_id&playlist_id=eq.${screen.playlist_id}&order=position`,
                token
            );
            if (!items.length) { setError("Playlist vazia."); setIsLoading(false); return; }
            addDiag(`✅ ${items.length} items`);

            // MEDIA — the problematic table
            const mediaIds = [...new Set(items.filter((i: any) => i.media_id).map((i: any) => i.media_id))];
            addDiag(`📡 Fetching ${mediaIds.length} media (cache:no-store)...`);

            const inFilter = mediaIds.map(id => `"${id}"`).join(',');
            const mediaRows = await directFetch(
                'media',
                `select=id,file_url,file_type&id=in.(${inFilter})`,
                token
            );
            addDiag(`✅ ${mediaRows.length} media rows!`);

            const mediaMap: Record<string, any> = {};
            for (const m of mediaRows) mediaMap[m.id] = m;

            // Build playlist
            const validItems: MediaItem[] = [];
            for (const item of items) {
                const media = item.media_id ? mediaMap[item.media_id] : null;
                if (!media?.file_url) continue;

                let finalUrl = media.file_url;
                if (!finalUrl.startsWith('http')) {
                    finalUrl = `${supabaseConfig.url}/storage/v1/object/public/media/${finalUrl}`;
                }
                validItems.push({
                    id: item.id,
                    url: finalUrl,
                    type: media.file_type || 'image',
                    duration: item.duration || 10,
                });
            }

            addDiag(`🎬 ${validItems.length} valid → PLAYING!`);

            if (!validItems.length) { setError("Nenhuma mídia válida."); setIsLoading(false); return; }

            localStorage.setItem(PLAYLIST_CACHE_KEY, JSON.stringify(validItems));

            if (!isBackgroundUpdate) {
                setPlaylist(validItems);
                setCurrentIndex(0);
                setNextIndex(validItems.length > 1 ? 1 : 0);
                setError(null);
                setAudioEnabled(!!screen.audio_enabled);
            } else if (JSON.stringify(validItems) !== JSON.stringify(playlistRef.current)) {
                setPendingPlaylist(validItems);
            }

        } catch (err: any) {
            addDiag(`💥 ${err?.message || err}`);
            if (!isBackgroundUpdate) {
                // Try cache
                try {
                    const cached = localStorage.getItem(PLAYLIST_CACHE_KEY);
                    if (cached) { setPlaylist(JSON.parse(cached)); setError(null); }
                    else setError(err?.message || 'Error');
                } catch { setError(err?.message || 'Error'); }
            }
        } finally {
            setIsLoading(false);
        }
    }, [routeId, addDiag, directFetch]);

    // INIT
    useEffect(() => {
        addDiag("🚀 v6.0 (all direct fetch, no SW cache)");
        // Nuke stale SW caches FIRST
        nukeStaleSwCaches().then(() => {
            addDiag("🧹 Stale caches cleared");
            fetchPlaylist(false);
        });

        const interval = setInterval(() => { if (navigator.onLine) fetchPlaylist(true); }, POLL_INTERVAL_MS);
        window.addEventListener('online', () => fetchPlaylist(true));
        return () => clearInterval(interval);
    }, [fetchPlaylist, addDiag]);

    // PLAYBACK
    const triggerNext = useCallback(() => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        setCurrentIndex(prev => {
            const len = playlistRef.current.length;
            if (len === 0) return 0;
            if (prev >= len - 1) setPendingPlaylist(p => { if (p) { setPlaylist(p); return null; } return null; });
            const next = (prev + 1) % len;
            setNextIndex((next + 1) % len);
            return next;
        });
    }, []);

    useEffect(() => {
        if (playlist.length === 0) return;
        const item = playlist[currentIndex];
        if (!item) return;
        if (item.type === 'image') {
            timerRef.current = setTimeout(triggerNext, (item.duration || 10) * 1000);
            return () => { if (timerRef.current) clearTimeout(timerRef.current); };
        }
        if (item.type === 'video') {
            const el = videoRefs.current.get(currentIndex);
            if (el) {
                el.currentTime = 0;
                el.play().catch(() => { timerRef.current = setTimeout(triggerNext, (item.duration || 10) * 1000); });
                const onEnded = () => triggerNext();
                const onError = () => triggerNext();
                el.addEventListener('ended', onEnded);
                el.addEventListener('error', onError);
                return () => { el.removeEventListener('ended', onEnded); el.removeEventListener('error', onError); if (timerRef.current) clearTimeout(timerRef.current); };
            }
            timerRef.current = setTimeout(triggerNext, (item.duration || 10) * 1000);
            return () => { if (timerRef.current) clearTimeout(timerRef.current); };
        }
        timerRef.current = setTimeout(triggerNext, (item.duration || 5) * 1000);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [currentIndex, playlist, triggerNext]);

    useEffect(() => {
        if (playlist.length < 2) return;
        const next = playlist[nextIndex];
        if (next?.type === 'video') {
            const el = videoRefs.current.get(nextIndex);
            if (el) { el.preload = 'auto'; el.load(); }
        }
    }, [nextIndex, playlist]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { });
        else document.exitFullscreen();
    };

    // DIAG OVERLAY (only while loading/error)
    if (DIAG && (isLoading || error || playlist.length === 0)) {
        return (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#0a0a0a', color: '#00ff88', fontFamily: 'monospace', fontSize: '12px', padding: '16px', overflow: 'auto', zIndex: 99999 }}>
                <h2 style={{ color: '#fff', margin: '0 0 8px' }}>🔬 Player Diagnostic v6.0</h2>
                <p style={{ color: '#888', margin: '0 0 12px' }}>{isLoading ? '⏳ Loading...' : error ? `❌ ${error}` : '⚠️ Empty'}</p>
                <div style={{ background: '#111', border: '1px solid #333', borderRadius: '6px', padding: '12px' }}>
                    {diagLog.map((log, i) => (
                        <div key={i} style={{ padding: '2px 0', fontSize: '11px', color: log.includes('❌') || log.includes('💥') ? '#ff4444' : log.includes('✅') || log.includes('🎬') ? '#00ff88' : log.includes('⚠️') ? '#ffaa00' : '#aaa' }}>{log}</div>
                    ))}
                </div>
            </div>
        );
    }

    // NORMAL RENDER
    const renderItem = (item: MediaItem, idx: number, isActive: boolean) => {
        if (!item) return null;
        const isNext = idx === nextIndex;
        if (!isActive && !isNext && playlist.length > 2) return null;
        const cls = `media-layer ${isActive ? 'active' : ''}`;
        if (item.type === 'image') return <img key={`img-${item.id}-${idx}`} src={item.url} className={cls} alt="" draggable={false} onError={() => triggerNext()} />;
        if (item.type === 'video') return (
            <video key={`vid-${item.id}-${idx}`} ref={el => { if (el) videoRefs.current.set(idx, el); else videoRefs.current.delete(idx); }}
                src={item.url} className={cls} muted={!audioEnabled} playsInline crossOrigin="anonymous" preload="auto" />
        );
        return null;
    };

    return (
        <div className="player-container" onClick={toggleFullscreen}>
            {playlist.map((item, idx) => renderItem(item, idx, idx === currentIndex))}
        </div>
    );
};
