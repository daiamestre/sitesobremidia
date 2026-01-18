import { useCallback, useState, useEffect } from 'react';
import { UnifiedPlaylistItem } from '@/pages/Player';

export function usePlaylistScheduler(items: UnifiedPlaylistItem[]) {
    // Determine the safe initial index: 0 if items exist, else -1
    const [currentIndex, setCurrentIndex] = useState(() => items.length > 0 ? 0 : -1);

    // 1. Reset/Correction when Playlist Changes
    useEffect(() => {
        if (items.length === 0) {
            setCurrentIndex(-1);
        } else {
            // If we are out of bounds or in -1 state, reset to 0
            setCurrentIndex(prev => (prev >= 0 && prev < items.length) ? prev : 0);
        }
    }, [items.length]); // Only depend on length change to avoid constant resets

    // 2. Simple Round-Robin Advance
    const advance = useCallback(() => {
        if (items.length === 0) return;

        setCurrentIndex(prev => {
            const next = prev + 1;
            // Loop back to 0 if at end
            return next >= items.length ? 0 : next;
        });
    }, [items.length]);

    // 3. Helper: Peek Next
    const getNextValidItem = useCallback((currentIdx: number, allItems: UnifiedPlaylistItem[]) => {
        if (allItems.length === 0) return null;
        const next = (currentIdx + 1) % allItems.length;
        return allItems[next];
    }, []);

    // 4. Validity Check (Pass-through for now)
    // We assume the Player.tsx fetcher has already filtered GARBAGE.
    // We assume everything in 'items' IS VALID and should play.
    const isScheduleValid = useCallback(() => true, []);

    return {
        currentIndex,
        setCurrentIndex,
        currentItem: items[currentIndex],
        nextItem: getNextValidItem(currentIndex, items),
        isScheduleValid,
        advance,
        getNextValidItem
    };
}
