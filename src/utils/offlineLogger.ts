import { supabase } from "@/integrations/supabase/client";

const QUEUE_KEY = "codemidia_playback_queue";
const MAX_QUEUE_SIZE = 5000; // Store up to 5000 logs (~5 days of continuous play)

export interface PlaybackLogEntry {
    screen_id: string;
    media_id: string;
    playlist_id: string | null;
    duration: number;
    status: string;
    started_at: string;
}

export const offlineLogger = {
    /**
     * Save a log entry to the local queue.
     */
    log: (entry: PlaybackLogEntry) => {
        try {
            const queueStr = localStorage.getItem(QUEUE_KEY);
            let queue: PlaybackLogEntry[] = queueStr ? JSON.parse(queueStr) : [];

            // Add new entry
            queue.push(entry);

            // Cap size to prevent storage overflow
            if (queue.length > MAX_QUEUE_SIZE) {
                // Remove oldest
                queue = queue.slice(queue.length - MAX_QUEUE_SIZE);
            }

            localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

            // Try to flush immediately if online
            if (navigator.onLine) {
                offlineLogger.flush();
            }
        } catch (e) {
            console.error("OfflineLogger: Failed to save log", e);
        }
    },

    /**
     * Try to send queued logs to the server.
     */
    flush: async () => {
        if (!navigator.onLine) return;

        try {
            const queueStr = localStorage.getItem(QUEUE_KEY);
            if (!queueStr) return;

            const queue: PlaybackLogEntry[] = JSON.parse(queueStr);
            if (queue.length === 0) return;

            // Take a batch (e.g., 50 items) to prevent massive payloads
            const batchSize = 50;
            const batch = queue.slice(0, batchSize);

            // Send to Supabase
            const { error } = await supabase.from('playback_logs').insert(batch);

            if (!error) {
                // Success! Remove from queue
                const remaining = queue.slice(batchSize);
                localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));

                console.log(`OfflineLogger: Flushed ${batch.length} logs. Remaining: ${remaining.length}`);

                // If more remain, flush again recursively next tick or soon
                if (remaining.length > 0) {
                    setTimeout(() => offlineLogger.flush(), 1000);
                }
            } else {
                console.warn("OfflineLogger: Flush failed (Supabase error)", error);
            }
        } catch (e) {
            console.error("OfflineLogger: Flush error", e);
        }
    },

    /**
     * Get queue status for debugging
     */
    getStatus: () => {
        const queueStr = localStorage.getItem(QUEUE_KEY);
        const queue = queueStr ? JSON.parse(queueStr) : [];
        return { count: queue.length };
    }
};

// Auto-flush periodically
setInterval(() => {
    offlineLogger.flush();
}, 60000); // Check every minute

// Flush when coming online
window.addEventListener('online', () => offlineLogger.flush());
