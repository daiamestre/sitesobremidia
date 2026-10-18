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
import { PastasPontosParceiros, useTelasDosPontos } from '@/components/screens/PastasPontosParceiros';
import { CartoesDasTelas, resumirTelas } from '@/components/screens/CartoesDasTelas';
import { CartaoDaTela, ResumoDasTelas, type TelaDoCartao } from '@/components/screens/CartaoDaTela';
import { MapaDaRede } from '@/components/rede/MapaDaRede';
import { telaOnlineAgora } from '@/lib/statusDoAparelho';
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
  // F-195: as telas da empresa só entram para dono/ADM (antes, a memória guardada da sessão do dono aparecia para o gestor)
  const telasDaEmpresaVisiveis = podeTelasParceiras ? (telasDaEmpresa.data ?? []) : [];
  const screens: Screen[] = [...telasDaConta, ...telasDaEmpresaVisiveis.filter((t) => !telasDaConta.some((c) => c.id === t.id))];
  const loading = carregandoConta || (podeTelasParceiras && !!empresaOperadoraId && telasDaEmpresa.isLoading);
  const navigate = useNavigate();
  // F-112: dois cartões — Telas Pontos Parceiros (pastas por estabelecimento) e Telas Anunciantes
  const [params, setParams] = useSearchParams();
  // F-116: gestor não vê a estrutura de pontos parceiros — vai direto para as telas dele
  const secao = !podeTelasParceiras ? 'anunciantes'
    : params.get('secao') === 'parceiros' || params.get('secao') === 'anunciantes' ? params.get('secao') : null;
  const pontoAberto = params.get('ponto');
  const irPara = (novo: Record<string, string>) => setParams(novo);
  const telasDosPontos = useTelasDosPontos(podeTelasParceiras);
  const telasParceiras = telasDosPontos.data ?? [];
  const pontosComTelas = new Set(telasParceiras.map((t) => t.ponto_id)).size;
  const cidadesDosPontos = new Set(telasParceiras.map((t) => (t.ponto?.cidade || '').trim().toLowerCase()).filter(Boolean)).size;

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
  // F-193: online só pelo sinal do PRÓPRIO aparelho pareado da tela (mesma regra da página da tela)
  const isScreenOnline = (screen: Screen) => telaOnlineAgora(screen as unknown as Parameters<typeof telaOnlineAgora>[0]);

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
  const cidadesDosAnunciantes = new Set(telasAnunciantes.map((s) => String((s as { cidade?: string | null }).cidade || '').trim().toLowerCase()).filter(Boolean)).size;
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
          {/* F-194: gestor de mídia só cria tela PAGA (o banco também recusa tela grátis de gestor) */}
          {ehGestor ? (
            <Button className={`${BOTAO} gradient-primary`} onClick={() => setTelaPagaOpen(true)} data-testid="botao-tela-paga">
              <Plus className="h-4 w-4 mr-2 flex-shrink-0" />
              Nova Tela (R$ 22,99)
            </Button>
          ) : (
            <Button className={`${BOTAO} gradient-primary`} onClick={() => { setSelectedScreen(null); setDialogOpen(true); }} data-testid="botao-telas-anunciantes">
              <Plus className="h-4 w-4 mr-2 flex-shrink-0" />
              Telas de Anunciantes
            </Button>
          )}
        </div>
      </div>

      {/* F-193: cartões em pé, lado a lado, com capa e números; abaixo, o mapa da rede (o mesmo da página inicial) */}
      {podeTelasParceiras && !secao && (<>
        <CartoesDasTelas
          secao={secao as 'parceiros' | 'anunciantes' | null}
          onAbrir={(s) => irPara({ secao: s })}
          parceiros={{
            resumo: resumirTelas(telasParceiras as never),
            carregando: telasDosPontos.isLoading,
            subtitulo: `${pontosComTelas} estabelecimento${pontosComTelas === 1 ? '' : 's'} · ${cidadesDosPontos} cidade${cidadesDosPontos === 1 ? '' : 's'}`,
          }}
          anunciantes={{
            resumo: resumirTelas(telasAnunciantes as never),
            carregando: loading,
            subtitulo: `${cidadesDosAnunciantes} cidade${cidadesDosAnunciantes === 1 ? '' : 's'}`,
          }}
        />
        <section className="space-y-3" data-testid="mapa-da-rede-telas">
          <div>
            <h2 className="font-display text-xl font-bold">Onde estamos</h2>
            <p className="text-sm text-muted-foreground">Estados e cidades da rede SOBRE MÍDIA — aproxime o mapa para ver as cidades</p>
          </div>
          <MapaDaRede />
        </section>
      </>)}

      {podeTelasParceiras && secao === 'parceiros' && !pontoAberto && (
        <button type="button" onClick={() => irPara({})} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar aos cartões
        </button>
      )}

      {secao === 'parceiros' && !pontoAberto && (
        <ResumoDasTelas testId="resumo-parceiros" total={telasParceiras.length}
          online={telasParceiras.filter((t) => isScreenOnline(t as unknown as Screen)).length}
          ativas={telasParceiras.filter((t) => t.is_active !== false).length} />
      )}

      {secao === 'parceiros' && (
        <PastasPontosParceiros
          pontoId={pontoAberto}
          onAbrirPonto={(id) => irPara({ secao: 'parceiros', ponto: id })}
          onVoltar={() => irPara({ secao: 'parceiros' })}
        />
      )}

      {secao === 'anunciantes' && (<>
      {podeTelasParceiras && (
        <button type="button" onClick={() => irPara({})} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar aos cartões
        </button>
      )}

      {/* F-194: resumo no mesmo estilo dos cartões (total, online, offline, ativas) */}
      <ResumoDasTelas testId="resumo-anunciantes" total={telasAnunciantes.length} online={onlineCount} ativas={activeCount} />

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
            onClick: () => { if (ehGestor) { setTelaPagaOpen(true); return; } setSelectedScreen(null); setDialogOpen(true); },
            icon: Plus
          } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3">
          {filteredScreens.map(screen => {
            const isOnline = isScreenOnline(screen);

            // Use operational code (custom_id or codigo_operacional) for navigation URL
            // UUID remains internal identifier
            const displayId = screen.codigo_operacional || screen.custom_id || screen.id;

            return (
              <CartaoDaTela
                key={screen.id}
                tela={screen as unknown as TelaDoCartao}
                online={isOnline}
                selecionada={selectedIds.has(screen.id)}
                onSelecionar={(e) => toggleSelect(screen.id, e)}
                onAbrir={() => navigate(`/dashboard/screens/${displayId}`)}
                menu={(
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20 hover:text-white" onClick={(e) => e.stopPropagation()} aria-label="Ações da tela">
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
                )}
              />
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
