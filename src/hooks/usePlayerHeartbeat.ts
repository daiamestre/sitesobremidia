import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UsePlayerHeartbeatProps {
    screenId?: string;
    currentItemId?: string;
    status?: 'playing' | 'error' | 'offline';
}

const HEARTBEAT_INTERVAL = 60000; // 1 minute

export function usePlayerHeartbeat({
    screenId,
    currentItemId,
    status = 'playing'
}: UsePlayerHeartbeatProps) {

    useEffect(() => {
        if (!screenId) return;

        const sendHeartbeat = async () => {
            try {
                // Basic heartbeat
                const payload: any = {
                    last_ping_at: new Date().toISOString(),
                };

                // If the schema supports it, we could send more info
                // For now, we just stick to the known 'last_ping_at'
                // If 'status' or 'current_item_id' columns existed, we would add them here.
                // Assuming strict schema for now to avoid errors.

                await supabase
                    .from('screens')
                    .update(payload)
                    .eq('id', screenId);

            } catch (error) {
                console.error('[Heartbeat] Failed to send heartbeat:', error);
            }
        };

        // Send immediately
        sendHeartbeat();

        // Set interval
        const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        return () => clearInterval(interval);
    }, [screenId, status]); // We omit currentItemId to avoid spamming updates on every slide change, 1 min interval is enough or we update only on critical status change
}
