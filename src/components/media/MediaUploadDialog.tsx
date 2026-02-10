import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X, Image, Video, Music, FileIcon, CheckCircle2, Clock, CalendarIcon, Monitor, Smartphone, ListPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Playlist, Media } from '@/types/models';

interface MediaUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete: () => void;
  editMedia?: Media | null;
}

interface UploadFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
  thumbnailBlob?: Blob;
  thumbnailPreview?: string;
}

const ACCEPTED_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp3'],
};

const SEGMENTS = [
  'Varejo',
  'Alimentação',
  'Saúde',
  'Educação',
  'Tecnologia',
  'Serviços',
  'Indústria',
  'Entretenimento',
  'Financeiro',
  'Imobiliário',
  'Automotivo',
  'Outros',
];

const getFileType = (mimeType: string): 'image' | 'video' | 'audio' | 'other' => {
  if (ACCEPTED_TYPES.image.includes(mimeType)) return 'image';
  if (ACCEPTED_TYPES.video.includes(mimeType)) return 'video';
  if (ACCEPTED_TYPES.audio.includes(mimeType)) return 'audio';
  return 'other';
};

const getFileIcon = (type: string) => {
  switch (type) {
    case 'image': return <Image className="h-8 w-8 text-primary" />;
    case 'video': return <Video className="h-8 w-8 text-accent" />;
    case 'audio': return <Music className="h-8 w-8 text-success" />;
    default: return <FileIcon className="h-8 w-8 text-muted-foreground" />;
  }
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const generateVideoThumbnail = (file: File): Promise<Blob | null> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    // Use onloadedmetadata to ensure duration is available
    video.onloadedmetadata = () => {
      // Seek to 1.5s or 10% of duration if shorter
      const seekTime = Math.min(1.5, (video.duration || 0) * 0.1);
      video.currentTime = seekTime || 0.1; // Fallback to 0.1 if calc fails
    };

    video.onseeked = () => {
      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.8);
      } catch (err) {
        console.warn('Canvas error:', err);
        resolve(null);
      } finally {
        URL.revokeObjectURL(video.src);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(null);
    };

    video.src = URL.createObjectURL(file);
  });
};



export function MediaUploadDialog({ open, onOpenChange, onUploadComplete, editMedia }: MediaUploadDialogProps) {
  const { user } = useAuth();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditMode = !!editMedia;

  // Form fields
  const [mediaName, setMediaName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [segment, setSegment] = useState('');
  const [mediaDuration, setMediaDuration] = useState(10);
  const [scheduledDate, setScheduledDate] = useState<Date>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'16x9' | '9x16'>('16x9');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('none');

  // Pre-fill form when editing
  useEffect(() => {
    if (open && editMedia) {
      setMediaName(editMedia.name || '');
      setAspectRatio((editMedia.aspect_ratio as '16x9' | '9x16') || '16x9');
      setFiles([]); // Clear any stale files
    } else if (open) {
      // Reset for new upload
      setMediaName('');
      setAspectRatio('16x9');
    }
  }, [open, editMedia]);

  useEffect(() => {
    if (open && user) {
      const fetchPlaylists = async () => {
        const { data } = await supabase
          .from('playlists')
          .select('*')
          .eq('is_active', true)
          .order('name');
        if (data) setPlaylists(data as Playlist[]);
      };
      fetchPlaylists();
    }
  }, [open, user]);

  const acceptedMimeTypes = [
    ...ACCEPTED_TYPES.image,
    ...ACCEPTED_TYPES.video,
    ...ACCEPTED_TYPES.audio,
  ].join(',');

  const handleFileSelect = async (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles: UploadFile[] = Array.from(selectedFiles)
      .filter(file => {
        const isAccepted = [...ACCEPTED_TYPES.image, ...ACCEPTED_TYPES.video, ...ACCEPTED_TYPES.audio]
          .includes(file.type);
        if (!isAccepted) {
          toast.error(`Tipo de arquivo não suportado: ${file.name}`);
        }
        return isAccepted;
      })
      .map(file => ({
        file,
        progress: 0,
        status: 'pending' as const,
      }));

    setFiles(prev => [...prev, ...newFiles]);

    // Generate thumbnails for videos
    for (const newFile of newFiles) {
      if (getFileType(newFile.file.type) === 'video') {
        try {
          const blob = await generateVideoThumbnail(newFile.file);
          if (blob) {
            const previewUrl = URL.createObjectURL(blob);
            setFiles(prev => prev.map(f =>
              f.file === newFile.file ? { ...f, thumbnailBlob: blob, thumbnailPreview: previewUrl } : f
            ));
          }
        } catch (err) {
          console.warn('Failed to generate thumbnail preview', err);
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDurationChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1 && num <= 120) {
      setMediaDuration(num);
    }
  };

  const uploadFiles = async () => {
    if (!user) {
      toast.error('Você precisa estar logado para fazer upload');
      return;
    }

    if (!mediaName.trim()) {
      toast.error('Por favor, preencha o nome da mídia');
      return;
    }

    if (!companyName.trim()) {
      toast.error('Por favor, preencha o nome da empresa');
      return;
    }

    if (!segment) {
      toast.error('Por favor, selecione um seguimento');
      return;
    }

    if (!aspectRatio) {
      toast.error('Por favor, selecione a proporção de tela');
      return;
    }

    if (files.length === 0) {
      toast.error('Por favor, selecione pelo menos um arquivo');
      return;
    }

    setIsUploading(true);

    for (let i = 0; i < files.length; i++) {
      const uploadFile = files[i];
      if (uploadFile.status !== 'pending') continue;

      // Update status to uploading
      setFiles(prev => prev.map((f, idx) =>
        idx === i ? { ...f, status: 'uploading' as const } : f
      ));

      try {
        const fileExt = uploadFile.file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(filePath, uploadFile.file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('media')
          .getPublicUrl(filePath);

        // Use the custom name if provided, otherwise use original filename
        const finalName = mediaName.trim() || uploadFile.file.name;

        // Upload thumbnail if exists
        let thumbnailUrl: string | null = null;
        if (uploadFile.thumbnailBlob) {
          const thumbName = `${Date.now()}-thumb.jpg`;
          const thumbPath = `${user.id}/thumbnails/${thumbName}`;

          const { error: thumbErr } = await supabase.storage
            .from('media')
            .upload(thumbPath, uploadFile.thumbnailBlob, {
              cacheControl: '3600',
              contentType: 'image/jpeg'
            });

          if (!thumbErr) {
            const { data: { publicUrl: thumbPublicUrl } } = supabase.storage
              .from('media')
              .getPublicUrl(thumbPath);
            thumbnailUrl = thumbPublicUrl;
          }
        }

        // Save to database
        const { data, error: dbError } = await supabase.from('media').insert({
          user_id: user.id,
          name: finalName,
          file_path: filePath,
          file_url: publicUrl,
          file_type: getFileType(uploadFile.file.type),
          file_size: uploadFile.file.size,
          mime_type: uploadFile.file.type,
          aspect_ratio: aspectRatio,
          thumbnail_url: thumbnailUrl,
        })
          .select()
          .single();

        if (dbError) throw dbError;

        // Add to playlist if selected
        if (selectedPlaylistId && selectedPlaylistId !== 'none' && data) {
          try {
            // Get current max position
            const { count } = await supabase
              .from('playlist_items')
              .select('*', { count: 'exact', head: true })
              .eq('playlist_id', selectedPlaylistId);

            const newPosition = count || 0;

            await supabase.from('playlist_items').insert({
              playlist_id: selectedPlaylistId,
              media_id: data.id,
              position: newPosition,
              duration: mediaDuration,
              // Apply schedule if set
              start_time: null, // Simple upload doesn't set specific times per item yet, usually
              end_time: null,
              days: null,
            });
          } catch (playlistErr) {
            console.error('Error adding to playlist:', playlistErr);
            toast.error(`Mídia enviada, mas erro ao adicionar na playlist: ${mediaName}`);
          }
        }

        if (dbError) throw dbError;

        // Update status to complete
        setFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'complete' as const, progress: 100 } : f
        ));

      } catch (error: unknown) {
        console.error('Upload error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'error' as const, error: errorMessage } : f
        ));
      }
    }

    setIsUploading(false);

    const successCount = files.filter(f => f.status === 'complete').length +
      files.filter(f => f.status === 'pending').length;

    if (successCount > 0) {
      toast.success(`${successCount} arquivo(s) enviado(s) com sucesso!`);
      onUploadComplete();
    }
  };

  // --- UPDATE MEDIA (Edit Mode) ---
  const updateMedia = async () => {
    if (!user || !editMedia) return;

    if (!mediaName.trim()) {
      toast.error('Por favor, preencha o nome da mídia');
      return;
    }

    setIsUploading(true);

    try {
      const updateData: Record<string, any> = {
        name: mediaName.trim(),
        aspect_ratio: aspectRatio,
      };

      // If user selected a new file, upload it and replace old one
      if (files.length > 0 && files[0].status === 'pending') {
        const newFile = files[0];

        // Upload new file
        const fileExt = newFile.file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(filePath, newFile.file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('media')
          .getPublicUrl(filePath);

        // Upload thumbnail for video
        let thumbnailUrl: string | null = null;
        if (newFile.thumbnailBlob) {
          const thumbName = `${Date.now()}-thumb.jpg`;
          const thumbPath = `${user.id}/thumbnails/${thumbName}`;
          const { error: thumbErr } = await supabase.storage
            .from('media')
            .upload(thumbPath, newFile.thumbnailBlob, {
              cacheControl: '3600',
              contentType: 'image/jpeg'
            });
          if (!thumbErr) {
            const { data: { publicUrl: thumbPublicUrl } } = supabase.storage
              .from('media')
              .getPublicUrl(thumbPath);
            thumbnailUrl = thumbPublicUrl;
          }
        }

        // Delete old file from storage
        try {
          await supabase.storage.from('media').remove([editMedia.file_path]);
        } catch (err) {
          console.warn('Could not delete old file:', err);
        }

        updateData.file_path = filePath;
        updateData.file_url = publicUrl;
        updateData.file_type = getFileType(newFile.file.type);
        updateData.file_size = newFile.file.size;
        updateData.mime_type = newFile.file.type;
        if (thumbnailUrl) updateData.thumbnail_url = thumbnailUrl;
      }

      // Update database
      const { error: dbError } = await supabase
        .from('media')
        .update(updateData)
        .eq('id', editMedia.id);

      if (dbError) throw dbError;

      // Add to playlist if selected
      if (selectedPlaylistId && selectedPlaylistId !== 'none') {
        try {
          // Get current max position
          const { count } = await supabase
            .from('playlist_items')
            .select('*', { count: 'exact', head: true })
            .eq('playlist_id', selectedPlaylistId);

          const newPosition = count || 0;

          // Check if already in this playlist
          const { data: existing } = await supabase
            .from('playlist_items')
            .select('id')
            .eq('playlist_id', selectedPlaylistId)
            .eq('media_id', editMedia.id)
            .maybeSingle();

          if (!existing) {
            await supabase.from('playlist_items').insert({
              playlist_id: selectedPlaylistId,
              media_id: editMedia.id,
              position: newPosition,
              duration: mediaDuration,
            });
          }
        } catch (playlistErr) {
          console.error('Error adding to playlist:', playlistErr);
          toast.error('Mídia atualizada, mas erro ao adicionar na playlist');
        }
      }

      toast.success('Mídia atualizada com sucesso!');
      onUploadComplete();
    } catch (error: unknown) {
      console.error('Update error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(`Erro ao atualizar: ${errorMessage}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setFiles([]);
      setMediaName('');
      setCompanyName('');
      setSegment('');
      setMediaDuration(10);
      setScheduledDate(undefined);
      setAspectRatio('16x9');
      setSelectedPlaylistId('none');
      onOpenChange(false);
    }
  };

  const pendingFiles = files.filter(f => f.status === 'pending');
  const hasFilesToUpload = pendingFiles.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Editar Mídia' : 'Upload de Mídias'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview da mídia atual (edit mode) */}
          {isEditMode && files.length === 0 && (
            <div className="rounded-lg border overflow-hidden bg-muted/30">
              <p className="text-xs text-muted-foreground px-3 pt-2">Mídia atual:</p>
              <div className="aspect-video max-h-40 flex items-center justify-center">
                {editMedia?.file_type === 'video' ? (
                  <video src={editMedia.file_url} className="h-full object-contain" muted />
                ) : editMedia?.file_type === 'image' ? (
                  <img src={editMedia.file_url} className="h-full object-contain" alt={editMedia.name} />
                ) : (
                  <div className="flex flex-col items-center text-muted-foreground">
                    <Music className="h-8 w-8" />
                    <span className="text-xs mt-1">Áudio</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Nome da Mídia */}
          <div className="space-y-2">
            <Label htmlFor="mediaName">Nome da Mídia</Label>
            <Input
              id="mediaName"
              placeholder="Digite o nome da mídia"
              value={mediaName}
              onChange={(e) => setMediaName(e.target.value)}
            />
          </div>

          {/* Nome da Empresa */}
          <div className="space-y-2">
            <Label htmlFor="companyName">Nome da Empresa</Label>
            <Input
              id="companyName"
              placeholder="Digite o nome da empresa"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          {/* Seguimento */}
          <div className="space-y-2">
            <Label htmlFor="segment">Seguimento</Label>
            <Select value={segment} onValueChange={setSegment}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o seguimento" />
              </SelectTrigger>
              <SelectContent>
                {SEGMENTS.map((seg) => (
                  <SelectItem key={seg} value={seg}>
                    {seg}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Proporção de Tela */}
          <div className="space-y-2">
            <Label>Proporção de Tela</Label>
            <div className="grid grid-cols-2 gap-3">
              {/* 16x9 Horizontal */}
              <button
                type="button"
                onClick={() => setAspectRatio('16x9')}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${aspectRatio === '16x9'
                  ? 'border-primary bg-primary/10'
                  : 'border-muted-foreground/25 hover:border-primary/50'
                  }`}
              >
                <div className="flex-shrink-0">
                  <Monitor className="h-8 w-8 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm">16x9</p>
                  <p className="text-xs text-muted-foreground">Horizontal</p>
                </div>
              </button>

              {/* 9x16 Vertical (deitado) */}
              <button
                type="button"
                onClick={() => setAspectRatio('9x16')}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${aspectRatio === '9x16'
                  ? 'border-primary bg-primary/10'
                  : 'border-muted-foreground/25 hover:border-primary/50'
                  }`}
              >
                <div className="flex-shrink-0">
                  <Monitor className="h-8 w-8 text-primary rotate-90" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm">9x16</p>
                  <p className="text-xs text-muted-foreground">Vertical</p>
                </div>
              </button>
            </div>
          </div>

          {/* Tempo de Mídia */}
          <div className="space-y-2">
            <Label htmlFor="mediaDuration">Tempo de Mídia</Label>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <Input
                id="mediaDuration"
                type="number"
                min={1}
                max={120}
                value={mediaDuration}
                onChange={(e) => handleDurationChange(e.target.value)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">segundos (1s - 2min)</span>
            </div>
          </div>

          {/* Agendamento */}
          <div className="space-y-2">
            <Label>Agendamento</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !scheduledDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {scheduledDate ? (
                    format(scheduledDate, "PPP", { locale: ptBR })
                  ) : (
                    <span>Calendário</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={scheduledDate}
                  onSelect={(date) => {
                    setScheduledDate(date);
                    setCalendarOpen(false);
                  }}
                  locale={ptBR}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Upload de Mídias */}
          <div className="space-y-2">
            <Label>{isEditMode ? 'Trocar Mídia (opcional)' : 'Upload de Mídias'}</Label>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
                ${isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple={!isEditMode}
                accept={acceptedMimeTypes}
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-base font-medium mb-1">
                {isEditMode ? 'Clique para trocar o arquivo' : 'Arraste e solte seus arquivos aqui'}
              </p>
              <p className="text-sm text-muted-foreground">
                {isEditMode ? 'Selecione um novo arquivo para substituir' : 'ou clique para selecionar'}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Suporta: Imagens (JPG, PNG, GIF, WebP), Vídeos (MP4, WebM), Áudios (MP3, WAV)
              </p>
            </div>
          </div>

          {/* Adicionar à Playlist (Opcional) */}
          <div className="space-y-2">
            <Label>{isEditMode ? 'Incluir na Playlist (Opcional)' : 'Adicionar à Playlist (Opcional)'}</Label>
            <div className="flex items-center gap-2">
              <ListPlus className="h-5 w-5 text-muted-foreground" />
              <Select value={selectedPlaylistId} onValueChange={setSelectedPlaylistId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione uma playlist (Opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (Apenas Galeria)</SelectItem>
                  {playlists.map((playlist) => (
                    <SelectItem key={playlist.id} value={playlist.id}>
                      {playlist.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {files.map((uploadFile, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex-shrink-0 w-12 h-12 bg-black/5 rounded overflow-hidden flex items-center justify-center">
                    {uploadFile.thumbnailPreview ? (
                      <img src={uploadFile.thumbnailPreview} className="w-full h-full object-cover" alt="Cover" />
                    ) : getFileType(uploadFile.file.type) === 'image' ? (
                      <img src={URL.createObjectURL(uploadFile.file)} className="w-full h-full object-cover" alt="Preview" />
                    ) : getFileType(uploadFile.file.type) === 'video' ? (
                      <video
                        src={URL.createObjectURL(uploadFile.file)}
                        className="w-full h-full object-cover pointer-events-none"
                        muted
                        onLoadedMetadata={(e) => e.currentTarget.currentTime = 1.0}
                      />
                    ) : (
                      getFileIcon(getFileType(uploadFile.file.type))
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{uploadFile.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(uploadFile.file.size)}
                    </p>
                    {uploadFile.status === 'uploading' && (
                      <Progress value={50} className="h-1 mt-1" />
                    )}
                    {uploadFile.status === 'error' && (
                      <p className="text-xs text-destructive mt-1">{uploadFile.error}</p>
                    )}
                  </div>
                  {uploadFile.status === 'complete' ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : uploadFile.status !== 'uploading' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            Cancelar
          </Button>
          {isEditMode ? (
            <Button
              onClick={updateMedia}
              disabled={isUploading}
              className="gradient-primary"
            >
              {isUploading ? 'Atualizando...' : 'Atualizar Mídia'}
            </Button>
          ) : (
            <Button
              onClick={uploadFiles}
              disabled={!hasFilesToUpload || isUploading}
              className="gradient-primary"
            >
              {isUploading ? 'Enviando...' : `Enviar ${pendingFiles.length} arquivo(s)`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
