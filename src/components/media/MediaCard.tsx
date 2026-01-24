import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
  const [isMuted, setIsMuted] = useState(true); // Start muted by default
  const videoRef = useRef<HTMLVideoElement>(null);

  const isVideo = media.file_type?.toLowerCase() === 'video';

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

  if (viewMode === 'list') {
    return (
      <div className="flex items-center gap-4 p-4 rounded-lg bg-card border hover:bg-muted/50 transition-colors">
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
          {media.file_type === 'image' ? (
            <img src={media.file_url} alt={media.name} className="w-full h-full object-cover" />
          ) : (
            getFileIcon(media.file_type)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{media.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatFileSize(media.file_size)} • {format(new Date(media.created_at), "dd 'de' MMM, yyyy", { locale: ptBR })}
          </p>
        </div>
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
    );
  }

  return (
    <Card className="group overflow-hidden hover:shadow-lg transition-shadow">
      <div
        className="aspect-video bg-muted flex items-center justify-center cursor-pointer relative overflow-hidden"
        onClick={() => onPreview(media)}
      >
        {media.file_type === 'image' ? (
          <img
            src={media.file_url}
            alt={media.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : isVideo ? (
          <video
            ref={videoRef}
            src={media.file_url}
            className="w-full h-full object-cover"
            muted={isMuted}
            loop
            onEnded={() => setIsPlaying(false)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center">
            {getFileIcon(media.file_type)}
            <span className="text-xs text-muted-foreground mt-2">Áudio</span>
          </div>
        )}

        {/* Hidden Generic Hover for Non-Video or when needed */}
        {!isVideo && (
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Eye className="h-8 w-8 text-white" />
          </div>
        )}
      </div>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{media.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(media.file_size)}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {isVideo && (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 hover:bg-secondary/80 transition-colors"
                  onClick={togglePlay}
                  title={isPlaying ? "Pausar" : "Reproduzir"}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 hover:bg-secondary/80 transition-colors"
                  onClick={toggleMute}
                  title={isMuted ? "Ativar Som" : "Mudo"}
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
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
      </CardContent>
    </Card>
  );
}
