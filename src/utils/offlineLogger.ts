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

            const resp = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(batch)
            });

            if (resp.ok) {
                const remaining = queue.slice(batchSize);
                localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
                console.log(`OfflineLogger: Flushed ${batch.length} logs. Remaining: ${remaining.length}`);
                if (remaining.length > 0) setTimeout(() => offlineLogger.flush(), 1000);
            } else {
                console.warn("OfflineLogger: Flush Failed", resp.status, await resp.text());
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
