import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { supabaseConfig } from "@/supabaseConfig";
import { usePlayerHeartbeat } from "@/hooks/usePlayerHeartbeat";
import { offlineLogger } from "@/utils/offlineLogger";
import { monitoring } from "@/utils/monitoring";
import { mapRpcPayload, resolveDeviceId, type MediaItem } from "./playerPlaylist";
import { RemoteCommandListener } from "./RemoteCommandListener";
import { Monitor, AlertTriangle, RefreshCw } from "lucide-react";
import "./Player.css";

const PLAYLIST_CACHE_KEY = "player_playlist_codemidia";
const SCREEN_ID_CACHE_KEY = "player_screen_id_codemidia";
const POLL_INTERVAL_MS = 30000;

// Force clear stale Service Worker caches that block API calls
async function nukeStaleSwCaches() {
    try {
        await caches.delete('api-cache');
        await caches.delete('player-media-v1');
        await caches.delete('player-media-v2');
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) {
            await reg.update();
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    } catch { /* ignore */ }
}

// Códigos que representam estado "sem conteúdo" (não são erros de rede)
const NO_CONTENT_CODES = new Set(['NO_PLAYLIST_ASSIGNED', 'PLAYLIST_EMPTY']);

export const PlayerEngine = () => {
    const { screenId: routeId } = useParams();

    const [playlist, setPlaylist] = useState<MediaItem[]>([]);
    const [pendingPlaylist, setPendingPlaylist] = useState<MediaItem[] | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [nextIndex, setNextIndex] = useState(1);
    const [activeScreenId, setActiveScreenId] = useState<string | null>(null);
    const [audioEnabled, setAudioEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isNoPlaylist, setIsNoPlaylist] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [screenOrientation, setScreenOrientation] = useState<'landscape' | 'portrait'>('landscape');
    const [bindError, setBindError] = useState<string | null>(null);

    // Heartbeat oficial: a RPC de playlist já atualiza devices.last_seen no
    // caminho bound; o hook só deve escrever com SESSÃO autenticada (RLS).
    usePlayerHeartbeat(activeScreenId);

    const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
    const playlistRef = useRef<MediaItem[]>([]);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { playlistRef.current = playlist; }, [playlist]);

    // ============================================================
    // FASE 17 — DISTRIBUIÇÃO VIA RPC OFICIAL
    // get_player_playlist_for_screen (SECURITY DEFINER, grant anon):
    // resolve tela (custom_id/uuid), aplica binding/tenancy server-side,
    // atualiza presença do device e devolve itens + mídia + durações.
    // ============================================================
    const fetchPlaylist = useCallback(async (isBackgroundUpdate = false) => {
        try {
            const screenId = routeId || new URLSearchParams(window.location.search).get('screen_id') || localStorage.getItem(SCREEN_ID_CACHE_KEY);
            if (!screenId) {
                if (!isBackgroundUpdate) setError("Nenhuma tela selecionada ou pareada.");
                setIsLoading(false); return;
            }
            localStorage.setItem(SCREEN_ID_CACHE_KEY, screenId);

            const deviceId = resolveDeviceId(
                (globalThis as Record<string, unknown>).NativePlayer as { getDeviceId?: () => string } | undefined
            );

            const { data, error: rpcError } = await supabase.rpc(
                'get_player_playlist_for_screen',
                { p_identifier: screenId, p_device_id: deviceId },
            );

            if (rpcError) {
                if (!isBackgroundUpdate) setError(`Falha de comunicação com o servidor (${rpcError.message}).`);
                setIsLoading(false); return;
            }

            const result = mapRpcPayload(data, supabaseConfig.url);

            // [TS] Comparação explícita: com strictNullChecks off, `!result.ok`
            // não estreita a união discriminada.
            if (result.ok === false) {
                setActiveScreenId(prev => prev); // mantém vínculo anterior para heartbeat

                if (result.code === 'NO_PLAYLIST_ASSIGNED') {
                    if (!isBackgroundUpdate) {
                        setIsNoPlaylist(true);
                        setError(null);
                    }
                } else if (!isBackgroundUpdate) {
                    setIsNoPlaylist(false);
                    if (result.code === 'DEVICE_ALREADY_BOUND' || result.code === 'DEVICE_REVOKED' || result.code === 'DEVICE_ACCESS_DENIED') {
                        setBindError(result.message);
                        setError(null);
                    } else {
                        setError(result.message || 'Falha ao carregar playlist.');
                    }
                } else if (result.code === 'DEVICE_ALREADY_BOUND') {
                    // Sinaliza em background também — o operador precisa saber.
                    setBindError(prevBind => prevBind ?? result.message);
                }
                setIsLoading(false); return;
            }

            // SUCCESS
            setBindError(null);
            setIsNoPlaylist(false);
            setActiveScreenId(result.screenId);
            setScreenOrientation(result.orientation);

            localStorage.setItem(PLAYLIST_CACHE_KEY, JSON.stringify(result.items));

            // [BLOQUEADOR 2] PRE-FETCH: Dispara cache invisível no background worker
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                const urlsToCache = result.items.map(i => i.url);
                navigator.serviceWorker.controller.postMessage({
                    type: 'CACHE_MEDIA',
                    payload: { urls: urlsToCache }
                });
            }

            const mudou = JSON.stringify(playlistRef.current) !== JSON.stringify(result.items);
            if (!isBackgroundUpdate || !mudou) {
                setPlaylist(mudou ? result.items : playlistRef.current.length ? playlistRef.current : result.items);
                setCurrentIndex(0);
                setNextIndex(result.items.length > 1 ? 1 : 0);
                setError(null);
                setAudioEnabled(result.audioEnabled);
            } else {
                // Aplica somente ao encerrar o ciclo atual (evita corte abrupto)
                setPendingPlaylist(result.items);
            }
            setIsLoading(false);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!isBackgroundUpdate) setError(`Erro de rede (${msg}).`);
            setIsLoading(false);
        }
    }, [routeId]);

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
        const isVideo = item.type === 'video';

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

    if (isNoPlaylist) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8 text-center select-none">
                <div className="max-w-lg w-full bg-slate-900/90 border border-primary/30 rounded-3xl p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center gap-6">
                    <div className="p-4 rounded-2xl bg-primary/20 text-primary border border-primary/30">
                        <Monitor className="h-14 w-14" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">Tela Conectada</h2>
                    <p className="text-slate-300 text-base leading-relaxed">
                        Esta tela está conectada ao painel, mas nenhuma playlist foi atribuída a ela no Dashboard.
                    </p>
                    <p className="text-xs text-slate-500">
                        Acesse o painel administrativo pelo computador ou celular para atribuir conteúdos a esta TV.
                    </p>
                    <button 
                        onClick={() => { setIsLoading(true); fetchPlaylist(false); }}
                        className="mt-2 px-6 py-3 gradient-primary glow-primary text-white font-bold rounded-xl transition-all shadow-lg text-sm"
                    >
                        Verificar Atualizações
                    </button>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 gap-6 select-none">
                <div className="animate-spin rounded-full h-14 w-14 border-t-2 border-b-2 border-primary"></div>
                <div className="text-center space-y-2">
                    <h2 className="text-xl font-bold tracking-tight text-white">Sincronizando mídias...</h2>
                    <p className="text-sm text-slate-400">Preparando conteúdos e conferindo cache local</p>
                </div>
            </div>
        );
    }

    if (bindError) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none">
                <div className="max-w-md w-full bg-slate-900/90 border border-amber-500/30 rounded-3xl p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center gap-4">
                    <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        <AlertTriangle className="h-10 w-10" />
                    </div>
                    <h2 className="text-xl font-bold text-amber-400">Vínculo de dispositivo</h2>
                    <p className="text-sm text-slate-300">{bindError}</p>
                    <div className="flex flex-col gap-2 w-full mt-4">
                        <button
                            onClick={() => { setBindError(null); setIsLoading(true); fetchPlaylist(false); }}
                            className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm"
                        >
                            Verificar Novamente
                        </button>
                        <button
                            onClick={() => {
                                localStorage.removeItem(SCREEN_ID_CACHE_KEY);
                                localStorage.removeItem('player_device_id_codemidia');
                                window.location.href = '/device-pairing';
                            }}
                            className="w-full py-3 bg-slate-800 text-slate-300 font-semibold rounded-xl hover:bg-slate-700 transition-colors text-sm"
                        >
                            Reiniciar Pareamento
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none">
                <div className="max-w-md w-full bg-slate-900/90 border border-red-500/30 rounded-3xl p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center gap-4">
                    <div className="p-3 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30">
                        <AlertTriangle className="h-10 w-10" />
                    </div>
                    <h2 className="text-xl font-bold text-red-400">{error}</h2>
                    <div className="flex flex-col gap-2 w-full mt-4">
                        <button 
                            onClick={() => { setIsLoading(true); fetchPlaylist(false); }} 
                            className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm"
                        >
                            Tentar Novamente
                        </button>
                        <button 
                            onClick={() => {
                                localStorage.removeItem(SCREEN_ID_CACHE_KEY);
                                window.location.href = '/device-pairing';
                            }} 
                            className="w-full py-3 bg-slate-800 text-slate-300 font-semibold rounded-xl hover:bg-slate-700 transition-colors text-sm"
                        >
                            Trocar ou Vincular Tela
                        </button>
                    </div>
                </div>
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
