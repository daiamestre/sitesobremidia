import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, WifiOff } from "lucide-react";
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

export const PlayerEngine = () => {
    const { screenId: routeId } = useParams();

    // -- STATE --
    const [playlist, setPlaylist] = useState<MediaItem[]>([]);
    const [pendingPlaylist, setPendingPlaylist] = useState<MediaItem[] | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [nextIndex, setNextIndex] = useState(1);
    const [activeScreenId, setActiveScreenId] = useState<string | null>(null);
    const [audioEnabled, setAudioEnabled] = useState(false);

    // -- HEARTBEAT --
    usePlayerHeartbeat(activeScreenId);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    // -- REFS --
    const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
    const playlistRef = useRef<MediaItem[]>([]);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync Ref
    useEffect(() => {
        playlistRef.current = playlist;
    }, [playlist]);

    // -- HELPER: LOAD FROM CACHE --
    const loadFromCache = useCallback(() => {
        const cached = localStorage.getItem(PLAYLIST_CACHE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    console.log("Loaded playlist from offline cache.");
                    setPlaylist(parsed);
                    setIsLoading(false);
                    return true;
                }
            } catch (e) {
                console.error("Cache corrupted", e);
            }
        }
        return false;
    }, []);

    // -- 1. SYNC ENGINE --
    const fetchPlaylist = useCallback(async (isBackgroundUpdate = false) => {
        try {
            const params = new URLSearchParams(window.location.search);
            const screenId = routeId || params.get('screen_id') || localStorage.getItem(SCREEN_ID_CACHE_KEY);

            if (!screenId) {
                if (!isBackgroundUpdate) setError("Nenhuma tela selecionada.");
                setIsLoading(false);
                return;
            }

            localStorage.setItem(SCREEN_ID_CACHE_KEY, screenId);
            if (screenId !== activeScreenId) setActiveScreenId(screenId);

            // TRY custom_id FIRST, then fallback to UUID (id)
            let screen: any = null;

            const { data: byCustomId, error: customErr } = await supabase
                .from('screens')
                .select('id, playlist_id, custom_id, orientation, resolution, audio_enabled')
                .eq('custom_id', screenId)
                .maybeSingle();

            if (byCustomId) {
                screen = byCustomId;
            } else {
                // Fallback: try by UUID
                const { data: byId, error: idErr } = await supabase
                    .from('screens')
                    .select('id, playlist_id, custom_id, orientation, resolution, audio_enabled')
                    .eq('id', screenId)
                    .maybeSingle();

                if (byId) {
                    screen = byId;
                }
            }

            if (!screen) {
                if (!isBackgroundUpdate) throw new Error("Tela não encontrada.");
                return;
            }

            // Update activeScreenId with the actual DB id for heartbeat
            if (screen.id !== activeScreenId) setActiveScreenId(screen.id);

            if (!screen.playlist_id) {
                if (!isBackgroundUpdate) setError("Nenhuma playlist definida para esta tela.");
                setIsLoading(false);
                return;
            }

            const { data: items, error: itemsError } = await supabase
                .from('playlist_items')
                .select(`
                    id, position, duration,
                    media:media_id ( file_url, file_type )
                `)
                .eq('playlist_id', screen.playlist_id)
                .order('position');

            if (itemsError) throw itemsError;

            const mappedItems = await Promise.all((items || []).map(async (item: any) => {
                if (!item.media) return null;
                let finalUrl = item.media.file_url;

                if (finalUrl && !finalUrl.startsWith('http')) {
                    const { data } = await supabase.storage.from('media').createSignedUrl(finalUrl, 3600);
                    if (data?.signedUrl) finalUrl = data.signedUrl;
                    else {
                        const { data: publicData } = supabase.storage.from('media').getPublicUrl(finalUrl);
                        finalUrl = publicData.publicUrl;
                    }
                }

                return {
                    id: item.id,
                    url: finalUrl,
                    type: item.media.file_type || 'image',
                    duration: item.duration || 10
                };
            }));

            const validItems = mappedItems.filter((i): i is MediaItem => i !== null);

            if (validItems.length === 0) {
                if (!isBackgroundUpdate) setError("Playlist vazia.");
            } else {
                localStorage.setItem(PLAYLIST_CACHE_KEY, JSON.stringify(validItems));

                if (!isBackgroundUpdate) {
                    setPlaylist(validItems);
                    setCurrentIndex(0);
                    setNextIndex(validItems.length > 1 ? 1 : 0);
                    setError(null);
                    setAudioEnabled(screen.audio_enabled || false);
                } else {
                    if (JSON.stringify(validItems) !== JSON.stringify(playlistRef.current)) {
                        console.log("New playlist update detected. Queued.");
                        setPendingPlaylist(validItems);
                    }
                }
            }

        } catch (err: unknown) {
            console.error("Sync Error:", err);
            if (!isBackgroundUpdate) {
                const loaded = loadFromCache();
                if (!loaded) {
                    const message = err instanceof Error ? err.message : String(err);
                    setError(message);
                }
            }
        } finally {
            setIsLoading(false);
        }
    }, [routeId, loadFromCache]);

    // -- INIT & POLLING --
    useEffect(() => {
        fetchPlaylist(false);

        const interval = setInterval(() => {
            if (navigator.onLine) fetchPlaylist(true);
        }, POLL_INTERVAL_MS);

        const handleOnline = () => { setIsOffline(false); fetchPlaylist(true); };
        const handleOffline = () => setIsOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            clearInterval(interval);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [fetchPlaylist]);


    // -- 2. PLAYBACK CONTROLLER --
    const triggerNext = useCallback(() => {
        // Clear any pending timer
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        setCurrentIndex(prevIndex => {
            const currentP = playlistRef.current;
            const currentLen = currentP.length;
            if (currentLen === 0) return 0;

            // HOT SWAP CHECK: at end of playlist, apply pending update
            if (prevIndex >= currentLen - 1) {
                setPendingPlaylist(pending => {
                    if (pending) {
                        console.log("Applying pending playlist update...");
                        setPlaylist(pending);
                        return null;
                    }
                    return null;
                });
            }

            const next = (prevIndex + 1) % currentLen;
            setNextIndex((next + 1) % currentLen);
            return next;
        });

    }, []);

    // -- 3. MEDIA LIFECYCLE --
    useEffect(() => {
        if (playlist.length === 0) return;

        const currentItem = playlist[currentIndex];
        if (!currentItem) return;

        // IMAGE LOGIC
        if (currentItem.type === 'image') {
            const durationMs = (currentItem.duration || 10) * 1000;
            timerRef.current = setTimeout(triggerNext, durationMs);
            return () => {
                if (timerRef.current) clearTimeout(timerRef.current);
            };
        }

        // VIDEO LOGIC
        if (currentItem.type === 'video') {
            const videoEl = videoRefs.current.get(currentIndex);
            if (videoEl) {
                videoEl.currentTime = 0;

                const playPromise = videoEl.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.warn(`Autoplay blocked / codec error:`, error);
                        // If autoplay fails, fall back to duration timer
                        const durationMs = (currentItem.duration || 10) * 1000;
                        timerRef.current = setTimeout(triggerNext, durationMs);
                    });
                }

                const onEnded = () => triggerNext();
                const onError = (e: any) => {
                    console.error(`Media Error:`, e);
                    triggerNext();
                };

                videoEl.addEventListener('ended', onEnded);
                videoEl.addEventListener('error', onError);

                return () => {
                    videoEl.removeEventListener('ended', onEnded);
                    videoEl.removeEventListener('error', onError);
                    if (timerRef.current) clearTimeout(timerRef.current);
                };
            } else {
                // Video ref not ready, try duration-based fallback
                const durationMs = (currentItem.duration || 10) * 1000;
                timerRef.current = setTimeout(triggerNext, durationMs);
                return () => {
                    if (timerRef.current) clearTimeout(timerRef.current);
                };
            }
        }

        // Fallback for unknown types
        const durationMs = (currentItem.duration || 5) * 1000;
        timerRef.current = setTimeout(triggerNext, durationMs);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };

    }, [currentIndex, playlist, triggerNext]);

    // -- PRE-BUFFER NEXT VIDEO --
    useEffect(() => {
        if (playlist.length < 2) return;
        const nextItem = playlist[nextIndex];
        if (!nextItem || nextItem.type !== 'video') return;

        const nextVideoEl = videoRefs.current.get(nextIndex);
        if (nextVideoEl) {
            nextVideoEl.preload = 'auto';
            // Load first frames
            nextVideoEl.load();
        }
    }, [nextIndex, playlist]);

    // -- ACTIONS --
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(e => {
                console.error("Fullscreen blocked:", e);
            });
        } else {
            document.exitFullscreen();
        }
    };


    // -- RENDERING --
    if (isLoading) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-black text-white">
                <Loader2 className="w-8 h-8 animate-spin text-white/50 mb-4" />
            </div>
        );
    }

    if (error || playlist.length === 0) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-black text-white p-8 text-center">
                <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center mb-6">
                    <span className="text-3xl font-bold text-zinc-700">SM</span>
                </div>
                <p className="text-zinc-500 mb-4 text-sm uppercase tracking-widest">{error || "Aguardando Conteúdo"}</p>
                {isOffline && <div className="flex items-center text-yellow-600 gap-2 text-xs"><WifiOff size={14} /> Offline</div>}
            </div>
        );
    }

    const renderItem = (item: MediaItem, index: number, isActive: boolean) => {
        const isNext = index === nextIndex;
        // Only render active, next, and current-1 for smooth transitions
        if (!isActive && !isNext && playlist.length > 2) return null;
        if (!item) return null;

        const commonClasses = `media-layer ${isActive ? 'active' : ''}`;

        if (item.type === 'image') {
            return (
                <img
                    key={`img-${item.id}-${index}`}
                    src={item.url}
                    className={commonClasses}
                    alt=""
                    draggable={false}
                    onError={() => { console.error("Image Fail"); triggerNext(); }}
                />
            );
        }

        if (item.type === 'video') {
            return (
                <video
                    key={`vid-${item.id}-${index}`}
                    ref={(el) => {
                        if (el) videoRefs.current.set(index, el);
                        else videoRefs.current.delete(index);
                    }}
                    src={item.url}
                    className={commonClasses}
                    muted={!audioEnabled}
                    playsInline
                    crossOrigin="anonymous"
                    preload="auto"
                />
            );
        }
        return null;
    };

    return (
        <div className="player-container" onClick={toggleFullscreen}>
            {playlist.map((item, idx) => renderItem(item, idx, idx === currentIndex))}
            <div className="debug-overlay">
                v5.0.0 • {currentIndex + 1}/{playlist.length}
            </div>
        </div>
    );
};
