import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface MediaItem {
    id: string;
    url: string;
    type: 'video' | 'image' | 'web';
    duration: number;
}

export const PlayerEngine = () => {
    const { screenId: routeId } = useParams();
    const [playlist, setPlaylist] = useState<MediaItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hasStarted, setHasStarted] = useState(false); // User interaction flag
    const videoRef = useRef<HTMLVideoElement>(null);

    // --- HARDENING: CODEC CHECK ---
    // Web Strategy: "Try and Skip". Browsers are good at determining support at runtime.
    // We only filter if we are 100% sure it's garbage.

    // 1. Fetch Playlist & Sign URLs (Parallel)
    useEffect(() => {
        const fetchPlaylist = async () => {
            try {
                // Get ID from URL or LocalStorage
                const params = new URLSearchParams(window.location.search);
                const screenId = routeId || params.get('screen_id') || localStorage.getItem('saved_screen_id');

                if (!screenId) {
                    setError("Nenhuma tela selecionada.");
                    setIsLoading(false);
                    return;
                }

                // Fetch Screen to get Playlist ID
                const { data: screen, error: screenError } = await supabase
                    .from('screens')
                    .select('playlist_id')
                    .eq('screen_code', screenId) // Assuming screen_code is the ID used
                    .single();

                if (screenError || !screen?.playlist_id) {
                    console.warn("Screen not found.");
                    setError("Tela não encontrada.");
                    setIsLoading(false);
                    return;
                }

                // Fetch Items
                const { data: items, error: itemsError } = await supabase
                    .from('playlist_items')
                    .select(`
                        id, position, duration,
                        media:media_id ( file_url, type, duration_seconds )
                    `)
                    .eq('playlist_id', screen.playlist_id)
                    .order('position');

                if (itemsError) throw itemsError;

                // RESOLVE SIGNED URLs (Parallel Promise.all)
                const mappedItems = await Promise.all(items.map(async (item: {
                    id: string;
                    media: { file_url: string; type: 'video' | 'image' | 'web'; duration_seconds: number };
                    duration: number
                }) => {
                    let finalUrl = item.media.file_url;

                    if (finalUrl && !finalUrl.startsWith('http')) {
                        // Always try to sign relative paths
                        const { data } = await supabase.storage
                            .from('media')
                            .createSignedUrl(finalUrl, 3600);

                        if (data?.signedUrl) finalUrl = data.signedUrl;
                        else {
                            // Fallback public
                            const { data: publicData } = supabase.storage.from('media').getPublicUrl(finalUrl);
                            finalUrl = publicData.publicUrl;
                        }
                    }

                    return {
                        id: item.id,
                        url: finalUrl,
                        type: item.media.type,
                        duration: item.duration || item.media.duration_seconds || 10
                    };
                }));

                console.log("Playlist Ready:", mappedItems);

                if (mappedItems.length === 0) {
                    setError("Playlist vazia.");
                } else {
                    setPlaylist(mappedItems);
                }

            } catch (err: unknown) {
                console.error("Sync Error:", err);
                const message = err instanceof Error ? err.message : String(err);
                setError(message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPlaylist();
    }, [routeId]);

    // 2. Playback Loop & Video Control
    const nextItem = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % playlist.length);
    }, [playlist.length]);

    useEffect(() => {
        if (!hasStarted || playlist.length === 0) return;

        const currentItem = playlist[currentIndex];

        // Image logic
        if (currentItem.type === 'image') {
            const timer = setTimeout(() => {
                nextItem();
            }, currentItem.duration * 1000);
            return () => clearTimeout(timer);
        }

        // Video Logic: Force Play & Watchdog
        if (currentItem.type === 'video' && videoRef.current) {
            // Attempt to play immediately
            const videoEl = videoRef.current;

            const startPlay = async () => {
                try {
                    await videoEl.play();
                } catch (e) {
                    console.warn("Play attempt failed:", e);
                }
            };
            startPlay();

            // WATCHDOG: Check for freezing every 1s
            let lastTime = -1;
            let stuckCount = 0;

            const watchdog = setInterval(() => {
                if (!videoEl) return;

                const currentTime = videoEl.currentTime;
                const isPlaying = !videoEl.paused && !videoEl.ended && videoEl.readyState > 2;

                if (currentTime === lastTime) {
                    stuckCount++;
                    console.log(`Video Stuck Check: ${stuckCount}/5`);

                    // Try to kickstart it
                    if (stuckCount === 2) {
                        console.log("Kickstarting video...");
                        videoEl.play().catch(() => { });
                    }

                    // If stuck for 5 seconds, SKIP
                    if (stuckCount >= 5) {
                        console.error("Watchdog: Video frozen, forcing skip.");
                        toast.error("Vídeo travou. Pulando...");
                        clearInterval(watchdog);
                        nextItem();
                    }
                } else {
                    // It's moving, reset counters
                    stuckCount = 0;
                    lastTime = currentTime;
                }
            }, 1000);

            return () => clearInterval(watchdog);
        }
    }, [currentIndex, playlist, hasStarted, nextItem]);


    if (isLoading) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0F172A] text-white">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
                <p>Carregando Mídias...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0F172A] text-white p-8 text-center">
                <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
                <h2 className="text-xl font-bold mb-2">Erro de Reprodução</h2>
                <p className="text-slate-400">{error}</p>
            </div>
        );
    }

    if (playlist.length === 0) return null;

    // START OVERLAY: Forces user interaction to unlock Autoplay for the entire session
    if (!hasStarted) {
        return (
            <div
                className="h-screen w-full flex flex-col items-center justify-center bg-black/90 z-50 cursor-pointer"
                onClick={() => setHasStarted(true)}
            >
                <div className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-6 transition-all transform hover:scale-110 shadow-2xl animate-bounce">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16 pl-2">
                        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                    </svg>
                </div>
                <p className="mt-8 text-white font-bold text-2xl tracking-widest uppercase">
                    Clique para Iniciar
                </p>
            </div>
        );
    }

    const currentItem = playlist[currentIndex];

    return (
        <div className="h-screen w-full bg-black overflow-hidden relative cursor-pointer" onClick={() => {
            // Unlock AudioContext/Autoplay on click (Redundant backup)
            if (videoRef.current) videoRef.current.play();
        }}>
            {/* Media Renderer */}
            {currentItem.type === 'image' && (
                <img
                    src={currentItem.url}
                    className="w-full h-full object-cover animate-in fade-in duration-500"
                    alt="Playback"
                />
            )}

            {currentItem.type === 'video' && (
                <video
                    key={currentItem.id} // FORCE RE-MOUNT: Ensures fresh decoder for every video
                    ref={videoRef}
                    src={currentItem.url}
                    className="w-full h-full object-contain"
                    muted
                    playsInline
                    autoPlay
                    onEnded={nextItem}
                    onError={(e) => {
                        const err = e.currentTarget.error;
                        console.error("Video Object Error:", err);
                        toast.error(`Erro: ${err?.message || "Código " + err?.code}`);
                        // Wait 1s and skip
                        setTimeout(nextItem, 1000);
                    }}
                />
            )}

            {/* Debug Overlay */}
            <div className="absolute top-2 right-2 bg-black/50 text-white text-xs p-2 rounded z-50 pointer-events-none">
                Item {currentIndex + 1}/{playlist.length} <br />
                Type: {currentItem.type}
            </div>
        </div>
    );
};
