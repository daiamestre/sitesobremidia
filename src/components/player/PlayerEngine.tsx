import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, WifiOff } from "lucide-react";
import "./Player.css";

interface MediaItem {
    id: string;
    url: string;
    type: 'video' | 'image' | 'web';
    duration: number;
}

const PLAYLIST_CACHE_KEY = "player_playlist_codemidia";
const SCREEN_ID_CACHE_KEY = "player_screen_id_codemidia";
const POLL_INTERVAL_MS = 30000; // Check for updates every 30s

export const PlayerEngine = () => {
    const { screenId: routeId } = useParams();

    // -- STATE --
    const [playlist, setPlaylist] = useState<MediaItem[]>([]);
    const [pendingPlaylist, setPendingPlaylist] = useState<MediaItem[] | null>(null); // For hot-swaps
    const [currentIndex, setCurrentIndex] = useState(0);
    const [nextIndex, setNextIndex] = useState(1);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hasStarted, setHasStarted] = useState(false);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    // -- REFS --
    const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());

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

    // -- 1. SYNC ENGINE (FETCH & PERSIST) --
    const fetchPlaylist = useCallback(async (isBackgroundUpdate = false) => {
        try {
            const params = new URLSearchParams(window.location.search);
            const screenId = routeId || params.get('screen_id') || localStorage.getItem(SCREEN_ID_CACHE_KEY);

            if (!screenId) {
                if (!isBackgroundUpdate) setError("Nenhuma tela selecionada.");
                setIsLoading(false);
                return;
            }

            // Save ID for future offline boots
            localStorage.setItem(SCREEN_ID_CACHE_KEY, screenId);

            // Fetch Screen
            const { data: screen, error: screenError } = await supabase
                .from('screens')
                .select('playlist_id, custom_id')
                .eq('custom_id', screenId)
                .single();

            if (screenError || !screen?.playlist_id) {
                if (!isBackgroundUpdate) throw new Error("Tela não encontrada.");
                return;
            }

            // Fetch Items
            const { data: items, error: itemsError } = await supabase
                .from('playlist_items')
                .select(`
                    id, position, duration,
                    media:media_id ( file_url, file_type )
                `)
                .eq('playlist_id', screen.playlist_id)
                .order('position');

            if (itemsError) throw itemsError;

            // Sign URLs & Map
            const mappedItems = await Promise.all(items.map(async (item: any) => {
                if (!item.media) return null;
                let finalUrl = item.media.file_url;

                // Only sign if needed (skip if already full public URL)
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
                // PERSIST
                localStorage.setItem(PLAYLIST_CACHE_KEY, JSON.stringify(validItems));

                // STRATEGY: IF INITIAL LOAD, SET IMMEDIATELY. IF UPDATE, SET PENDING.
                if (!isBackgroundUpdate) {
                    setPlaylist(validItems);
                    setNextIndex(validItems.length > 1 ? 1 : 0);
                    setError(null);
                } else {
                    // Check if different to avoid unnecessary re-renders
                    if (JSON.stringify(validItems) !== JSON.stringify(playlist)) {
                        console.log("New playlist update detected. Queued for next loop.");
                        setPendingPlaylist(validItems);
                    }
                }
            }

        } catch (err: unknown) {
            console.error("Sync Error:", err);
            if (!isBackgroundUpdate) {
                // Try cache fallback on error
                const loaded = loadFromCache();
                if (!loaded) {
                    const message = err instanceof Error ? err.message : String(err);
                    setError(message);
                }
            }
        } finally {
            setIsLoading(false);
        }
    }, [routeId, playlist, loadFromCache]);

    // -- INIT & POLLING --
    useEffect(() => {
        fetchPlaylist(false);

        // Background Polling
        const interval = setInterval(() => {
            if (navigator.onLine) fetchPlaylist(true);
        }, POLL_INTERVAL_MS);

        // Network Listeners
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


    // -- 2. PLAYBACK CONTROLLER (LOOP & HOT-SWAP) --
    // Must depend on playlist, but be careful with closure staleness if using timers.
    // Using functional state setPlaylist helps, but here we update indexes.

    const triggerNext = useCallback(() => {
        setPlaylist((currentPlaylist) => {
            // We use 'setPlaylist' just to access the latest state safely, 
            // but we must be careful not to trigger re-renders if nothing changes.
            // Actually, we need to read 'currentIndex' too. 
            // Better to just rely on the 'currentIndex' from scope if dependency array is correct.
            return currentPlaylist;
        });

        // NOTE: In this complex state dependent logic, using functional updates for everything is safer
        setCurrentIndex(prevIndex => {
            const currentLen = playlist.length;
            if (currentLen === 0) return 0;

            // HOT SWAP CHECK
            if (prevIndex >= currentLen - 1) {
                // End of loop
                if (pendingPlaylist) {
                    console.log("Applying pending playlist update...");
                    setPlaylist(pendingPlaylist);
                    setPendingPlaylist(null);
                    // Recalculate Next
                    setNextIndex(pendingPlaylist.length > 1 ? 1 : 0);
                    return 0;
                }
            }

            const next = (prevIndex + 1) % currentLen;
            setNextIndex((next + 1) % currentLen);
            return next;
        });

    }, [playlist, pendingPlaylist]);


    // -- 3. MEDIA LIFECYCLE (WATCHDOG & ERROR SHIELD) --
    useEffect(() => {
        if (!hasStarted || playlist.length === 0) return;

        const currentItem = playlist[currentIndex];

        // IMAGE LOGIC
        if (currentItem.type === 'image') {
            const durationMs = (currentItem.duration || 10) * 1000;
            const timer = setTimeout(triggerNext, durationMs);
            return () => clearTimeout(timer);
        }

        // VIDEO LOGIC
        const videoEl = videoRefs.current.get(currentIndex);

        if (currentItem.type === 'video' && videoEl) {
            // Reset state
            videoEl.currentTime = 0;

            // Promise-based Play
            const playPromise = videoEl.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn(`Autoplay blocked or codec error (Item ${currentIndex}):`, error);
                    // TRY-SKIP LOGIC: Move to next immediately if play fails
                    triggerNext();
                });
            }

            const onEnded = () => triggerNext();
            const onError = (e: any) => {
                console.error(`Media Error (Item ${currentIndex}):`, e);
                triggerNext(); // Fail-safe skip
            };

            videoEl.addEventListener('ended', onEnded);
            videoEl.addEventListener('error', onError);

            return () => {
                videoEl.removeEventListener('ended', onEnded);
                videoEl.removeEventListener('error', onError);
                // Soft pause
                videoEl.pause();
            };
        }

        // Fallback for unknown types
        const timer = setTimeout(triggerNext, 5000);
        return () => clearTimeout(timer);

    }, [currentIndex, hasStarted, playlist, triggerNext]);


    // -- RENDERING --

    if (isLoading) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0F172A] text-white">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
                <p>Inicializando Player Enterprise...</p>
            </div>
        );
    }

    // Critical Error (No Cache, No Net) OR Empty Playlist
    if (error || playlist.length === 0) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-black text-white p-8 text-center">
                {/* STANDBY LOGO PLACEHOLDER */}
                <div className="w-32 h-32 bg-indigo-900 rounded-full flex items-center justify-center mb-6 animate-pulse">
                    <span className="text-4xl font-bold">S</span>
                </div>
                <h2 className="text-2xl font-bold mb-2">Standby</h2>
                <p className="text-slate-400 mb-4">{error || "Aguardando Programação..."}</p>
                {isOffline && <div className="flex items-center text-yellow-500 gap-2"><WifiOff size={20} /> Modo Offline</div>}
            </div>
        );
    }

    if (!hasStarted) {
        return (
            <div className="start-overlay" onClick={() => setHasStarted(true)}>
                <div className="bg-indigo-600 rounded-full p-6 animate-bounce shadow-2xl">
                    <svg className="w-16 h-16 text-white pl-2" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </div>
                <p className="mt-8 text-white font-bold text-2xl tracking-widest uppercase">Iniciar Apresentação</p>
            </div>
        );
    }

    const renderItem = (item: MediaItem, index: number, isActive: boolean) => {
        const isNext = index === nextIndex;
        // Optimization: Keep DOM light, mostly just 2 items.
        if (!isActive && !isNext && playlist.length > 2) return null;

        const commonClasses = `media-layer ${isActive ? 'active' : ''}`;

        // SAFETY: Handle null item (just in case)
        if (!item) return null;

        if (item.type === 'image') {
            return (
                <img
                    key={`img-${item.id}-${index}`}
                    src={item.url}
                    className={commonClasses}
                    alt="slide"
                    onError={() => { console.error("Image Load Fail"); triggerNext(); }}
                    style={{ backgroundColor: 'black' }} // Avoid white flash
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
                    muted
                    playsInline
                    preload="auto"
                />
            );
        }
        return null;
    };

    return (
        <div className="player-container">
            {playlist.map((item, idx) => renderItem(item, idx, idx === currentIndex))}

            {/* Enterprise HUD (Hidden in production or via keyboard shortcut) */}
            <div className="debug-overlay">
                SSM ENTERPRISE v4.0<br />
                Status: {isOffline ? 'OFFLINE (Cache)' : 'ONLINE'}<br />
                Item: {currentIndex + 1}/{playlist.length}<br />
                {pendingPlaylist && <span className="text-yellow-400">Update Queued</span>}
            </div>
        </div>
    );
};
