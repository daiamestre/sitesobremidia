
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import {
    ArrowLeft, Monitor, Wifi, WifiOff, MapPin, Clock, Server, ListVideo, Play,
    Power, RefreshCw, Camera, Save, Trash2, GripVertical, Plus, Image, Video,
    Music, Volume2, VolumeX, Smartphone, MonitorSmartphone
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Screen, ScreenStatus, Playlist, Media } from '@/types/models';
import { toast } from 'sonner';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Types
interface MediaItem {
    id: string;
    name: string;
    file_url: string;
    duration: number;
    file_type: string;
}

interface PlaylistItem {
    id: string; // unique item id
    media_id: string;
    position: number;
    media?: MediaItem;
    duration: number; // override duration
}

interface ScreenWithPlaylist extends Screen {
    playlist?: {
        id: string;
        name: string;
        items: PlaylistItem[];
    };
}

// Mock Data for Chart
const data = [
    { name: 'Jan', value: 400 },
    { name: 'Fev', value: 300 },
    { name: 'Mar', value: 200 },
    { name: 'Abr', value: 278 },
    { name: 'Mai', value: 189 },
    { name: 'Jun', value: 239 },
    { name: 'Jul', value: 349 },
];

export default function ScreenDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // States
    const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
    const [availableMedia, setAvailableMedia] = useState<Media[]>([]);

    // Fetch Screen
    const { data: screen, isLoading, refetch } = useQuery({
        queryKey: ['screen', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('screens')
                .select(`
                    *,
                    playlist:playlists(
                        id,
                        name,
                        items:playlist_items(
                            id,
                            media_id,
                            position,
                            duration,
                            media:media_id(id, name, file_url, duration, file_type)
                        )
                    )
                `)
                .eq('id', id)
                .single();
            if (error) throw error;
            return data as any as ScreenWithPlaylist;
        }
    });

    // Initialize/Sync Playlist Items
    useEffect(() => {
        if (screen?.playlist?.items) {
            // Sort by position
            const sorted = [...screen.playlist.items].sort((a, b) => a.position - b.position);
            setPlaylistItems(sorted);
        } else {
            setPlaylistItems([]);
        }
    }, [screen]);

    // Fetch Media for Picker
    useEffect(() => {
        if (mediaPickerOpen) {
            const fetchMedia = async () => {
                const { data } = await supabase.from('media').select('*').order('created_at', { ascending: false });
                if (data) setAvailableMedia(data as Media[]);
            };
            fetchMedia();
        }
    }, [mediaPickerOpen]);


    // Handlers
    const handleSendCommand = async (command: 'reload' | 'reboot' | 'screenshot') => {
        toast.info(`Enviando comando: ${command}...`);
        // In a real app, insert into command queue table
        await supabase.from('remote_commands').insert({
            screen_id: id,
            command: command,
            status: 'pending'
        });
        toast.success('Comando enviado!');
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...playlistItems];
        newItems.splice(index, 1);
        setPlaylistItems(newItems);
        setHasUnsavedChanges(true);
    };

    const handleAddItem = (media: Media) => {
        const newItem: PlaylistItem = {
            id: `temp-${Date.now()}`, // temp id
            media_id: media.id,
            position: playlistItems.length,
            duration: media.duration || 10, // default duration
            media: {
                id: media.id,
                name: media.name,
                file_url: media.file_url,
                duration: media.duration || 10,
                file_type: media.file_type || 'image'
            }
        };
        setPlaylistItems([...playlistItems, newItem]);
        setHasUnsavedChanges(true);
        setMediaPickerOpen(false);
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        e.dataTransfer.setData('text/plain', index.toString());
    };

    const handleDrop = (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
        if (dragIndex === dropIndex) return;

        const newItems = [...playlistItems];
        const [removed] = newItems.splice(dragIndex, 1);
        newItems.splice(dropIndex, 0, removed);

        setPlaylistItems(newItems);
        setHasUnsavedChanges(true);
    };

    const handleSavePlaylist = async () => {
        if (!screen?.playlist_id) return;
        setIsSaving(true);
        try {
            // 1. Delete all current items (simplest strategy for now, or use upsert if IDs strictly managed)
            // But we have mixed temp IDs. Safest is delete all for this playlist and insert new.
            // CAREFUL: This wipes history/stats if linked to specific item IDs. 
            // Better: update existing where possible, insert new, delete missing.
            // For MVP: Delete All -> Insert All is standard "Save Playlist" behavior in many simple CRUDs.

            await supabase.from('playlist_items').delete().eq('playlist_id', screen.playlist_id);

            const itemsToInsert = playlistItems.map((item, index) => ({
                playlist_id: screen.playlist_id,
                media_id: item.media_id,
                position: index,
                duration: item.duration
            }));

            if (itemsToInsert.length > 0) {
                await supabase.from('playlist_items').insert(itemsToInsert);
            }

            toast.success('Playlist salva com sucesso!');
            setHasUnsavedChanges(false);
            refetch(); // Reload data
        } catch (e) {
            console.error(e);
            toast.error('Erro ao salvar playlist');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="p-8 flex justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div></div>;

    // Add specific check for error or missing screen
    if (isError || !screen) {
        return (
            <div className="p-8 flex flex-col items-center justify-center text-muted-foreground">
                <Server className="h-10 w-10 mb-2 opacity-50" />
                <h2 className="text-xl font-semibold">Erro ao carregar detalhes</h2>
                <p>Não foi possível encontrar a tela ou os dados estão incompletos.</p>
                <Button variant="link" onClick={() => navigate('/dashboard/screens')}>Voltar</Button>
            </div>
        );
    }
    const isOnline = screen.last_ping_at && (new Date().getTime() - new Date(screen.last_ping_at).getTime()) < 300000; // 5 min
    const isPortrait = screen.resolution === '9x16';

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header */}
            <div className="bg-card border border-border/50 rounded-xl p-6 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                            {isPortrait ? <Smartphone className="h-8 w-8 text-primary" /> : <Monitor className="h-8 w-8 text-primary" />}
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold">{screen.name}</h1>
                                <Badge className={isOnline ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"}>
                                    {isOnline ? "ONLINE" : "OFFLINE"}
                                </Badge>
                                <Badge variant="outline" className="gap-1">
                                    {isPortrait ? <MonitorSmartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                                    {screen.resolution || '16x9'}
                                </Badge>
                                {screen.audio_enabled && (
                                    <Badge variant="secondary" className="gap-1 bg-blue-500/10 text-blue-500 border-blue-500/20">
                                        <Volume2 className="h-3 w-3" /> Áudio Ativo
                                    </Badge>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
                                <div className="flex items-center gap-1.5">
                                    <MapPin className="h-3.5 w-3.5" />
                                    {screen.location || 'Sem localização'}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5" />
                                    {screen.last_ping_at ? formatDistanceToNow(new Date(screen.last_ping_at), { addSuffix: true, locale: ptBR }) : 'Nunca visto'}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Server className="h-3.5 w-3.5" />
                                    v{screen.version || '1.0.0'}
                                </div>
                                <div className="flex items-center gap-1.5 font-mono bg-muted px-1.5 py-0.5 rounded text-xs">
                                    ID: {screen.custom_id || screen.id.slice(0, 8)}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigate('/dashboard/screens')}>
                            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Charts & Controls */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Stats Chart */}
                    <Card className="glass h-[400px]">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Estatísticas de Exibição</CardTitle>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="h-8">Mensal</Button>
                            </div>
                        </CardHeader>
                        <CardContent className="h-[320px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                    <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                                    />
                                    <Bar dataKey="value" fill="#8884d8" radius={[4, 4, 0, 0]} className="fill-primary" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Remote Control */}
                        <Card className="glass">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Wifi className="h-5 w-5" /> Controle Remoto
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 gap-3">
                                <Button variant="outline" className="h-20 flex flex-col gap-2 hover:bg-primary/10 hover:border-primary/50" onClick={() => handleSendCommand('reload')}>
                                    <RefreshCw className="h-6 w-6" />
                                    Atualizar Player
                                </Button>
                                <Button variant="outline" className="h-20 flex flex-col gap-2 hover:bg-destructive/10 hover:border-destructive/50 hover:text-destructive" onClick={() => handleSendCommand('reboot')}>
                                    <Power className="h-6 w-6" />
                                    Reiniciar Dispositivo
                                </Button>
                                <Button className="col-span-2 h-12 flex items-center gap-2" onClick={() => handleSendCommand('screenshot')}>
                                    <Camera className="h-5 w-5" /> Solicitar Screenshot
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Screenshot Preview */}
                        <Card className="glass overflow-hidden">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Monitor className="h-5 w-5" /> Screenshot
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0 relative aspect-video bg-black/50">
                                {/* Placeholder for now */}
                                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground flex-col gap-2">
                                    <Camera className="h-8 w-8 opacity-20" />
                                    <span className="text-xs opacity-50">Nenhum screenshot recente</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Right Column: Playlist Management */}
                <div className="lg:col-span-1">
                    <Card className="glass h-full flex flex-col">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <ListVideo className="h-5 w-5 text-primary" />
                                    <CardTitle>Lista de Reprodução</CardTitle>
                                </div>
                                <Dialog open={mediaPickerOpen} onOpenChange={setMediaPickerOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" className="gap-1">
                                            <Plus className="h-4 w-4" /> Incluir Mídia
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                                        <DialogHeader>
                                            <DialogTitle>Selecionar Mídia</DialogTitle>
                                        </DialogHeader>
                                        <ScrollArea className="flex-1 p-2">
                                            <div className="grid grid-cols-3 gap-3">
                                                {availableMedia.map(media => (
                                                    <div key={media.id}
                                                        className="aspect-video bg-muted rounded-lg relative overflow-hidden cursor-pointer group hover:ring-2 hover:ring-primary"
                                                        onClick={() => handleAddItem(media)}
                                                    >
                                                        {media.file_type === 'image' ? (
                                                            <img src={media.file_url} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <video src={media.file_url} className="w-full h-full object-cover" />
                                                        )}
                                                        <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 text-[10px] truncate text-white">
                                                            {media.name}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </CardHeader>

                        <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
                            {!screen.playlist_id ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                                    <ListVideo className="h-10 w-10 mb-3 opacity-20" />
                                    <p>Esta tela não possui uma playlist associada.</p>
                                    <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/dashboard/playlists')}>
                                        Criar/Vincular Playlist
                                    </Button>
                                </div>
                            ) : (
                                <ScrollArea className="flex-1">
                                    <div className="p-4 space-y-2">
                                        {playlistItems.map((item, index) => (
                                            <div
                                                key={item.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, index)}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => handleDrop(e, index)}
                                                className="group flex items-center gap-3 p-2 bg-muted/30 hover:bg-muted/50 border border-transparent hover:border-border/50 rounded-lg transition-all cursor-move active:cursor-grabbing"
                                            >
                                                <div className="text-muted-foreground cursor-grab active:cursor-grabbing p-1">
                                                    <GripVertical className="h-4 w-4" />
                                                </div>

                                                <div className="h-10 w-16 bg-black/20 rounded overflow-hidden flex-shrink-0 relative">
                                                    {item.media?.file_type === 'video' ? (
                                                        <Video className="h-4 w-4 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/50" />
                                                    ) : (
                                                        <img src={item.media?.file_url} className="w-full h-full object-cover" />
                                                    )}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{item.media?.name}</p>
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <Clock className="h-3 w-3" />
                                                        <span>{item.duration}s</span>
                                                    </div>
                                                </div>

                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => handleRemoveItem(index)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}

                                        {playlistItems.length === 0 && (
                                            <div className="text-center py-8 text-sm text-muted-foreground">
                                                Playlist vazia
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            )}
                        </CardContent>

                        {screen.playlist_id && (
                            <div className="p-4 border-t border-border/50 bg-muted/10">
                                <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                                    <span>{playlistItems.length} mídias</span>
                                    <span>{Math.floor(playlistItems.reduce((acc, i) => acc + (i.duration || 10), 0) / 60)}m {playlistItems.reduce((acc, i) => acc + (i.duration || 10), 0) % 60}s duração</span>
                                </div>
                                <Button
                                    className="w-full gap-2"
                                    onClick={handleSavePlaylist}
                                    disabled={!hasUnsavedChanges || isSaving}
                                    variant={hasUnsavedChanges ? "default" : "secondary"}
                                >
                                    {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                                </Button>
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}

