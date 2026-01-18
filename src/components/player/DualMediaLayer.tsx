import { useState, useEffect, useRef, useCallback } from 'react';
import { UnifiedPlaylistItem } from '@/pages/Player';
import { useOfflineMedia } from '@/hooks/useOfflineMedia';

// ==============================================
// TYPES
// ==============================================
interface DualMediaLayerProps {
    item: UnifiedPlaylistItem | null;
    nextItem: UnifiedPlaylistItem | null;
    onFinished: () => void;
    onError: () => void;
}

// ==============================================
// CONFIG
// ==============================================
const CROSSFADE_DURATION_MS = 500; // 500ms fade

// ==============================================
// SUB-COMPONENTS (Offline Aware)
// ==============================================

// Wrapper to handle Blob resolution
const OfflineVideo = ({
    src,
    isActive,
    onEnded,
    onError,
    style,
    videoRef
}: {
    src: string;
    isActive: boolean;
    onEnded: () => void;
    onError: (e: any) => void;
    style: React.CSSProperties;
    videoRef: React.RefObject<HTMLVideoElement>;
}) => {
    // Resolve URL (Cache vs Remote)
    const offlineSrc = useOfflineMedia(src);

    // PLAYBACK WATCHDOG: Force Play if Active but Paused
    useEffect(() => {
        if (!isActive || !videoRef.current) return;

        const video = videoRef.current;
        const watchdog = setInterval(() => {
            if (video.paused && !video.ended && video.readyState > 2) {
                console.warn('[OfflineVideo] Watchdog: Video paused unexpectedly. Forcing play...');
                video.muted = true; // Ensure mute
                video.play().catch(e => console.error('[OfflineVideo] Force play failed:', e));
            }
        }, 1000);

        return () => clearInterval(watchdog);
    }, [isActive, videoRef]);

    if (!offlineSrc) return null; // Wait for resolution

    return (
        <video
            ref={videoRef}
            src={offlineSrc}
            style={style}
            muted
            playsInline
            preload="auto"
            onEnded={onEnded}
            onError={onError}
            controls={false}
            // Optimization properties
            x-webkit-airplay="allow"
            disablePictureInPicture
        />
    );
};

const OfflineImage = ({
    src,
    style,
    onError
}: {
    src: string;
    style: React.CSSProperties;
    onError: (e: any) => void;
}) => {
    const offlineSrc = useOfflineMedia(src);

    // If we're waiting for the blob, maybe show nothing or a placeholder?
    // Showing nothing (black bg) is better than a broken image icon.
    if (!offlineSrc) return <div style={style} />;

    return (
        <img
            src={offlineSrc}
            style={style}
            alt="media"
            onError={onError}
        />
    );
};


// ==============================================
// MAIN COMPONENT
// ==============================================

export function DualMediaLayer({ item, nextItem, onFinished, onError }: DualMediaLayerProps) {
    // STATE: Which physical layer is currently showing?
    const [activeLayer, setActiveLayer] = useState<'A' | 'B'>('A');

    // STATE: Content for each layer
    const [contentA, setContentA] = useState<UnifiedPlaylistItem | null>(item);
    const [contentB, setContentB] = useState<UnifiedPlaylistItem | null>(nextItem); // Pre-load B immediately

    // REFS for Video Elements (for direct control)
    const videoARef = useRef<HTMLVideoElement>(null);
    const videoBRef = useRef<HTMLVideoElement>(null);

    // TRACKING: Prevent infinite loops or stale updates
    const currentItemIdRef = useRef<string | null>(item?.id || null);

    // ==============================================
    // SYNC ENGINE
    // ==============================================

    useEffect(() => {
        if (!item) return;

        // Has the item actually changed?
        if (item.id === currentItemIdRef.current) {
            // Just updated nextItem? Ensure the Reserve layer has it.
            const reserveLayer = activeLayer === 'A' ? 'B' : 'A';
            if (reserveLayer === 'A' && contentA?.id !== nextItem?.id) setContentA(nextItem);
            if (reserveLayer === 'B' && contentB?.id !== nextItem?.id) setContentB(nextItem);
            return;
        }

        console.debug(`[DualMedia] Transitioning to: ${item.id} (Next: ${nextItem?.id})`);
        currentItemIdRef.current = item.id;

        // 1. Determine which layer holds the NEW item.
        let newActiveLayer = activeLayer;

        if (contentA?.id === item.id) {
            newActiveLayer = 'A';
        } else if (contentB?.id === item.id) {
            newActiveLayer = 'B';
        } else {
            // MISS: The new item is in NEITHER layer. Panic load.
            const target = activeLayer === 'A' ? 'B' : 'A';
            if (target === 'A') setContentA(item);
            else setContentB(item);
            newActiveLayer = target;
        }

        // 2. TRIGGER TRANSITION
        setActiveLayer(newActiveLayer);

        // 3. PREPARE RESERVE LAYER (Pre-fetch next)
        const reserve = newActiveLayer === 'A' ? 'B' : 'A';
        if (nextItem) {
            if (reserve === 'A') setContentA(nextItem);
            else setContentB(nextItem);
        } else {
            if (reserve === 'A') setContentA(null);
            else setContentB(null);
        }

    }, [item, nextItem]);

    // ==============================================
    // PLAYBACK CONTROLLER
    // ==============================================

    /* 
       NOTE: We use a slight timeout to ensure the DOM has updated with the new 'offlineSrc' 
       before calling .play(). The OfflineVideo component helps, but the ref might be unstable for a microtask.
    */

    const playVideo = useCallback((video: HTMLVideoElement) => {
        video.currentTime = 0;
        video.muted = true; // STRICT FORCE MUTE
        const p = video.play();
        if (p) p.catch(e => {
            console.error("Play error:", e);
            // Retry once with strict mute if NotAllowed
            if (e.name === 'NotAllowedError') {
                video.muted = true;
                video.play().catch(err => {
                    console.error("Retry failed, skipping:", err);
                    if (activeLayer === (video === videoARef.current ? 'A' : 'B')) {
                        onError();
                    }
                });
            } else if (activeLayer === (video === videoARef.current ? 'A' : 'B')) {
                onError();
            }
        });
    }, [activeLayer, onError]);

    // CONTROL LAYER A
    useEffect(() => {
        const video = videoARef.current;
        if (!video) return;

        if (activeLayer === 'A') {
            playVideo(video);
        } else {
            video.pause();
            if (contentA) video.load();
        }
    }, [activeLayer, contentA, playVideo]);

    // CONTROL LAYER B
    useEffect(() => {
        const video = videoBRef.current;
        if (!video) return;

        if (activeLayer === 'B') {
            playVideo(video);
        } else {
            video.pause();
            if (contentB) video.load();
        }
    }, [activeLayer, contentB, playVideo]);


    // ==============================================
    // HELPERS
    // ==============================================

    const handleMediaEnd = useCallback(() => {
        onFinished();
    }, [onFinished]);

    const handleMediaError = useCallback((layer: 'A' | 'B', e: any) => {
        console.error(`[Player] Error in Layer ${layer}:`, e);
        if (layer === activeLayer) {
            console.log('[Player] Skipping corrupted media...');
            onError();
        }
    }, [activeLayer, onError]);

    // RENDER HELPER
    const renderLayer = (layerId: 'A' | 'B', content: UnifiedPlaylistItem | null) => {
        const isActive = activeLayer === layerId;
        const style: React.CSSProperties = {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: isActive ? 10 : 0,
            opacity: isActive ? 1 : 0,
            transition: `opacity ${CROSSFADE_DURATION_MS}ms ease-in-out`,
            backgroundColor: 'black'
        };

        if (!content || !content.media) return <div style={{ ...style, backgroundColor: 'black' }} />;

        if (content.media.file_type === 'video') {
            return (
                <OfflineVideo
                    key={content.id} // FORCE REMOUNT IF CONTENT CHANGES
                    src={content.media.file_url}
                    isActive={isActive}
                    onEnded={() => { if (isActive) handleMediaEnd(); }}
                    onError={(e) => handleMediaError(layerId, e)}
                    style={style}
                    videoRef={layerId === 'A' ? videoARef : videoBRef}
                />
            );
        }

        return (
            <OfflineImage
                key={content.id}
                src={content.media.file_url}
                style={style}
                onError={(e) => handleMediaError(layerId, e)}
            />
        );
    };

    return (
        <div className="relative w-full h-full bg-black overflow-hidden">
            {renderLayer('A', contentA)}
            {renderLayer('B', contentB)}
        </div>
    );
}

