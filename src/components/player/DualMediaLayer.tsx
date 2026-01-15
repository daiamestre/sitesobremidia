import { useState, useEffect, useRef } from 'react';
import { UnifiedPlaylistItem } from '@/pages/Player';
// Removed visible Loader import to keep UI clean
// import { Loader2 } from 'lucide-react';

/* 
  SINGLE LAYER COMPONENT
  Wrapper for standard HTML5 Video/Image.
  - Handles "active" state (play/pause).
  - Preloads when inactive.
*/
const SingleLayer = ({
    item,
    isActive,
    onFinished,
    onError
}: {
    item: UnifiedPlaylistItem | null;
    isActive: boolean;
    onFinished?: () => void;
    onError?: () => void;
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (isActive && videoRef.current) {
            // Force play when becoming active
            // Reset logic: only reset if it's not already playing correct content?
            // Actually for digital signage, usually we want to restart the video.
            videoRef.current.currentTime = 0;
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(e => {
                    console.warn('[DualLayer] Play failed (autoplay policy?):', e);
                    // If autoplay fails, we might want to skip or just start next.
                    // For now, let's try to recover by skipping after 2s if it really stuck.
                    // But actually, 'canplay' logic should have handled it.
                });
            }
        } else if (!isActive && videoRef.current) {
            // Pause/Stop when not active
            videoRef.current.pause();
            // Optional: videoRef.current.currentTime = 0; // Prepare for next time?
        }
    }, [isActive, item]); // Re-run if item changes while active

    if (!item || !item.media) return null;

    const media = item.media;
    const fitMode = media.file_type === 'video' ? 'contain' : 'cover';

    const style: React.CSSProperties = {
        width: '100%',
        height: '100%',
        objectFit: fitMode,
        objectPosition: 'center',
        backgroundColor: '#000',
    };

    if (media.file_type === 'video') {
        return (
            <video
                ref={videoRef}
                src={media.file_url}
                style={style}
                muted
                playsInline
                // CRITICAL: Preload 'auto' allows the hidden layer to buffer data.
                preload="auto"
                loop={false}
                disablePictureInPicture
                controls={false}
                onEnded={onFinished}
                onError={(e) => {
                    console.warn('Video error:', e);
                    if (onError) onError();
                }}
            />
        );
    }

    return (
        <img
            src={media.file_url}
            alt={media.name}
            style={style}
            // Optional: Add simple fade-in for images
            // className="animate-in fade-in duration-500" 
            onError={onError}
        />
    );
};

interface DualMediaLayerProps {
    item: UnifiedPlaylistItem | null;
    nextItem: UnifiedPlaylistItem | null;
    onFinished: () => void;
    onError: () => void;
}

/*
  DUAL MEDIA LAYER (Ping-Pong Buffer)
  Strategies:
  1. Slot A and Slot B.
  2. One is VISIBLE (z-10, opacity-100).
  3. One is BUFFER (z-0, opacity-0 or hidden).
  4. When 'item' changes, we assert that 'item' is already in the BUFFER slot, so we specificy that slot as VISIBLE.
  5. Then we immediately load 'nextItem' into the NOW-EMPTY buffer slot.
*/
export function DualMediaLayer({ item, nextItem, onFinished, onError }: DualMediaLayerProps) {
    const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');

    const [slotAItem, setSlotAItem] = useState<UnifiedPlaylistItem | null>(item);
    // Initialize slot B with next item immediately
    const [slotBItem, setSlotBItem] = useState<UnifiedPlaylistItem | null>(nextItem);

    // Track previous ID to detect changes
    const prevItemIdRef = useRef<string | null>(item?.id || null);

    useEffect(() => {
        if (!item) return;
        const prevId = prevItemIdRef.current;

        // If the item hasn't effectively changed, do nothing.
        // (React might re-render, but if ID is same, we are good)
        if (item.id === prevId) {
            // Just ensure nextItem is queued if it changed mid-playback
            // Case: Playlist order shuffled or new item added while playing
            // We only update buffer if it's not currently holding the next item
            const currentBufferSlot = activeSlot === 'A' ? 'B' : 'A';
            if (currentBufferSlot === 'B') {
                if (slotBItem?.id !== nextItem?.id) setSlotBItem(nextItem);
            } else {
                if (slotAItem?.id !== nextItem?.id) setSlotAItem(nextItem);
            }
            return;
        }

        // ITEM CHANGED (Transition detected)
        prevItemIdRef.current = item.id;

        // Check if the new item is waiting in the buffer (Ideal "Gapless" Case)
        let newActiveSlot = activeSlot;

        // Is it in A?
        if (slotAItem?.id === item.id) {
            newActiveSlot = 'A';
        } else if (slotBItem?.id === item.id) {
            // It is in B! Perfect.
            newActiveSlot = 'B';
        } else {
            // FALLBACK / COLD JUMP
            // Item is neither in A nor B (e.g. user clicked "Next" fast, or first load misalignment).
            // We force load it into the "Other" slot and switch to it.
            // Why "Other"? To preserve the current one fading out? 
            // Actually, if we jump, just use the 'other' slot to crossfade or cut.
            const target = activeSlot === 'A' ? 'B' : 'A';
            if (target === 'A') setSlotAItem(item);
            else setSlotBItem(item);
            newActiveSlot = target;
        }

        // 1. Commit the switch
        setActiveSlot(newActiveSlot);

        // 2. Queue the Next Item into the NOW-Idle slot
        const idleSlot = newActiveSlot === 'A' ? 'B' : 'A';
        if (nextItem) {
            if (idleSlot === 'A') setSlotAItem(nextItem);
            else setSlotBItem(nextItem);
        } else {
            // Cleanup idle slot if no next item
            if (idleSlot === 'A') setSlotAItem(null);
            else setSlotBItem(null);
        }

    }, [item, nextItem]); // Dependencies: item and nextItem are the driver.

    // Calculate styling for crossfade or cut
    // For seamless signage, a very fast fade (300ms) or pure cut (0s) is preferred.
    // Let's go with 0.5s fade to mask any decoding stutter.
    const getSlotClass = (slot: 'A' | 'B') => {
        const isActive = activeSlot === slot;
        // z-index: active is 10, idle is 0
        // opacity: active is 100, idle is 0
        return `absolute inset-0 transition-opacity duration-500 ease-linear ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'}`;
    };

    return (
        <div className="relative w-full h-full bg-black overflow-hidden">
            {/* SLOT A */}
            <div className={getSlotClass('A')}>
                <SingleLayer
                    item={slotAItem}
                    isActive={activeSlot === 'A'}
                    onFinished={() => { if (activeSlot === 'A') onFinished(); }}
                    onError={() => { if (activeSlot === 'A') onError(); }}
                />
            </div>

            {/* SLOT B */}
            <div className={getSlotClass('B')}>
                <SingleLayer
                    item={slotBItem}
                    isActive={activeSlot === 'B'}
                    onFinished={() => { if (activeSlot === 'B') onFinished(); }}
                    onError={() => { if (activeSlot === 'B') onError(); }}
                />
            </div>
        </div>
    );
}
