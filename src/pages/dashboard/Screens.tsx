import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Search, Monitor, MoreVertical, Pencil, Trash2,
  MapPin, Loader2, Wifi, WifiOff, Play, Calendar, ExternalLink, Copy, RefreshCw, Camera, MonitorSmartphone, Unlink, Store,
  ArrowLeft, ChevronRight, Folder, Megaphone
} from 'lucide-react';
import { PastasPontosParceiros, telaOnline, useTelasDosPontos } from '@/components/screens/PastasPontosParceiros';
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
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScreenDialog } from '@/components/screens/ScreenDialog';
import { CriarTelaPagaDialog } from '@/modules/gestor/CriarTelaPagaDialog';
import { ScreenScheduleDialog } from '@/components/screens/ScreenScheduleDialog';
import { ScreenIdBadge } from '@/components/screens/ScreenIdBadge';
import { ScreenPairingDialog } from '@/components/screens/ScreenPairingDialog';
import { useScreens } from '@/hooks/useScreens';
import { Screen } from '@/types/models';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Skeleton } from '@/components/ui/skeleton';

/** Botões do topo: ocupam a célula inteira no celular e quebram o texto em vez de sobrepor. */
const BOTAO = 'w-full sm:w-auto h-auto min-h-10 whitespace-normal py-2 leading-tight';

export default function Screens() {
  const { user, isOwner, perfilNome, empresaOperadoraId } = useAuth();
  const podeTelasParceiras = isOwner || perfilNome === 'OWNER' || perfilNome === 'ADMIN';
  // F-112: só o gestor de mídia paga para criar tela; OWNER/ADMIN não veem o botão com valor
  const ehGestor = !isOwner && perfilNome === 'GESTOR';
  const { screens: telasDaConta, loading: carregandoConta, fetchScreens, deleteScreen, sendCommand, unpairScreen, isUnpairing } = useScreens(user?.id);
  // F-114: OWNER/ADMIN veem também as telas da EMPRESA (as já existentes, mesmo sem dono ou de outro usuário da empresa).
  // A leitura continua limitada pela regra do banco (própria conta ou mesma empresa).
  const telasDaEmpresa = useQuery({
    queryKey: ['telas-da-empresa', empresaOperadoraId],
    enabled: podeTelasParceiras && !!empresaOperadoraId,
    staleTime: 30_000,
    queryFn: async (): Promise<Screen[]> => {
      const { data, error } = await supabase.from('screens').select('*, playlist:playlists(id, name)')
        .eq('empresa_operadora_id', empresaOperadoraId!).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Screen[];
    },
  });
  const screens: Screen[] = [...telasDaConta, ...(telasDaEmpresa.data ?? []).filter((t) => !telasDaConta.some((c) => c.id === t.id))];
  const loading = carregandoConta || (podeTelasParceiras && !!empresaOperadoraId && telasDaEmpresa.isLoading);
  const navigate = useNavigate();
  // F-112: dois cartões — Telas Pontos Parceiros (pastas por estabelecimento) e Telas Anunciantes
  const [params, setParams] = useSearchParams();
  const secao = params.get('secao') === 'parceiros' || params.get('secao') === 'anunciantes' ? params.get('secao') : null;
  const pontoAberto = params.get('ponto');
  const irPara = (novo: Record<string, string>) => setParams(novo);
  const telasDosPontos = useTelasDosPontos();
  const telasParceiras = telasDosPontos.data ?? [];
  const pontosComTelas = new Set(telasParceiras.map((t) => t.ponto_id)).size;

  const [searchQuery, setSearchQuery] = useState('');
  const [telaPagaOpen, setTelaPagaOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pairingDialogOpen, setPairingDialogOpen] = useState(false);
  const [scheduleScreen, setScheduleScreen] = useState<Screen | null>(null);
  const [selectedScreen, setSelectedScreen] = useState<Screen | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // unpairTarget: the primary screen being unpaired (for the AlertDialog)
  const [unpairTarget, setUnpairTarget] = useState<Screen | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const hasSelectedWithDevice = [...selectedIds].some(id => {
    const s = screens.find(sc => sc.id === id);
    return s?.bound_device_id;
  });

  // Helper to check online status based on activation AND last ping (threshold: 3 mins)
  const isScreenOnline = (screen: Screen) => {
    if (screen.is_active === false) return false;
    if (!screen.last_ping_at) return false;
    try {
      const diff = differenceInMinutes(new Date(), new Date(screen.last_ping_at));
      return diff < 3;
    } catch (e) {
      return false;
    }
  };

  const handleCopyUrl = (screen: Screen) => {
    const displayId = screen.codigo_operacional || screen.custom_id || screen.id;
    const url = `${window.location.origin}/player/${displayId}`;
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

  const handleUnpair = async () => {
    if (!unpairTarget) return;
    if (selectedIds.size > 1) {
      for (const id of selectedIds) {
        const s = screens.find(sc => sc.id === id);
        if (s?.bound_device_id) {
          await unpairScreen(id);
        }
      }
    } else {
      await unpairScreen(unpairTarget.id);
    }
    setSelectedIds(new Set());
    setUnpairTarget(null);
  };

  const handleEdit = (screen: Screen) => {
    setSelectedScreen(screen);
    setDialogOpen(true);
  };

  const handleSchedule = (screen: Screen) => {
    setScheduleScreen(screen);
  };

  // Telas dos anunciantes = todas as telas do usuário menos as de pontos parceiros (essas ficam nas pastas)
  const telasAnunciantes = screens.filter(s => (s as { tipo_tela?: string }).tipo_tela !== 'PARCEIRA');
  const filteredScreens = telasAnunciantes.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.location?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCount = telasAnunciantes.filter(s => s.is_active).length;
  const onlineCount = telasAnunciantes.filter(s => isScreenOnline(s)).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Telas</h1>
          <p className="text-muted-foreground">Gerencie seus dispositivos e players</p>
        </div>
        {/* F-112: botões em grade (2 por linha no celular), nunca um por cima do outro */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end" data-testid="botoes-telas">
          <Button variant="outline" className={`${BOTAO} border-primary/50 text-primary hover:bg-primary/10`} onClick={() => setPairingDialogOpen(true)}>
            <MonitorSmartphone className="h-4 w-4 mr-2 flex-shrink-0" />
            Vincular TV
          </Button>
          {selectedIds.size > 0 && hasSelectedWithDevice && (
            <Button variant="destructive" className={BOTAO} onClick={() => {
              const firstWithDevice = [...selectedIds].find(id => {
                const s = screens.find(sc => sc.id === id);
                return s?.bound_device_id;
              });
              const targetScreen = firstWithDevice ? screens.find(sc => sc.id === firstWithDevice) : null;
              if (targetScreen) setUnpairTarget(targetScreen);
            }}>
              <Unlink className="h-4 w-4 mr-2" />
              Desvincular Tela {selectedIds.size > 1 ? `(${selectedIds.size})` : ''}
            </Button>
          )}
          {podeTelasParceiras && (
            <Button className={`${BOTAO} gradient-primary`} onClick={() => navigate('/dashboard/telas-parceiras')}>
              <Store className="h-4 w-4 mr-2 flex-shrink-0" />
              Telas de parceiros
            </Button>
          )}
          {ehGestor && (
            <Button variant="outline" className={`${BOTAO} border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10`} onClick={() => setTelaPagaOpen(true)}>
              <Plus className="h-4 w-4 mr-2 flex-shrink-0" />
              Nova Tela (R$ 22,99)
            </Button>
          )}
          <Button className={`${BOTAO} gradient-primary`} onClick={() => { setSelectedScreen(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2 flex-shrink-0" />
            Nova Tela
          </Button>
        </div>
      </div>

      {/* F-112: os dois cartões (sempre visíveis; o escolhido fica destacado) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="cartoes-telas">
        <button type="button" data-testid="cartao-telas-parceiros" onClick={() => irPara({ secao: 'parceiros' })}
          className={`rounded-2xl border p-5 text-left transition-all hover:shadow-lg ${secao === 'parceiros' ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-card/60 hover:border-primary/50'}`}>
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-sky-500/15"><Folder className="h-6 w-6 text-sky-400" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold leading-tight">Telas Pontos Parceiros</p>
              <p className="text-sm text-muted-foreground">
                {telasDosPontos.isLoading ? 'Carregando…' : `${pontosComTelas} estabelecimento${pontosComTelas === 1 ? '' : 's'} · ${telasParceiras.length} tela${telasParceiras.length === 1 ? '' : 's'} · ${telasParceiras.filter(telaOnline).length} online`}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
          </div>
        </button>
        <button type="button" data-testid="cartao-telas-anunciantes" onClick={() => irPara({ secao: 'anunciantes' })}
          className={`rounded-2xl border p-5 text-left transition-all hover:shadow-lg ${secao === 'anunciantes' ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-card/60 hover:border-primary/50'}`}>
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/15"><Megaphone className="h-6 w-6 text-primary" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold leading-tight">Telas Anunciantes</p>
              <p className="text-sm text-muted-foreground">
                {loading ? 'Carregando…' : `${telasAnunciantes.length} tela${telasAnunciantes.length === 1 ? '' : 's'} · ${onlineCount} online`}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
          </div>
        </button>
      </div>

      {secao === 'parceiros' && (
        <PastasPontosParceiros
          pontoId={pontoAberto}
          onAbrirPonto={(id) => irPara({ secao: 'parceiros', ponto: id })}
          onVoltar={() => irPara({ secao: 'parceiros' })}
        />
      )}

      {secao === 'anunciantes' && (<>
      <button type="button" onClick={() => irPara({})} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar aos cartões
      </button>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Monitor className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{telasAnunciantes.length}</p>
              <p className="text-sm text-muted-foreground">Total de Telas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="flex items-center gap-4 p-4">
            <div className={`p-3 rounded-lg ${onlineCount > 0 ? 'bg-success/10' : 'bg-muted'}`}>
              <Wifi className={`h-6 w-6 ${onlineCount > 0 ? 'text-success' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-2xl font-bold">{onlineCount}</p>
              <p className="text-sm text-muted-foreground">Online Agora</p>
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
          {filteredScreens.map(screen => {
            const isOnline = isScreenOnline(screen);
            const statusColor = isOnline ? '#22c55e' : '#ef4444';

            // Use operational code (custom_id or codigo_operacional) for navigation URL
            // UUID remains internal identifier
            const displayId = screen.codigo_operacional || screen.custom_id || screen.id;

            return (
              <Card
                key={screen.id}
                className="glass group hover:shadow-lg transition-shadow overflow-hidden border-l-4 cursor-pointer"
                style={{ borderLeftColor: statusColor }}
                onClick={() => navigate(`/dashboard/screens/${displayId}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(screen.id)}
                        onClick={(e) => toggleSelect(screen.id, e)}
                        onChange={() => {}}
                        className="h-4 w-4 rounded border-muted-foreground/30 accent-primary cursor-pointer shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{screen.name}</h3>
                        {isOnline ? (
                          <Badge className="bg-green-500 hover:bg-green-600">Online</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-destructive/10 text-destructive hover:bg-destructive/20">Offline</Badge>
                        )}
                      </div>
                      {screen.location && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">{screen.location}</span>
                        </div>
                      )}

                      {/* Resolution Icon */}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        {screen.resolution === '9x16' ? (
                          <MonitorSmartphone className="h-3 w-3" />
                        ) : (
                          <Monitor className="h-3 w-3" />
                        )}
                        <span>{screen.resolution === '9x16' ? '9x16 (Vertical)' : '16x9 (Horizontal)'}</span>
                      </div>
                    </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(screen); }}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSchedule(screen); }}>
                          <Calendar className="h-4 w-4 mr-2" />
                          Agendar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCopyUrl(screen); }}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copiar URL
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(`/player/${screen.codigo_operacional || screen.custom_id || screen.id}`, '_blank'); }}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Abrir Player
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); sendCommand(screen.id, 'reload'); }}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Recarregar Player
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); sendCommand(screen.id, 'screenshot'); }}
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          Capturar Tela
                        </DropdownMenuItem>
                        {screen.bound_device_id && (
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); setUnpairTarget(screen); }}
                            className="text-amber-500 focus:text-amber-400"
                          >
                            <Unlink className="h-4 w-4 mr-2" />
                            Desvincular Tela
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); setDeleteId(screen.id); }}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex flex-col gap-2 text-sm text-muted-foreground mt-4 p-3 bg-muted/30 rounded-lg">
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

                    <div className="h-px w-full bg-border/50" />

                    <div className="flex items-center justify-between group/id border-t border-border/30 pt-3 mt-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">ID DO PLAYER</span>
                      <ScreenIdBadge
                        customId={screen.custom_id}
                        codigoOperacional={screen.codigo_operacional}
                        className="bg-background border-border/50 text-[10px] h-6 px-2"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      {isScreenOnline(screen) ? (
                        <Wifi className="h-3 w-3 text-green-500" />
                      ) : (
                        <WifiOff className="h-3 w-3 text-red-500" />
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
            );
          })}
        </div>
      )}
      </>)}

      {/* Dialogs */}
      <CriarTelaPagaDialog open={telaPagaOpen} onOpenChange={setTelaPagaOpen} />
      <ScreenDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        screen={selectedScreen}
        onSaved={fetchScreens}
      />

      <ScreenPairingDialog
        open={pairingDialogOpen}
        onOpenChange={setPairingDialogOpen}
        screens={screens}
        onPaired={fetchScreens}
      />

      {scheduleScreen && (
        <ScreenScheduleDialog
          open={!!scheduleScreen}
          onOpenChange={(open) => !open && setScheduleScreen(null)}
          screenId={scheduleScreen.id}
          screenName={scheduleScreen.name}
        />
      )}

      <AlertDialog open={!!unpairTarget} onOpenChange={(open) => !open && setUnpairTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Unlink className="h-5 w-5" />
              {selectedIds.size > 1 ? `Desvincular ${selectedIds.size} telas?` : 'Desvincular esta tela?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                {unpairTarget && selectedIds.size <= 1 && (
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1.5 text-foreground">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tela</span>
                      <span className="font-medium">{unpairTarget.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ID do Player</span>
                      <code className="text-xs bg-black/30 px-2 py-0.5 rounded font-mono">{unpairTarget.codigo_operacional || unpairTarget.custom_id || '—'}</code>
                    </div>
                    {unpairTarget.bound_device_id && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dispositivo</span>
                        <code className="text-xs bg-black/30 px-2 py-0.5 rounded font-mono truncate max-w-[160px]">{unpairTarget.bound_device_id}</code>
                      </div>
                    )}
                  </div>
                )}
                {selectedIds.size > 1 ? (
                  <p>{selectedIds.size} telas terão seus dispositivos desvinculados.</p>
                ) : (
                  <p>O dispositivo atualmente conectado <strong>perderá o vínculo</strong> com esta tela.</p>
                )}
                <p className="text-emerald-400 font-medium">✓ A Screen e a Playlist <strong>NÃO serão excluídas</strong> e ficarão disponíveis para novo pareamento.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel disabled={isUnpairing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleUnpair();
              }}
              disabled={isUnpairing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
            >
              {isUnpairing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Desvinculando...
                </>
              ) : (
                <>
                  <Unlink className="h-4 w-4" />
                  {selectedIds.size > 1 ? `Desvincular ${selectedIds.size} telas` : 'Desvincular'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
