import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Search, Monitor, MoreVertical, Pencil, Trash2,
  MapPin, Loader2, Wifi, WifiOff, Play, Calendar, ExternalLink, Copy, RefreshCw, Camera
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
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScreenDialog } from '@/components/screens/ScreenDialog';
import { ScreenScheduleDialog } from '@/components/screens/ScreenScheduleDialog';
import { useScreens } from '@/hooks/useScreens';
import { Screen } from '@/types/models';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Skeleton } from '@/components/ui/skeleton';

export default function Screens() {
  const { user } = useAuth();
  const { screens, loading, fetchScreens, deleteScreen, sendCommand } = useScreens(user?.id);

  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scheduleScreen, setScheduleScreen] = useState<Screen | null>(null);
  const [selectedScreen, setSelectedScreen] = useState<Screen | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCopyUrl = (screenId: string) => {
    const url = `${window.location.origin}/player/${screenId}`;
    navigator.clipboard.writeText(url);
    toast.success('URL copiada para a área de transferência');
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    await deleteScreen(deleteId);
    setDeleting(false);
    setDeleteId(null);
  };

  const handleEdit = (screen: Screen) => {
    setSelectedScreen(screen);
    setDialogOpen(true);
  };

  const handleSchedule = (screen: Screen) => {
    setScheduleScreen(screen);
  };

  const filteredScreens = screens.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.location?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCount = screens.filter(s => s.is_active).length;
  const onlineCount = screens.filter(s => s.status === 'online' || s.status === 'playing').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Telas</h1>
          <p className="text-muted-foreground">Gerencie seus dispositivos e players</p>
        </div>
        <Button className="gradient-primary" onClick={() => { setSelectedScreen(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Tela
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Monitor className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{screens.length}</p>
              <p className="text-sm text-muted-foreground">Total de Telas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 rounded-lg bg-success/10">
              <Wifi className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{onlineCount}</p>
              <p className="text-sm text-muted-foreground">Online</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 rounded-lg bg-accent/10">
              <Monitor className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-sm text-muted-foreground">Ativas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar telas..."
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
              <Skeleton className="h-[200px] w-full rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredScreens.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title={searchQuery ? 'Nenhuma tela encontrada' : 'Nenhuma tela cadastrada'}
          description={searchQuery
            ? 'Tente ajustar sua busca com outros termos.'
            : 'Adicione telas para começar a exibir suas playlists.'}
          action={!searchQuery ? {
            label: 'Criar Tela',
            onClick: () => { setSelectedScreen(null); setDialogOpen(true); },
            icon: Plus
          } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredScreens.map(screen => (
            <Card key={screen.id} className="glass group hover:shadow-lg transition-shadow overflow-hidden border-l-4"
              style={{ borderLeftColor: screen.status === 'playing' ? '#22c55e' : screen.status === 'online' ? '#3b82f6' : '#ef4444' }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{screen.name}</h3>
                      {screen.status === 'playing' && <Badge className="bg-green-500 hover:bg-green-600">Reproduzindo</Badge>}
                      {screen.status === 'online' && <Badge className="bg-blue-500 hover:bg-blue-600">Online</Badge>}
                      {screen.status === 'offline' && <Badge variant="secondary">Offline</Badge>}
                    </div>
                    {screen.location && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{screen.location}</span>
                      </div>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(screen)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSchedule(screen)}>
                        <Calendar className="h-4 w-4 mr-2" />
                        Agendar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleCopyUrl(screen.id)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copiar URL
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => window.open(`/player/${screen.id}`, '_blank')}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Abrir Player
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => sendCommand(screen.id, 'reload')}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Recarregar Player
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => sendCommand(screen.id, 'screenshot')}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Capturar Tela
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteId(screen.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-4 p-3 bg-muted/30 rounded-lg">
                  <div className="flex flex-col gap-1 w-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider">Playlist Atual</span>
                      {screen.playlist ? (
                        <div className="flex items-center gap-1 text-primary">
                          <Play className="h-3 w-3" />
                          <span className="font-medium truncate max-w-[120px]">{screen.playlist.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Nenhuma definida</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    {screen.status !== 'offline' ? (
                      <Wifi className="h-3 w-3 text-green-500" />
                    ) : (
                      <WifiOff className="h-3 w-3" />
                    )}
                    <span>
                      {screen.last_ping_at
                        ? `Visto ${format(new Date(screen.last_ping_at), "HH:mm", { locale: ptBR })}`
                        : 'Nunca visto'}
                    </span>
                  </div>
                  <span>v{screen.version || '1.0'}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <ScreenDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        screen={selectedScreen}
        onSaved={fetchScreens}
      />

      {/* Schedule Dialog */}
      {scheduleScreen && (
        <ScreenScheduleDialog
          open={!!scheduleScreen}
          onOpenChange={(open) => !open && setScheduleScreen(null)}
          screenId={scheduleScreen.id}
          screenName={scheduleScreen.name}
        />
      )}


      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tela?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
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
