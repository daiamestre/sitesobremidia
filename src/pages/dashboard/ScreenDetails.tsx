import { useState, useEffect } from 'react';
import { MediaThumbnail } from '@/components/media/MediaThumbnail';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { supabaseConfig } from '@/supabaseConfig';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    ArrowLeft, Monitor, Wifi, WifiOff, MapPin, Clock, Server, ListVideo, Play,
    Power, RefreshCw, Camera, Save, Trash2, GripVertical, Plus, Image, Video,
    Music, Volume2, VolumeX, Smartphone, MonitorSmartphone, LayoutTemplate, ExternalLink as ExternalLinkIcon
} from 'lucide-react';
import { format, formatDistanceToNow, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Screen, ScreenStatus, Playlist, Media, Widget, ExternalLink, PlaylistItem as ModelPlaylistItem } from '@/types/models';
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
    media_id: string | null;
    widget_id?: string | null;
    external_link_id?: string | null;
    position: number;
    media?: MediaItem;
    widget?: Widget | null;
    external_link?: ExternalLink | null;
    duration: number; // override duration
}

// Types matching query response exactly, without implementing full Screen interface
interface ScreenWithPlaylist {
    id: string;
    name: string;
    location?: string;
    description?: string;
    status?: string;
    last_ping_at?: string;
    version?: string;
    ip_address?: string;
    custom_id?: string;
    resolution?: string;
    orientation?: 'landscape' | 'portrait';
    playlist_id?: string;
    is_active: boolean;
    audio_enabled?: boolean;
    last_screenshot_at?: string;
    last_screenshot_type?: 'manual' | 'heartbeat';
    playlist?: {
        id: string;
        name: string;
        items: PlaylistItem[];
    };
}

// Mock Data for Chart
// Chart Data Logic handled inside component


function DebugLogViewer({ screenId }: { screenId: string }) {
    const [logs, setLogs] = useState<any[]>([]);
    const [count, setCount] = useState(0);
    const [lastError, setLastError] = useState<string | null>(null);

    useEffect(() => {
        const fetch = async () => {
            try {
                // FIX: Cannot query UUID column with text string (causes 400 error).
                console.log("Debug: Fetching logs for UUID:", screenId);

                const { data, count, error } = await supabase
                    .from('playback_logs')
                    .select('*', { count: 'exact' })
                    .eq('screen_id', screenId)
                    .order('started_at', { ascending: false })
                    .limit(5);

                if (error) {
                    console.error("Debug: Log fetch error:", error);
                    throw error;
                }

                console.log("Debug: Logs found:", data);
                setLogs(data || []);
                setCount(count || 0);
                setLastError(null);
            } catch (e: any) {
                setLastError(e.message);
            }
        };

        fetch();
        const interval = setInterval(fetch, 5000);
        return () => clearInterval(interval);
    }, [screenId]);

    return (
        <div className="bg-black/80 p-4 rounded text-xs font-mono max-h-60 overflow-auto border border-red-500/30">
            <h4 className="text-red-400 font-bold mb-2">DEBUG RAW DATA</h4>
            <div className="flex justify-between mb-1">
                <span>Total Count: {count}</span>
                {lastError && <span className="text-red-500">{lastError}</span>}
            </div>

            {/* RAW DATA DUMP */}
            <pre className="text-[10px] text-green-400 whitespace-pre-wrap break-all">
                {logs.length > 0 ? JSON.stringify(logs, null, 2) : "Nenhum dado retornado (Array vazio)."}
            </pre>
        </div>
    );
}

export default function ScreenDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { user } = useAuth();

    // --- SMART UUID RESOLVER ---
    const { data: resolvedId, isLoading: idLoading, isError: idError } = useQuery({
        queryKey: ['screen-id-resolve', id],
        queryFn: async () => {
            if (!id) return null;
            // Common UUID Regex
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

            if (isUUID) return id;

            console.log("Detectado ID Personalizado (Custom ID):", id, "Buscando UUID...");
            const { data, error } = await supabase
                .from('screens')
                .select('id')
                .eq('custom_id', id)
                .maybeSingle();

            if (error) {
                console.error("Erro na resolução de ID:", error);
                throw error;
            }
            return data?.id || null;
        },
        enabled: !!id
    });

    // States
    const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
    const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
    const [widgetPickerOpen, setWidgetPickerOpen] = useState(false);
    const [linkPickerOpen, setLinkPickerOpen] = useState(false);

    // Stats State
    const [statsPeriod, setStatsPeriod] = useState<'today' | 'week' | 'month'>('week');
    const [isCapturing, setIsCapturing] = useState(false);

    // Fetch Stats
    const { data: statsData, isLoading: isLoadingStats } = useQuery({
        queryKey: ['screen-stats', resolvedId, statsPeriod],
        queryFn: async () => {
            if (!resolvedId) return [];

            const now = new Date();
            let start, end, formatLabel: (d: Date) => string;

            if (statsPeriod === 'today') {
                start = startOfDay(now);
                end = endOfDay(now);
                formatLabel = (d) => format(d, 'HH:mm');
            } else if (statsPeriod === 'week') {
                start = startOfDay(subDays(now, 6));
                end = endOfDay(now);
                formatLabel = (d) => format(d, 'dd/MM');
            } else { // month
                start = startOfDay(subDays(now, 29));
                end = endOfDay(now);
                formatLabel = (d) => format(d, 'dd/MM');
            }

            const { data, error } = await supabase
                .from('playback_logs')
                .select('started_at')
                .eq('screen_id', resolvedId)
                .gte('started_at', start.toISOString())
                .lte('started_at', end.toISOString());

            if (error) {
                console.error("Stats Error:", error);
                throw error;
            }

            const counts: Record<string, number> = {};
            data?.forEach((row: any) => {
                const date = new Date(row.started_at);
                const label = formatLabel(date);
                counts[label] = (counts[label] || 0) + 1;
            });

            return Object.entries(counts)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => a.name.localeCompare(b.name));
        },
        refetchInterval: 10000,
        enabled: !!resolvedId
    });

    // Main Query: simplified and more resilient
    const { data: screen, isLoading: screenLoading, isError: screenError, refetch } = useQuery({
        queryKey: ['screen', resolvedId],
        queryFn: async () => {
            if (!resolvedId) return null;

            // Step 1: Fetch Screen and basic Playlist
            const { data: screenData, error } = await supabase
                .from('screens')
                .select(`
                    *,
                    playlist:playlists(id, name)
                `)
                .eq('id', resolvedId)
                .maybeSingle();

            if (error) {
                console.error('Error fetching screen:', error);
                throw error;
            }
            if (!screenData) return null;

            let items: any[] = [];
            if (screenData.playlist_id) {
                // Step 2: Fetch Playlist Items with specific columns to avoid errors with missing columns (like thumbnail_url in widgets)
                const { data: itemsData, error: itemsError } = await supabase
                    .from('playlist_items')
                    .select(`
                        id,
                        playlist_id,
                        media_id,
                        widget_id,
                        external_link_id,
                        position,
                        duration,
                        created_at,
                        media:media(id, name, file_path, file_url, file_type, thumbnail_url, aspect_ratio),
                        widget:widgets(id, name, widget_type, config, is_active),
                        external_link:external_links(id, title, url, platform, thumbnail_url, is_active)
                    `)
                    .eq('playlist_id', screenData.playlist_id)
                    .order('position');

                if (itemsError) {
                    console.error('Error fetching playlist items:', itemsError);
                } else {
                    items = itemsData || [];
                }
            }

            return { ...screenData, playlist_items: items };
        },
        enabled: !!resolvedId
    });

    // Consolidated Loading and Error states
    const isLoading = idLoading || (!!resolvedId && screenLoading);
    const isError = idError || (!!resolvedId && screenError);

    // Initialize/Sync Playlist Items
    useEffect(() => {
        if (screen?.playlist_items) {
            const sorted = [...screen.playlist_items].sort((a, b) => a.position - b.position);
            setPlaylistItems(sorted);
        } else {
            setPlaylistItems([]);
        }
    }, [screen]);

    // Force re-render every minute to update "time ago" text
    const [, forceUpdate] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => forceUpdate(n => n + 1), 60000);
        return () => clearInterval(interval);
    }, []);

    // Secondary queries: Enhanced with user_id to respect RLS
    const { data: availableMedia = [] } = useQuery({
        queryKey: ['available-media', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('media')
                .select('*')
                .eq('user_id', user?.id)
                .order('name');
            if (error) throw error;
            return data || [];
        },
        enabled: !!user?.id
    });

    const { data: availableWidgets = [] } = useQuery({
        queryKey: ['available-widgets', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('widgets')
                .select('id, name, widget_type, config, is_active')
                .eq('user_id', user?.id)
                .order('name');
            if (error) throw error;
            return data || [];
        },
        enabled: !!user?.id
    });

    const { data: availableLinks = [] } = useQuery({
        queryKey: ['available-links', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('external_links')
                .select('*')
                .eq('user_id', user?.id)
                .order('title');
            if (error) throw error;
            return data || [];
        },
        enabled: !!user?.id
    });

    const { data: availablePlaylists = [] } = useQuery({
        queryKey: ['available-playlists', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('playlists')
                .select('*, item_count:playlist_items(count)')
                .eq('user_id', user?.id)
                .order('name');
            if (error) throw error;

            return (data || []).map(p => ({
                ...p,
                item_count: (p as any).item_count?.[0]?.count || 0
            }));
        },
        enabled: !!user?.id
    });

    // [REALTIME DIAGNOSTIC] Listen for command execution to auto-refresh screenshot
    useEffect(() => {
        if (!resolvedId) return;

        console.log(">>> [SNIFFER] Iniciando Observador em Tempo Real para UUID:", resolvedId);
        const channel = supabase
            .channel(`screen-diagnostics-${resolvedId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'remote_commands',
                    filter: `screen_id=eq.${resolvedId}`
                },
                (payload) => {
                    const cmd = payload.new.command?.toLowerCase();
                    const status = payload.new.status?.toLowerCase();

                    console.log(">>> [SNIFFER] Mudança de Status detectada:", cmd, status);

                    if (cmd === 'screenshot') {
                        if (status === 'executed' || status?.startsWith('executed')) {
                            toast.success('📸 Screenshot recebido e atualizado!', {
                                description: 'A imagem foi capturada agora mesmo pelo dispositivo.'
                            });
                            setIsCapturing(false);
                            // Refresh React Query to update last_screenshot_at
                            queryClient.invalidateQueries({ queryKey: ['screen', resolvedId] });
                            // Force refresh image via DOM
                            const img = document.getElementById('screenshot-preview') as HTMLImageElement;
                            if (img) {
                                const baseUrl = supabaseConfig.url;
                                img.src = `${baseUrl}/storage/v1/object/public/screenshots/${resolvedId}.jpg?t=${Date.now()}`;
                            }
                        } else if (status === 'failed' || status?.startsWith('failed')) {
                            toast.error(`❌ Falha na captura do dispositivo`, {
                                description: payload.new.status_note || payload.new.error_message || 'Verifique se o player está online.'
                            });
                            setIsCapturing(false);
                        }
                    }
                }
            )
            .subscribe((status) => {
                console.log(">>> [SNIFFER] Status da Conexão Realtime:", status);
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [resolvedId, queryClient]);


    // Handlers
    const handleSendCommand = async (command: 'reload' | 'reboot' | 'screenshot') => {
        if (!resolvedId) {
            toast.error("Erro: ID da tela não resolvido.");
            return;
        }
        if (command === 'screenshot') setIsCapturing(true);
        toast.info(`Contatando dispositivo: ${command}...`, { duration: 2000 });

        const { error } = await supabase.from('remote_commands').insert({
            screen_id: resolvedId, // Use UUID
            command: command,
            status: 'pending'
        });

        if (error) {
            console.error("Erro ao enviar comando:", error);
            toast.error(`Erro ao enviar: ${error.message}`);
            if (command === 'screenshot') setIsCapturing(false);
        }
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

    const handleAddWidget = (widget: Widget) => {
        const newItem: PlaylistItem = {
            id: `temp-widget-${Date.now()}`,
            media_id: null,
            widget_id: widget.id,
            position: playlistItems.length,
            duration: widget.widget_type === 'rss' ? 15 : 10, // Default duration: RSS 15s, others 10s
            widget: widget
        };
        setPlaylistItems([...playlistItems, newItem]);
        setHasUnsavedChanges(true);
        setWidgetPickerOpen(false);
    };

    const handleAddExternalLink = (link: ExternalLink) => {
        const newItem: PlaylistItem = {
            id: `temp-link-${Date.now()}`,
            media_id: null,
            external_link_id: link.id,
            position: playlistItems.length,
            duration: 30, // default duration for links
            external_link: link
        };
        setPlaylistItems([...playlistItems, newItem]);
        setHasUnsavedChanges(true);
        setLinkPickerOpen(false);
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
        if (!screen?.playlist_id || !user?.id) return;
        setIsSaving(true);
        try {
            // 1. Delete all current items for this playlist
            const { error: deleteError } = await supabase
                .from('playlist_items')
                .delete()
                .eq('playlist_id', screen.playlist_id);

            if (deleteError) throw deleteError;

            // 2. Prepare items to insert with user_id for RLS compliance
            const itemsToInsert = playlistItems.map((item, index) => ({
                playlist_id: screen.playlist_id,
                media_id: item.media_id,
                widget_id: item.widget_id,
                external_link_id: item.external_link_id,
                position: index,
                duration: item.duration || 10
            }));

            if (itemsToInsert.length > 0) {
                const { error: insertError } = await supabase
                    .from('playlist_items')
                    .insert(itemsToInsert);

                if (insertError) throw insertError;
            }

            // Trigger Realtime Sync: Update the playlist itself to notify the player
            await supabase
                .from('playlists')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', screen.playlist_id);

            toast.success('Playlist salva e sincronizada com o player!');
            setHasUnsavedChanges(false);

            // Reload EVERYTHING to ensure state is perfectly synced with DB
            await refetch();
        } catch (e: any) {
            console.error("Erro ao salvar playlist:", e);
            toast.error(`Erro ao salvar playlist: ${e.message || 'Erro desconhecido'}`);
            // If insert failed, refetch to restore what's (potentially still) in DB
            refetch();
        } finally {
            setIsSaving(false);
        }
    };

    const handleLinkPlaylist = async (playlist: Playlist) => {
        try {
            toast.loading('Vinculando playlist...');

            const { error } = await supabase
                .from('screens')
                .update({ playlist_id: playlist.id })
                .eq('id', resolvedId);

            if (error) throw error;

            toast.dismiss();
            toast.success(`Playlist "${playlist.name}" vinculada com sucesso!`);
            setPlaylistPickerOpen(false);
            refetch(); // Trigger reload to show the new playlist items
        } catch (error) {
            console.error(error);
            toast.dismiss();
            toast.error('Erro ao vincular playlist');
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
    // Status logic: Must be active AND have pinged in the last 5 minutes
    const isOnline = screen.is_active !== false && screen.last_ping_at && (new Date().getTime() - new Date(screen.last_ping_at).getTime()) < 300000; // 5 min
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
                                {screen.status && (
                                    <div className="flex items-center gap-1.5 font-mono bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded text-xs border border-blue-500/20">
                                        <Server className="h-3 w-3" />
                                        {screen.status}
                                    </div>
                                )}
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
                                <Button
                                    size="sm"
                                    variant={statsPeriod === 'today' ? "default" : "outline"}
                                    className="h-7 text-xs"
                                    onClick={() => setStatsPeriod('today')}
                                >
                                    Hoje
                                </Button>
                                <Button
                                    size="sm"
                                    variant={statsPeriod === 'week' ? "default" : "outline"}
                                    className="h-7 text-xs"
                                    onClick={() => setStatsPeriod('week')}
                                >
                                    7 Dias
                                </Button>
                                <Button
                                    size="sm"
                                    variant={statsPeriod === 'month' ? "default" : "outline"}
                                    className="h-7 text-xs"
                                    onClick={() => setStatsPeriod('month')}
                                >
                                    30 Dias
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="h-[320px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={statsData || []}>
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
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <Button variant="outline" className="h-20 flex flex-col gap-2 hover:bg-primary/10 hover:border-primary/50" onClick={() => handleSendCommand('reload')}>
                                        <RefreshCw className="h-6 w-6" />
                                        Atualizar Player
                                    </Button>
                                    <Button variant="outline" className="h-20 flex flex-col gap-2 hover:bg-destructive/10 hover:border-destructive/50 hover:text-destructive" onClick={() => handleSendCommand('reboot')}>
                                        <Power className="h-6 w-6" />
                                        Reiniciar Dispositivo
                                    </Button>
                                </div>

                                <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/20">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-medium">Tela Ativa</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Se desativada, a tela exibirá um aviso.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={screen.is_active !== false}
                                        onCheckedChange={async (checked) => {
                                            if (!resolvedId) {
                                                toast.error('Erro: ID da tela não resolvido.');
                                                return;
                                            }

                                            // Optimistic update: change UI immediately
                                            queryClient.setQueryData(['screen', resolvedId], (old: any) =>
                                                old ? { ...old, is_active: checked } : old
                                            );

                                            const { data, error } = await supabase
                                                .from('screens')
                                                .update({ is_active: checked })
                                                .eq('id', resolvedId)
                                                .select('is_active');

                                            if (error) {
                                                console.error('Toggle is_active error:', error);
                                                toast.error(`Erro ao atualizar: ${error.message}`);
                                                // Rollback optimistic update
                                                queryClient.invalidateQueries({ queryKey: ['screen', resolvedId] });
                                            } else if (!data || data.length === 0) {
                                                console.error('Toggle is_active: 0 rows affected (RLS ou ID inválido)');
                                                toast.error('Sem permissão para alterar esta tela.');
                                                queryClient.invalidateQueries({ queryKey: ['screen', resolvedId] });
                                            } else {
                                                toast.success(`Tela ${checked ? 'ativada' : 'desativada'}!`);
                                            }
                                        }}
                                    />
                                </div>

                                <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/20">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            {screen.audio_enabled !== false ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
                                            <Label className="text-sm font-medium">Áudio Dinâmico</Label>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Controla o volume do player remotamente.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={screen.audio_enabled !== false}
                                        onCheckedChange={async (checked) => {
                                            if (!resolvedId) {
                                                toast.error('Erro: ID da tela não resolvido.');
                                                return;
                                            }
                                            const { error } = await supabase
                                                .from('screens')
                                                .update({ audio_enabled: checked })
                                                .eq('id', resolvedId);

                                            if (error) {
                                                console.error('Toggle audio error:', error);
                                                toast.error(`Erro ao atualizar áudio: ${error.message}`);
                                            } else {
                                                toast.success(`Áudio ${checked ? 'ativado' : 'mudo'}!`);
                                            }
                                            queryClient.invalidateQueries({ queryKey: ['screen', resolvedId] });
                                        }}
                                    />
                                </div>

                                <Button
                                    className="w-full h-12 flex items-center gap-2"
                                    onClick={() => handleSendCommand('screenshot')}
                                    disabled={isCapturing}
                                >
                                    {isCapturing ? (
                                        <>
                                            <RefreshCw className="h-5 w-5 animate-spin" />
                                            Capturando na TV...
                                        </>
                                    ) : (
                                        <>
                                            <Camera className="h-5 w-5" />
                                            Solicitar Screenshot
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Screenshot Preview - Compact Version */}
                        <div className="glass rounded-xl border border-border/50 overflow-hidden flex flex-col bg-card/10 min-h-[300px] w-full max-w-[380px] mx-auto md:mx-0">
                            {/* Header Strip */}
                            <div className="px-4 py-3 flex items-center justify-between border-b border-border/40 shrink-0">
                                <div className="flex items-center gap-2">
                                    <Monitor className="h-4 w-4 text-primary" />
                                    <span className="text-sm font-semibold text-white">Screenshot</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {screen.last_screenshot_type && (
                                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-primary/20 text-primary border-primary/30 uppercase tracking-tighter font-bold">
                                            {screen.last_screenshot_type === 'heartbeat' ? 'Check de Mídia' : 'Manual'}
                                        </Badge>
                                    )}
                                    <button
                                        className="p-1.5 hover:bg-muted rounded-md transition-colors"
                                        onClick={() => {
                                            const img = document.getElementById('screenshot-preview') as HTMLImageElement;
                                            if (img) img.src = `${supabaseConfig.url}/storage/v1/object/public/screenshots/${resolvedId}.jpg?t=${Date.now()}`;
                                        }}
                                    >
                                        <RefreshCw className="h-4 w-4 text-muted-foreground" />
                                    </button>
                                </div>
                            </div>

                            {/* Image Container */}
                            <div className={`p-0 relative flex-1 bg-black/80 flex items-center justify-center group overflow-hidden ${isPortrait ? 'max-h-[280px] min-h-[220px]' : 'aspect-video'}`}>
                                <img
                                    id="screenshot-preview"
                                    src={`${supabaseConfig.url}/storage/v1/object/public/screenshots/${resolvedId}.jpg?t=${Date.now()}`}
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                    }}
                                    onLoad={(e) => {
                                        e.currentTarget.style.display = 'block';
                                        e.currentTarget.nextElementSibling?.classList.add('hidden');
                                    }}
                                />
                                {/* Error State */}
                                <div className="hidden absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2 bg-[#0a0a0a]">
                                    <Camera className="h-8 w-8 opacity-20" />
                                    <span className="text-xs opacity-50">Nenhum screenshot disponível</span>
                                </div>
                            </div>

                            {/* FOOTER LEGEND - Plain Div for Visibility */}
                            <div className="p-4 bg-muted/60 border-t border-border/60 shrink-0">
                                <div className="flex items-center justify-between text-xs mb-1.5">
                                    <div className="flex items-center gap-2 text-primary font-bold">
                                        <Clock className="h-4 w-4" />
                                        <span>{screen.last_screenshot_type === 'heartbeat' ? 'CHECAGEM DE MÍDIA' : 'ÚLTIMO PRINT MANUAL'}</span>
                                    </div>
                                    <div className="text-white font-black bg-primary/20 px-2 py-0.5 rounded border border-primary/30">
                                        {screen.last_screenshot_at ? (
                                            format(new Date(screen.last_screenshot_at), "dd/MM 'às' HH:mm", { locale: ptBR })
                                        ) : (
                                            '--/-- às --:--'
                                        )}
                                    </div>
                                </div>
                                <div className="text-[11px] text-muted-foreground leading-snug">
                                    {screen.last_screenshot_at
                                        ? "Esta captura foi enviada automaticamente pelo Player para auditoria visual."
                                        : "Aguardando o primeiro envio de captura do dispositivo vinculado."}
                                </div>
                            </div>
                        </div>
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
                                <div className="flex gap-2">
                                    <Dialog open={mediaPickerOpen} onOpenChange={setMediaPickerOpen}>
                                        <DialogTrigger asChild>
                                            <Button size="sm" className="gap-1 px-2">
                                                <Image className="h-4 w-4" /> Mídia
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
                                                            <MediaThumbnail media={media} showIcon={false} />
                                                            <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 text-[10px] truncate text-white">
                                                                {media.name}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                        </DialogContent>
                                    </Dialog>

                                    <Dialog open={widgetPickerOpen} onOpenChange={setWidgetPickerOpen}>
                                        <DialogTrigger asChild>
                                            <Button size="sm" variant="outline" className="gap-1 px-2 border-primary/50 text-primary">
                                                <LayoutTemplate className="h-4 w-4" /> Widget
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                                            <DialogHeader>
                                                <DialogTitle>Selecionar Widget</DialogTitle>
                                            </DialogHeader>
                                            <ScrollArea className="flex-1 p-2">
                                                <div className="grid grid-cols-3 gap-3">
                                                    {availableWidgets.map(widget => (
                                                        <div key={widget.id}
                                                            className="aspect-video bg-muted rounded-lg relative overflow-hidden cursor-pointer group hover:ring-2 hover:ring-primary"
                                                            onClick={() => handleAddWidget(widget)}
                                                        >
                                                            {(widget.thumbnail_url || widget.config?.backgroundImageLandscape) ? (
                                                                <img src={widget.thumbnail_url || widget.config?.backgroundImageLandscape || ''} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex flex-col items-center justify-center bg-primary/10">
                                                                    <LayoutTemplate className="h-6 w-6 text-primary mb-1" />
                                                                    <span className="text-[10px] uppercase font-bold text-primary">{widget.widget_type}</span>
                                                                </div>
                                                            )}
                                                            <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 text-[10px] truncate text-white">
                                                                {widget.name}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                        </DialogContent>
                                    </Dialog>

                                    <Dialog open={linkPickerOpen} onOpenChange={setLinkPickerOpen}>
                                        <DialogTrigger asChild>
                                            <Button size="sm" variant="outline" className="gap-1 px-2 border-blue-500/50 text-blue-500">
                                                <ExternalLinkIcon className="h-4 w-4" /> Link
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                                            <DialogHeader>
                                                <DialogTitle>Selecionar Link Externo</DialogTitle>
                                            </DialogHeader>
                                            <ScrollArea className="flex-1 p-2">
                                                <div className="grid grid-cols-3 gap-3">
                                                    {availableLinks.map(link => (
                                                        <div key={link.id}
                                                            className="aspect-video bg-muted rounded-lg relative overflow-hidden cursor-pointer group hover:ring-2 hover:ring-primary"
                                                            onClick={() => handleAddExternalLink(link)}
                                                        >
                                                            {link.thumbnail_url ? (
                                                                <img src={link.thumbnail_url} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex flex-col items-center justify-center bg-blue-500/10">
                                                                    <ExternalLinkIcon className="h-6 w-6 text-blue-500 mb-1" />
                                                                    <span className="text-[10px] uppercase font-bold text-blue-500">Link</span>
                                                                </div>
                                                            )}
                                                            <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 text-[10px] truncate text-white">
                                                                {link.title}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
                            {!screen.playlist_id ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center gap-4">
                                    <ListVideo className="h-10 w-10 mb-2 opacity-20" />
                                    <p>Esta tela não possui uma playlist associada.</p>
                                    <div className="flex flex-col gap-2 w-full max-w-xs">
                                        <Button
                                            variant="default"
                                            className="w-full gap-2"
                                            onClick={() => setPlaylistPickerOpen(true)}
                                        >
                                            <ListVideo className="h-4 w-4" />
                                            Selecionar Playlist Existente
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="w-full gap-2"
                                            onClick={() => navigate('/dashboard/playlists')}
                                        >
                                            <Plus className="h-4 w-4" />
                                            Criar Nova Playlist
                                        </Button>
                                    </div>

                                    {/* Playlist Picker Dialog */}
                                    <Dialog open={playlistPickerOpen} onOpenChange={setPlaylistPickerOpen}>
                                        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                                            <DialogHeader>
                                                <DialogTitle>Selecionar Playlist</DialogTitle>
                                            </DialogHeader>
                                            <ScrollArea className="flex-1 p-2">
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                    {availablePlaylists.map(playlist => (
                                                        <div key={playlist.id}
                                                            className="bg-card border border-border/50 rounded-lg p-3 cursor-pointer hover:ring-2 hover:ring-primary transition-all flex flex-col gap-2 group"
                                                            onClick={() => handleLinkPlaylist(playlist)}
                                                        >
                                                            <div className="aspect-video bg-muted rounded-md overflow-hidden relative">
                                                                {playlist.cover_url ? (
                                                                    <img src={playlist.cover_url} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center bg-accent/50">
                                                                        <ListVideo className="h-8 w-8 text-muted-foreground opacity-50" />
                                                                    </div>
                                                                )}
                                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <span className="text-white text-xs font-bold bg-primary px-2 py-1 rounded-full">Selecionar</span>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <h4 className="font-medium text-sm truncate" title={playlist.name}>{playlist.name}</h4>
                                                                <span className="text-xs text-muted-foreground">{playlist.item_count || 0} itens • {Math.floor((playlist.total_duration || 0) / 60)}m</span>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    {availablePlaylists.length === 0 && (
                                                        <div className="col-span-full py-8 text-center text-muted-foreground">
                                                            Nenhuma playlist encontrada.
                                                        </div>
                                                    )}
                                                </div>
                                            </ScrollArea>
                                        </DialogContent>
                                    </Dialog>
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
                                                    {item.media && <MediaThumbnail media={item.media} showIcon={false} />}
                                                    {item.widget && (
                                                        (item.widget.thumbnail_url || item.widget.config?.backgroundImageLandscape || item.widget.config?.backgroundImagePortrait) ? (
                                                            <img src={item.widget.thumbnail_url || item.widget.config?.backgroundImageLandscape || item.widget.config?.backgroundImagePortrait || ''} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center bg-primary/20">
                                                                <LayoutTemplate className="h-5 w-5 text-primary" />
                                                            </div>
                                                        )
                                                    )}
                                                    {item.external_link && (
                                                        item.external_link.thumbnail_url ? (
                                                            <img src={item.external_link.thumbnail_url} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center bg-blue-500/20">
                                                                <ExternalLinkIcon className="h-5 w-5 text-blue-500" />
                                                            </div>
                                                        )
                                                    )}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">
                                                        {item.media?.name || item.widget?.name || item.external_link?.title || 'Sem título'}
                                                    </p>
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <Clock className="h-3 w-3" />
                                                        <span>{item.duration}s</span>
                                                        <span className="text-[10px] uppercase font-bold opacity-50 px-1 bg-muted rounded">
                                                            {item.media ? 'Mídia' : item.widget ? 'Widget' : item.external_link ? 'Link' : ''}
                                                        </span>
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

