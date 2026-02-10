import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { Media } from '@/types/models';
import { useRef, useState, useEffect } from 'react';
import { VideoPlayer, VideoPlayerRef } from '@/components/media/VideoPlayer';

interface MediaPreviewDialogProps {
  media: Media | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MediaPreviewDialog({ media, open, onOpenChange }: MediaPreviewDialogProps) {
  if (!media) return null;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<VideoPlayerRef>(null);
  const isVertical = media.aspect_ratio === '9x16';

  // Reset state when media changes
  useEffect(() => {
    if (media?.file_type === 'video') {
      setIsPlaying(true); // AutoPlay is on
      setIsMuted(false);
    }
  }, [media]);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = media.file_url;
    link.download = media.name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const togglePlay = () => {
    if (videoRef.current) {
      videoRef.current.togglePlay();
      // Sync local state is handled via onPlay/onPause callbacks
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.toggleMute();
      setIsMuted(!isMuted);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="truncate pr-4">{media.name}</DialogTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex items-center justify-center bg-muted rounded-lg overflow-hidden max-h-[70vh]">
          {media.file_type === 'image' && (
            <img
              src={media.file_url}
              alt={media.name}
              className="max-w-full max-h-[70vh] object-contain"
            />
          )}

          {media.file_type === 'video' && (
            <div className="flex flex-col w-full h-full relative group">
              {/* Use robust VideoPlayer */}
              <VideoPlayer
                src={media.file_url}
                className={isVertical
                  ? "h-full w-auto aspect-[9/16] mx-auto bg-transparent"
                  : "w-full aspect-video bg-transparent"
                }
                autoPlay
                controls={false} // Use our custom controls below or built-in if preferred
                showCustomControls={false} // We are building custom controls outside
                ref={videoRef}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                muted={isMuted}
              />

              {/* Overlay Toggle Play Area (Click on video to toggle) */}
              <div
                className="absolute inset-0 z-10 cursor-pointer"
                onClick={togglePlay}
                role="button"
                aria-label={isPlaying ? "Pausar vídeo" : "Reproduzir vídeo"}
              />

              {/* Custom Controls Bar */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-center gap-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-full bg-background/20 border-white/20 text-white hover:bg-background/40 hover:text-white"
                  onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                >
                  {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full text-white hover:bg-white/10"
                  onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                >
                  {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </Button>
              </div>
            </div>
          )}

          {media.file_type === 'audio' && (
            <div className="p-8 w-full">
              <audio
                src={media.file_url}
                controls
                autoPlay
                className="w-full"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
