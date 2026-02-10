import { useEffect, useState, useRef, useCallback } from "react";
import "./WebPlayer.css";

// Strong typed interface for Media
export interface WebPlayerMedia {
    id: string;
    url: string;
    type: 'video' | 'image' | 'web';
    duration: number; // in seconds
    objectFit?: 'contain' | 'cover' | 'fill'; // Strict rendering mode
}

interface WebPlayerProps {
    playlist: WebPlayerMedia[];
    aspectRatio: string; // e.g. "16/9", "9/16", "1920/1080"
    deviceFrame?: 'tv' | 'totem' | 'monitor' | 'none';
    showGuides?: boolean;
    autoPlay?: boolean;
    muted?: boolean;
    onError?: (error: string) => void;
}

export const WebPlayer = ({
    playlist,
    aspectRatio = "16/9",
    deviceFrame = "none",
    showGuides = false,
    autoPlay = true,
    muted = true,
    onError
}: WebPlayerProps) => {

    const [currentIndex, setCurrentIndex] = useState(0);
    const [nextIndex, setNextIndex] = useState(1);
    const [isPlaying, setIsPlaying] = useState(autoPlay);

    // Refs for seamless transitions
    const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Initial Setup
    useEffect(() => {
        if (playlist.length > 0) {
            setCurrentIndex(0);
            setNextIndex(playlist.length > 1 ? 1 : 0);
        }
    }, [playlist]);

    // Playback Controller
    const triggerNext = useCallback(() => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

        setCurrentIndex(prev => {
            const len = playlist.length;
            if (len === 0) return 0;
            const next = (prev + 1) % len;
            setNextIndex((next + 1) % len);
            return next;
        });
    }, [playlist.length]);

    // Effect: Handle Current Item Playback
    useEffect(() => {
        if (playlist.length === 0 || !isPlaying) return;

        const currentItem = playlist[currentIndex];
        const durationMs = (currentItem.duration || 10) * 1000;

        // IMAGE LOGIC
        if (currentItem.type === 'image') {
            timerRef.current = setTimeout(triggerNext, durationMs);
            return () => { if (timerRef.current) clearTimeout(timerRef.current); };
        }

        // VIDEO LOGIC
        if (currentItem.type === 'video') {
            const el = videoRefs.current.get(currentIndex);
            if (el) {
                el.currentTime = 0;
                el.muted = muted; // Enforce mute policy for browser autoplay

                const playPromise = el.play();
                if (playPromise !== undefined) {
                    playPromise.catch(err => {
                        console.warn("WebPlayer Autoplay Blocked:", err);
                        // Fallback: If autoplay fails, treat as image with timer
                        timerRef.current = setTimeout(triggerNext, durationMs);
                    });
                }

                const onEnded = () => triggerNext();
                const onErr = () => {
                    console.error(`Media Error: ${currentItem.url}`);
                    if (onError) onError(`Falha ao reproduzir: ${currentItem.url}`);
                    triggerNext(); // Skip broken media
                };

                el.addEventListener('ended', onEnded);
                el.addEventListener('error', onErr);

                return () => {
                    el.removeEventListener('ended', onEnded);
                    el.removeEventListener('error', onErr);
                    if (timerRef.current) clearTimeout(timerRef.current);
                };
            }
            // Fallback if ref is missing but type is video
            timerRef.current = setTimeout(triggerNext, durationMs);
            return () => { if (timerRef.current) clearTimeout(timerRef.current); };
        }

        // WEB/HTML LOGIC (Treat as Image for now)
        timerRef.current = setTimeout(triggerNext, durationMs);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };

    }, [currentIndex, playlist, isPlaying, muted, triggerNext, onError]);

    // Effect: Preload Next Item (Gapless Buffer)
    useEffect(() => {
        if (playlist.length < 2) return;
        const nextItem = playlist[nextIndex];
        if (nextItem?.type === 'video') {
            const el = videoRefs.current.get(nextIndex);
            if (el) {
                el.preload = 'auto';
                el.load();
            }
        } else if (nextItem?.type === 'image') {
            const img = new Image();
            img.src = nextItem.url;
        }
    }, [nextIndex, playlist]);


    // Calculated Aspect Ratio Style
    // If input is "9:16" or "9/16", CSS understands "9 / 16"
    const ratioStyle = { aspectRatio: aspectRatio.replace(':', '/') };

    /**
     * Renders a specific item.
     * We keep Previous, Current, Next in DOM for smooth transitions? 
     * Actually, we just render all and use opacity for transitions 
     * to ensure true seamless/gapless switch.
     */
    const renderItem = (item: WebPlayerMedia, index: number) => {
        const isActive = index === currentIndex;
        const isNext = index === nextIndex;
        // Optimization: Only render active and next in DOM
        if (!isActive && !isNext) return null;

        const objectFitClass = item.objectFit || 'contain'; // Default strictly to contain to prevent distortion

        if (item.type === 'video') {
            return (
                <video
                    key={`vid-${item.id}-${index}`}
                    ref={el => { if (el) videoRefs.current.set(index, el); else videoRefs.current.delete(index); }}
                    src={item.url}
                    className={`web-player-media-layer ${isActive ? 'active' : ''}`}
                    style={{ objectFit: objectFitClass }}
                    muted={muted}
                    playsInline
                    preload="auto"
                />
            );
        }

        return (
            <img
                key={`img-${item.id}-${index}`}
                src={item.url}
                className={`web-player-media-layer ${isActive ? 'active' : ''}`}
                style={{ objectFit: objectFitClass }}
                alt=""
                draggable={false}
            />
        );
    };

    return (
        <div className="web-player-container">
            {/* The Virtual Screen Container - Locked Aspect Ratio */}
            <div
                className={`web-player-screen device-frame-${deviceFrame}`}
                style={ratioStyle}
            >
                {/* Safe Area Guide Layer */}
                {showGuides && <div className="safe-area-overlay"></div>}

                {/* Media Layers */}
                {playlist.length > 0 ? (
                    playlist.map((item, idx) => renderItem(item, idx))
                ) : (
                    <div style={{ color: '#666', fontSize: '12px' }}>W: Waiting for content...</div>
                )}
            </div>
        </div>
    );
};
