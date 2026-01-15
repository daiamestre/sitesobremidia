import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Search, ListMusic, MoreVertical, Pencil, Trash2,
  Image, Clock, Loader2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PlaylistDialog } from '@/components/playlists/PlaylistDialog';
import { PlaylistItemsDialog } from '@/components/playlists/PlaylistItemsDialog';
import { usePlaylists } from '@/hooks/usePlaylists';
import { Playlist } from '@/types/models';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Skeleton } from '@/components/ui/skeleton';

export default function Playlists() {
  const { user } = useAuth();
  const { playlists, loading, fetchPlaylists, deletePlaylist } = usePlaylists(user?.id);

  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [itemsDialogOpen, setItemsDialogOpen] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    await deletePlaylist(deleteId);
    setDeleting(false);
    setDeleteId(null);
  };

  const handleEdit = (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    setDialogOpen(true);
  };

  const handleManageItems = (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    setItemsDialogOpen(true);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const filteredPlaylists = playlists.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Playlists</h1>
          <p className="text-muted-foreground">Organize suas mídias em sequências</p>
        </div>
        <Button className="gradient-primary" onClick={() => { setSelectedPlaylist(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Playlist
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar playlists..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex flex-col space-y-3">
              <Skeleton className="h-[180px] w-full rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredPlaylists.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          title={searchQuery ? 'Nenhuma playlist encontrada' : 'Nenhuma playlist ainda'}
          description={searchQuery
            ? 'Tente ajustar sua busca com outros termos.'
            : 'Crie playlists para organizar suas mídias e exibí-las nas telas.'}
          action={!searchQuery ? {
            label: 'Criar Playlist',
            onClick: () => { setSelectedPlaylist(null); setDialogOpen(true); },
            icon: Plus
          } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlaylists.map(playlist => (
            <Card key={playlist.id} className="glass group hover:shadow-lg transition-shadow overflow-hidden">
              {/* Cover Image */}
              <div
                className="h-32 bg-muted/50 flex items-center justify-center cursor-pointer"
                onClick={() => handleManageItems(playlist)}
              >
                {playlist.cover_url ? (
                  <img
                    src={playlist.cover_url}
                    alt={playlist.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ListMusic className="h-12 w-12 text-muted-foreground" />
                )}
              </div>

              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{playlist.name}</h3>
                      <Badge variant={playlist.is_active ? 'default' : 'secondary'}>
                        {playlist.is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>
                    {playlist.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {playlist.description}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleManageItems(playlist)}>
                        <ListMusic className="h-4 w-4 mr-2" />
                        Gerenciar Mídias
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEdit(playlist)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteId(playlist.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div
                  className="flex items-center gap-4 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleManageItems(playlist)}
                >
                  <div className="flex items-center gap-1">
                    <Image className="h-4 w-4" />
                    <span>{playlist.item_count} mídias</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>{formatDuration(playlist.total_duration || 0)}</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mt-3">
                  Criada em {format(new Date(playlist.created_at), "dd 'de' MMM, yyyy", { locale: ptBR })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <PlaylistDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        playlist={selectedPlaylist}
        onSaved={fetchPlaylists}
      />

      {/* Items Dialog */}
      <PlaylistItemsDialog
        open={itemsDialogOpen}
        onOpenChange={setItemsDialogOpen}
        playlist={selectedPlaylist}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir playlist?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A playlist e todos os itens serão removidos.
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
