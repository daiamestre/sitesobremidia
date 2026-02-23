import { useEffect, useCallback } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
    screenId: string | null;
}

// Global definition for Native Bridge - EXTENDING existing interface
declare global {
    interface Window {
        handleScreenshotResult?: (base64: string | null) => void;
    }
}

export const RemoteCommandListener = ({ screenId }: Props) => {

    // Poll for commands (Simple & Robust) rather than complex Realtime subscription for now
    useEffect(() => {
        if (!screenId) return;

        const checkCommands = async () => {
            try {
                // Fetch pending commands
                const { data: commands, error } = await supabase
                    .from('remote_commands')
                    .select('*')
                    .eq('screen_id', screenId)
                    .eq('status', 'pending')
                    .limit(1);

                if (error || !commands?.length) return;

                const cmd = commands[0];
                console.log("RemoteCommandListener: 📥 Received command:", cmd.command);

                // Execute Command
                let success = false;

                if (cmd.command === 'reload') {
                    success = true;
                    await markAsExecuted(cmd.id); // Mark first, then reload

                    // Try to clear cache native-side for a "Hard Refresh"
                    if (window.NativePlayer?.showToast) window.NativePlayer.showToast("Atualizando...");
                    // We don't have clearAppCache exposed in d.ts yet, but checking if it exists at runtime
                    // actually wait, checking Step 1020, clearAppCache IS in WebAppInterface.kt
                    // I will need to update d.ts if I want to use it typed, but for now I can cast or check.
                    // Let's check d.ts from Step 980. It does NOT have clearAppCache.
                    // I will skip clearAppCache for now to avoid compilation error, or cast.
                    // Actually, let's just do a normal reload for safety as the user wants functionality first.
                    window.location.reload();
                }
                else if (cmd.command === 'reboot') {
                    // Try native reboot, fallback to reload
                    if (window.NativePlayer?.reboot) {
                        window.NativePlayer.reboot();
                        success = true;
                    } else {
                        // Fallback
                        console.warn("Native reboot not available, reloading...");
                        window.location.reload();
                        success = true;
                    }
                    await markAsExecuted(cmd.id);
                }
                else if (cmd.command === 'screenshot') {
                    if (window.NativePlayer?.captureScreenshot) {
                        // Define global callback for Native Bridge
                        window.handleScreenshotResult = async (base64: string | null) => {
                            if (!base64) {
                                console.error("Screenshot failed or cancelled.");
                                await markAsFailed(cmd.id, "Capture failed");
                                return;
                            }

                            try {
                                // Upload to Supabase Storage
                                // Bucket: screenshots (Must be Public)
                                // Path: {screen_id}.jpg (Overwrite)
                                const blob = await fetch(base64).then(res => res.blob());
                                const fileName = `${screenId}.jpg`;
                                const { error: uploadError } = await supabase.storage
                                    .from('screenshots')
                                    .upload(fileName, blob, {
                                        upsert: true,
                                        contentType: 'image/jpeg'
                                    });

                                if (uploadError) throw uploadError;

                                // Success
                                console.log("Screenshot uploaded successfully!");
                                await markAsExecuted(cmd.id, { url: fileName });

                            } catch (err: any) {
                                console.error("Upload failed:", err);
                                await markAsFailed(cmd.id, err.message);
                            } finally {
                                // Cleanup generic callback to avoid memory leaks if called multiple times?
                                // Actually keeping it is fine, just overwrites.
                            }
                        };

                        // Call Native
                        window.NativePlayer.captureScreenshot('handleScreenshotResult');
                        success = true; // Async completion handled in callback
                    } else {
                        console.error("Native Screenshot not supported on this device.");
                        // TODO: Implement html2canvas fallback for Web Browser testing?
                        // For now, fail it.
                        await markAsFailed(cmd.id, "Native Bridge not found");
                    }
                }

            } catch (err) {
                console.error("Error checking commands:", err);
            }
        };

        const markAsExecuted = async (id: string, payload?: any) => {
            await supabase.from('remote_commands').update({
                status: 'executed',
                executed_at: new Date().toISOString(),
                payload: payload // Store result URL here if needed
            }).eq('id', id);
        };

        const markAsFailed = async (id: string, errorMsg: string) => {
            await supabase.from('remote_commands').update({
                status: 'failed',
                executed_at: new Date().toISOString(),
                payload: { error: errorMsg }
            }).eq('id', id);
        };

        // Poll every 5 seconds
        const interval = setInterval(checkCommands, 5000);
        return () => clearInterval(interval);

    }, [screenId]);

    return null; // Headless component
};
