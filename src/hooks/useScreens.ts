import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Screen, ScreenStatus, RemoteCommandType } from '@/types/models';
import { toast } from 'sonner';

export function useScreens(userId?: string) {
    const queryClient = useQueryClient();

    const fetchScreens = async (): Promise<Screen[]> => {
        const { data, error } = await supabase
            .from('screens')
            .select(`
                *,
                playlist:playlists(id, name)
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const now = new Date();
        const screensWithStatus = (data || []).map((screen) => {
            let status: ScreenStatus = 'offline';
            if (screen.last_ping_at) {
                const lastPing = new Date(screen.last_ping_at);
                const diffSeconds = (now.getTime() - lastPing.getTime()) / 1000;
                if (diffSeconds < 60) {
                    status = 'playing';
                } else if (diffSeconds < 300) {
                    status = 'online'; // Idle but online
                }
            }
            return {
                ...screen,
                status,
                // Ensure playlist is null if relation is empty/null, though supabase usually returns null or object
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                playlist: (screen as any).playlist || null,
                orientation: screen.orientation as unknown as any // Should be ScreenOrientation but data is typed as any or inferred as string
            };
        });

        return screensWithStatus;
    };

    const { data: screens = [], isLoading: loading, refetch } = useQuery({
        queryKey: ['screens', userId],
        queryFn: fetchScreens,
        enabled: !!userId || undefined,
        refetchInterval: 30000, // Refresh every 30s to update online status
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('screens')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['screens'] });
            toast.success('Tela excluída!');
        },
        onError: (error) => {
            console.error('Error deleting screen:', error);
            toast.error('Erro ao excluir tela');
        }
    });

    const commandMutation = useMutation({
        mutationFn: async ({ screenId, command }: { screenId: string, command: RemoteCommandType }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('remote_commands' as any) as any).insert({
                screen_id: screenId,
                command: command,
                status: 'pending'
            });
            if (error) throw error;
            return { screenId, command };
        },
        onSuccess: (_, variables) => {
            toast.success(`Comando enviado: ${variables.command}`);
        },
        onError: () => {
            toast.error('Erro ao enviar comando');
        }
    });

    // Wrapper to match old signature: (screenId, command) => Promise<boolean>
    const sendCommand = async (screenId: string, command: RemoteCommandType) => {
        try {
            await commandMutation.mutateAsync({ screenId, command });
            return true;
        } catch {
            return false;
        }
    };

    return {
        screens,
        loading,
        fetchScreens: refetch,
        deleteScreen: deleteMutation.mutateAsync,
        sendCommand
    };
}
