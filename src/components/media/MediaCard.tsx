import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Image, Video, Music, MoreVertical, Trash2, Download, Eye, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Media } from '@/types/models';

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
  const videoRef = useRef<HTMLVideoElement>(null);

  // ROBUST VIDEO DETECTION
  // We check multiple properties to ensure we catch ANY video file.
  const isVideo =
    media.file_type?.toLowerCase() === 'video' ||
    media.mime_type?.toLowerCase().startsWith('video') ||
    /\.(mp4|webm|ogg|mov|mkv|avi|m4v)(\?|$)/i.test(media.file_url);

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
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0 relative group cursor-pointer" onClick={() => onPreview(media)}>
          {/* Thumbnail Logic */}
          {media.file_type === 'image' ? (
            <img src={media.file_url} alt={media.name} className="w-full h-full object-cover" />
          ) : isVideo ? (
            <Video className="h-8 w-8 text-accent" />
          ) : (
            getFileIcon(media.file_type)
          )}
        </div>

        <div className="flex-1 min-w-0 pointer-events-none">
          <p className="font-medium truncate pointer-events-auto select-text">{media.name}</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{formatFileSize(media.file_size)}</span>
            <span>•</span>
            <span>{format(new Date(media.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
          </div>
        </div>

        {/* List View Controls (Simplified) */}
        <div className="flex items-center gap-2">
          {isVideo && (
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
          // If video, clicking sends to preview or plays? Let's keep consistent: Click on preview area -> open Preview Dialog
          // unless playing? No, "Preview Dialog" is better for detailed view.
          // But user asked to control video BEFORE adding. So maybe toggle play?
          // Let's stick to: Click Center -> Open Preview (which has full controls).
          // Footer buttons -> Quick Verify.
          onPreview(media);
        }}
      >
        {media.file_type === 'image' ? (
          <img
            src={media.file_url}
            alt={media.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : isVideo ? (
          <video
            ref={videoRef}
            src={media.file_url}
            className="w-full h-full object-cover"
            muted={isMuted}
            loop
            playsInline
            // Reset state if video ends naturally
            onEnded={() => setIsPlaying(false)}
            // If error, it might not be a video or codec issue
            onError={() => {
              // console.log("Video load error for:", media.name);
              // We could set a fallback state here if needed
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            {getFileIcon(media.file_type)}
            <span className="text-xs uppercase font-semibold mt-2 tracking-wider">Áudio</span>
          </div>
        )}

        {/* Overlay Icon for non-playing states (Hover) */}
        {!isPlaying && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
            <Eye className="h-8 w-8 text-white drop-shadow-lg" />
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
      <CardFooter className="p-2 pt-0 flex items-center justify-between border-t border-border/50 bg-muted/20">
        <div className="flex items-center gap-1">
          {isVideo ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${isPlaying ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={togglePlay}
                title={isPlaying ? "Pausar" : "Reproduzir"} // Tooltip
              >
                {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
              </Button>

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
            // Spacer for non-videos to keep strict alignment if needed, or just nothing.
            <div className="h-8 w-1" />
          )}
        </div>

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
      </CardFooter>
    </Card>
  );
}
