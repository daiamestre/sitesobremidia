import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import { Media } from '@/types/models';

interface MediaPreviewDialogProps {
  media: Media | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MediaPreviewDialog({ media, open, onOpenChange }: MediaPreviewDialogProps) {
  if (!media) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = media.file_url;
    link.download = media.name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
            <video
              src={media.file_url}
              controls
              autoPlay
              className="max-w-full max-h-[70vh]"
            />
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
