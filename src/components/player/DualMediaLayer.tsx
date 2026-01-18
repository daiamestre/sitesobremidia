import { useState, useEffect, useRef, useCallback } from 'react';
import { UnifiedPlaylistItem } from '@/pages/Player';
import { DirectMediaRenderer } from './DirectMediaRenderer';

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
// Reduced crossfade for snappier transitions on TV boxes
const CROSSFADE_DURATION_MS = 500;

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
    // Note: UniversalMediaRenderer handles its own "Force Play" logic internally 
    // using the aggressive watchdog. We mostly just manage layer visibility here.

    // We still keep a high-level pause ensure to stop the background layer
    useEffect(() => {
        const video = videoARef.current;
        if (video && activeLayer !== 'A') {
            video.pause();
            // video.currentTime = 0; // Optional: Reset for next time?
        }
    }, [activeLayer]);

    useEffect(() => {
        const video = videoBRef.current;
        if (video && activeLayer !== 'B') {
            video.pause();
        }
    }, [activeLayer]);


    // ==============================================
    // HELPERS
    // ==============================================

    const handleMediaEnd = useCallback(() => {
        onFinished();
    }, [onFinished]);

    const handleMediaError = useCallback((layer: 'A' | 'B', e: any) => {
        console.error(`[Player] Error in Layer ${layer}:`, e);

        // Dispatch diagnostic event
        const errorMsg = e.message || (e.currentTarget && e.currentTarget.error ? e.currentTarget.error.message : 'Unknown Playback Error');
        window.dispatchEvent(new CustomEvent('player-media-error', { detail: { message: `L${layer}: ${errorMsg}` } }));

        if (layer === activeLayer) {
            console.log('[Player] Skipping corrupted media...');
            onError(); // Skip
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

        // ROBUSTNESS: Normalize file_type check (handle 'Video', 'VIDEO', 'video/mp4')
        // AND check file extension for formats like .mov, .mkv which might have missed mime types
        const fileUrl = content.media.file_url?.toLowerCase() || '';
        const dbType = content.media.file_type?.toLowerCase() || '';

        const isVideoExtension = /\.(mp4|mov|webm|mkv|avi|m4v|3gp)(\?|$)/i.test(fileUrl);
        const isVideoMime = dbType.includes('video');

        const isVideo = isVideoMime || isVideoExtension;

        // GUESS MIME TYPE IF MISSING (Crucial for .mov/.mkv support)
        let effectiveMime = content.media.mime_type;
        if (isVideo && (!effectiveMime || !effectiveMime.includes('video'))) {
            if (fileUrl.endsWith('.mov')) effectiveMime = 'video/quicktime';
            else if (fileUrl.endsWith('.mkv')) effectiveMime = 'video/x-matroska';
            else if (fileUrl.endsWith('.webm')) effectiveMime = 'video/webm';
            else effectiveMime = 'video/mp4';
        }

        return (
            <DirectMediaRenderer
                key={content.id}
                src={content.media.file_url}
                type={isVideo ? 'video' : 'image'}
                mimeType={effectiveMime}
                isActive={isActive}
                onEnded={() => { if (isActive) handleMediaEnd(); }}
                onError={(e) => handleMediaError(layerId, e)}
                style={style}
                videoRef={layerId === 'A' ? videoARef : videoBRef}
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
