import { supabaseConfig } from "@/supabaseConfig";

const QUEUE_KEY = "codemidia_playback_queue";
const MAX_QUEUE_SIZE = 5000;

export interface PlaybackLogEntry {
    screen_id: string;
    media_id: string;
    playlist_id: string | null;
    duration: number;
    status: string;
    started_at: string;
}

export const offlineLogger = {
    log: (entry: PlaybackLogEntry) => {
        try {
            console.log("OfflineLogger: Queueing log", entry);
            const queueStr = localStorage.getItem(QUEUE_KEY);
            let queue: PlaybackLogEntry[] = queueStr ? JSON.parse(queueStr) : [];
            queue.push(entry);
            if (queue.length > MAX_QUEUE_SIZE) queue = queue.slice(queue.length - MAX_QUEUE_SIZE);
            localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

            if (navigator.onLine) offlineLogger.flush();
        } catch (e) {
            console.error("OfflineLogger: Save failed", e);
        }
    },

    flush: async () => {
        if (!navigator.onLine) return;

        try {
            const queueStr = localStorage.getItem(QUEUE_KEY);
            if (!queueStr) return;

            const queue: PlaybackLogEntry[] = JSON.parse(queueStr);
            if (queue.length === 0) return;

            const batchSize = 50;
            const batch = queue.slice(0, batchSize);

            // USE DIRECT FETCH (Bypass Supabase Client)
            const url = `${supabaseConfig.url}/rest/v1/playback_logs`;
            const headers = {
                'apikey': supabaseConfig.key,
                'Authorization': `Bearer ${supabaseConfig.key}`, // Anon Key
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            };

            // Send batch to Supabase
            const resp = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(batch)
            });

            if (resp.ok) {
                // Success: Remove flushed items from queue
                // Correct logic: filter out items that were in the batch
                const remaining = queue.filter(item => !batch.includes(item));

                localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
                console.log(`OfflineLogger: ✅ Flushed ${batch.length} logs to Supabase. Response: 201 OK.`);

                // If there are more items, try to flush again soon
                if (remaining.length > 0) setTimeout(() => offlineLogger.flush(), 1000);
            } else {
                const errorText = await resp.text();

                // Handle 409 Conflict (Foreign Key Violation - Deleted Media)
                if (resp.status === 409 || errorText.includes('violates foreign key constraint')) {
                    console.warn(`OfflineLogger: ⚠️ Batch failed with 409. Retrying ${batch.length} items individually to save valid logs.`);

                    // GRANULAR RECOVERY: Switch to serial mode for this batch
                    const successfullyProcessed: PlaybackLogEntry[] = [];

                    for (const item of batch) {
                        try {
                            const singleResp = await fetch(url, {
                                method: 'POST',
                                headers,
                                body: JSON.stringify([item]) // Send as array of 1
                            });

                            if (singleResp.ok) {
                                successfullyProcessed.push(item);
                            } else if (singleResp.status === 409) {
                                console.warn("OfflineLogger: 🗑️ Discarding invalid log (Deleted Media):", item.media_id);
                                successfullyProcessed.push(item); // Mark as processed to remove from queue
                            } else {
                                console.error(`OfflineLogger: ❌ Single Item Failed. Status: ${singleResp.status}`);
                                // Do NOT add to successfullyProcessed -> keeps in queue for retry
                            }
                        } catch (e) {
                            console.error("OfflineLogger: Network error on single item retry", e);
                        }
                    }

                    // Update Queue: Remove only what was processed (sent OR discarded)
                    const remaining = queue.filter(qItem => !successfullyProcessed.includes(qItem));
                    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
                    console.log(`OfflineLogger: ♻️ Recovery Complete. Saved ${successfullyProcessed.length} items.`);

                } else {
                    console.error(`OfflineLogger: ❌ Flush Failed. Status: ${resp.status}. Response: ${errorText}`);
                }
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
