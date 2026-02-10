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
                    setPlaylist(parsed);
                    setIsLoading(false);
                    return true;
                }
            }
        } catch { /* ignore */ }
        return false;
    }, []);

    // ============================================================
    // RAW FETCH to Supabase REST API — bypasses JS client entirely
    // ============================================================
    const rawSupabaseQuery = useCallback(async (
        table: string,
        queryParams: string,
        accessToken?: string | null
    ): Promise<any[]> => {
        const url = `${supabaseConfig.url}/rest/v1/${table}?${queryParams}`;
        const headers: Record<string, string> = {
            'apikey': supabaseConfig.key,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
        } else {
            headers['Authorization'] = `Bearer ${supabaseConfig.key}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
            const resp = await fetch(url, { headers, signal: controller.signal });
            clearTimeout(timeoutId);
            if (!resp.ok) {
                const body = await resp.text();
                throw new Error(`HTTP ${resp.status}: ${body.substring(0, 100)}`);
            }
            return await resp.json();
        } catch (e: any) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') throw new Error('TIMEOUT (5s)');
            throw e;
        }
    }, []);

    // ============================================================
    // MAIN SYNC
    // ============================================================
    const fetchPlaylist = useCallback(async (isBackgroundUpdate = false) => {
        try {
            // Get auth token
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || null;
            addDiag(`🔑 Auth: ${session ? `uid=${session.user.id.substring(0, 8)}...` : 'anon'}`);

            const params = new URLSearchParams(window.location.search);
            const screenId = routeId || params.get('screen_id') || localStorage.getItem(SCREEN_ID_CACHE_KEY);
            addDiag(`🔍 screenId="${screenId}"`);

            if (!screenId) {
                if (!isBackgroundUpdate) setError("Nenhuma tela selecionada.");
                setIsLoading(false); return;
            }
            localStorage.setItem(SCREEN_ID_CACHE_KEY, screenId);

            // STEP 2: Find screen (Supabase client works for this)
            let screen: any = null;
            try {
                const r = await withTimeout(supabase.from('screens').select('*').eq('custom_id', screenId).maybeSingle(), 8000);
                if (r.data) { screen = r.data; addDiag(`✅ Screen: custom_id match`); }
            } catch { /* fallback */ }

            if (!screen) {
                try {
                    const r = await withTimeout(supabase.from('screens').select('*').eq('id', screenId).maybeSingle(), 8000);
                    if (r.data) { screen = r.data; addDiag(`✅ Screen: UUID match`); }
                } catch { /* not found */ }
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

            // STEP 4: Fetch playlist_items (Supabase client works)
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
            // STEP 5: Fetch media via RAW FETCH (bypasses JS client)
            // =====================================================
            const mediaIds = [...new Set(items.filter(i => i.media_id).map(i => i.media_id))];
            addDiag(`🔍 Fetching ${mediaIds.length} media via RAW FETCH...`);

            let mediaMap: Record<string, any> = {};

            try {
                // PostgREST filter: id=in.(uuid1,uuid2,...)
                const inFilter = mediaIds.map(id => `"${id}"`).join(',');
                const queryStr = `select=id,file_url,file_type&id=in.(${inFilter})`;

                addDiag(`📡 API: ${supabaseConfig.url?.substring(0, 30)}/rest/v1/media?...`);

                const mediaRows = await rawSupabaseQuery('media', queryStr, token);
                addDiag(`✅ Raw fetch: ${mediaRows.length} media rows returned!`);

                for (const m of mediaRows) {
                    mediaMap[m.id] = m;
                }
            } catch (e: any) {
                addDiag(`❌ Raw fetch failed: ${e.message}`);

                // FALLBACK: try without auth token (anon key only)
                try {
                    addDiag(`🔄 Retrying without auth token...`);
                    const inFilter = mediaIds.map(id => `"${id}"`).join(',');
                    const queryStr = `select=id,file_url,file_type&id=in.(${inFilter})`;
                    const mediaRows = await rawSupabaseQuery('media', queryStr, null);
                    addDiag(`✅ Anon fetch: ${mediaRows.length} rows`);
                    for (const m of mediaRows) mediaMap[m.id] = m;
                } catch (e2: any) {
                    addDiag(`❌ Anon fetch also failed: ${e2.message}`);
                }
            }

            // STEP 6: Build playlist
            const validItems: MediaItem[] = [];
            for (const item of items) {
                const media = item.media_id ? mediaMap[item.media_id] : null;
                if (!media?.file_url) {
                    addDiag(`⚠️ Skip: no media for ${item.media_id?.substring(0, 8)}`);
                    continue;
                }

                let finalUrl = media.file_url;
                if (!finalUrl.startsWith('http')) {
                    // Build storage URL manually
                    finalUrl = `${supabaseConfig.url}/storage/v1/object/public/media/${finalUrl}`;
                }

                validItems.push({
                    id: item.id,
                    url: finalUrl,
                    type: media.file_type || 'image',
                    duration: item.duration || 10,
                });
                addDiag(`✅ ${media.file_type}: ${finalUrl.substring(0, 55)}...`);
            }

            addDiag(`📊 Final: ${validItems.length}/${items.length} valid`);

            if (validItems.length === 0) {
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
    }, [routeId, loadFromCache, addDiag, rawSupabaseQuery]);

    // INIT
    useEffect(() => {
        addDiag("🚀 v5.6 (raw fetch for media)");
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

    // DIAG OVERLAY
    if (DIAG && (isLoading || error || playlist.length === 0)) {
        return (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#0a0a0a', color: '#00ff88', fontFamily: 'monospace', fontSize: '12px', padding: '16px', overflow: 'auto', zIndex: 99999 }}>
                <h2 style={{ color: '#fff', margin: '0 0 8px' }}>🔬 Player Diagnostic v5.6</h2>
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
