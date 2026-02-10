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
        } catch (e) { addDiag(`❌ Cache error: ${e}`); }
        return false;
    }, [addDiag]);

    // ============================================================
    // MAIN SYNC
    // ============================================================
    const fetchPlaylist = useCallback(async (isBackgroundUpdate = false) => {
        try {
            // AUTH CHECK
            const { data: { session } } = await supabase.auth.getSession();
            addDiag(`🔑 Auth: ${session ? `uid=${session.user.id.substring(0, 8)}...` : 'NO SESSION (anonymous)'}`);

            const params = new URLSearchParams(window.location.search);
            const screenId = routeId || params.get('screen_id') || localStorage.getItem(SCREEN_ID_CACHE_KEY);
            addDiag(`🔍 Step1: screenId="${screenId}"`);

            if (!screenId) {
                if (!isBackgroundUpdate) setError("Nenhuma tela selecionada.");
                setIsLoading(false);
                return;
            }
            localStorage.setItem(SCREEN_ID_CACHE_KEY, screenId);

            // STEP 2: Find screen
            let screen: any = null;
            try {
                const r = await withTimeout(
                    supabase.from('screens').select('*').eq('custom_id', screenId).maybeSingle(),
                    8000, 'screens.custom_id'
                );
                if (r.data) { screen = r.data; addDiag(`✅ Step2: Found by custom_id`); }
                else addDiag(`📦 Step2a: not found by custom_id (err=${r.error?.message || 'none'})`);
            } catch (e: any) { addDiag(`⚠️ Step2a: ${e.message}`); }

            if (!screen) {
                try {
                    const r = await withTimeout(
                        supabase.from('screens').select('*').eq('id', screenId).maybeSingle(),
                        8000, 'screens.id'
                    );
                    if (r.data) { screen = r.data; addDiag(`✅ Step2: Found by UUID`); }
                    else addDiag(`📦 Step2b: not found by UUID`);
                } catch (e: any) { addDiag(`⚠️ Step2b: ${e.message}`); }
            }

            if (!screen) {
                if (!isBackgroundUpdate) setError("Tela não encontrada.");
                setIsLoading(false);
                return;
            }

            setActiveScreenId(screen.id);
            if (!screen.playlist_id) {
                addDiag("❌ No playlist_id");
                if (!isBackgroundUpdate) setError("Nenhuma playlist definida.");
                setIsLoading(false);
                return;
            }
            addDiag(`✅ Step3: playlist_id="${screen.playlist_id}"`);

            // STEP 4: Fetch playlist_items WITHOUT join
            addDiag(`🔍 Step4: Fetching playlist_items...`);
            const { data: items, error: itemsErr } = await withTimeout(
                supabase.from('playlist_items')
                    .select('id, position, duration, media_id')
                    .eq('playlist_id', screen.playlist_id)
                    .order('position'),
                8000, 'playlist_items'
            );
            addDiag(`📦 Step4: ${items?.length ?? 0} items, err=${itemsErr?.message || 'none'}`);
            if (itemsErr) throw itemsErr;
            if (!items || items.length === 0) {
                if (!isBackgroundUpdate) setError("Playlist vazia.");
                setIsLoading(false);
                return;
            }

            // STEP 5: Fetch each media item INDIVIDUALLY (avoids .in() hang)
            addDiag(`🔍 Step5: Fetching media individually (${items.length} items)...`);
            const validItems: MediaItem[] = [];

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item.media_id) {
                    addDiag(`⚠️ #${i}: no media_id, skip`);
                    continue;
                }

                try {
                    const { data: media, error: mediaErr } = await withTimeout(
                        supabase.from('media')
                            .select('id, file_url, file_type')
                            .eq('id', item.media_id)
                            .maybeSingle(),
                        5000, `media.${i}`
                    );

                    if (mediaErr) {
                        addDiag(`⚠️ #${i}: media query error: ${mediaErr.message}`);
                        continue;
                    }

                    if (!media || !media.file_url) {
                        addDiag(`⚠️ #${i}: media not found or no file_url`);
                        continue;
                    }

                    let finalUrl = media.file_url;
                    if (!finalUrl.startsWith('http')) {
                        const { data: pub } = supabase.storage.from('media').getPublicUrl(finalUrl);
                        finalUrl = pub.publicUrl;
                    }

                    validItems.push({
                        id: item.id,
                        url: finalUrl,
                        type: media.file_type || 'image',
                        duration: item.duration || 10,
                    });
                    addDiag(`✅ #${i}: ${media.file_type} → ${finalUrl.substring(0, 60)}...`);

                } catch (e: any) {
                    addDiag(`⚠️ #${i}: ${e.message}`);
                    // If this is a TIMEOUT, the media table is RLS-blocked
                    if (e.message.includes('TIMEOUT')) {
                        addDiag(`🚨 MEDIA TABLE BLOCKED BY RLS — Switching to fallback strategy`);
                        // FALLBACK: Try to get media via the playlist join from screens user context
                        break;
                    }
                }
            }

            // FALLBACK if media table is blocked: try a raw fetch to Supabase REST API
            if (validItems.length === 0 && items.length > 0) {
                addDiag(`🔄 Fallback: Trying raw fetch to Supabase REST API...`);
                try {
                    const supaUrl = (supabase as any).supabaseUrl ||
                        localStorage.getItem('VITE_SUPABASE_URL') ||
                        (import.meta as any).env?.VITE_SUPABASE_URL;
                    const supaKey = (supabase as any).supabaseKey ||
                        localStorage.getItem('VITE_SUPABASE_PUBLISHABLE_KEY') ||
                        (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY;

                    addDiag(`📡 Supabase URL: ${supaUrl ? supaUrl.substring(0, 30) + '...' : 'NOT FOUND'}`);

                    if (supaUrl && supaKey) {
                        const mediaIds = items.filter(i => i.media_id).map(i => i.media_id);
                        const inFilter = mediaIds.map(id => `"${id}"`).join(',');
                        const apiUrl = `${supaUrl}/rest/v1/media?id=in.(${inFilter})&select=id,file_url,file_type`;

                        const headers: Record<string, string> = {
                            'apikey': supaKey,
                            'Content-Type': 'application/json',
                        };

                        // Include auth token if available
                        if (session?.access_token) {
                            headers['Authorization'] = `Bearer ${session.access_token}`;
                        }

                        addDiag(`📡 RAW FETCH: ${apiUrl.substring(0, 80)}...`);

                        const resp = await withTimeout(
                            fetch(apiUrl, { headers }),
                            8000, 'raw-media-fetch'
                        );

                        addDiag(`📡 Response: status=${resp.status}`);

                        if (resp.ok) {
                            const mediaRows = await resp.json();
                            addDiag(`📡 Got ${mediaRows.length} media rows via raw fetch`);

                            const mediaMap: Record<string, any> = {};
                            for (const m of mediaRows) mediaMap[m.id] = m;

                            for (const item of items) {
                                const media = item.media_id ? mediaMap[item.media_id] : null;
                                if (!media?.file_url) continue;
                                let finalUrl = media.file_url;
                                if (!finalUrl.startsWith('http')) {
                                    finalUrl = `${supaUrl}/storage/v1/object/public/media/${finalUrl}`;
                                }
                                validItems.push({
                                    id: item.id,
                                    url: finalUrl,
                                    type: media.file_type || 'image',
                                    duration: item.duration || 10,
                                });
                            }
                            addDiag(`✅ Fallback: ${validItems.length} items via raw fetch`);
                        } else {
                            const body = await resp.text();
                            addDiag(`❌ Raw fetch failed: ${resp.status} ${body.substring(0, 100)}`);
                        }
                    }
                } catch (e: any) {
                    addDiag(`❌ Fallback failed: ${e.message}`);
                }
            }

            addDiag(`📊 Final: ${validItems.length} valid items`);

            if (validItems.length === 0) {
                if (!isBackgroundUpdate) setError("Nenhuma mídia acessível.");
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

    useEffect(() => {
        addDiag("🚀 PlayerEngine v5.4 mounted");
        addDiag(`📍 ${window.location.href}`);
        addDiag(`🌐 Online: ${navigator.onLine}`);
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

    // DIAG OVERLAY
    if (DIAG && (isLoading || error || playlist.length === 0)) {
        return (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#0a0a0a', color: '#00ff88', fontFamily: 'monospace', fontSize: '12px', padding: '16px', overflow: 'auto', zIndex: 99999 }}>
                <h2 style={{ color: '#fff', margin: '0 0 8px' }}>🔬 Player Diagnostic v5.4</h2>
                <p style={{ color: '#888', margin: '0 0 12px' }}>{isLoading ? '⏳ Loading...' : error ? `❌ ${error}` : '⚠️ Empty'}</p>
                <div style={{ background: '#111', border: '1px solid #333', borderRadius: '6px', padding: '12px', maxHeight: '75vh', overflow: 'auto' }}>
                    {diagLog.map((log, i) => (
                        <div key={i} style={{ padding: '2px 0', fontSize: '11px', color: log.includes('❌') || log.includes('💥') || log.includes('🚨') ? '#ff4444' : log.includes('✅') || log.includes('🎬') ? '#00ff88' : log.includes('⚠️') ? '#ffaa00' : '#aaa' }}>{log}</div>
                    ))}
                </div>
            </div>
        );
    }

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
