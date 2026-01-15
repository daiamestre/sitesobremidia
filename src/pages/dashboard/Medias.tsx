import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Upload, Search, Grid, List, Image, Video, Music, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { MediaUploadDialog } from '@/components/media/MediaUploadDialog';
import { MediaCard } from '@/components/media/MediaCard';
import { MediaPreviewDialog } from '@/components/media/MediaPreviewDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMedia } from '@/hooks/useMedia';
import { Media } from '@/types/models';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Skeleton } from '@/components/ui/skeleton';

export default function Medias() {
  const { user } = useAuth();
  const { medias, loading, fetchMedias, deleteMedia } = useMedia(user?.id);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFolder, setCurrentFolder] = useState<'image' | 'video' | 'audio' | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<Media | null>(null);
  const [deleteMediaId, setDeleteMediaId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteMediaId) return;

    setDeleting(true);
    const mediaToDelete = medias.find(m => m.id === deleteMediaId);
    if (mediaToDelete) {
      await deleteMedia(deleteMediaId, mediaToDelete.file_path);
    }
    setDeleting(false);
    setDeleteMediaId(null);
  };

  const filteredMedias = medias.filter(media => {
    // Global search overrides folder view
    if (searchQuery) {
      return media.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    // Folder filtering
    if (currentFolder) {
      return media.file_type === currentFolder;
    }
    return false; // Should not reach here in root view logic, but technically 'all' if needed
  });

  const imageCount = medias.filter(m => m.file_type === 'image').length;
  const videoCount = medias.filter(m => m.file_type === 'video').length;
  const audioCount = medias.filter(m => m.file_type === 'audio').length;

  const getFolderIcon = (type: 'image' | 'video' | 'audio') => {
    switch (type) {
      case 'image': return Image;
      case 'video': return Video;
      case 'audio': return Music;
    }
  };

  const FolderCard = ({ type, count, label, colorClass }: { type: 'image' | 'video' | 'audio', count: number, label: string, colorClass: string }) => {
    const Icon = getFolderIcon(type);
    return (
      <Card
        className="glass hover:bg-muted/50 transition-colors cursor-pointer group"
        onClick={() => setCurrentFolder(type)}
      >
        <CardContent className="flex flex-col items-center justify-center p-8 gap-4 text-center">
          <div className={`p-4 rounded-2xl ${colorClass} group-hover:scale-110 transition-transform`}>
            <Icon className="h-12 w-12" />
          </div>
          <div>
            <h3 className="text-xl font-bold">{label}</h3>
            <p className="text-muted-foreground">{count} arquivos</p>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            {currentFolder && !searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentFolder(null)}
                className="mr-2 -ml-2"
              >
                <ArrowLeft className="h-6 w-6" />
              </Button>
            )}
            <h1 className="text-3xl font-display font-bold">
              {searchQuery ? 'Resultados da Busca' : currentFolder ? (
                currentFolder === 'image' ? 'Imagens' :
                  currentFolder === 'video' ? 'Vídeos' : 'Áudios'
              ) : 'Minhas Mídias'}
            </h1>
          </div>
          <p className="text-muted-foreground">
            {currentFolder
              ? `Gerenciando ${currentFolder === 'image' ? 'imagens' : currentFolder === 'video' ? 'vídeos' : 'áudios'}`
              : 'Gerencie seus arquivos de mídia'}
          </p>
        </div>
        <Button className="gradient-primary" onClick={() => setUploadDialogOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Enviar
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar em todas as pastas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {(currentFolder || searchQuery) && (
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : !currentFolder && !searchQuery ? (
          // Folder View
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FolderCard
              type="image"
              count={imageCount}
              label="Imagens"
              colorClass="bg-primary/10 text-primary"
            />
            <FolderCard
              type="video"
              count={videoCount}
              label="Vídeos"
              colorClass="bg-accent/10 text-accent"
            />
            <FolderCard
              type="audio"
              count={audioCount}
              label="Áudios"
              colorClass="bg-success/10 text-success"
            />
          </div>
        ) : filteredMedias.length === 0 ? (
          // Empty State
          <EmptyState
            icon={currentFolder === 'image' ? Image : currentFolder === 'video' ? Video : Upload}
            title={searchQuery ? 'Nenhuma mídia encontrada' : 'Pasta vazia'}
            description={searchQuery
              ? 'Tente ajustar sua busca com outros termos.'
              : `Nenhum arquivo de ${currentFolder === 'image' ? 'imagem' : currentFolder === 'video' ? 'vídeo' : 'áudio'} encontrado.`}
            action={!searchQuery ? {
              label: 'Fazer Upload',
              onClick: () => setUploadDialogOpen(true),
              icon: Upload
            } : undefined}
          />
        ) : viewMode === 'grid' ? (
          // Media Grid
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredMedias.map(media => (
              <MediaCard
                key={media.id}
                media={media}
                viewMode={viewMode}
                onDelete={setDeleteMediaId}
                onPreview={setPreviewMedia}
              />
            ))}
          </div>
        ) : (
          // Media List
          <div className="space-y-2">
            {filteredMedias.map(media => (
              <MediaCard
                key={media.id}
                media={media}
                viewMode={viewMode}
                onDelete={setDeleteMediaId}
                onPreview={setPreviewMedia}
              />
            ))}
          </div>
        )}
      </div>

      {/* Upload Dialog */}
      <MediaUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUploadComplete={() => {
          fetchMedias();
          setUploadDialogOpen(false);
        }}
      />

      {/* Preview Dialog */}
      <MediaPreviewDialog
        media={previewMedia}
        open={!!previewMedia}
        onOpenChange={(open) => !open && setPreviewMedia(null)}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteMediaId} onOpenChange={(open) => !open && setDeleteMediaId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mídia?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O arquivo será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
