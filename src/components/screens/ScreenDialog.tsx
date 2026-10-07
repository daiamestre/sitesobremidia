import { useState, useEffect } from 'react';
import { Images, ListVideo, X } from 'lucide-react';
import { SeletorDeConteudo, criarPlaylistComMidias, type MidiaDaGaleria } from './SeletorDeConteudo';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Monitor, MonitorSmartphone, Loader2 } from 'lucide-react';

import { Screen } from '@/types/models';

interface Playlist {
  id: string;
  name: string;
  resolution?: string;
}

interface ScreenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screen?: Screen | null;
  onSaved: () => void;
}

const ASPECT_RATIOS = [
  { value: '16x9', label: '16x9 (Horizontal)', icon: 'horizontal' },
  { value: '9x16', label: '9x16 (Vertical)', icon: 'vertical' },
];

export function ScreenDialog({ open, onOpenChange, screen, onSaved }: ScreenDialogProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [resolution, setResolution] = useState('16x9');
  // F-152: conteúdo da tela por mídias da galeria (vira uma playlist ao salvar) ou por playlist já criada
  const [midiasEscolhidas, setMidiasEscolhidas] = useState<MidiaDaGaleria[]>([]);
  const [seletor, setSeletor] = useState<'galeria' | 'playlist' | null>(null);
  useEffect(() => { if (open) { setMidiasEscolhidas([]); setSeletor(null); } }, [open, screen?.id]);
  const [customId, setCustomId] = useState('');
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset playlist if resolution changes and current playlist doesn't match
  useEffect(() => {
    if (playlistId && playlists.length > 0) {
      const selectedPlaylist = playlists.find(p => p.id === playlistId);
      if (selectedPlaylist && (selectedPlaylist.resolution || '16x9') !== resolution) {
        setPlaylistId(null);
      }
    }
  }, [resolution, playlists, playlistId]);

  useEffect(() => {
    const fetchPlaylists = async () => {
      const { data } = await supabase
        .from('playlists')
        .select('id, name, resolution')
        .eq('is_active', true)
        .order('name');
      setPlaylists(data || []);
    };

    if (open) {
      fetchPlaylists();
    }
  }, [open]);

  useEffect(() => {
    if (screen) {
      setName(screen.name);
      setDescription(screen.description || '');
      setLocation(screen.location || '');
      setResolution(screen.resolution || '16x9');
      setCustomId(screen.custom_id || '');
      setPlaylistId(screen.playlist_id);
      setIsActive(screen.is_active);
    } else {
      setName('');
      setDescription('');
      setLocation('');
      setResolution('16x9');
      setCustomId('');
      setPlaylistId(null);
      setIsActive(true);
    }
  }, [screen, open]);

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    // Validar ID personalizado
    if (!customId.trim()) {
      toast.error('ID é obrigatório');
      return;
    }

    const idRegex = /^[a-zA-Z0-9_-]+$/;
    if (!idRegex.test(customId)) {
      toast.error('ID deve conter apenas letras, números, hífens e underscores');
      return;
    }


    const orientation = resolution === '16x9' ? 'landscape' : 'portrait';

    setSaving(true);
    try {
      // F-152: mídias escolhidas da galeria viram a playlist desta tela
      let playlistFinal = playlistId;
      if (midiasEscolhidas.length > 0) {
        const nova = await criarPlaylistComMidias(user.id, name, resolution, midiasEscolhidas);
        playlistFinal = nova.id;
      }
      if (screen) {
        const { error } = await supabase
          .from('screens')
          .update({
            name,
            description: description || null,
            location: location || null,
            resolution,
            orientation,
            playlist_id: playlistFinal,
            is_active: isActive,
            custom_id: customId,
          })
          .eq('id', screen.id);
        if (error) {
          if (error.code === '23505') {
            toast.error('Este ID já está em uso. Escolha outro.');
            return;
          }
          throw error;
        }
        toast.success('Tela atualizada!');
      } else {
        const { error } = await supabase
          .from('screens')
          .insert({
            name,
            description: description || null,
            location: location || null,
            resolution,
            orientation,
            playlist_id: playlistFinal,
            is_active: isActive,
            user_id: user.id,
            custom_id: customId,
          });
        if (error) {
          if (error.code === '23505') {
            toast.error('Este ID já está em uso. Escolha outro.');
            return;
          }
          throw error;
        }
        toast.success('Tela criada!');
      }
      onSaved();
      onOpenChange(false);
    } catch (error: unknown) {
      console.error('Error saving screen:', error);
      console.error('Error saving screen:', error);
      toast.error('Erro ao salvar tela: ' + ((error as any).message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-2 shrink-0">
          <DialogTitle>{screen ? 'Editar Tela' : 'Nova Tela'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-2 custom-scrollbar space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Tela *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Recepção, Vitrine"
                className="bg-muted/30 border-border/50 focus:border-primary/50 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom_id">ID Personalizado *</Label>
              <div className="relative">
                <Input
                  id="custom_id"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value.toUpperCase().replace(/\s+/g, '-'))}
                  placeholder="Ex: TELA-01"
                  className="font-mono uppercase bg-muted/30 border-border/50 focus:border-primary/50 transition-colors pr-10"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/30">
                  <Monitor className="h-4 w-4" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Usado para conectar o player: <code className="text-primary/70">{customId || 'ID'}</code>
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Localização / Descrição</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ex: Piso 1, Entrada Principal"
              className="bg-muted/30 border-border/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIOS.map(ratio => (
                    <SelectItem key={ratio.value} value={ratio.value}>
                      <div className="flex items-center gap-2">
                        {ratio.icon === 'horizontal' ? <Monitor className="h-4 w-4" /> : <MonitorSmartphone className="h-4 w-4" />}
                        {ratio.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2" data-testid="conteudo-da-tela">
              <Label>Conteúdo da tela</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setSeletor('galeria')} data-testid="tela-galeria"><Images className="h-4 w-4" /> Mídias da galeria</Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setSeletor('playlist')} data-testid="tela-playlist"><ListVideo className="h-4 w-4" /> Playlist</Button>
              </div>
              {midiasEscolhidas.length > 0 && (
                <p className="flex items-center justify-between gap-2 rounded-md bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-300" data-testid="midias-escolhidas">
                  <span>{midiasEscolhidas.length} {midiasEscolhidas.length === 1 ? 'mídia da galeria' : 'mídias da galeria'} — ao salvar, viram a playlist desta tela.</span>
                  <button type="button" aria-label="Tirar as mídias escolhidas" onClick={() => setMidiasEscolhidas([])}><X className="h-3.5 w-3.5" /></button>
                </p>
              )}
              <Label className="text-xs text-muted-foreground">Playlist já criada</Label>
              <Select value={playlistId || 'none'} onValueChange={(v) => setPlaylistId(v === 'none' ? null : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {playlists
                    .filter(p => !p.resolution || p.resolution === resolution)
                    .map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>





          <div className="flex items-center justify-between border rounded-lg p-3">
            <div className="space-y-0.5">
              <Label>Tela Ativa</Label>
              <p className="text-sm text-muted-foreground">
                Se desativada, o player mostrará tela preta
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <div className="p-4 border-t bg-background mt-auto flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
      <SeletorDeConteudo aberto={seletor !== null} passoInicial={seletor ?? 'opcoes'} titulo="Conteúdo da tela" onFechar={() => setSeletor(null)} variasMidias donos={user?.id ? [user.id] : undefined}
        playlistAtual={playlistId}
        onMidias={(ms) => { setMidiasEscolhidas(ms); setPlaylistId(null); }}
        onPlaylist={(p) => { setPlaylistId(p.id); setMidiasEscolhidas([]); setSeletor(null); }} />
    </Dialog >
  );
}
