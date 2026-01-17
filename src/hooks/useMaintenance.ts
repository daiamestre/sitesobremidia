
import { useEffect } from 'react';

/**
 * Runs weekly maintenance tasks.
 * Schedule: Sunday at 03:00 AM
 */
export function useMaintenance() {
    useEffect(() => {
        const checkSchedule = () => {
            const now = new Date();
            // Sunday (0), 3 AM
            if (now.getDay() === 0 && now.getHours() === 3 && now.getMinutes() < 5) {
                console.log('[Maintenance] Running scheduled maintenance...');
                if (window.NativePlayer?.clearAppCache) {
                    window.NativePlayer.clearAppCache();
                } else {
                    console.warn('[Maintenance] Native bridge not available for cache clear.');
                }
            }
        };

        // Check every minute
        const interval = setInterval(checkSchedule, 60 * 1000);
        return () => clearInterval(interval);
    }, []);
}
