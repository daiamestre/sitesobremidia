import { useCallback, useState, useEffect, useRef } from 'react';
import { UnifiedPlaylistItem } from '@/pages/Player';

export function usePlaylistScheduler(items: UnifiedPlaylistItem[]) {
    const [currentIndex, setCurrentIndex] = useState(0);
    // Track current item ID to restore position on update
    const currentItemIdRef = useRef<string | null>(null);

    // Sync Ref
    useEffect(() => {
        if (items[currentIndex]) {
            currentItemIdRef.current = items[currentIndex].id;
        }
    }, [currentIndex, items]);

    // Smart Recovery on Items Change
    useEffect(() => {
        if (items.length === 0) return;

        // If we have a previous item that is still in the new list, jump to it
        if (currentItemIdRef.current) {
            const foundIndex = items.findIndex(i => i.id === currentItemIdRef.current);
            if (foundIndex !== -1 && foundIndex !== currentIndex) {
                console.log(`[Scheduler] Playlist updated. Restoring position to item ${currentItemIdRef.current} at index ${foundIndex}`);
                setCurrentIndex(foundIndex);
            }
        }
    }, [items]);

    const isScheduleValid = useCallback((item: UnifiedPlaylistItem) => {
        // If no schedule set, it's always valid
        if (!item.start_time && !item.end_time && (!item.days || item.days.length === 0)) return true;

        const now = new Date();
        const currentDay = now.getDay(); // 0 = Sunday
        const currentTime = now.getHours() * 60 + now.getMinutes();

        // Check Days
        if (item.days && item.days.length > 0 && !item.days.includes(currentDay)) return false;

        // Check Time
        if (item.start_time && item.end_time) {
            const parseTime = (t: string) => {
                const [h, m] = t.split(':').map(Number);
                return h * 60 + m;
            };
            const start = parseTime(item.start_time);
            const end = parseTime(item.end_time);

            if (start <= end) {
                // Normal range (e.g. 08:00 to 18:00)
                if (currentTime < start || currentTime >= end) return false;
            } else {
                // Overnight range (e.g. 22:00 to 06:00)
                // Valid if after start OR before end
                if (currentTime < start && currentTime >= end) return false;
            }
        }

        return true;
    }, []);

    const getNextValidItem = useCallback((currentIdx: number, allItems: UnifiedPlaylistItem[]): UnifiedPlaylistItem | null => {
        if (allItems.length === 0) return null;

        let nextIdx = (currentIdx + 1) % allItems.length;
        let attempts = 0;

        while (attempts < allItems.length) {
            const nextItem = allItems[nextIdx];
            if (isScheduleValid(nextItem)) {
                return nextItem;
            }
            nextIdx = (nextIdx + 1) % allItems.length;
            attempts++;
        }
        return null;
    }, [isScheduleValid]);

    const advance = useCallback(() => {
        if (items.length === 0) {
            if (currentIndex !== -1) setCurrentIndex(-1);
            return;
        }

        // Start searching from current index + 1
        // If currently -1, start from 0
        let startIdx = currentIndex === -1 ? 0 : (currentIndex + 1) % items.length;
        let nextIdx = startIdx;
        let attempts = 0;

        // Loop to find next valid
        while (attempts < items.length) {
            if (isScheduleValid(items[nextIdx])) {
                if (nextIdx !== currentIndex) setCurrentIndex(nextIdx);
                return;
            }
            nextIdx = (nextIdx + 1) % items.length;
            attempts++;
        }

        // If we get here, NOTHING is valid.
        // Enter "No Content" state to avoid freezing on an invalid frame.
        console.warn('[Scheduler] No scheduled content available. Entering Standby.');
        if (currentIndex !== -1) setCurrentIndex(-1);

    }, [items, currentIndex, isScheduleValid]);

    /* 
      DEADLOCK PREVENTION:
      If no content is valid, we must ensure we don't freeze.
      We return -1 for currentIndex if nothing is valid.
      And we implement a ticker to check for validity regain.
    */
    useEffect(() => {
        // If we are in "No Content" state (currentIndex === -1), check every 10s
        let interval: NodeJS.Timeout;
        if (currentIndex === -1) {
            interval = setInterval(() => {
                advance();
            }, 10000);
        }
        return () => clearInterval(interval);
    }, [currentIndex, advance]);

    return {
        currentIndex,
        setCurrentIndex,
        // Safely return undefined if -1
        currentItem: currentIndex === -1 ? undefined : items[currentIndex],
        isScheduleValid,
        advance,
        getNextValidItem
    };
}
