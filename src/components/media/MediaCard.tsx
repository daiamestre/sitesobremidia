import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Image, Video, Music, MoreVertical, Trash2, Download, Eye, Play, Pause, Volume2, VolumeX, Monitor, MonitorSmartphone } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Media } from '@/types/models';
import { supabase } from '@/integrations/supabase/client';

interface MediaCardProps {
  media: Media;
  viewMode: 'grid' | 'list';
  onDelete: (id: string) => void;
  onPreview: (media: Media) => void;
}

const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getFileIcon = (type: string) => {
  switch (type) {
    case 'image': return <Image className="h-6 w-6 text-primary" />;
    case 'video': return <Video className="h-6 w-6 text-accent" />;
    case 'audio': return <Music className="h-6 w-6 text-success" />;
    default: return <Image className="h-6 w-6 text-muted-foreground" />;
  }
};

export function MediaCard({ media, viewMode, onDelete, onPreview }: MediaCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  // Initialize with prop value, but allow local override for auto-correction
  const [detectedRatio, setDetectedRatio] = useState<string | null>(media.aspect_ratio || null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync state with prop if it changes (e.g. after a refresh or parent update)
  useEffect(() => {
    if (media.aspect_ratio) {
      setDetectedRatio(media.aspect_ratio);
    }
  }, [media.aspect_ratio]);

  const updateAspectRatio = async (ratio: '16x9' | '9x16') => {
    // If DB value matches, do nothing.
    if (media.aspect_ratio === ratio) return;

    // If we already detected this locally, do nothing to avoid loop.
    if (detectedRatio === ratio) return;

    console.log(`Auto-correcting aspect ratio for ${media.name}: ${ratio}`);
    setDetectedRatio(ratio); // Update UI immediately

    // Silently update database
    try {
      await supabase
        .from('media')
        .update({ aspect_ratio: ratio })
        .eq('id', media.id);
    } catch (err) {
      console.error('Error updating aspect ratio:', err);
    }
  };

  const handleMediaLoad = (e: React.SyntheticEvent<HTMLImageElement | HTMLVideoElement, Event>) => {
    const target = e.target as HTMLImageElement | HTMLVideoElement;
    let width = 0;
    let height = 0;

    if (target.tagName === 'VIDEO') {
      const v = target as HTMLVideoElement;
      // Ensure we have valid dimensions
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        width = v.videoWidth;
        height = v.videoHeight;
      }
    } else {
      const i = target as HTMLImageElement;
      if (i.naturalWidth > 0 && i.naturalHeight > 0) {
        width = i.naturalWidth;
        height = i.naturalHeight;
      }
    }

    if (width > 0 && height > 0) {
      // Logic: If Width < Height = Vertical (9x16). If Width >= Height = Horizontal (16x9)
      const ratio = width < height ? '9x16' : '16x9';

      // Only trigger if different from what we think it is
      if (detectedRatio !== ratio) {
        updateAspectRatio(ratio);
      }
    }
  };

  // --- AGGRESSIVE VIDEO DETECTION ---
  // If it's NOT an image and NOT audio, assume it's video to be safe.
  // We double check extensions just in case.
  const isVideo =
    (media.file_type && media.file_type.toLowerCase() === 'video') ||
    (media.mime_type && media.mime_type.toLowerCase().startsWith('video')) ||
    /\.(mp4|webm|ogg|mov|mkv|avi|m4v)/i.test(media.file_url) || // Regex without end-of-line anchor
    (!media.file_type && !media.mime_type); // Default fallback for unknown type if not obviously image

  // Force controls to be visible for debugging/verification if ambiguous
  const showControls = isVideo;

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = media.file_url;
    link.download = media.name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- LIST VIEW ---
  if (viewMode === 'list') {
    return (
      <div className="flex items-center gap-4 p-4 rounded-lg bg-card border hover:bg-muted/50 transition-colors">
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0 relative cursor-pointer" onClick={() => onPreview(media)}>
          {/* Thumbnail Logic */}
          {media.file_type === 'image' ? (
            <img src={media.file_url} alt={media.name} className="w-full h-full object-cover" />
          ) : isVideo ? (
            <Video className="h-8 w-8 text-accent" />
          ) : (
            getFileIcon(media.file_type)
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{media.name}</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{formatFileSize(media.file_size)}</span>
            <span>•</span>
            <span>{format(new Date(media.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Resolution Icon for List View */}
          {detectedRatio && (
            <div className="flex items-center gap-1 mr-2 px-2 py-1 rounded-md bg-muted/50 text-xs text-muted-foreground" title={`Formato: ${detectedRatio}`}>
              {detectedRatio === '9x16' ? <MonitorSmartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
              <span className="hidden sm:inline">{detectedRatio}</span>
            </div>
          )}

          {showControls && (
            <Button variant="ghost" size="icon" onClick={() => onPreview(media)} title="Visualizar/Reproduzir">
              <Play className="h-4 w-4" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onPreview(media)}>
                <Eye className="h-4 w-4 mr-2" />
                Visualizar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Baixar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(media.id)} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // --- GRID VIEW ---
  return (
    <Card className={`group overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col ${isPlaying ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
      {/* Media Preview Area */}
      <div
        className="aspect-video bg-muted/30 flex items-center justify-center cursor-pointer relative overflow-hidden"
        onClick={() => {
          if (!isVideo) onPreview(media);
          else onPreview(media); // Default behavior is preview
        }}
      >
        {media.file_type === 'image' ? (
          <img
            src={media.file_url}
            alt={media.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onLoad={handleMediaLoad}
          />
        ) : isVideo ? (
          <video
            ref={videoRef}
            src={media.file_url}
            className="w-full h-full object-cover"
            muted={isMuted}
            loop
            playsInline
            preload="metadata"
            // Reset state if video ends naturally
            onEnded={() => setIsPlaying(false)}
            onLoadedMetadata={handleMediaLoad}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            {getFileIcon(media.file_type)}
            <span className="text-xs uppercase font-semibold mt-2 tracking-wider">Áudio</span>
          </div>
        )}

        {/* Overlay Icon for non-playing states (Hover) */}
        {!isPlaying && (
          <div className={`absolute inset-0 bg-black/40 ${isVideo ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity flex items-center justify-center backdrop-blur-[1px]`}>
            {/* Always show Eye for interactions unless playing */}
            {isVideo ? (
              <Play className="h-10 w-10 text-white opacity-80 hover:opacity-100 transition-opacity" onClick={togglePlay} />
            ) : (
              <Eye className="h-8 w-8 text-white drop-shadow-lg" />
            )}
          </div>
        )}
      </div>

      {/* Card Body */}
      <CardContent className="p-3 flex-1 flex flex-col justify-between">
        <div className="mb-2">
          <h3 className="font-semibold text-sm truncate leading-tight" title={media.name}>
            {media.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {formatFileSize(media.file_size)}
          </p>
        </div>
      </CardContent>

      {/* Footer Actions - ALWAYS VISIBLE FOR VIDEOS */}
      <CardFooter className="p-2 pt-0 flex items-center justify-between border-t border-border/50 bg-muted/20 min-h-[44px]">
        <div className="flex items-center gap-1">
          {showControls ? (
            <>
              {/* Primary Control: Play/Pause */}
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${isPlaying ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={togglePlay}
                title={isPlaying ? "Pausar" : "Reproduzir"} // Tooltip
              >
                {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
              </Button>

              {/* Volume Control */}
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${isMuted ? 'text-muted-foreground' : 'text-primary'}`}
                onClick={toggleMute}
                title={isMuted ? "Ativar Som" : "Mudo"}
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground uppercase px-2 font-medium">
                {media.file_type || 'Arquivo'}
              </span>
            </div>
          )}

          {/* Resolution Display for Grid View - Always show if available */}
          {detectedRatio && (
            <div className={`flex items-center gap-1 ml-2 ${showControls ? 'border-l pl-2 border-border/50' : ''}`} title={`Formato: ${detectedRatio}`}>
              {detectedRatio === '9x16' ? (
                <MonitorSmartphone className="h-3 w-3 text-muted-foreground" />
              ) : (
                <Monitor className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="text-[10px] text-muted-foreground">{detectedRatio}</span>
            </div>
          )}
        </div>

        <div className="flex items-center">
          <div className="border-l border-border/50 pl-1 ml-1 h-5" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onPreview(media)}>
                <Eye className="h-4 w-4 mr-2" />
                Visualizar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Baixar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(media.id)} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardFooter >
    </Card >
  );
}
