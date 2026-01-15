import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RemoteCommand, RemoteCommandType } from '@/types/remote-commands';
import html2canvas from 'html2canvas';

interface UseRemoteCommandsProps {
    screenId: string;
}

export function useRemoteCommands({ screenId }: UseRemoteCommandsProps) {
    useEffect(() => {
        if (!screenId) return;

        console.log('[RemoteCommands] Listening for commands on screen:', screenId);

        const channel = supabase
            .channel(`remote-commands:${screenId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'remote_commands',
                    filter: `screen_id=eq.${screenId}`
                },
                async (payload) => {
                    const command = payload.new as RemoteCommand;
                    console.log('[RemoteCommands] Received command:', command);

                    if (command.status !== 'pending') return;

                    // Execute Command
                    try {
                        const result = await handleCommand(command);

                        // Acknowledge Execution
                        await (supabase.from('remote_commands' as any) as any)
                            .update({
                                status: 'executed',
                                executed_at: new Date().toISOString(),
                                payload: result ? { ...command.payload, ...result } : command.payload
                            })
                            .eq('id', command.id);

                    } catch (error) {
                        console.error('[RemoteCommands] Failed to execute:', error);
                        await (supabase.from('remote_commands' as any) as any)
                            .update({ status: 'failed' })
                            .eq('id', command.id);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [screenId]);

    const handleCommand = async (command: RemoteCommand) => {
        switch (command.command) {
            case 'reload':
                console.log('[RemoteCommands] Reloading page...');
                window.location.reload();
                break;
            case 'reboot':
                // In a browser environment, reboot is effectively a hard reload or redirect
                // Ideally this would integrate with a native shell (Electron/Tauri)
                console.log('[RemoteCommands] Rebooting player...');
                window.location.href = window.location.href;
                break;
            case 'screenshot':
                console.log('[RemoteCommands] Taking screenshot...');
                try {
                    const canvas = await html2canvas(document.body, {
                        useCORS: true,
                        logging: false
                    });

                    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
                    if (!blob) throw new Error('Failed to generate screenshot blob');

                    const fileName = `${screenId}/${Date.now()}.jpg`;
                    const { data, error: uploadError } = await supabase.storage
                        .from('screenshots')
                        .upload(fileName, blob, {
                            contentType: 'image/jpeg',
                            upsert: true
                        });

                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = supabase.storage
                        .from('screenshots')
                        .getPublicUrl(fileName);

                    return { screenshot_url: publicUrl };
                } catch (err) {
                    console.error('[RemoteCommands] Screenshot failed:', err);
                    throw err;
                }
            default:
                console.warn('[RemoteCommands] Unknown command:', command.command);
        }
    };
}
