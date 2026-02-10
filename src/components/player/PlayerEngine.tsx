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

// DIAGNOSTIC MODE - set to false after fix is confirmed
const DIAG = true;

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

    // DIAGNOSTIC
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
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    usePlayerHeartbeat(activeScreenId);

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
                    addDiag(`✅ Cache: ${parsed.length} items`);
                    setPlaylist(parsed);
                    setIsLoading(false);
                    return true;
                }
            }
        } catch (e) { addDiag(`❌ Cache error: ${e}`); }
        return false;
    }, [addDiag]);

    // ============================================================
    // MAIN SYNC — NO JOIN QUERIES (split to avoid RLS join issues)
    // ============================================================
    const fetchPlaylist = useCallback(async (isBackgroundUpdate = false) => {
        try {
            const params = new URLSearchParams(window.location.search);
            const screenId = routeId || params.get('screen_id') || localStorage.getItem(SCREEN_ID_CACHE_KEY);

            addDiag(`🔍 Step1: screenId="${screenId}"`);
            if (!screenId) {
                addDiag("❌ No screen ID");
                if (!isBackgroundUpdate) setError("Nenhuma tela selecionada.");
                setIsLoading(false);
                return;
            }
            localStorage.setItem(SCREEN_ID_CACHE_KEY, screenId);

            // STEP 2: Find screen
            addDiag(`🔍 Step2: Finding screen...`);
            let screen: any = null;

            try {
                const r = await withTimeout(
                    supabase.from('screens').select('*').eq('custom_id', screenId).maybeSingle(),
                    8000, 'screens.custom_id'
                );
                addDiag(`📦 Step2a: ${r.data ? 'FOUND' : 'null'} err=${r.error?.message || 'none'}`);
                if (r.data) screen = r.data;
            } catch (e: any) { addDiag(`⚠️ Step2a: ${e.message}`); }

            if (!screen) {
                try {
                    const r = await withTimeout(
                        supabase.from('screens').select('*').eq('id', screenId).maybeSingle(),
                        8000, 'screens.id'
                    );
                    addDiag(`📦 Step2b: ${r.data ? 'FOUND' : 'null'} err=${r.error?.message || 'none'}`);
                    if (r.data) screen = r.data;
                } catch (e: any) { addDiag(`⚠️ Step2b: ${e.message}`); }
            }

            if (!screen) {
                addDiag("❌ Screen not found");
                if (!isBackgroundUpdate) setError("Tela não encontrada.");
                setIsLoading(false);
                return;
            }

            setActiveScreenId(screen.id);
            if (!screen.playlist_id) {
                addDiag("❌ No playlist_id on screen");
                if (!isBackgroundUpdate) setError("Nenhuma playlist definida.");
                setIsLoading(false);
                return;
            }
            addDiag(`✅ Step3: playlist_id="${screen.playlist_id}"`);

            // =====================================================
            // STEP 4: Fetch playlist_items WITHOUT media join
            // This avoids PostgREST join hanging due to RLS on media
            // =====================================================
            addDiag(`🔍 Step4: Fetching playlist_items (no join)...`);
            const { data: items, error: itemsErr } = await withTimeout(
                supabase
                    .from('playlist_items')
                    .select('id, position, duration, media_id')
                    .eq('playlist_id', screen.playlist_id)
                    .order('position'),
                8000,
                'playlist_items'
            );
            addDiag(`📦 Step4: ${items?.length ?? 'null'} items, err=${itemsErr?.message || 'none'}`);
            if (itemsErr) throw itemsErr;
            if (!items || items.length === 0) {
                addDiag("❌ Playlist empty");
                if (!isBackgroundUpdate) setError("Playlist vazia.");
                setIsLoading(false);
                return;
            }

            // STEP 5: Fetch media for each item INDIVIDUALLY
            addDiag(`🔍 Step5: Fetching media for ${items.length} items...`);
            const mediaIds = [...new Set(items.filter(i => i.media_id).map(i => i.media_id))];
            addDiag(`📎 Unique media IDs: ${mediaIds.length}`);

            let mediaMap: Record<string, any> = {};

            if (mediaIds.length > 0) {
                try {
                    const { data: mediaRows, error: mediaErr } = await withTimeout(
                        supabase
                            .from('media')
                            .select('id, file_url, file_type')
                            .in('id', mediaIds),
                        8000,
                        'media.in'
                    );
                    addDiag(`📦 Step5a: ${mediaRows?.length ?? 'null'} media rows, err=${mediaErr?.message || 'none'}`);

                    if (mediaRows) {
                        for (const m of mediaRows) {
                            mediaMap[m.id] = m;
                        }
                    }
                } catch (e: any) {
                    addDiag(`⚠️ Step5a failed: ${e.message}`);
                }
            }

            // STEP 6: Build final playlist
            addDiag(`🔍 Step6: Building playlist...`);
            const validItems: MediaItem[] = [];

            for (const item of items) {
                const media = item.media_id ? mediaMap[item.media_id] : null;
                if (!media || !media.file_url) {
                    addDiag(`⚠️ Skip item ${item.id}: no media`);
                    continue;
                }

                let finalUrl = media.file_url;
                if (finalUrl && !finalUrl.startsWith('http')) {
                    const { data: publicData } = supabase.storage.from('media').getPublicUrl(finalUrl);
                    finalUrl = publicData.publicUrl;
                }

                validItems.push({
                    id: item.id,
                    url: finalUrl,
                    type: media.file_type || 'image',
                    duration: item.duration || 10,
                });
                addDiag(`✅ Item: ${media.file_type} - ${finalUrl?.substring(0, 50)}...`);
            }

            addDiag(`✅ Step6: ${validItems.length} valid items`);

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
                addDiag(`🎬 PLAYING: ${validItems.length} items!`);
            } else {
                if (JSON.stringify(validItems) !== JSON.stringify(playlistRef.current)) {
                    setPendingPlaylist(validItems);
                }
            }

        } catch (err: any) {
            addDiag(`💥 ${err?.message || err}`);
            if (!isBackgroundUpdate) {
                if (!loadFromCache()) setError(err?.message || 'Unknown error');
            }
        } finally {
            setIsLoading(false);
        }
    }, [routeId, loadFromCache, addDiag]);

    // INIT
    useEffect(() => {
        addDiag("🚀 PlayerEngine v5.3 mounted");
        addDiag(`📍 ${window.location.href}`);
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

    // PLAYBACK
    const triggerNext = useCallback(() => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        setCurrentIndex(prev => {
            const len = playlistRef.current.length;
            if (len === 0) return 0;
            if (prev >= len - 1) {
                setPendingPlaylist(p => { if (p) { setPlaylist(p); return null; } return null; });
            }
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
                el.play().catch(() => {
                    timerRef.current = setTimeout(triggerNext, (item.duration || 10) * 1000);
                });
                const onEnded = () => triggerNext();
                const onError = () => triggerNext();
                el.addEventListener('ended', onEnded);
                el.addEventListener('error', onError);
                return () => {
                    el.removeEventListener('ended', onEnded);
                    el.removeEventListener('error', onError);
                    if (timerRef.current) clearTimeout(timerRef.current);
                };
            }
            timerRef.current = setTimeout(triggerNext, (item.duration || 10) * 1000);
            return () => { if (timerRef.current) clearTimeout(timerRef.current); };
        }
        timerRef.current = setTimeout(triggerNext, (item.duration || 5) * 1000);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [currentIndex, playlist, triggerNext]);

    // PRE-BUFFER
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

    // DIAG OVERLAY
    if (DIAG && (isLoading || error || playlist.length === 0)) {
        return (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#0a0a0a', color: '#00ff88', fontFamily: 'monospace', fontSize: '12px', padding: '16px', overflow: 'auto', zIndex: 99999 }}>
                <h2 style={{ color: '#fff', margin: '0 0 8px' }}>🔬 Player Diagnostic v5.3</h2>
                <p style={{ color: '#888', margin: '0 0 12px' }}>{isLoading ? '⏳ Loading...' : error ? `❌ ${error}` : '⚠️ Empty'}</p>
                <div style={{ background: '#111', border: '1px solid #333', borderRadius: '6px', padding: '12px', maxHeight: '75vh', overflow: 'auto' }}>
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
