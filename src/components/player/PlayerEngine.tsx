import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { supabaseConfig } from "@/supabaseConfig";
import { usePlayerHeartbeat } from "@/hooks/usePlayerHeartbeat";
import { offlineLogger } from "@/utils/offlineLogger";
import { monitoring } from "@/utils/monitoring";
import { RemoteCommandListener } from "./RemoteCommandListener";
import "./Player.css";

interface MediaItem {
    id: string;
    mediaId: string; // Real Media UUID for stats
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

            if (screen.is_active === false) {
                if (!isBackgroundUpdate) setError("Tela desativada pelo administrador.");
                setIsLoading(false); return;
            }

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
                    mediaId: media.id, // STORE REAL MEDIA ID for stats
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

    // HEARTBEAT / MONITORING (Proof of Play)
    useEffect(() => {
        if (!activeScreenId) return;

        // Send initial heartbeat
        monitoring.sendHeartbeat(activeScreenId);

        // Schedule every 5 minutes
        const heartbeatInterval = setInterval(() => {
            monitoring.sendHeartbeat(activeScreenId);
        }, 5 * 60 * 1000);

        return () => clearInterval(heartbeatInterval);
    }, [activeScreenId]);
    const logPlayback = useCallback((item: MediaItem) => {
        if (!item.mediaId) return; // Guard against missing ID

        const payload = {
            screen_id: activeScreenId || '', // Should not happen if active
            media_id: item.mediaId, // USE REAL MEDIA ID
            playlist_id: null,
            duration: item.duration,
            status: 'completed',
            started_at: new Date().toISOString()
        };
        console.log("PlayerEngine: 📤 Triggering log. Payload:", payload);
        offlineLogger.log(payload);
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
        // --- ROBUST BACKGROUND TIMER (WEB WORKER) ---
        // Browser main thread gets throttled in background. We use a Worker Blob to keep time.
        // This ensures the playlist advances even if the tab is minimized/hidden.

        const workerCode = `
            self.onmessage = function(e) {
                const { expectedTime } = e.data;
                const check = () => {
                    if (Date.now() >= expectedTime) {
                        self.postMessage('timeout');
                        self.close();
                    } else {
                        setTimeout(check, 1000);
                    }
                };
                check();
            };
        `;

        const blob = new Blob([workerCode], { type: "application/javascript" });
        const worker = new Worker(URL.createObjectURL(blob));

        const duration = (item.duration || 10) * 1000;
        let isVideo = item.type === 'video';

        const startTime = Date.now();
        const expectedEndTime = startTime + duration + 500; // +500ms buffer

        worker.onmessage = (e) => {
            if (e.data === 'timeout') {
                console.log("Player: Worker Triggered Skip (Background Safe)");
                // Clean up video listeners to avoid double triggers if they fire late
                if (videoRefs.current.get(currentIndex)) {
                    const el = videoRefs.current.get(currentIndex);
                    // Optionally force pause? No, just move on.
                }
                triggerNext();
            }
        };

        worker.postMessage({ expectedTime: expectedEndTime });

        if (isVideo) {
            const el = videoRefs.current.get(currentIndex);
            if (el) {
                el.currentTime = 0;
                el.muted = !audioEnabled;

                const playPromise = el.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.warn("Autoplay failed:", error);
                        // Worker is already running, so we don't need to do anything special here, 
                        // the worker will catch the timeout eventually.
                    });
                }

                // Standard End Listener
                const onEnded = () => {
                    worker.terminate(); // Kill worker if video finishes naturally
                    triggerNext();
                };

                // If browser pauses video (e.g. background tab), we DO NOT clear the worker.
                // The worker is our "Safety Net". If the video pauses, the worker will eventually fire "timeout".
                // This effectively implements "Virtual Playback".

                const onPause = () => {
                    if (!el.ended && document.visibilityState === 'hidden') {
                        console.log("Player: Video paused (Background). Worker will handle skip.");
                    }
                }

                el.addEventListener('ended', onEnded);
                el.addEventListener('pause', onPause);
                el.addEventListener('error', () => { worker.terminate(); triggerNext(); });

                return () => {
                    el.removeEventListener('ended', onEnded);
                    el.removeEventListener('pause', onPause);
                    worker.terminate(); // Cleanup Call 1
                };
            }
            // If ref missing, worker handles it.
        }

        // Image or Default
        return () => {
            worker.terminate(); // Cleanup Call 2
        };
    }, [currentIndex, playlist, triggerNext, audioEnabled]);

    // [ORIENTATION INTERCEPTOR] Dynamic Layout Logic
    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            const isPortrait = height > width;

            document.body.classList.toggle('is-portrait', isPortrait);
            document.body.classList.toggle('is-landscape', !isPortrait);

            // Notify custom components
            const event = new CustomEvent('layoutChanged', {
                detail: { width, height, orientation: isPortrait ? 'portrait' : 'landscape' }
            });
            window.dispatchEvent(event);

            console.log(`OrientationInterceptor: ${isPortrait ? 'PORTRAIT' : 'LANDSCAPE'} (${width}x${height})`);
        };

        window.addEventListener("orientationchange", handleResize);
        window.addEventListener("resize", handleResize);
        handleResize(); // Initial trigger

        return () => {
            window.removeEventListener("orientationchange", handleResize);
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log("Player: Tab Visible. Resuming active video if needed.");
                // Ensure video is playing if it should be
                const item = playlist[currentIndex];
                if (item?.type === 'video') {
                    const el = videoRefs.current.get(currentIndex);
                    if (el && el.paused && !el.ended) {
                        el.play().catch(() => { });
                    }
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [currentIndex, playlist]);

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
            <RemoteCommandListener screenId={activeScreenId} />
            <div
                className={`player-screen-box ${screenOrientation}`}
                style={screenOrientation === 'landscape' ? { aspectRatio: '16/9' } : {}}
            >
                {playlist.map((item, idx) => renderItem(item, idx, idx === currentIndex))}
            </div>
        </div>
    );
};
