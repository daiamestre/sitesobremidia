import { supabaseConfig } from "@/supabaseConfig";
import { resolveDeviceId } from "@/components/player/playerPlaylist";

const QUEUE_KEY = "codemidia_playback_queue";
const MAX_QUEUE_SIZE = 5000;

export interface PlaybackLogEntry {
    screen_id: string;
    media_id: string;
    playlist_id: string | null;
    duration: number;
    status: string;
    started_at: string;
    /** F-147: zona em que a mídia foi exibida (ausente = tela cheia) */
    zona_id?: string;
    zona_numero?: number;
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

            // F-147: a tabela não aceita gravação sem login (o envio direto era sempre recusado). O registro agora
            // entra pela função fn_player_registrar_exibicoes, que só aceita o aparelho vinculado à tela.
            // Um envio por tela, até 50 registros por vez.
            const tela = queue[0].screen_id;
            const batch = queue.filter((e) => e.screen_id === tela).slice(0, 50);
            const deviceId = resolveDeviceId(
                (globalThis as Record<string, unknown>).NativePlayer as { getDeviceId?: () => string } | undefined
            );

            const resp = await fetch(`${supabaseConfig.url}/rest/v1/rpc/fn_player_registrar_exibicoes`, {
                method: 'POST',
                headers: {
                    'apikey': supabaseConfig.key,
                    'Authorization': `Bearer ${supabaseConfig.key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ p_identifier: tela, p_device_id: deviceId, p_registros: batch }),
            });

            if (!resp.ok) {
                console.error(`OfflineLogger: envio recusado (${resp.status}). Os registros ficam na fila.`);
                return;
            }
            const r = (await resp.json().catch(() => null)) as { status?: string; gravados?: number } | null;
            // SUCCESS: gravou os válidos (mídia apagada fica de fora). SEM_ACESSO: este aparelho não é o da tela, então
            // esses registros nunca poderão entrar — saem da fila para não travar os das outras telas.
            if (r?.status !== 'SUCCESS') console.warn(`OfflineLogger: ${batch.length} registro(s) descartado(s): ${r?.status ?? 'resposta inválida'}.`);
            const remaining = queue.filter((item) => !batch.includes(item));
            localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
            if (remaining.length > 0) setTimeout(() => offlineLogger.flush(), 1000);
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
