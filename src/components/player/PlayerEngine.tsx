import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import "./Player.css"; // High-End Styles

interface MediaItem {
    id: string;
    url: string;
    type: 'video' | 'image' | 'web';
    duration: number;
}

export const PlayerEngine = () => {
    const { screenId: routeId } = useParams();
    const [playlist, setPlaylist] = useState<MediaItem[]>([]);

    // Dual Buffer State
    const [currentIndex, setCurrentIndex] = useState(0);
    const [nextIndex, setNextIndex] = useState(1);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hasStarted, setHasStarted] = useState(false);

    // Refs for video control
    const currentVideoRef = useRef<HTMLVideoElement>(null);
    const nextVideoRef = useRef<HTMLVideoElement>(null);

    // 1. Fetch Playlist & Sign URLs
    useEffect(() => {
        const fetchPlaylist = async () => {
            try {
                const params = new URLSearchParams(window.location.search);
                const screenId = routeId || params.get('screen_id') || localStorage.getItem('saved_screen_id');

                if (!screenId) {
                    setError("Nenhuma tela selecionada.");
                    setIsLoading(false);
                    return;
                }

                // Fetch Screen
                const { data: screen, error: screenError } = await supabase
                    .from('screens')
                    .select('playlist_id, custom_id')
                    .eq('custom_id', screenId)
                    .single();

                if (screenError || !screen?.playlist_id) {
                    setError("Tela não encontrada.");
                    setIsLoading(false);
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

                // Sign URLs
                const mappedItems = await Promise.all(items.map(async (item: any) => {
                    if (!item.media) return null;

                    let finalUrl = item.media.file_url;

                    if (finalUrl && !finalUrl.startsWith('http')) {
                        const { data } = await supabase.storage
                            .from('media')
                            .createSignedUrl(finalUrl, 3600);
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
                    setError("Playlist vazia (sem mídia válida).");
                } else {
                    setPlaylist(validItems);
                    // Initialize Next Index correctly even if only 1 item
                    setNextIndex(validItems.length > 1 ? 1 : 0);
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

    // 2. Playback Controller
    const triggerNext = useCallback(() => {
        const newCurrent = (currentIndex + 1) % playlist.length;
        const newNext = (newCurrent + 1) % playlist.length;

        setCurrentIndex(newCurrent);
        setNextIndex(newNext);
    }, [currentIndex, playlist.length]);

    // 3. Effect to manage Playback Timing for Current Item
    useEffect(() => {
        if (!hasStarted || playlist.length === 0) return;

        const currentItem = playlist[currentIndex];

        // --- IMAGE LOGIC ---
        if (currentItem.type === 'image') {
            const durationMs = (currentItem.duration || 10) * 1000;
            const timer = setTimeout(() => {
                triggerNext();
            }, durationMs);
            return () => clearTimeout(timer);
        }

        // --- VIDEO LOGIC ---
        if (currentItem.type === 'video' && currentVideoRef.current) {
            const videoEl = currentVideoRef.current;

            // Reset and Play
            videoEl.currentTime = 0;
            videoEl.play().catch(e => console.warn("Autoplay blocked:", e));

            // Watchdog for ending (Fail-safe)
            const onEnded = () => triggerNext();
            videoEl.addEventListener('ended', onEnded);

            return () => {
                videoEl.removeEventListener('ended', onEnded);
                videoEl.pause(); // Stop when switching out
            };
        }

    }, [currentIndex, hasStarted, playlist, triggerNext]);

    if (isLoading) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0F172A] text-white">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
                <p>Carregando Player Pro...</p>
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

    // --- DUAL BUFFER RENDERER ---
    // We strictly render TWO items: Current and Next.
    // CSS handles opacity/z-index toggling.

    // Note: We use "key" to force React to differentiate items, but for performance,
    // we iterate the playlist and only render if index matches current or next.
    // Actually, for true gapless, we render *all* items but hide them, OR just render 2.
    // Rendering 2 is safer for memory.

    const renderItem = (item: MediaItem, index: number, isActive: boolean) => {
        const isNext = index === nextIndex;
        // Optimization: Only render if Active, Next, or if playlist has < 3 items (keep meaningful DOM)
        if (!isActive && !isNext && playlist.length > 2) return null;

        const commonClasses = `media-layer ${isActive ? 'active' : ''}`;

        if (item.type === 'image') {
            return (
                <img
                    key={`${item.id}-${index}`}
                    src={item.url}
                    className={commonClasses}
                    alt="slide"
                />
            );
        }

        if (item.type === 'video') {
            return (
                <video
                    key={`${item.id}-${index}`}
                    ref={isActive ? currentVideoRef : (isNext ? nextVideoRef : null)}
                    src={item.url}
                    className={commonClasses}
                    muted
                    playsInline
                    preload="auto" // Crucial for Gapless
                />
            );
        }
        return null; // Web/Other types can be added here
    };

    return (
        <div className="player-container">
            {playlist.map((item, idx) => renderItem(item, idx, idx === currentIndex))}

            {/* Minimal Info for Operator */}
            <div className="debug-overlay">
                PRO PLAYER v3.1<br />
                Item: {currentIndex + 1}/{playlist.length}<br />
                Next: {nextIndex + 1}
            </div>
        </div>
    );
};
