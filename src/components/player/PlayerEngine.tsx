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

// DIAGNOSTIC MODE - will be removed after fix
const DIAG = true;

// Timeout wrapper for any promise
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`TIMEOUT (${ms}ms): ${label}`)), ms)
        ),
    ]);
}

export const PlayerEngine = () => {
    const { screenId: routeId } = useParams();

    // DIAGNOSTIC LOG
    const [diagLog, setDiagLog] = useState<string[]>([]);
    const diagLogRef = useRef<string[]>([]);

    const addDiag = useCallback((msg: string) => {
        const ts = new Date().toLocaleTimeString();
        const entry = `[${ts}] ${msg}`;
        console.log(`[DIAG] ${entry}`);
        diagLogRef.current = [...diagLogRef.current, entry];
        setDiagLog([...diagLogRef.current]);
    }, []);

    // STATE
    const [playlist, setPlaylist] = useState<MediaItem[]>([]);
    const [pendingPlaylist, setPendingPlaylist] = useState<MediaItem[] | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [nextIndex, setNextIndex] = useState(1);
    const [activeScreenId, setActiveScreenId] = useState<string | null>(null);
    const [audioEnabled, setAudioEnabled] = useState(false);

    usePlayerHeartbeat(activeScreenId);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
    const playlistRef = useRef<MediaItem[]>([]);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { playlistRef.current = playlist; }, [playlist]);

    const loadFromCache = useCallback(() => {
        try {
            const cached = localStorage.getItem(PLAYLIST_CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    addDiag(`✅ Cache: ${parsed.length} items loaded`);
                    setPlaylist(parsed);
                    setIsLoading(false);
                    return true;
                }
            }
        } catch (e) { addDiag(`❌ Cache error: ${e}`); }
        return false;
    }, [addDiag]);

    // MAIN SYNC
    const fetchPlaylist = useCallback(async (isBackgroundUpdate = false) => {
        try {
            const params = new URLSearchParams(window.location.search);
            const screenId = routeId || params.get('screen_id') || localStorage.getItem(SCREEN_ID_CACHE_KEY);

            addDiag(`🔍 Step1: screenId="${screenId}" (route="${routeId}")`);

            if (!screenId) {
                addDiag("❌ No screen ID");
                if (!isBackgroundUpdate) setError("Nenhuma tela selecionada.");
                setIsLoading(false);
                return;
            }

            localStorage.setItem(SCREEN_ID_CACHE_KEY, screenId);

            // STEP 2: Find screen — try custom_id, then UUID
            // Use .select('*') to avoid column-not-found errors
            addDiag(`🔍 Step2: Querying by custom_id="${screenId}"...`);

            let screen: any = null;

            try {
                const result = await withTimeout(
                    supabase
                        .from('screens')
                        .select('*')
                        .eq('custom_id', screenId)
                        .maybeSingle(),
                    8000,
                    'screens.custom_id query'
                );
                addDiag(`📦 Step2a: data=${result.data ? 'FOUND' : 'null'}, error=${result.error ? result.error.message : 'none'}, code=${result.error?.code || 'n/a'}`);

                if (result.data) {
                    screen = result.data;
                }
            } catch (e: any) {
                addDiag(`⚠️ Step2a failed: ${e.message}`);
            }

            if (!screen) {
                addDiag(`🔍 Step2b: Trying UUID id="${screenId}"...`);
                try {
                    const result = await withTimeout(
                        supabase
                            .from('screens')
                            .select('*')
                            .eq('id', screenId)
                            .maybeSingle(),
                        8000,
                        'screens.id query'
                    );
                    addDiag(`📦 Step2b: data=${result.data ? 'FOUND' : 'null'}, error=${result.error ? result.error.message : 'none'}`);

                    if (result.data) {
                        screen = result.data;
                    }
                } catch (e: any) {
                    addDiag(`⚠️ Step2b failed: ${e.message}`);
                }
            }

            if (!screen) {
                // STEP 2c: Try listing ALL screens as diagnostic
                addDiag(`🔍 Step2c: Listing all screens to check access...`);
                try {
                    const allResult = await withTimeout(
                        supabase.from('screens').select('id, custom_id, name').limit(5),
                        8000,
                        'screens.list query'
                    );
                    addDiag(`📦 Step2c: count=${allResult.data?.length ?? 'null'}, error=${allResult.error ? allResult.error.message : 'none'}`);
                    if (allResult.data) {
                        allResult.data.forEach((s: any) => {
                            addDiag(`   → Screen: id="${s.id?.substring(0, 8)}...", custom_id="${s.custom_id}", name="${s.name}"`);
                        });
                    }
                } catch (e: any) {
                    addDiag(`⚠️ Step2c failed: ${e.message}`);
                }

                addDiag("❌ CONCLUSION: Screen NOT FOUND — check if custom_id='TELA1' matches DB or if RLS blocks anonymous reads");
                if (!isBackgroundUpdate) setError("Tela não encontrada — verifique o ID e permissões RLS.");
                setIsLoading(false);
                return;
            }

            setActiveScreenId(screen.id);

            if (!screen.playlist_id) {
                addDiag("❌ Step3: Screen has no playlist_id");
                if (!isBackgroundUpdate) setError("Nenhuma playlist definida para esta tela.");
                setIsLoading(false);
                return;
            }

            addDiag(`✅ Step3: playlist_id="${screen.playlist_id}"`);

            // STEP 4: Get playlist items
            addDiag(`🔍 Step4: Fetching playlist items...`);
            const { data: items, error: itemsError } = await withTimeout(
                supabase
                    .from('playlist_items')
                    .select(`
                        id, position, duration,
                        media:media_id ( file_url, file_type )
                    `)
                    .eq('playlist_id', screen.playlist_id)
                    .order('position'),
                10000,
                'playlist_items query'
            );

            addDiag(`📦 Step4: ${items?.length ?? 'null'} items, error=${itemsError ? itemsError.message : 'none'}`);

            if (itemsError) throw itemsError;
            if (!items || items.length === 0) {
                addDiag("❌ Step4: Playlist is empty");
                if (!isBackgroundUpdate) setError("Playlist vazia.");
                setIsLoading(false);
                return;
            }

            // STEP 5: Map items
            addDiag(`🔍 Step5: Mapping ${items.length} items...`);
            const mappedItems = await Promise.all(items.map(async (item: any, idx: number) => {
                if (!item.media) {
                    addDiag(`⚠️ Item#${idx}: media=null`);
                    return null;
                }
                let finalUrl = item.media.file_url;

                if (finalUrl && !finalUrl.startsWith('http')) {
                    const { data: publicData } = supabase.storage.from('media').getPublicUrl(finalUrl);
                    finalUrl = publicData.publicUrl;
                }

                addDiag(`✅ Item#${idx}: ${item.media.file_type} → ${finalUrl?.substring(0, 50)}...`);

                return {
                    id: item.id,
                    url: finalUrl,
                    type: item.media.file_type || 'image',
                    duration: item.duration || 10
                };
            }));

            const validItems = mappedItems.filter((i): i is MediaItem => i !== null);

            addDiag(`✅ Step5: ${validItems.length} valid items`);

            if (validItems.length === 0) {
                if (!isBackgroundUpdate) setError("No valid media items.");
                setIsLoading(false);
                return;
            }

            localStorage.setItem(PLAYLIST_CACHE_KEY, JSON.stringify(validItems));

            if (!isBackgroundUpdate) {
                setPlaylist(validItems);
                setCurrentIndex(0);
                setNextIndex(validItems.length > 1 ? 1 : 0);
                setError(null);
                setAudioEnabled(!!screen.audio_enabled);
                addDiag(`🎬 READY: ${validItems.length} items. Playback starting!`);
            } else {
                if (JSON.stringify(validItems) !== JSON.stringify(playlistRef.current)) {
                    setPendingPlaylist(validItems);
                    addDiag("🔄 Background update queued");
                }
            }

        } catch (err: any) {
            const msg = err?.message || String(err);
            addDiag(`💥 EXCEPTION: ${msg}`);
            if (!isBackgroundUpdate) {
                if (!loadFromCache()) setError(msg);
            }
        } finally {
            setIsLoading(false);
        }
    }, [routeId, loadFromCache, addDiag]);

    // INIT
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
    }, [fetchPlaylist, addDiag]);

    // PLAYBACK CONTROLLER
    const triggerNext = useCallback(() => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        setCurrentIndex(prev => {
            const len = playlistRef.current.length;
            if (len === 0) return 0;
            if (prev >= len - 1) {
                setPendingPlaylist(pending => {
                    if (pending) { setPlaylist(pending); return null; }
                    return null;
                });
            }
            const next = (prev + 1) % len;
            setNextIndex((next + 1) % len);
            return next;
        });
    }, []);

    // MEDIA LIFECYCLE
    useEffect(() => {
        if (playlist.length === 0) return;
        const currentItem = playlist[currentIndex];
        if (!currentItem) return;

        if (currentItem.type === 'image') {
            timerRef.current = setTimeout(triggerNext, (currentItem.duration || 10) * 1000);
            return () => { if (timerRef.current) clearTimeout(timerRef.current); };
        }

        if (currentItem.type === 'video') {
            const videoEl = videoRefs.current.get(currentIndex);
            if (videoEl) {
                videoEl.currentTime = 0;
                videoEl.play().catch(() => {
                    timerRef.current = setTimeout(triggerNext, (currentItem.duration || 10) * 1000);
                });
                const onEnded = () => triggerNext();
                const onError = () => triggerNext();
                videoEl.addEventListener('ended', onEnded);
                videoEl.addEventListener('error', onError);
                return () => {
                    videoEl.removeEventListener('ended', onEnded);
                    videoEl.removeEventListener('error', onError);
                    if (timerRef.current) clearTimeout(timerRef.current);
                };
            } else {
                timerRef.current = setTimeout(triggerNext, (currentItem.duration || 10) * 1000);
                return () => { if (timerRef.current) clearTimeout(timerRef.current); };
            }
        }

        timerRef.current = setTimeout(triggerNext, (currentItem.duration || 5) * 1000);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [currentIndex, playlist, triggerNext]);

    // PRE-BUFFER
    useEffect(() => {
        if (playlist.length < 2) return;
        const nextItem = playlist[nextIndex];
        if (nextItem?.type === 'video') {
            const el = videoRefs.current.get(nextIndex);
            if (el) { el.preload = 'auto'; el.load(); }
        }
    }, [nextIndex, playlist]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { });
        else document.exitFullscreen();
    };

    // DIAGNOSTIC OVERLAY
    if (DIAG && (isLoading || error || playlist.length === 0)) {
        return (
            <div style={{
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                backgroundColor: '#0a0a0a', color: '#00ff88', fontFamily: 'monospace',
                fontSize: '12px', padding: '16px', overflow: 'auto', zIndex: 99999,
            }}>
                <h2 style={{ color: '#fff', margin: '0 0 8px' }}>🔬 Player Diagnostic v5.2</h2>
                <p style={{ color: '#888', margin: '0 0 12px' }}>
                    {isLoading ? '⏳ Loading...' : error ? `❌ ${error}` : '⚠️ Empty playlist'}
                </p>
                <div style={{ background: '#111', border: '1px solid #333', borderRadius: '6px', padding: '12px', maxHeight: '75vh', overflow: 'auto' }}>
                    {diagLog.map((log, i) => (
                        <div key={i} style={{
                            padding: '2px 0', fontSize: '11px',
                            color: log.includes('❌') || log.includes('💥') ? '#ff4444' :
                                log.includes('✅') ? '#00ff88' :
                                    log.includes('⚠️') ? '#ffaa00' : '#aaa'
                        }}>{log}</div>
                    ))}
                    {diagLog.length === 0 && <p style={{ color: '#555' }}>Initializing...</p>}
                </div>
            </div>
        );
    }

    // NORMAL RENDER
    const renderItem = (item: MediaItem, idx: number, isActive: boolean) => {
        const isNext = idx === nextIndex;
        if (!isActive && !isNext && playlist.length > 2) return null;
        if (!item) return null;
        const cls = `media-layer ${isActive ? 'active' : ''}`;
        if (item.type === 'image') {
            return <img key={`img-${item.id}-${idx}`} src={item.url} className={cls} alt="" draggable={false} onError={() => triggerNext()} />;
        }
        if (item.type === 'video') {
            return (
                <video key={`vid-${item.id}-${idx}`} ref={el => { if (el) videoRefs.current.set(idx, el); else videoRefs.current.delete(idx); }}
                    src={item.url} className={cls} muted={!audioEnabled} playsInline crossOrigin="anonymous" preload="auto" />
            );
        }
        return null;
    };

    return (
        <div className="player-container" onClick={toggleFullscreen}>
            {playlist.map((item, idx) => renderItem(item, idx, idx === currentIndex))}
        </div>
    );
};
