import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms)),
    ]);
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
        } catch (e) { /* ignore */ }
        return false;
    }, [addDiag]);

    // ============================================================
    // MAIN SYNC — PARALLEL media fetches with Promise.allSettled
    // ============================================================
    const fetchPlaylist = useCallback(async (isBackgroundUpdate = false) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            addDiag(`🔑 Auth: ${session ? `uid=${session.user.id.substring(0, 8)}...` : 'NO SESSION'}`);

            const params = new URLSearchParams(window.location.search);
            const screenId = routeId || params.get('screen_id') || localStorage.getItem(SCREEN_ID_CACHE_KEY);
            addDiag(`🔍 screenId="${screenId}"`);

            if (!screenId) {
                if (!isBackgroundUpdate) setError("Nenhuma tela selecionada.");
                setIsLoading(false); return;
            }
            localStorage.setItem(SCREEN_ID_CACHE_KEY, screenId);

            // Find screen
            let screen: any = null;
            try {
                const r = await withTimeout(supabase.from('screens').select('*').eq('custom_id', screenId).maybeSingle(), 8000);
                if (r.data) { screen = r.data; addDiag(`✅ Screen found by custom_id`); }
            } catch { /* fallback below */ }

            if (!screen) {
                try {
                    const r = await withTimeout(supabase.from('screens').select('*').eq('id', screenId).maybeSingle(), 8000);
                    if (r.data) { screen = r.data; addDiag(`✅ Screen found by UUID`); }
                } catch { /* no screen */ }
            }

            if (!screen) {
                if (!isBackgroundUpdate) setError("Tela não encontrada.");
                setIsLoading(false); return;
            }
            setActiveScreenId(screen.id);

            if (!screen.playlist_id) {
                addDiag("❌ No playlist_id");
                if (!isBackgroundUpdate) setError("Nenhuma playlist definida.");
                setIsLoading(false); return;
            }
            addDiag(`✅ playlist_id="${screen.playlist_id}"`);

            // Fetch playlist_items (no join)
            const { data: items, error: itemsErr } = await withTimeout(
                supabase.from('playlist_items')
                    .select('id, position, duration, media_id')
                    .eq('playlist_id', screen.playlist_id)
                    .order('position'),
                8000
            );

            if (itemsErr) throw itemsErr;
            if (!items || items.length === 0) {
                if (!isBackgroundUpdate) setError("Playlist vazia.");
                setIsLoading(false); return;
            }
            addDiag(`✅ ${items.length} playlist items`);

            // =====================================================
            // PARALLEL media fetch — all at once with 3s timeout each
            // =====================================================
            addDiag(`🔍 Fetching ${items.length} media items in PARALLEL...`);

            const fetchResults = await Promise.allSettled(
                items.filter(i => i.media_id).map(async (item, idx) => {
                    try {
                        const { data: media } = await withTimeout(
                            supabase.from('media')
                                .select('id, file_url, file_type')
                                .eq('id', item.media_id)
                                .maybeSingle(),
                            3000
                        );
                        if (!media?.file_url) return null;

                        let finalUrl = media.file_url;
                        if (!finalUrl.startsWith('http')) {
                            const { data: pub } = supabase.storage.from('media').getPublicUrl(finalUrl);
                            finalUrl = pub.publicUrl;
                        }

                        return {
                            id: item.id,
                            url: finalUrl,
                            type: media.file_type || 'image',
                            duration: item.duration || 10,
                            position: item.position,
                        } as MediaItem & { position: number };
                    } catch {
                        return null;
                    }
                })
            );

            // Collect successful results
            const validItems: MediaItem[] = fetchResults
                .map(r => r.status === 'fulfilled' ? r.value : null)
                .filter((item): item is MediaItem & { position: number } => item !== null)
                .sort((a, b) => (a as any).position - (b as any).position)
                .map(({ position, ...rest }) => rest as unknown as MediaItem);

            const succeeded = fetchResults.filter(r => r.status === 'fulfilled' && r.value).length;
            const failed = fetchResults.length - succeeded;
            addDiag(`📊 Results: ${succeeded} ok, ${failed} failed`);

            validItems.forEach((item, i) => {
                addDiag(`✅ #${i}: ${item.type} → ${item.url.substring(0, 55)}...`);
            });

            if (validItems.length === 0) {
                addDiag("❌ No valid items — all media queries failed");
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
                addDiag(`🎬 PLAYING ${validItems.length} items!`);
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
        addDiag("🚀 v5.5");
        addDiag(`📍 ${window.location.href}`);
        fetchPlaylist(false);

        const interval = setInterval(() => { if (navigator.onLine) fetchPlaylist(true); }, POLL_INTERVAL_MS);
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

    // DIAG OVERLAY — only while loading
    if (DIAG && (isLoading || error || playlist.length === 0)) {
        return (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#0a0a0a', color: '#00ff88', fontFamily: 'monospace', fontSize: '12px', padding: '16px', overflow: 'auto', zIndex: 99999 }}>
                <h2 style={{ color: '#fff', margin: '0 0 8px' }}>🔬 Player Diagnostic v5.5</h2>
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
