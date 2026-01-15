import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Upload, Trash2, Copy, Image as ImageIcon, Loader2, RefreshCw } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { compressImage } from '@/utils/imageCompression';

interface AssetFile {
    name: string;
    id: string; // File name as ID for list
    url: string;
    created_at: string;
    size: number;
}

interface WidgetAssetsGalleryProps {
    onSelect?: (url: string) => void;
}

export function WidgetAssetsGallery({ onSelect }: WidgetAssetsGalleryProps) {
    const { user } = useAuth();
    const [assets, setAssets] = useState<AssetFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    const fetchAssets = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const { data, error } = await supabase.storage
                .from('media')
                .list(`${user.id}/widgets`, {
                    limit: 100,
                    offset: 0,
                    sortBy: { column: 'created_at', order: 'desc' },
                });

            if (error) throw error;

            const files = data || [];
            const processedAssets: AssetFile[] = files.map(file => {
                const { data: { publicUrl } } = supabase.storage
                    .from('media')
                    .getPublicUrl(`${user.id}/widgets/${file.name}`);

                return {
                    name: file.name,
                    id: file.id || file.name,
                    created_at: file.created_at,
                    size: file.metadata?.size || 0,
                    url: publicUrl
                };
            });

            setAssets(processedAssets);
        } catch (error: any) {
            console.error('Error fetching assets:', error);
            toast.error('Erro ao listar imagens');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAssets();
    }, [user]);

    const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Apenas arquivos de imagem são permitidos.');
            return;
        }

        setUploading(true);
        try {
            // Compress image before upload
            const compressedBlob = await compressImage(file, 1920, 0.8);

            const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
            // Force jpg extension if we converted to jpeg blob, mostly likely yes
            const finalExt = 'jpg';

            const sanitizedName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `widget_${Date.now()}_${sanitizedName}.${finalExt}`;
            const filePath = `${user.id}/widgets/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('media')
                .upload(filePath, compressedBlob, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            toast.success('Imagem enviada com sucesso!');
            fetchAssets();
        } catch (error: any) {
            console.error('Upload error:', error);
            toast.error('Erro ao enviar imagem');
        } finally {
            setUploading(false);
            // Reset input
            event.target.value = '';
        }
    };

    const handleDelete = async (fileName: string) => {
        if (!user || !confirm('Excluir esta imagem permanentemente?')) return;

        try {
            const { error } = await supabase.storage
                .from('media')
                .remove([`${user.id}/widgets/${fileName}`]);

            if (error) throw error;

            toast.success('Imagem excluída');
            setAssets(prev => prev.filter(a => a.name !== fileName));
        } catch (error) {
            console.error('Delete error:', error);
            toast.error('Erro ao excluir imagem');
        }
    };

    const handleCopyUrl = (url: string) => {
        navigator.clipboard.writeText(url);
        toast.success('URL copiada!');
    };

    if (loading && assets.length === 0) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="aspect-square rounded-xl" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">Galeria de Widgets</h2>
                    <p className="text-sm text-muted-foreground">Gerencie imagens de fundo para relógio e clima</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={fetchAssets} title="Atualizar">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <div className="relative">
                        <input
                            type="file"
                            accept="image/*"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={handleUpload}
                            disabled={uploading}
                        />
                        <Button disabled={uploading}>
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                            Upload
                        </Button>
                    </div>
                </div>
            </div>

            {assets.length === 0 ? (
                <EmptyState
                    icon={ImageIcon}
                    title="Galeria vazia"
                    description="Envie imagens para usar como fundo nos seus widgets."
                />
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {assets.map((asset) => (
                        <div
                            key={asset.id}
                            className={`group relative aspect-square rounded-xl overflow-hidden border bg-muted/50 ${onSelect ? 'cursor-pointer ring-offset-2 hover:ring-2 ring-primary' : ''}`}
                            onClick={() => onSelect && onSelect(asset.url)}
                        >
                            <img
                                src={asset.url}
                                alt={asset.name}
                                className="w-full h-full object-cover transition-transform group-hover:scale-110"
                            />

                            {!onSelect ? (
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={(e) => { e.stopPropagation(); handleCopyUrl(asset.url); }}
                                        title="Copiar URL"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={(e) => { e.stopPropagation(); handleDelete(asset.name); }}
                                        title="Excluir"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-white font-medium bg-black/50 px-3 py-1 rounded-full text-sm backdrop-blur-sm">
                                        Selecionar
                                    </span>
                                </div>
                            )}

                            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-xs truncate">{asset.name}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
