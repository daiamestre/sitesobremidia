import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Upload, X, Image } from 'lucide-react';

interface Playlist {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  cover_url?: string | null;
}

interface PlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlist?: Playlist | null;
  onSaved: () => void;
}

export function PlaylistDialog({ open, onOpenChange, playlist, onSaved }: PlaylistDialogProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (playlist) {
      setName(playlist.name);
      setDescription(playlist.description || '');
      setIsActive(playlist.is_active);
      setCoverUrl(playlist.cover_url || null);
      setCoverPreview(playlist.cover_url || null);
    } else {
      setName('');
      setDescription('');
      setIsActive(true);
      setCoverUrl(null);
      setCoverPreview(null);
    }
    setCoverFile(null);
  }, [playlist, open]);

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Por favor, selecione uma imagem');
        return;
      }
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const removeCover = () => {
    setCoverFile(null);
    setCoverPreview(null);
    setCoverUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadCover = async (): Promise<string | null> => {
    if (!coverFile || !user) return coverUrl;

    setUploadingCover(true);
    try {
      const fileExt = coverFile.name.split('.').pop();
      const fileName = `${Date.now()}-cover.${fileExt}`;
      const filePath = `${user.id}/covers/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, coverFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading cover:', error);
      toast.error('Erro ao fazer upload da capa');
      return null;
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      // Upload cover if there's a new file
      let finalCoverUrl = coverUrl;
      if (coverFile) {
        finalCoverUrl = await uploadCover();
      } else if (!coverPreview && coverUrl) {
        // Cover was removed
        finalCoverUrl = null;
      }

      if (playlist) {
        const { error } = await supabase
          .from('playlists')
          .update({ name, description, is_active: isActive, cover_url: finalCoverUrl })
          .eq('id', playlist.id);
        if (error) throw error;
        toast.success('Playlist atualizada!');
      } else {
        const { error } = await supabase
          .from('playlists')
          .insert({ user_id: user.id, name, description, is_active: isActive, cover_url: finalCoverUrl });
        if (error) throw error;
        toast.success('Playlist criada!');
      }
      onSaved();
      onOpenChange(false);
    } catch (error: unknown) {
      console.error('Error saving playlist:', error);
      toast.error('Erro ao salvar playlist');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-2 shrink-0">
          <DialogTitle>{playlist ? 'Editar Playlist' : 'Nova Playlist'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-2 custom-scrollbar space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Playlist</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Manhã, Ofertas, Institucional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (Opcional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Uma breve descrição sobre o conteúdo..."
            />
          </div>

          <div className="space-y-2">
            <Label>Capa da Playlist</Label>
            <div className="flex items-start gap-4">
              <div
                className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center border-2 border-dashed overflow-hidden relative cursor-pointer hover:bg-muted/80 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {coverPreview ? (
                  <>
                    <img
                      src={coverPreview}
                      alt="Capa"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <Upload className="h-6 w-6 text-white" />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <Image className="h-8 w-8" />
                    <span className="text-[10px]">Alterar</span>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverSelect}
                  className="hidden"
                />
                <div className="text-sm text-muted-foreground">
                  <p>Selecione uma imagem para identificar a playlist.</p>
                  <p className="text-xs mt-1">Formatos aceitos: JPG, PNG, WEBP</p>
                </div>
                {coverPreview && (
                  <Button variant="outline" size="sm" onClick={removeCover} className="h-8 text-xs text-destructive hover:text-destructive">
                    <X className="h-3 w-3 mr-1" />
                    Remover Capa
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border rounded-lg p-3">
            <div className="space-y-0.5">
              <Label>Playlist Ativa</Label>
              <p className="text-sm text-muted-foreground">
                Se desativada, não aparecerá nas telas vinculadas
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <div className="p-4 border-t bg-background mt-auto flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || uploadingCover}>
            {saving || uploadingCover ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
