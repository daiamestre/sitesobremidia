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

// ========================
// DIAGNOSTIC MODE - REMOVE AFTER DEBUGGING
// ========================
const DIAGNOSTIC_MODE = true;

export const PlayerEngine = () => {
    const { screenId: routeId } = useParams();

    // -- DIAGNOSTIC LOG --
    const [diagLog, setDiagLog] = useState<string[]>([]);
    const addDiag = (msg: string) => {
        const ts = new Date().toLocaleTimeString();
        console.log(`[DIAG ${ts}] ${msg}`);
        setDiagLog(prev => [...prev, `[${ts}] ${msg}`]);
    };

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
                    addDiag(`✅ Cache: loaded ${parsed.length} items`);
                    setPlaylist(parsed);
                    setIsLoading(false);
                    return true;
                }
            } catch (e) {
                addDiag(`❌ Cache corrupted: ${e}`);
            }
        }
        return false;
    }, []);

    // -- 1. SYNC ENGINE --
    const fetchPlaylist = useCallback(async (isBackgroundUpdate = false) => {
        try {
            const params = new URLSearchParams(window.location.search);
            const screenId = routeId || params.get('screen_id') || localStorage.getItem(SCREEN_ID_CACHE_KEY);

            addDiag(`🔍 Step1: screenId = "${screenId}" (routeId="${routeId}", query="${params.get('screen_id')}", cached="${localStorage.getItem(SCREEN_ID_CACHE_KEY)}")`);

            if (!screenId) {
                addDiag("❌ Step1 FAIL: No screen ID found anywhere");
                if (!isBackgroundUpdate) setError("Nenhuma tela selecionada.");
                setIsLoading(false);
                return;
            }

            localStorage.setItem(SCREEN_ID_CACHE_KEY, screenId);
            if (screenId !== activeScreenId) setActiveScreenId(screenId);

            // TRY custom_id FIRST
            addDiag(`🔍 Step2: Querying screens by custom_id="${screenId}"...`);
            let screen: any = null;

            const { data: byCustomId, error: customErr } = await supabase
                .from('screens')
                .select('id, playlist_id, custom_id, orientation, resolution, audio_enabled')
                .eq('custom_id', screenId)
                .maybeSingle();

            addDiag(`📦 Step2a: custom_id result: data=${JSON.stringify(byCustomId)}, error=${customErr ? customErr.message : 'none'}`);

            if (byCustomId) {
                screen = byCustomId;
                addDiag("✅ Step2: Found by custom_id");
            } else {
                // Fallback: try by UUID
                addDiag(`🔍 Step2b: Trying by UUID id="${screenId}"...`);
                const { data: byId, error: idErr } = await supabase
                    .from('screens')
                    .select('id, playlist_id, custom_id, orientation, resolution, audio_enabled')
                    .eq('id', screenId)
                    .maybeSingle();

                addDiag(`📦 Step2b: UUID result: data=${JSON.stringify(byId)}, error=${idErr ? idErr.message : 'none'}`);

                if (byId) {
                    screen = byId;
                    addDiag("✅ Step2: Found by UUID");
                }
            }

            if (!screen) {
                addDiag("❌ Step2 FAIL: Screen NOT FOUND by custom_id or UUID");
                if (!isBackgroundUpdate) throw new Error("Tela não encontrada.");
                return;
            }

            // Update activeScreenId with the actual DB id for heartbeat
            if (screen.id !== activeScreenId) setActiveScreenId(screen.id);

            if (!screen.playlist_id) {
                addDiag("❌ Step3 FAIL: Screen has NO playlist_id assigned");
                if (!isBackgroundUpdate) setError("Nenhuma playlist definida para esta tela.");
                setIsLoading(false);
                return;
            }

            addDiag(`✅ Step3: playlist_id="${screen.playlist_id}"`);

            // Fetch playlist items
            addDiag(`🔍 Step4: Fetching playlist_items for playlist_id="${screen.playlist_id}"...`);
            const { data: items, error: itemsError } = await supabase
                .from('playlist_items')
                .select(`
                    id, position, duration,
                    media:media_id ( file_url, file_type )
                `)
                .eq('playlist_id', screen.playlist_id)
                .order('position');

            addDiag(`📦 Step4: items=${items ? items.length : 'null'}, error=${itemsError ? itemsError.message : 'none'}`);

            if (itemsError) throw itemsError;

            if (!items || items.length === 0) {
                addDiag("❌ Step4 FAIL: No playlist items found");
                if (!isBackgroundUpdate) setError("Playlist vazia.");
                setIsLoading(false);
                return;
            }

            addDiag(`🔍 Step5: Mapping ${items.length} items to MediaItem...`);
            const mappedItems = await Promise.all((items || []).map(async (item: any, idx: number) => {
                if (!item.media) {
                    addDiag(`⚠️ Item #${idx}: media is NULL (media_id might be missing)`);
                    return null;
                }
                let finalUrl = item.media.file_url;
                addDiag(`📎 Item #${idx}: type=${item.media.file_type}, url=${finalUrl ? finalUrl.substring(0, 60) + '...' : 'NULL'}`);

                if (finalUrl && !finalUrl.startsWith('http')) {
                    addDiag(`🔑 Item #${idx}: URL is not absolute, creating signed URL...`);
                    const { data } = await supabase.storage.from('media').createSignedUrl(finalUrl, 3600);
                    if (data?.signedUrl) {
                        finalUrl = data.signedUrl;
                        addDiag(`✅ Item #${idx}: Got signed URL`);
                    } else {
                        const { data: publicData } = supabase.storage.from('media').getPublicUrl(finalUrl);
                        finalUrl = publicData.publicUrl;
                        addDiag(`✅ Item #${idx}: Using public URL: ${finalUrl?.substring(0, 60)}...`);
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

            addDiag(`✅ Step5: ${validItems.length} valid items of ${items.length} total`);

            if (validItems.length === 0) {
                addDiag("❌ Step5 FAIL: All items invalid (media null or URL null)");
                if (!isBackgroundUpdate) setError("Playlist vazia.");
            } else {
                localStorage.setItem(PLAYLIST_CACHE_KEY, JSON.stringify(validItems));

                if (!isBackgroundUpdate) {
                    setPlaylist(validItems);
                    setCurrentIndex(0);
                    setNextIndex(validItems.length > 1 ? 1 : 0);
                    setError(null);
                    setAudioEnabled(screen.audio_enabled || false);
                    addDiag(`🎬 READY: Playing ${validItems.length} items. Audio=${screen.audio_enabled || false}`);
                } else {
                    if (JSON.stringify(validItems) !== JSON.stringify(playlistRef.current)) {
                        setPendingPlaylist(validItems);
                        addDiag("🔄 Background: playlist update queued");
                    }
                }
            }

        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            addDiag(`💥 EXCEPTION: ${message}`);
            console.error("Sync Error:", err);
            if (!isBackgroundUpdate) {
                const loaded = loadFromCache();
                if (!loaded) {
                    setError(message);
                }
            }
        } finally {
            setIsLoading(false);
        }
    }, [routeId, loadFromCache]);

    // -- INIT & POLLING --
    useEffect(() => {
        addDiag("🚀 PlayerEngine mounted");
        addDiag(`📍 URL: ${window.location.href}`);
        addDiag(`🌐 Online: ${navigator.onLine}`);
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
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        setCurrentIndex(prevIndex => {
            const currentP = playlistRef.current;
            const currentLen = currentP.length;
            if (currentLen === 0) return 0;

            if (prevIndex >= currentLen - 1) {
                setPendingPlaylist(pending => {
                    if (pending) {
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
                    playPromise.catch(err => {
                        console.warn(`Autoplay blocked:`, err);
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
                const durationMs = (currentItem.duration || 10) * 1000;
                timerRef.current = setTimeout(triggerNext, durationMs);
                return () => {
                    if (timerRef.current) clearTimeout(timerRef.current);
                };
            }
        }

        // Fallback
        const durationMs = (currentItem.duration || 5) * 1000;
        timerRef.current = setTimeout(triggerNext, durationMs);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [currentIndex, playlist, triggerNext]);

    // -- PRE-BUFFER --
    useEffect(() => {
        if (playlist.length < 2) return;
        const nextItem = playlist[nextIndex];
        if (!nextItem || nextItem.type !== 'video') return;
        const nextVideoEl = videoRefs.current.get(nextIndex);
        if (nextVideoEl) {
            nextVideoEl.preload = 'auto';
            nextVideoEl.load();
        }
    }, [nextIndex, playlist]);

    // -- ACTIONS --
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => { });
        } else {
            document.exitFullscreen();
        }
    };

    // ========================
    // DIAGNOSTIC OVERLAY  
    // ========================
    if (DIAGNOSTIC_MODE && (isLoading || error || playlist.length === 0)) {
        return (
            <div style={{
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                backgroundColor: '#0a0a0a', color: '#00ff88', fontFamily: 'monospace',
                fontSize: '13px', padding: '20px', overflow: 'auto', zIndex: 99999,
            }}>
                <h2 style={{ color: '#fff', marginBottom: '10px' }}>🔬 SOBRE MÍDIA — Player Diagnostic v5.1</h2>
                <p style={{ color: '#888', marginBottom: '15px' }}>
                    Status: {isLoading ? '⏳ Loading...' : error ? `❌ Error: ${error}` : '⚠️ Empty playlist'}
                </p>
                <div style={{
                    background: '#111', border: '1px solid #333', borderRadius: '8px',
                    padding: '15px', maxHeight: '70vh', overflow: 'auto'
                }}>
                    <h3 style={{ color: '#ffaa00', marginBottom: '8px' }}>📋 Diagnostic Log:</h3>
                    {diagLog.length === 0 ? (
                        <p style={{ color: '#555' }}>Waiting for logs...</p>
                    ) : (
                        diagLog.map((log, i) => (
                            <div key={i} style={{
                                padding: '3px 0',
                                borderBottom: '1px solid #1a1a1a',
                                color: log.includes('❌') ? '#ff4444' :
                                    log.includes('✅') ? '#00ff88' :
                                        log.includes('💥') ? '#ff0000' :
                                            log.includes('⚠️') ? '#ffaa00' : '#aaa'
                            }}>
                                {log}
                            </div>
                        ))
                    )}
                </div>
                <p style={{ color: '#555', marginTop: '15px', fontSize: '11px' }}>
                    This diagnostic panel will be removed after the issue is found. Click anywhere to toggle fullscreen.
                </p>
            </div>
        );
    }

    // -- NORMAL RENDERING --
    const renderItem = (item: MediaItem, index: number, isActive: boolean) => {
        const isNext = index === nextIndex;
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
            <div className="debug-overlay" style={{ display: 'block' }}>
                v5.1.0-diag • {currentIndex + 1}/{playlist.length}
            </div>
        </div>
    );
};
