import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export function usePlayerHeartbeat(screenId: string | null | undefined) {
    useEffect(() => {
        if (!screenId) return;

        const sendHeartbeat = async () => {
            try {
                // RLS: escrita em screens/devices exige sessão autenticada.
                // Player anônimo tem presença registrada pela RPC oficial
                // get_player_playlist_for_screen (devices.last_seen no caminho bound).
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                const deviceToken = localStorage.getItem('player_screen_token_codemidia');

                // Try to update by ID first (UUID)
                const { data: updated } = await supabase
                    .from('screens')
                    .update({ last_ping_at: new Date().toISOString() })
                    .eq('id', screenId)
                    .select('id');

                // If no rows updated (maybe screenId is custom_id?), try custom_id
                if ((!updated || updated.length === 0) && screenId) {
                    await supabase
                        .from('screens')
                        .update({ last_ping_at: new Date().toISOString() })
                        .eq('custom_id', screenId);
                }

                // If device token exists, update device last_seen as well
                if (deviceToken) {
                    await supabase
                        .from('devices')
                        .update({ last_seen: new Date().toISOString() })
                        .eq('screen_token', deviceToken);
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
