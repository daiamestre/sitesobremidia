import { useState, useEffect, useRef, useCallback } from 'react';
import { UnifiedPlaylistItem } from '@/pages/Player';

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
const PRELOAD_OFFSET_SEC = 2; // Start preloading next video this many seconds before end (Not fully utilized in this architecture, we preload immediately)

/*
  DOUBLE BUFFERING PLAYER ENGINE
  - Two permanent video layers: Layer A and Layer B.
  - "Active" layer is visible (opacity 1, z-index 10).
  - "Reserve" layer is hidden (opacity 0, z-index 0) but LOADED.
  - When "Advance" happens, we simply swap the Active/Reserve pointers and Fade.
*/

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

    // When the main 'item' prop changes, it means the scheduler has officially advanced.
    // We need to ensure the visual state matches this new reality.
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

        console.log(`[DualMedia] Transitioning to: ${item.id} (Next: ${nextItem?.id})`);
        currentItemIdRef.current = item.id;

        // 1. Determine which layer holds the NEW item.
        // Ideally, the Reserve layer already has it pre-loaded.
        let newActiveLayer = activeLayer;

        if (contentA?.id === item.id) {
            newActiveLayer = 'A';
        } else if (contentB?.id === item.id) {
            newActiveLayer = 'B';
        } else {
            // MISS: The new item is in NEITHER layer (e.g. random jump).
            // Panic load into the reserve layer and switch.
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
            // Clear if end of playlist
            if (reserve === 'A') setContentA(null);
            else setContentB(null);
        }

    }, [item, nextItem]); // activeLayer, contentA, contentB are implied state, not deps for this trigger

    // ==============================================
    // PLAYBACK CONTROLLER
    // ==============================================

    // We watch 'activeLayer' and 'contentX' to control Play/Pause

    // CONTROL LAYER A
    useEffect(() => {
        const video = videoARef.current;
        if (!video) return;

        if (activeLayer === 'A') {
            // Layer A is ACTIVE
            video.currentTime = 0; // Ensure start from 0 (or remove if smooth loop desired, but usually 0)
            const p = video.play();
            if (p) p.catch(e => console.warn('[Player] Layer A play error:', e));
        } else {
            // Layer A is RESERVE
            // If it has content, it should be PAUSED but Ready.
            // If we want "Pre-buffering", we can let it load but keep it paused.
            // video.pause() is standard.
            video.pause();
            if (contentA) {
                video.load(); // Force buffer start
            }
        }
    }, [activeLayer, contentA]);

    // CONTROL LAYER B
    useEffect(() => {
        const video = videoBRef.current;
        if (!video) return;

        if (activeLayer === 'B') {
            video.currentTime = 0;
            const p = video.play();
            if (p) p.catch(e => console.warn('[Player] Layer B play error:', e));
        } else {
            video.pause();
            if (contentB) {
                video.load();
            }
        }
    }, [activeLayer, contentB]);


    // ==============================================
    // HELPERS
    // ==============================================

    const handleMediaEnd = useCallback(() => {
        // Only the ACTIVE player should trigger "onFinished"
        onFinished();
    }, [onFinished]);

    const handleMediaError = useCallback((layer: 'A' | 'B', e: any) => {
        // Blindagem: If active layer fails, skip immediately.
        console.error(`[Player] Error in Layer ${layer}:`, e);
        if (layer === activeLayer) {
            console.log('[Player] Skipping corrupted media...');
            onError(); // Triggers advance
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
            backgroundColor: 'black' // No transparent gaps
        };

        if (!content || !content.media) return <div style={{ ...style, backgroundColor: 'black' }} />;

        if (content.media.file_type === 'video') {
            return (
                <video
                    ref={layerId === 'A' ? videoARef : videoBRef}
                    src={content.media.file_url}
                    style={style}
                    muted
                    playsInline
                    preload="auto" // CRITICAL FOR PRE-FETCH
                    onEnded={() => { if (isActive) handleMediaEnd(); }}
                    onError={(e) => handleMediaError(layerId, e)}
                    // Hide Controls Hard
                    controls={false}
                />
            );
        }

        // Image Support
        return (
            <img
                src={content.media.file_url}
                style={style}
                alt="media"
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

