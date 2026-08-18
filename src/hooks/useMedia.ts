import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Media, MediaType } from '@/types/models';
import { toast } from 'sonner';

export function useMedia(userId?: string) {
    const queryClient = useQueryClient();

    const fetchMedias = async (): Promise<Media[]> => {
        const { data, error } = await supabase
            .from('media')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map(m => ({
            ...m,
            file_type: m.file_type as MediaType,
        }));
    };

    const { data: medias = [], isLoading: loading, refetch } = useQuery({
        queryKey: ['medias', userId],
        queryFn: fetchMedias,
        enabled: !!userId || undefined,
    });

    const deleteMutation = useMutation({
        mutationFn: async ({ id, filePath, fileUrl }: { id: string, filePath: string, fileUrl: string }) => {
            // 1. Delete from storage
            const isR2 = fileUrl?.includes('r2.dev') || fileUrl?.includes('cloudflarestorage.com');

            if (isR2) {
                // [SECURITY HARDENING FASE F] Delete via Edge Function autenticada
                // (delete-media-object). Nunca mais embutir credenciais R2 no browser.
                try {
                    const { error: r2Error } = await supabase.functions.invoke('delete-media-object', {
                        body: { objectKey: filePath },
                    });
                    if (r2Error) {
                        console.error('Error deleting from R2:', r2Error);
                    }
                } catch (e) {
                    console.error('Error deleting from R2:', e);
                    // Continue even if R2 deletion fails, to keep DB clean
                }
            } else {
                const { error: storageError } = await supabase.storage
                    .from('media')
                    .remove([filePath]);

                if (storageError) {
                    console.error('Error deleting from Supabase Storage:', storageError);
                }
            }

            // 2. Delete from database
            const { error: dbError } = await supabase
                .from('media')
                .delete()
                .eq('id', id);

            if (dbError) throw dbError;
            return id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['medias'] });
            toast.success('Mídia excluída com sucesso');
        },
        onError: (error) => {
            console.error('Error deleting media:', error);
            toast.error('Erro ao excluir mídia');
        }
    });

    const deleteMedia = async (id: string, filePath: string, fileUrl: string) => {
        try {
            await deleteMutation.mutateAsync({ id, filePath, fileUrl });
            return true;
        } catch {
            return false;
        }
    };

    return {
        medias,
        loading,
        fetchMedias: refetch,
        deleteMedia
    };
}
