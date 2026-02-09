import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Monitor, Wifi, WifiOff, MapPin, Clock, Server, ListVideo, Play } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Screen, ScreenStatus } from '@/types/models';

interface MediaItem {
    id: string;
    name: string;
    file_url: string;
    duration: number;
    file_type: string;
}

interface PlaylistItem {
    id: string;
    position: number;
    media?: MediaItem;
}

interface PlaylistDetails {
    id: string;
    name: string;
    description?: string;
    items?: PlaylistItem[];
}

interface ScreenWithPlaylist extends Omit<Screen, 'playlist'> {
    playlist?: PlaylistDetails;
}

export default function ScreenDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Fetch Screen Details
    const { data: screen, isLoading } = useQuery({
        queryKey: ['screen', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('screens')
                .select(`
          *,
          playlist:playlists(
            id,
            name,
            description,
            items:playlist_items(
              id,
              position,
              media:media_items(id, name, file_url, duration, file_type)
            )
          )
        `)
                .eq('id', id)
                .single();

            if (error) throw error;

            // Compute status logic similar to useScreens
            const now = new Date();
            let status: ScreenStatus = 'offline';
            if (data.last_ping_at) {
                const lastPing = new Date(data.last_ping_at);
                const diffSeconds = (now.getTime() - lastPing.getTime()) / 1000;
                if (diffSeconds < 60) {
                    status = 'playing';
                } else if (diffSeconds < 300) {
                    status = 'online';
                }
            }

            return { ...data, status } as ScreenWithPlaylist;
        },
        enabled: !!id,
        refetchInterval: 10000,
    });

    if (isLoading) {
        return (
            <div className="space-y-6 animate-fade-in p-6">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2">
                        <Skeleton className="h-8 w-64" />
                        <Skeleton className="h-4 w-32" />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                </div>
            </div>
        );
    }

    if (!screen) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-muted-foreground">
                <Monitor className="h-12 w-12 mb-4 opacity-50" />
                <h2 className="text-xl font-semibold">Tela não encontrada</h2>
                <Button variant="link" onClick={() => navigate('/dashboard/screens')}>
                    Voltar para Lista
                </Button>
            </div>
        );
    }

    const isOnline = screen.status === 'playing' || screen.status === 'online';

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/screens')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-display font-bold text-foreground">{screen.name}</h1>
                            <Badge
                                variant={isOnline ? 'default' : 'destructive'}
                                className={isOnline ? 'bg-green-500 hover:bg-green-600' : ''}
                            >
                                {isOnline ? 'ONLINE' : 'OFFLINE'}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                <span>{screen.location || 'Sem localização'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>
                                    {screen.last_ping_at
                                        ? `Visto ${formatDistanceToNow(new Date(screen.last_ping_at), { addSuffix: true, locale: ptBR })}`
                                        : 'Nunca visto'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => window.open(`/player/${screen.custom_id || screen.id}`, '_blank')}>
                        Abrir Player
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="bg-background/50 backdrop-blur border border-border/50 p-1">
                    <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                    <TabsTrigger value="playlist">Playlist da Tela</TabsTrigger>
                    {/* <TabsTrigger value="analytics">Métricas</TabsTrigger> */}
                </TabsList>

                <TabsContent value="overview" className="space-y-6 mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Status Card */}
                        <Card className="glass overflow-hidden">
                            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                <CardTitle className="text-sm font-medium">Status da Conexão</CardTitle>
                                {isOnline ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-red-500" />}
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{isOnline ? 'Online' : 'Offline'}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {screen.last_ping_at
                                        ? `Último sinal em ${format(new Date(screen.last_ping_at), "dd/MM 'às' HH:mm")}`
                                        : 'Sem conexão recente'}
                                </p>
                            </CardContent>
                        </Card>

                        {/* Device Info */}
                        <Card className="glass">
                            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                <CardTitle className="text-sm font-medium">Dispositivo</CardTitle>
                                <Monitor className="h-4 w-4 text-primary" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">v{screen.version || '1.0.0'}</div>
                                <div className="flex flex-col gap-1 mt-1 text-xs text-muted-foreground">
                                    <span>IP: {screen.ip_address || '---'}</span>
                                    <span>ID: {screen.custom_id || screen.id.slice(0, 8)}</span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Current Playlist */}
                        <Card className="glass">
                            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                <CardTitle className="text-sm font-medium">Playlist Atual</CardTitle>
                                <ListVideo className="h-4 w-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                {screen.playlist ? (
                                    <>
                                        <div className="text-lg font-bold truncate" title={screen.playlist.name}>
                                            {screen.playlist.name}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">{screen.playlist.items?.length || 0} itens na fila</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-lg font-bold text-muted-foreground">Nenhuma</div>
                                        <p className="text-xs text-muted-foreground mt-1">Tela ociosa</p>
                                    </>
                                )}
                            </CardContent>
                        </Card>

                        {/* Uptime/Storage (Mock for now) */}
                        <Card className="glass">
                            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                <CardTitle className="text-sm font-medium">Armazenamento</CardTitle>
                                <Server className="h-4 w-4 text-orange-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">--</div>
                                <p className="text-xs text-muted-foreground mt-1">Disponível no dispositivo</p>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="playlist" className="mt-6">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Conteúdo em Reprodução</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {screen.playlist ? (
                                <div className="space-y-4">
                                    {screen.playlist.items?.sort((a, b) => a.position - b.position).map((item, index) => (
                                        <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-background/50 text-xs font-bold border border-border">
                                                    {index + 1}
                                                </div>
                                                {item.media?.file_type === 'video' ? (
                                                    <div className="h-10 w-16 bg-black/20 rounded flex items-center justify-center">
                                                        <Play className="h-4 w-4 opacity-50" />
                                                    </div>
                                                ) : (
                                                    <div className="h-10 w-16 bg-cover bg-center rounded" style={{ backgroundImage: `url(${item.media?.file_url})` }} />
                                                )}
                                                <div>
                                                    <p className="font-medium">{item.media?.name || 'Item desconhecido'}</p>
                                                    <p className="text-xs text-muted-foreground">{item.media ? `${item.media.duration}s` : 'Tempo padrão'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(!screen.playlist.items || screen.playlist.items.length === 0) && (
                                        <div className="text-center py-8 text-muted-foreground">Playlist vazia</div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <ListVideo className="h-10 w-10 mb-3 opacity-20" />
                                    <p>Nenhuma playlist associada a esta tela.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
