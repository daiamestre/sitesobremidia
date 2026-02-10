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

// Force clear stale Service Worker caches that block API calls
async function nukeStaleSwCaches() {
    try {
        await caches.delete('api-cache');
        await caches.delete('player-media-v1');
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) {
            await reg.update();
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    } catch { /* ignore */ }
}

export const PlayerEngine = () => {
    const { screenId: routeId } = useParams();

    const [playlist, setPlaylist] = useState<MediaItem[]>([]);
    const [pendingPlaylist, setPendingPlaylist] = useState<MediaItem[] | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [nextIndex, setNextIndex] = useState(1);
    const [activeScreenId, setActiveScreenId] = useState<string | null>(null);
    const [audioEnabled, setAudioEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [screenOrientation, setScreenOrientation] = useState<'landscape' | 'portrait'>('landscape');

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
                cache: 'no-store', // CRITICAL: bypass Service Worker cache
            });
            clearTimeout(timeoutId);

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
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

            const screenId = routeId || new URLSearchParams(window.location.search).get('screen_id') || localStorage.getItem(SCREEN_ID_CACHE_KEY);
            if (!screenId) {
                if (!isBackgroundUpdate) setError("Nenhuma tela selecionada.");
                setIsLoading(false); return;
            }
            localStorage.setItem(SCREEN_ID_CACHE_KEY, screenId);

            // Fetch screen
            let screens = await directFetch('screens', `select=*&custom_id=eq.${screenId}`, token);
            if (!screens.length) screens = await directFetch('screens', `select=*&id=eq.${screenId}`, token);

            if (!screens.length) {
                if (!isBackgroundUpdate) setError("Tela não encontrada.");
                setIsLoading(false); return;
            }

            const screen = screens[0];
            setActiveScreenId(screen.id);
            setScreenOrientation(screen.orientation || 'landscape');

            if (!screen.playlist_id) {
                if (!isBackgroundUpdate) setError("Nenhuma playlist definida.");
                setIsLoading(false); return;
            }

            // Fetch items
            const items = await directFetch(
                'playlist_items',
                `select=id,position,duration,media_id&playlist_id=eq.${screen.playlist_id}&order=position`,
                token
            );

            if (!items.length) {
                if (!isBackgroundUpdate) setError("Playlist vazia.");
                setIsLoading(false); return;
            }

            // Fetch Media
            const mediaIds = [...new Set(items.filter((i: any) => i.media_id).map((i: any) => i.media_id))];
            if (mediaIds.length === 0) {
                if (!isBackgroundUpdate) setError("Nenhuma mídia válida.");
                setIsLoading(false); return;
            }

            const inFilter = mediaIds.map(id => `"${id}"`).join(',');
            const mediaRows = await directFetch(
                'media',
                `select=id,file_url,file_type&id=in.(${inFilter})`,
                token
            );

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

                // Construct URL with query param to bypass cache if needed, but storage handles it usually
                validItems.push({
                    id: item.id,
                    url: finalUrl,
                    type: media.file_type || 'image',
                    duration: item.duration || 10,
                });
            }

            if (!validItems.length) {
                if (!isBackgroundUpdate) setError("Nenhuma mídia acessível.");
                setIsLoading(false); return;
            }

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
            console.error("Player Error:", err);
            if (!isBackgroundUpdate) {
                try {
                    const cached = localStorage.getItem(PLAYLIST_CACHE_KEY);
                    if (cached) { setPlaylist(JSON.parse(cached)); setError(null); }
                    else setError("Erro de conexão. Tentando reconectar...");
                } catch { setError("Erro crítico."); }
            }
        } finally {
            setIsLoading(false);
        }
    }, [routeId, directFetch]);

    // INIT
    useEffect(() => {
        nukeStaleSwCaches().then(() => fetchPlaylist(false));
        const interval = setInterval(() => { if (navigator.onLine) fetchPlaylist(true); }, POLL_INTERVAL_MS);
        window.addEventListener('online', () => fetchPlaylist(true));
        return () => clearInterval(interval);
    }, [fetchPlaylist]);

    // LOGGING
    const logPlayback = useCallback(async (item: MediaItem) => {
        try {
            await supabase.from('playback_logs').insert({
                screen_id: activeScreenId,
                media_id: item.id,
                playlist_id: null, // We don't track playlist_id in MediaItem currently, optional
                duration: item.duration,
                status: 'completed',
                started_at: new Date().toISOString() // Or calculate actual start
            });
        } catch (e) {
            // Fail silently if table doesn't exist yet or offline
            console.warn("Stats log failed:", e);
        }
    }, [activeScreenId]);

    // PLAYBACK LOGIC
    const triggerNext = useCallback(() => {
        // Log previous item completion
        const currentItem = playlistRef.current[currentIndex];
        if (currentItem && activeScreenId) {
            logPlayback(currentItem);
        }

        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        setCurrentIndex(prev => {
            const len = playlistRef.current.length;
            if (len === 0) return 0;
            if (prev >= len - 1) setPendingPlaylist(p => { if (p) { setPlaylist(p); return null; } return null; });
            const next = (prev + 1) % len;
            setNextIndex((next + 1) % len);
            return next;
        });
    }, [activeScreenId, currentIndex, logPlayback]);

    useEffect(() => {
        if (playlist.length === 0) return;
        const item = playlist[currentIndex];
        if (!item) return;

        // Force reset video if changing types/items
        const duration = (item.duration || 10) * 1000;

        if (item.type === 'image') {
            timerRef.current = setTimeout(triggerNext, duration);
            return () => { if (timerRef.current) clearTimeout(timerRef.current); };
        }

        if (item.type === 'video') {
            const el = videoRefs.current.get(currentIndex);
            if (el) {
                el.currentTime = 0;
                // Force muted for autoplay policy
                el.muted = !audioEnabled;
                const playPromise = el.play();

                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.warn("Autoplay failed:", error);
                        // Fallback: treat as image timer if video fails to autoplay
                        timerRef.current = setTimeout(triggerNext, duration);
                    });
                }

                const onEnded = () => triggerNext();
                const onError = () => {
                    console.error("Video error");
                    triggerNext();
                }

                el.addEventListener('ended', onEnded);
                el.addEventListener('error', onError);

                return () => {
                    el.removeEventListener('ended', onEnded);
                    el.removeEventListener('error', onError);
                    if (timerRef.current) clearTimeout(timerRef.current);
                };
            }
            // Fallback if ref missing
            timerRef.current = setTimeout(triggerNext, duration);
            return () => { if (timerRef.current) clearTimeout(timerRef.current); };
        }

        // Default timer
        timerRef.current = setTimeout(triggerNext, 5000);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [currentIndex, playlist, triggerNext, audioEnabled]);

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

    if (isLoading) {
        return (
            <div className="player-loading">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="player-error">
                <h2>{error}</h2>
                <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-white text-black rounded">
                    Tentar Novamente
                </button>
            </div>
        );
    }

    const renderItem = (item: MediaItem, idx: number, isActive: boolean) => {
        if (!item) return null;
        // Keep 3 items in DOM: prev, current, next for smooth transition
        const isNext = idx === nextIndex;
        // Simple logic: render only active and next
        if (!isActive && !isNext) return null;

        const cls = `media-layer ${isActive ? 'active' : ''}`;

        if (item.type === 'image') {
            return (
                <img
                    key={`img-${item.id}-${idx}`}
                    src={item.url}
                    className={cls}
                    alt=""
                    draggable={false}
                    onError={() => { if (isActive) triggerNext(); }}
                />
            );
        }

        if (item.type === 'video') {
            return (
                <video
                    key={`vid-${item.id}-${idx}`}
                    ref={el => { if (el) videoRefs.current.set(idx, el); else videoRefs.current.delete(idx); }}
                    src={item.url}
                    className={cls}
                    muted={!audioEnabled} // Critical for autoplay
                    playsInline
                    autoPlay={isActive}
                    crossOrigin="anonymous"
                    preload="auto"
                />
            );
        }
        return null;
    };

    return (
        <div className="player-container" onClick={toggleFullscreen}>
            <div
                className={`player-screen-box ${screenOrientation}`}
                style={screenOrientation === 'landscape' ? { aspectRatio: '16/9' } : {}}
            >
                {playlist.map((item, idx) => renderItem(item, idx, idx === currentIndex))}
            </div>
        </div>
    );
};
