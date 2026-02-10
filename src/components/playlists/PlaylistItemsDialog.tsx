import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Plus, Trash2, GripVertical, Image, Video, Music, Clock, Loader2, Cloud, Newspaper, LayoutGrid, ArrowUp, ArrowDown, Link2, Calendar as CalendarIcon } from 'lucide-react';
import { Playlist, Media, Widget, ExternalLink, PlaylistItem, WidgetType } from '@/types/models';

// Extend Playlist type locally if needed, or rely on models.ts if it's updated there. 
// Ideally models.ts should have it, but for now I'll cast or rely on dynamic check.
// I'll check if models.ts change was actually applied? No, I only checked it. 
// I need to update models.ts or just cast here. 
// I will check models.ts content to be sure. Wait, I saw models.ts in step 234 and it DID NOT have resolution.
// So I should update models.ts first or just extend it here.
// I will extend it here for safety.
interface ExtendedPlaylist extends Playlist {
  resolution?: string;
}

interface PlaylistItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlist: ExtendedPlaylist | null;
}

const getFileIcon = (type: string) => {
  switch (type) {
    case 'image': return <Image className="h-5 w-5 text-primary" />;
    case 'video': return <Video className="h-5 w-5 text-accent" />;
    case 'audio': return <Music className="h-5 w-5 text-success" />;
    default: return <Image className="h-5 w-5 text-muted-foreground" />;
  }
};

const getWidgetLabel = (type: string) => {
  switch (type) {
    case 'clock': return 'Relógio';
    case 'weather': return 'Clima';
    case 'rss': return 'Notícias';
    default: return 'Widget';
  }
};

// Componente de preview do relógio em miniatura
const ClockPreview = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
      <span className="text-xs font-bold text-primary">
        {time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
};

// Componente de preview do clima em miniatura
const WeatherPreview = () => (
  <div className="w-full h-full bg-gradient-to-br from-blue-500/20 to-blue-500/5 flex items-center justify-center">
    <Cloud className="h-5 w-5 text-blue-500" />
  </div>
);

// Componente de preview do RSS em miniatura
const RssPreview = () => (
  <div className="w-full h-full bg-gradient-to-br from-orange-500/20 to-orange-500/5 flex items-center justify-center">
    <Newspaper className="h-5 w-5 text-orange-500" />
  </div>
);

// Extrair thumbnail do Instagram a partir da URL
const getInstagramThumbnail = (url: string) => {
  // Tentar extrair o ID do post do Instagram
  const match = url.match(/instagram\.com\/p\/([^/?#&]+)/);
  if (match) {
    // Usar a URL de embed do Instagram como thumbnail
    return `https://www.instagram.com/p/${match[1]}/media/?size=t`;
  }
  return null;
};

// Componente de thumbnail para links externos
const ExternalLinkThumbnail = ({ link }: { link: ExternalLink }) => {
  const [imgError, setImgError] = useState(false);

  // Tentar usar thumbnail_url salvo, ou extrair do Instagram
  let thumbnailUrl = link.thumbnail_url;
  if (!thumbnailUrl && link.platform.toLowerCase().includes('instagram')) {
    thumbnailUrl = getInstagramThumbnail(link.url);
  }

  if (thumbnailUrl && !imgError) {
    return (
      <img
        src={thumbnailUrl}
        alt=""
        className="w-full h-full object-cover"
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback: mostrar ícone com cor baseada na plataforma
  const platform = link.platform.toLowerCase();
  if (platform.includes('instagram')) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-pink-500/30 via-purple-500/30 to-orange-500/30 flex items-center justify-center">
        <span className="text-[10px] font-bold text-white">IG</span>
      </div>
    );
  }
  if (platform.includes('youtube')) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-red-500/30 to-red-600/30 flex items-center justify-center">
        <span className="text-[10px] font-bold text-white">YT</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gradient-to-br from-purple-500/20 to-purple-500/5 flex items-center justify-center">
      <Link2 className="h-5 w-5 text-purple-500" />
    </div>
  );
};

export function PlaylistItemsDialog({ open, onOpenChange, playlist }: PlaylistItemsDialogProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [availableMedia, setAvailableMedia] = useState<Media[]>([]);
  const [availableWidgets, setAvailableWidgets] = useState<Widget[]>([]);
  const [availableLinks, setAvailableLinks] = useState<ExternalLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<'media' | 'widgets' | 'links'>('media');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!playlist || !user) return;

    setLoading(true);
    try {
      const { data: itemsData, error: itemsError } = await supabase
        .from('playlist_items')
        .select('*, media:media_id(*), widget:widget_id(*), external_link:external_link_id(*)')
        .eq('playlist_id', playlist.id)
        .order('position');

      if (itemsError) throw itemsError;
      setItems((itemsData || []) as PlaylistItem[]);

      const { data: mediaData, error: mediaError } = await supabase
        .from('media')
        .select('*')
        .order('created_at', { ascending: false });

      if (mediaError) throw mediaError;
      setAvailableMedia((mediaData || []) as unknown as Media[]);

      const { data: widgetData, error: widgetError } = await supabase
        .from('widgets')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (widgetError) throw widgetError;
      setAvailableWidgets((widgetData || []) as unknown as Widget[]);

      const { data: linksData, error: linksError } = await supabase
        .from('external_links')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (linksError) throw linksError;
      setAvailableLinks((linksData || []) as ExternalLink[]);
      setAvailableLinks((linksData || []) as ExternalLink[]);
    } catch (error: unknown) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [playlist, user]);

  useEffect(() => {
    if (open && playlist) {
      fetchData();
    }
  }, [open, playlist, fetchData]);

  const updatePositions = useCallback(async (newItems: PlaylistItem[]) => {
    try {
      const updates = newItems.map((item, index) =>
        supabase
          .from('playlist_items')
          .update({ position: index })
          .eq('id', item.id)
      );

      await Promise.all(updates);
    } catch (error) {
      console.error('Error updating positions:', error);
      toast.error('Erro ao atualizar posições');
    }
  }, []);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', '');
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newItems = [...items];
    const [draggedItem] = newItems.splice(draggedIndex, 1);
    newItems.splice(dropIndex, 0, draggedItem);

    const updatedItems = newItems.map((item, index) => ({ ...item, position: index }));
    setItems(updatedItems);

    await updatePositions(updatedItems);
    toast.success('Ordem atualizada!');

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const moveItem = async (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= items.length) return;

    const newItems = [...items];
    const [movedItem] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, movedItem);

    const updatedItems = newItems.map((item, index) => ({ ...item, position: index }));
    setItems(updatedItems);

    await updatePositions(updatedItems);
    toast.success('Ordem atualizada!');
  };

  const addMedia = async (media: Media) => {
    if (!playlist) return;

    try {
      const newPosition = items.length;
      const { data, error } = await supabase
        .from('playlist_items')
        .insert({
          playlist_id: playlist.id,
          media_id: media.id,
          widget_id: null,
          external_link_id: null,
          position: newPosition,
          duration: media.file_type === 'video' ? 0 : 10,
        })
        .select('*, media:media_id(*), widget:widget_id(*), external_link:external_link_id(*)')
        .single();

      if (error) throw error;
      setItems([...items, data as PlaylistItem]);
      setShowPicker(false);
      toast.success('Mídia adicionada!');
      toast.success('Mídia adicionada!');
    } catch (error: unknown) {
      console.error('Error adding media:', error);
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao adicionar mídia: ' + message);
    }
  };

  const addWidget = async (widget: Widget) => {
    if (!playlist) return;

    try {
      const newPosition = items.length;
      const { data, error } = await supabase
        .from('playlist_items')
        .insert({
          playlist_id: playlist.id,
          media_id: null,
          widget_id: widget.id,
          external_link_id: null,
          position: newPosition,
          duration: 15,
        })
        .select('*, media:media_id(*), widget:widget_id(*), external_link:external_link_id(*)')
        .single();

      if (error) throw error;
      setItems([...items, data as PlaylistItem]);
      setShowPicker(false);
      toast.success('Widget adicionado!');
      toast.success('Widget adicionado!');
    } catch (error: unknown) {
      console.error('Error adding widget:', error);
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao adicionar widget: ' + message);
    }
  };

  const addExternalLink = async (link: ExternalLink) => {
    if (!playlist) return;

    try {
      const newPosition = items.length;
      const { data, error } = await supabase
        .from('playlist_items')
        .insert({
          playlist_id: playlist.id,
          media_id: null,
          widget_id: null,
          external_link_id: link.id,
          position: newPosition,
          duration: 30,
        })
        .select('*, media:media_id(*), widget:widget_id(*), external_link:external_link_id(*)')
        .single();

      if (error) throw error;
      setItems([...items, data as PlaylistItem]);
      setShowPicker(false);
      toast.success('Link externo adicionado!');
      toast.success('Link externo adicionado!');
    } catch (error: unknown) {
      console.error('Error adding external link:', error);
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao adicionar link externo: ' + message);
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('playlist_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      const newItems = items.filter(i => i.id !== itemId);
      const updatedItems = newItems.map((item, index) => ({ ...item, position: index }));
      setItems(updatedItems);
      await updatePositions(updatedItems);

      toast.success('Item removido!');
      toast.success('Item removido!');
    } catch (error: unknown) {
      console.error('Error removing item:', error);
      toast.error('Erro ao remover item');
    }
  };

  const updateDuration = async (itemId: string, duration: number) => {
    try {
      const { error } = await supabase
        .from('playlist_items')
        .update({ duration })
        .eq('id', itemId);

      if (error) throw error;
      setItems(items.map(i => i.id === itemId ? { ...i, duration } : i));
    } catch (error: unknown) {
      console.error('Error updating duration:', error);
    }
  };

  const updateSchedule = async (itemId: string, updates: { start_time?: string | null, end_time?: string | null, days?: number[] | null }) => {
    try {
      const { error } = await supabase
        .from('playlist_items')
        .update(updates)
        .eq('id', itemId);

      if (error) throw error;
      setItems(items.map(i => i.id === itemId ? { ...i, ...updates } : i));
    } catch (error: unknown) {
      console.error('Error updating schedule:', error);
      toast.error('Erro ao atualizar agendamento');
    }
  };



  const totalDuration = items.reduce((acc, item) => acc + item.duration, 0);
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const usedMediaIds = items.filter(i => i.media_id).map(i => i.media_id);
  const unusedMedia = availableMedia.filter(m => {
    if (usedMediaIds.includes(m.id)) return false;

    // Resolution filtering
    const playlistResolution = (playlist as ExtendedPlaylist)?.resolution || '16x9';

    // Allow audio always
    if (m.file_type === 'audio') return true;

    // Strict filtering: Media MUST have aspect_ratio matching playlist resolution.
    // exception: if media has no aspect_ratio (legacy), we assume 16x9 if playlist is 16x9, but block for 9x16 to be safe?
    // Let's go with: if aspect_ratio is present, must match. 
    // If aspect_ratio is missing, treat as 16x9 (most common legacy).

    const mediaRatio = m.aspect_ratio || '16x9';
    return mediaRatio === playlistResolution;
  });

  const getItemName = (item: PlaylistItem) => {
    if (item.media) return item.media.name;
    if (item.widget) return item.widget.name;
    if (item.external_link) return item.external_link.title;
    return 'Item desconhecido';
  };

  const getItemThumbnail = (item: PlaylistItem) => {
    if (item.media) {
      if (item.media.file_type === 'image') {
        return <img src={item.media.file_url} alt="" className="w-full h-full object-cover" />;
      }
      if (item.media.file_type === 'video') {
        // Usar thumbnail se disponível, senão mostrar ícone
        if (item.media.thumbnail_url) {
          return <img src={item.media.thumbnail_url} alt="" className="w-full h-full object-cover" />;
        }
        return (
          <div className="w-full h-full bg-black relative">
            <video
              src={item.media.file_url}
              className="w-full h-full object-cover"
              preload="metadata"
              muted
              playsInline
              crossOrigin="anonymous"
              onLoadedMetadata={(e) => {
                e.currentTarget.currentTime = 0.1;
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Video className="h-4 w-4 text-white/90 drop-shadow-sm" />
            </div>
          </div>
        );
      }
      return getFileIcon(item.media.file_type);
    }
    if (item.widget) {
      switch (item.widget.widget_type) {
        case 'clock':
          return <ClockPreview />;
        case 'weather':
          return <WeatherPreview />;
        case 'rss':
          return <RssPreview />;
        default:
          return <LayoutGrid className="h-5 w-5 text-muted-foreground" />;
      }
    }
    if (item.external_link) {
      return <ExternalLinkThumbnail link={item.external_link} />;
    }
    return <LayoutGrid className="h-5 w-5 text-muted-foreground" />;
  };

  const getItemSubtitle = (item: PlaylistItem) => {
    if (item.widget) return getWidgetLabel(item.widget.widget_type);
    if (item.external_link) return item.external_link.platform;
    return null;
  };

  if (!playlist) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span>Itens em "{playlist.name}"</span>
            <span className="text-sm font-normal text-muted-foreground flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Total: {formatDuration(totalDuration)}
            </span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 pt-2 custom-scrollbar">
              {items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum item na playlist. Adicione mídias, widgets ou links abaixo.
                </div>
              ) : (
                <div className="space-y-2">
                  {items.length > 0 && (
                    <p className="text-xs text-muted-foreground text-center mb-2">
                      Arraste os itens para reordenar ou use as setas
                    </p>
                  )}

                  {items.map((item, index) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-3 p-3 rounded-lg bg-muted/50 group transition-all ${draggedIndex === index ? 'opacity-50 scale-95' : ''
                        } ${dragOverIndex === index ? 'ring-2 ring-primary ring-offset-2' : ''
                        }`}
                    >
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0" />

                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveItem(index, index - 1)}
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveItem(index, index + 1)}
                          disabled={index === items.length - 1}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>

                      <span className="text-sm font-medium text-muted-foreground w-6">
                        {index + 1}
                      </span>
                      <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                        {getItemThumbnail(item)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {getItemName(item)}
                        </p>
                        {getItemSubtitle(item) && (
                          <p className="text-xs text-muted-foreground">
                            {getItemSubtitle(item)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Duração (s):</Label>
                        <Input
                          type="number"
                          min={0}
                          value={item.duration}
                          onChange={(e) => updateDuration(item.id, parseInt(e.target.value) || 0)}
                          className="w-20 h-8"
                        />
                      </div>

                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={item.start_time || (item.days && item.days.length > 0) ? "text-primary hover:text-primary" : "text-muted-foreground hover:text-foreground"}
                          >
                            <CalendarIcon className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                          <div className="space-y-4">
                            <h4 className="font-medium leading-none">Agendamento</h4>
                            <p className="text-sm text-muted-foreground">Defina quando este item deve aparecer.</p>

                            <div className="grid gap-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label htmlFor={`start-${item.id}`}>Início</Label>
                                  <Input
                                    id={`start-${item.id}`}
                                    type="time"
                                    value={item.start_time || ''}
                                    onChange={(e) => updateSchedule(item.id, { start_time: e.target.value || null })}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor={`end-${item.id}`}>Fim</Label>
                                  <Input
                                    id={`end-${item.id}`}
                                    type="time"
                                    value={item.end_time || ''}
                                    onChange={(e) => updateSchedule(item.id, { end_time: e.target.value || null })}
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label>Dias da Semana</Label>
                              <ToggleGroup
                                type="multiple"
                                variant="outline"
                                value={item.days?.map(String) || []}
                                onValueChange={(val) => {
                                  const nums = val.map(Number).sort((a, b) => a - b);
                                  updateSchedule(item.id, { days: nums.length > 0 ? nums : null });
                                }}
                                className="flex justify-between"
                              >
                                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                                  <ToggleGroupItem key={i} value={String(i)} className="h-8 w-8 p-0" title={['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][i]}>
                                    {d}
                                  </ToggleGroupItem>
                                ))}
                              </ToggleGroup>
                              <p className="text-xs text-muted-foreground text-center">
                                {item.days && item.days.length > 0
                                  ? item.days.length === 7
                                    ? 'Todos os dias'
                                    : 'Apenas dias selecionados'
                                  : 'Todos os dias (Padrão)'}
                              </p>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-background mt-auto shrink-0">
              {showPicker ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Selecione um item:</Label>
                    <Button variant="ghost" size="sm" onClick={() => setShowPicker(false)}>
                      Cancelar
                    </Button>
                  </div>

                  <Tabs value={pickerTab} onValueChange={(v) => setPickerTab(v as 'media' | 'widgets' | 'links')}>
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="media" className="flex items-center gap-2">
                        <Image className="h-4 w-4" />
                        Mídias
                      </TabsTrigger>
                      <TabsTrigger value="widgets" className="flex items-center gap-2">
                        <LayoutGrid className="h-4 w-4" />
                        Widgets
                      </TabsTrigger>
                      <TabsTrigger value="links" className="flex items-center gap-2">
                        <Link2 className="h-4 w-4" />
                        Links
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="media" className="mt-3">
                      <ScrollArea className="h-[200px]">
                        {unusedMedia.length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground">
                            Todas as mídias já foram adicionadas
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {unusedMedia.map(media => (
                              <div
                                key={media.id}
                                onClick={() => addMedia(media)}
                                className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                              >
                                <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                                  {media.file_type === 'image' ? (
                                    <img src={media.file_url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    getFileIcon(media.file_type)
                                  )}
                                </div>
                                <span className="text-sm truncate">{media.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </TabsContent>

                    <TabsContent value="widgets" className="mt-3">
                      <ScrollArea className="h-[200px]">
                        {availableWidgets.length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground">
                            Nenhum widget disponível. Crie widgets na seção Widgets.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {availableWidgets.map(widget => {
                              const WidgetPreviewComponent = () => {
                                switch (widget.widget_type) {
                                  case 'clock': return <ClockPreview />;
                                  case 'weather': return <WeatherPreview />;
                                  case 'rss': return <RssPreview />;
                                  default: return <LayoutGrid className="h-5 w-5 text-muted-foreground" />;
                                }
                              };
                              return (
                                <div
                                  key={widget.id}
                                  onClick={() => addWidget(widget)}
                                  className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                                >
                                  <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                                    <WidgetPreviewComponent />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm truncate block">{widget.name}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {getWidgetLabel(widget.widget_type)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </ScrollArea>
                    </TabsContent>

                    <TabsContent value="links" className="mt-3">
                      <ScrollArea className="h-[200px]">
                        {availableLinks.length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground">
                            Nenhum link externo disponível. Crie links na seção Links Externos.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {availableLinks.map(link => (
                              <div
                                key={link.id}
                                onClick={() => addExternalLink(link)}
                                className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                              >
                                <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                                  <ExternalLinkThumbnail link={link} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm truncate block">{link.title}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {link.platform}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
                <Button onClick={() => setShowPicker(true)} className="w-full" variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Item
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
