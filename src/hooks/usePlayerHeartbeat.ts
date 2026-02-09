import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export function usePlayerHeartbeat(screenId: string | null | undefined) {
    useEffect(() => {
        if (!screenId) return;

        const sendHeartbeat = async () => {
            try {
                // Try to update by ID first (UUID)
                const { error, count } = await supabase
                    .from('screens')
                    .update({ last_ping_at: new Date().toISOString() })
                    .eq('id', screenId)
                    .select('id', { count: 'exact' });

                // If no rows updated (maybe screenId is custom_id?), try custom_id
                if ((!count || count === 0) && screenId) {
                    await supabase
                        .from('screens')
                        .update({ last_ping_at: new Date().toISOString() })
                        .eq('custom_id', screenId);
                }
            } catch (err) {
                console.error('Error sending heartbeat:', err);
            }
        };

        // Send immediate ping on mount/screenId change
        sendHeartbeat();

        // Set up interval
        const intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        return () => clearInterval(intervalId);
    }, [screenId]);
}
