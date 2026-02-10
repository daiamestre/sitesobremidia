import { supabase } from "@/integrations/supabase/client";

// NativePlayer is declared in src/vite-env.d.ts

export const monitoring = {
    /**
     * Captures a screenshot via Native Bridge and uploads it to Supabase.
     * Returns the public URL of the uploaded image.
     */
    captureAndUploadScreenshot: async (screenId: string): Promise<string | null> => {
        return new Promise((resolve) => {
            if (!window.NativePlayer || !window.NativePlayer.captureScreenshot) {
                console.warn("Monitoring: NativePlayer bridge not found.");
                resolve(null);
                return;
            }

            // Define the callback for Native Bridge
            window.onScreenshotReady = async (base64: string | null) => {
                if (!base64) {
                    console.error("Monitoring: Screenshot failed or returned null.");
                    resolve(null);
                    return;
                }

                try {
                    // Convert base64 to Blob
                    const res = await fetch(base64);
                    const blob = await res.blob();

                    // Use crypto.randomUUID() supported in modern browsers/WebViews
                    const fileName = `${screenId}/${crypto.randomUUID()}.jpg`;

                    // Upload to 'proof_of_play' bucket
                    const { data, error } = await supabase.storage
                        .from('proof_of_play')
                        .upload(fileName, blob, {
                            contentType: 'image/jpeg',
                            upsert: true
                        });

                    if (error) {
                        console.error("Monitoring: Upload failed", error);
                        resolve(null);
                    } else {
                        // Get Public URL
                        const { data: { publicUrl } } = supabase.storage
                            .from('proof_of_play')
                            .getPublicUrl(fileName);

                        resolve(publicUrl);
                    }
                } catch (e) {
                    console.error("Monitoring: Error processing screenshot", e);
                    resolve(null);
                } finally {
                    // Cleanup
                    delete window.onScreenshotReady;
                }
            };

            // Trigger Native Capture
            try {
                window.NativePlayer.captureScreenshot('onScreenshotReady');
            } catch (e) {
                console.error("Monitoring: Bridge call failed", e);
                resolve(null);
            }
        });
    },

    /**
     * Logs a heartbeat with optional screenshot URL and health stats.
     */
    sendHeartbeat: async (screenId: string) => {
        if (!screenId) return;

        let screenshotUrl = null;
        let deviceStats: any = {};

        // 1. Try to get Screenshot
        try {
            screenshotUrl = await monitoring.captureAndUploadScreenshot(screenId);
        } catch (e) {
            console.warn("Monitoring: Screenshot skipped", e);
        }

        // 2. Try to get Device Stats
        try {
            if (window.NativePlayer && window.NativePlayer.getDeviceStatus) {
                const statusJson = window.NativePlayer.getDeviceStatus();
                deviceStats = JSON.parse(statusJson);
            }
        } catch (e) {
            console.warn("Monitoring: Stats skipped", e);
        }

        // 3. Insert Log
        const { error } = await supabase.from('monitoring_logs').insert({
            screen_id: screenId,
            screenshot_url: screenshotUrl,
            ram_used_mb: deviceStats.ram_used || 0,
            storage_used_mb: deviceStats.storage_used || 0,
            cpu_temp: deviceStats.cpu_temp || 0,
            battery_level: deviceStats.battery_level || null,
            is_charging: deviceStats.is_charging || false,
            created_at: new Date().toISOString()
        });

        if (error) {
            console.warn("Monitoring: Heartbeat insert failed", error);
        } else {
            console.log("Monitoring: Heartbeat sent successfully.");
        }
    }
};
