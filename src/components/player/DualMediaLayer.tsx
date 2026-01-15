import { useState, useEffect, useRef } from 'react';
import { UnifiedPlaylistItem } from '@/pages/Player'; // We will export this interface from Player.tsx if not already
import { Loader2 } from 'lucide-react';

// Re-using the logic from the original MediaRenderer but adapted for dual-buffer
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
            videoRef.current.currentTime = 0;
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(e => {
                    console.warn('[DualLayer] Play failed:', e);
                    // Auto-recover from play failure (e.g. interaction policy) by moving next
                    if (onFinished) onFinished();
                });
            }
        } else if (!isActive && videoRef.current) {
            // Pause when not active to save resources
            videoRef.current.pause();
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
                // Preload auto to ensure it's ready in background
                preload="auto"
                loop={false}
                disablePictureInPicture
                controls={false}
                onEnded={onFinished}
                onError={onError}
            />
        );
    }

    return (
        <img
            src={media.file_url}
            alt={media.name}
            style={style}
            className="animate-ken-burns"
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

export function DualMediaLayer({ item, nextItem, onFinished, onError }: DualMediaLayerProps) {
    // We maintain two fixed "slots" or "channels" (A and B)
    // One is Active (visible), the other is Buffer (hidden/preloading)
    // When item changes, we swap roles.

    // Actually, a simpler React approach for Gapless is:
    // Render [CurrentItem] with z-index 10
    // Render [NextItem] with z-index 1
    // But standard React re-renders might unmount the previous component.

    // Better Approach: "Ping Pong" buffering
    // We decide which slot (A or B) the *current* item belongs to.
    // Ideally, if index is Even -> Slot A, Odd -> Slot B.

    const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');

    // We need to track what is currently assigned to each slot.
    const [slotAItem, setSlotAItem] = useState<UnifiedPlaylistItem | null>(null);
    const [slotBItem, setSlotBItem] = useState<UnifiedPlaylistItem | null>(null);

    // When props.item changes, we need to decide where to put it.
    useEffect(() => {
        if (!item) return;

        // Strategy: 
        // If activeSlot is A, and we get a new item...
        // We want to put the NEW item into B, and then switch activeSlot to B.
        // BUT, the prop `item` IS the "current" item we want to show RIGHT NOW.

        // So actually:
        // If the new `item` is different from what's in activeSlot,
        // We verify if it is already preloaded in the OTHER slot.

        // Let's simplify: Use an internal index tracker or just check ID.
        // If item.id matches slotA.id, active is A.
        // If item.id matches slotB.id, active is B.
        // If neither, we need to load it into the "inactive" slot and switch.

        if (slotAItem?.id === item.id) {
            setActiveSlot('A');
            // Preload next into B
            if (nextItem && slotBItem?.id !== nextItem.id) {
                setSlotBItem(nextItem);
            }
        } else if (slotBItem?.id === item.id) {
            setActiveSlot('B');
            // Preload next into A
            if (nextItem && slotAItem?.id !== nextItem.id) {
                setSlotAItem(nextItem);
            }
        } else {
            // Cold start or unexpected jump: Load into the 'next' slot relative to current active
            // If currently A is active, load new into B and switch (fade in?)
            // For hard cuts, just load into the pending slot.
            const targetSlot = activeSlot === 'A' ? 'B' : 'A';
            if (targetSlot === 'A') setSlotAItem(item);
            else setSlotBItem(item);
            setActiveSlot(targetSlot);

            // Immediately queue next
            const bufferSlot = targetSlot === 'A' ? 'B' : 'A';
            if (nextItem) {
                if (bufferSlot === 'A') setSlotAItem(nextItem);
                else setSlotBItem(nextItem);
            }
        }
    }, [item, nextItem]); // We intentionally omit slotAItem/slotBItem dependencies to avoid loops, reliant on functional updates or careful logic

    return (
        <div className="relative w-full h-full bg-black overflow-hidden">
            {/* SLOT A */}
            <div
                className={`absolute inset-0 transition-opacity duration-300 ${activeSlot === 'A' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
            >
                <SingleLayer
                    item={slotAItem}
                    isActive={activeSlot === 'A'}
                    onFinished={() => { if (activeSlot === 'A') onFinished() }}
                    onError={() => { if (activeSlot === 'A') onError() }}
                />
            </div>

            {/* SLOT B */}
            <div
                className={`absolute inset-0 transition-opacity duration-300 ${activeSlot === 'B' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
            >
                <SingleLayer
                    item={slotBItem}
                    isActive={activeSlot === 'B'}
                    onFinished={() => { if (activeSlot === 'B') onFinished() }}
                    onError={() => { if (activeSlot === 'B') onError() }}
                />
            </div>

            {/* Loading Indicator if active Layer has no item (rare) */}
            {!item && (
                <div className="absolute inset-0 flex items-center justify-center z-50">
                    <Loader2 className="w-10 h-10 text-white/20 animate-spin" />
                </div>
            )}
        </div>
    );
}
