import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Upload, Trash2, Copy, Image as ImageIcon, Loader2, RefreshCw, Video, Play, CheckCircle2, Plus, Info, Link as LinkIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface AssetFile {
    name: string;
    id: string;
    url: string;
    created_at: string;
    size: number;
    type: string;
}

interface SocialAssetsGalleryProps {
    onSelect?: (url: string) => void;
    onApplyToInstagram?: (type: 'posts' | 'profile', data: any, targetLinkId: string) => void;
    isApplying?: boolean;
    availableLinks?: { id: string; title: string; platform: string }[];
    selectionMode?: boolean;
    onSelectionConfirm?: (assets: AssetFile[], type: string) => void;
}

export function SocialAssetsGallery({
    onSelect,
    onApplyToInstagram,
    isApplying,
    availableLinks = [],
    selectionMode = false,
    onSelectionConfirm
}: SocialAssetsGalleryProps) {
    const { user } = useAuth();
    const [assets, setAssets] = useState<AssetFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [activeTab, setActiveTab] = useState('posts'); // 'posts' or 'perfil'
    const [selectedLinkId, setSelectedLinkId] = useState<string>('');

    // Selection & Preview State
    const [selectedAssets, setSelectedAssets] = useState<AssetFile[]>([]);
    const [previewItem, setPreviewItem] = useState<AssetFile | null>(null);

    // Filter only Instagram links for selection context (since this feature is Instagram specific)
    const instagramLinks = availableLinks.filter(l => l.platform === 'instagram');

    // Auto-select if only one link exists
    useEffect(() => {
        if (!selectionMode && instagramLinks.length === 1 && !selectedLinkId) {
            setSelectedLinkId(instagramLinks[0].id);
        }
    }, [instagramLinks, selectedLinkId, selectionMode]);

    const fetchAssets = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const folderPath = `${user.id}/social/${activeTab}`;

            const { data, error } = await supabase.storage
                .from('media')
                .list(folderPath, {
                    limit: 100,
                    offset: 0,
                    sortBy: { column: 'created_at', order: 'desc' },
                });

            if (error) throw error;

            const files = data || [];
            // Filter out empty folder placeholders if any
            const realFiles = files.filter(f => f.name !== '.emptyFolderPlaceholder');

            const processedAssets: AssetFile[] = realFiles.map(file => {
                const { data: { publicUrl } } = supabase.storage
                    .from('media')
                    .getPublicUrl(`${folderPath}/${file.name}`);

                return {
                    name: file.name,
                    id: file.id || file.name,
                    created_at: file.created_at,
                    size: file.metadata?.size || 0,
                    type: file.metadata?.mimetype || 'unknown',
                    url: publicUrl
                };
            });

            setAssets(processedAssets);
        } catch (error: any) {
            console.error('Error fetching assets:', error);
            // Don't show error on 404/empty folder, just show empty
            if (error.message !== 'The resource was not found') {
                toast.error('Erro ao listar arquivos');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAssets();
        setSelectedAssets([]); // Reset selection on tab change
    }, [user, activeTab]);

    const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0 || !user) return;

        setUploading(true);
        let successCount = 0;

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
                    toast.error(`Arquivo ignorado (tipo inválido): ${file.name}`);
                    continue;
                }

                const fileExt = file.name.split('.').pop()?.toLowerCase();
                const sanitizedName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
                const fileName = `manual_${Date.now()}_${sanitizedName}.${fileExt}`;
                const filePath = `${user.id}/social/${activeTab}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('media')
                    .upload(filePath, file, {
                        upsert: true
                    });

                if (uploadError) {
                    console.error(`Error uploading ${file.name}:`, uploadError);
                    toast.error(`Erro ao enviar ${file.name}`);
                } else {
                    successCount++;
                }
            }

            if (successCount > 0) {
                toast.success(`${successCount} arquivo(s) enviado(s)!`);
                fetchAssets();
            }
        } catch (error: any) {
            console.error('Upload error:', error);
            toast.error('Erro crítico no upload');
        } finally {
            setUploading(false);
            event.target.value = '';
        }
    };

    const handleDelete = async (fileName: string) => {
        if (!user || !confirm('Excluir este arquivo permanentemente?')) return;

        try {
            const { error } = await supabase.storage
                .from('media')
                .remove([`${user.id}/social/${activeTab}/${fileName}`]);

            if (error) throw error;

            toast.success('Arquivo excluído');
            setAssets(prev => prev.filter(a => a.name !== fileName));
            setSelectedAssets(prev => prev.filter(a => a.name !== fileName));
        } catch (error) {
            console.error('Delete error:', error);
            toast.error('Erro ao excluir arquivo');
        }
    };

    const handleCopyUrl = (url: string) => {
        navigator.clipboard.writeText(url);
        toast.success('URL copiada!');
    };

    // Toggle selection logic
    const toggleSelection = (asset: AssetFile) => {
        // If Profile Tab -> Radio behavior (Single Select)
        if (activeTab === 'perfil') {
            // Validate: Must be an image for profile (usually)
            if (asset.name.match(/\.(mp4|webm|mov)$/i)) {
                toast.warning('A foto de perfil deve ser uma imagem, não um vídeo.');
                return;
            }
            // If already selected, do nothing or deselect? Usually radio doesn't deselect on click.
            // Let's just set it as the single item.
            setSelectedAssets([asset]);
            return;
        }

        // If Posts Tab -> Multi Select (Max 3)
        if (selectedAssets.find(a => a.id === asset.id)) {
            setSelectedAssets(prev => prev.filter(a => a.id !== asset.id));
        } else {
            if (selectedAssets.length >= 3) {
                toast.warning('Você só pode selecionar até 3 posts para o card.');
                return;
            }
            setSelectedAssets(prev => [...prev, asset]);
        }
    };

    const handleConfirmSelection = () => {
        if (!onSelectionConfirm) return;

        if (activeTab === 'perfil' && selectedAssets.length !== 1) {
            toast.error('Selecione exatamente 1 foto para o perfil.');
            return;
        }
        if (activeTab === 'posts' && selectedAssets.length === 0) {
            toast.error('Selecione pelo menos 1 item.');
            return;
        }

        onSelectionConfirm(selectedAssets, activeTab);
    };

    const handleApplySelection = () => {
        if (selectionMode) {
            handleConfirmSelection();
            return;
        }

        if (!onApplyToInstagram) return;

        if (!selectedLinkId) {
            toast.error('Selecione um Card/Link de destino na lista acima.');
            return;
        }

        if (activeTab === 'perfil') {
            if (selectedAssets.length !== 1) {
                toast.error('Selecione exatamente 1 foto para o perfil.');
                return;
            }
            onApplyToInstagram('profile', selectedAssets[0].url, selectedLinkId);
        } else {
            if (selectedAssets.length === 0) {
                toast.error('Selecione pelo menos 1 vídeo/post.');
                return;
            }
            const formattedAssets = selectedAssets.map(asset => ({
                src: asset.url,
                type: asset.name.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'image' as 'video' | 'image'
            }));
            onApplyToInstagram('posts', formattedAssets, selectedLinkId);
        }
    };

    const getHeaderMessage = () => {
        if (activeTab === 'perfil') return "Selecione a Foto de Perfil (Obrigatório)";
        return "Selecione os Posts para serem Visualizados no seu Perfil";
    };

    const isApplyDisabled = () => {
        if (isApplying) return true;
        if (!selectionMode && !selectedLinkId) return true;
        if (activeTab === 'perfil') return selectedAssets.length !== 1;
        return selectedAssets.length === 0;
    };

    return (
        <div className="space-y-6">
            <div className={`p-4 rounded-xl border space-y-4 ${selectionMode ? 'bg-zinc-800 border-zinc-700' : 'bg-muted/30'}`}>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            {selectionMode ? 'Galeria' : 'Galeria Social'}
                            {selectedAssets.length > 0 && (
                                <Badge variant="secondary" className="ml-2">
                                    {selectedAssets.length} {activeTab === 'perfil' ? 'selecionada' : 'selecionados'}
                                </Badge>
                            )}
                        </h2>
                        <p className="text-sm font-medium text-blue-500 flex items-center gap-1.5 mt-1 bg-blue-500/10 px-3 py-1 rounded-full w-fit">
                            <Info className="w-4 h-4" />
                            {getHeaderMessage()}
                        </p>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button variant="outline" size="icon" onClick={fetchAssets} title="Atualizar">
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                        <div className="relative flex-1 sm:flex-initial">
                            <input
                                type="file"
                                accept={activeTab === 'perfil' ? "image/*" : "image/*,video/*"}
                                multiple={activeTab === 'posts'}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={handleUpload}
                                disabled={uploading}
                            />
                            <Button disabled={uploading} className="w-full" variant="secondary">
                                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                                Upload
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Card Selection and Apply Row - Visible only when items are selected */}
                {selectedAssets.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 animate-in fade-in slide-in-from-top-2">
                        {!selectionMode && (
                            <div className="flex-1 w-full flex items-center gap-3">
                                <div className="shrink-0 bg-blue-500/10 p-2 rounded-full">
                                    <LinkIcon className="w-4 h-4 text-blue-500" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider mb-1.5">
                                        Destino do {activeTab === 'perfil' ? 'Perfil' : 'Post'}
                                    </p>
                                    <Select value={selectedLinkId} onValueChange={setSelectedLinkId} disabled={instagramLinks.length === 0}>
                                        <SelectTrigger className="w-full bg-black/20 border-zinc-700 text-zinc-100">
                                            <SelectValue placeholder={instagramLinks.length === 0 ? "Nenhum card do Instagram criado" : "Selecione o Card para vincular..."} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {instagramLinks.map(link => (
                                                <SelectItem key={link.id} value={link.id}>
                                                    {link.title} ({link.platform})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}

                        {(onApplyToInstagram || selectionMode) && (
                            <div className={`w-full ${selectionMode ? 'flex justify-end' : 'sm:w-auto mt-auto sm:self-end'}`}>
                                <Button
                                    type={selectionMode ? 'button' : 'submit'}
                                    onClick={(e) => {
                                        if (selectionMode) {
                                            e.preventDefault();
                                            handleConfirmSelection();
                                        } else {
                                            handleApplySelection();
                                        }
                                    }}
                                    disabled={isApplyDisabled()}
                                    className={`w-full sm:w-auto h-10 px-6 ${activeTab === 'perfil' ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-gradient-to-r from-purple-600 to-orange-500 hover:opacity-90 text-white border-0"}`}
                                >
                                    {isApplying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    {selectionMode
                                        ? (activeTab === 'perfil' ? 'Confirmar Foto de Perfil' : 'Confirmar Posts')
                                        : (activeTab === 'perfil' ? 'Definir Foto' : 'Usar Posts')
                                    }
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                    <TabsTrigger value="posts">Meus Posts</TabsTrigger>
                    <TabsTrigger value="perfil">Fotos de Perfil</TabsTrigger>
                </TabsList>

                {/* Content Area */}
                <div className="mt-6 min-h-[300px]">
                    {loading && assets.length === 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {[...Array(6)].map((_, i) => (
                                <Skeleton key={i} className="aspect-square rounded-xl" />
                            ))}
                        </div>
                    ) : assets.length === 0 ? (
                        <EmptyState
                            icon={ImageIcon}
                            title={`Nenhum arquivo em ${activeTab}`}
                            description="Envie imagens ou vídeos para esta pasta."
                        />
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 animate-fade-in">
                            {assets.map((asset) => {
                                const isSelected = selectedAssets.some(a => a.id === asset.id);
                                const isVideo = asset.name.match(/\.(mp4|webm|mov)$/i);

                                return (
                                    <div
                                        key={asset.id}
                                        className={`group relative aspect-square rounded-xl overflow-hidden border transition-all duration-300 ${isSelected ? 'ring-4 ring-purple-500 ring-offset-2' : 'hover:border-purple-300'}`}
                                        onClick={() => toggleSelection(asset)}
                                    >
                                        {/* Background Media */}
                                        {isVideo ? (
                                            <div className="w-full h-full flex items-center justify-center bg-black">
                                                <video src={asset.url} className="w-full h-full object-cover opacity-80" muted />
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <Video className="w-8 h-8 text-white/70" />
                                                </div>
                                            </div>
                                        ) : (
                                            <img
                                                src={asset.url}
                                                alt={asset.name}
                                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                            />
                                        )}

                                        {/* Selection Indicator */}
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 bg-purple-600 text-white rounded-full p-1 shadow-lg z-20">
                                                <CheckCircle2 className="w-4 h-4" />
                                            </div>
                                        )}

                                        {/* Hover Actions */}
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 z-10">
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="h-8 w-8 rounded-full"
                                                    onClick={(e) => { e.stopPropagation(); setPreviewItem(asset); }}
                                                    title="Pré-visualizar"
                                                >
                                                    <Play className="h-4 w-4 ml-0.5" />
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    className="h-8 w-8 rounded-full"
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(asset.name); }}
                                                    title="Excluir"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            <p className="text-[10px] text-white/80 px-2 truncate max-w-full text-center mt-2">
                                                {isSelected ? 'Selecionado' : 'Clique para selecionar'}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Tabs>

            {/* Preview Dialog */}
            <Dialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)}>
                <DialogContent className="max-w-3xl bg-black border-white/10 p-1 rounded-2xl overflow-hidden text-white w-full aspect-video flex items-center justify-center">
                    {previewItem && (
                        previewItem.name.match(/\.(mp4|webm|mov)$/i) ? (
                            <video
                                src={previewItem.url}
                                className="w-full h-full max-h-[80vh] object-contain"
                                controls
                                autoPlay
                            />
                        ) : (
                            <img
                                src={previewItem.url}
                                alt={previewItem.name}
                                className="w-full h-full max-h-[80vh] object-contain"
                            />
                        )
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
