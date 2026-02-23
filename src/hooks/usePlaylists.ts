import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Playlist } from '@/types/models';
import { toast } from 'sonner';

export function usePlaylists(userId?: string) {
    const queryClient = useQueryClient();

    const fetchPlaylists = async (): Promise<Playlist[]> => {
        const { data: playlistsData, error: playlistsError } = await supabase
            .from('playlists')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (playlistsError) throw playlistsError;

        const playlistsWithCounts = await Promise.all(
            (playlistsData || []).map(async (playlist) => {
                const { data: items } = await supabase
                    .from('playlist_items')
                    .select('duration, media:media!playlist_items_media_id_fkey(file_url, thumbnail_url, file_type), widget:widgets!playlist_items_widget_id_fkey(name, config, thumbnail_url), external_link:external_links!playlist_items_external_link_id_fkey(id, title, url, thumbnail_url)')
                    .eq('playlist_id', playlist.id)
                    .order('position', { ascending: true });

                // Logic to find cover image
                let coverUrl = playlist.cover_url;
                if (!coverUrl && items && items.length > 0) {
                    const firstItemWithCover = items.find((item: any) =>
                        (item.media && (item.media.file_type === 'image' || item.media.thumbnail_url)) ||
                        (item.widget && (item.widget.thumbnail_url || item.widget.config?.backgroundImageLandscape || item.widget.config?.backgroundImagePortrait)) ||
                        (item.external_link && item.external_link.thumbnail_url)
                    );

                    if (firstItemWithCover) {
                        const item = firstItemWithCover as any;
                        if (item.media) {
                            coverUrl = item.media.file_type === 'video' ? item.media.thumbnail_url : item.media.file_url;
                        } else if (item.widget) {
                            coverUrl = item.widget.thumbnail_url || item.widget.config?.backgroundImageLandscape || item.widget.config?.backgroundImagePortrait;
                        } else if (item.external_link) {
                            coverUrl = item.external_link.thumbnail_url;
                        }
                    }
                }

                return {
                    ...playlist,
                    item_count: items?.length || 0,
                    total_duration: items?.reduce((acc: number, item: any) => acc + item.duration, 0) || 0,
                    cover_url: coverUrl,
                };
            })
        );

        return playlistsWithCounts;
    };

    const { data: playlists = [], isLoading: loading, refetch } = useQuery({
        queryKey: ['playlists', userId],
        queryFn: fetchPlaylists,
        enabled: !!userId || undefined, // Allow fetching even if userId is undefined (RLS handles it), but caching key depends on it
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('playlists')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['playlists'] });
            toast.success('Playlist excluída!');
        },
        onError: (error) => {
            console.error('Error deleting playlist:', error);
            toast.error('Erro ao excluir playlist');
        }
    });

    return {
        playlists,
        loading,
        fetchPlaylists: refetch, // Expose refetch as fetchPlaylists for backward compatibility
        deletePlaylist: deleteMutation.mutateAsync
    };
}
