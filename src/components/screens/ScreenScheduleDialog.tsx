import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Clock, Calendar, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface Schedule {
  id: string;
  screen_id: string;
  playlist_id: string;
  name: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  priority: number;
  is_active: boolean;
  playlist?: { name: string } | null;
}

interface Playlist {
  id: string;
  name: string;
}

interface ScreenScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screenId: string;
  screenName: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Dom', fullLabel: 'Domingo' },
  { value: 1, label: 'Seg', fullLabel: 'Segunda' },
  { value: 2, label: 'Ter', fullLabel: 'Terça' },
  { value: 3, label: 'Qua', fullLabel: 'Quarta' },
  { value: 4, label: 'Qui', fullLabel: 'Quinta' },
  { value: 5, label: 'Sex', fullLabel: 'Sexta' },
  { value: 6, label: 'Sáb', fullLabel: 'Sábado' },
];

export function ScreenScheduleDialog({
  open,
  onOpenChange,
  screenId,
  screenName
}: ScreenScheduleDialogProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New schedule form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPlaylistId, setNewPlaylistId] = useState('');
  const [newStartTime, setNewStartTime] = useState('08:00');
  const [newEndTime, setNewEndTime] = useState('18:00');
  const [newDays, setNewDays] = useState<number[]>([1, 2, 3, 4, 5]); // Weekdays default
  const [newPriority, setNewPriority] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [schedulesRes, playlistsRes] = await Promise.all([
        supabase
          .from('screen_schedules')
          .select('*, playlist:playlist_id(name)')
          .eq('screen_id', screenId)
          .order('priority', { ascending: false }),
        supabase
          .from('playlists')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
      ]);

      if (schedulesRes.error) throw schedulesRes.error;
      if (playlistsRes.error) throw playlistsRes.error;

      setSchedules(schedulesRes.data || []);
      setPlaylists(playlistsRes.data || []);
    } catch (error) {
      console.error('Error fetching schedules:', error);
      toast.error('Erro ao carregar agendamentos');
    } finally {
      setLoading(false);
    }
  }, [screenId]);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchData();
    }
  }, [open, fetchData]);

  const resetForm = () => {
    setNewName('');
    setNewPlaylistId('');
    setNewStartTime('08:00');
    setNewEndTime('18:00');
    setNewDays([1, 2, 3, 4, 5]);
    setNewPriority(0);
    setShowAddForm(false);
  };

  const handleAddSchedule = async () => {
    if (!newName.trim() || !newPlaylistId) {
      toast.error('Preencha nome e playlist');
      return;
    }

    if (newStartTime >= newEndTime) {
      toast.error('O horário final deve ser posterior ao inicial');
      return;
    }

    if (newDays.length === 0) {
      toast.error('Selecione pelo menos um dia');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('screen_schedules')
        .insert({
          screen_id: screenId,
          playlist_id: newPlaylistId,
          name: newName,
          start_time: newStartTime,
          end_time: newEndTime,
          days_of_week: newDays,
          priority: newPriority,
        });

      if (error) throw error;
      toast.success('Agendamento criado!');
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error creating schedule:', error);
      toast.error('Erro ao criar agendamento');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (scheduleId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('screen_schedules')
        .update({ is_active: isActive })
        .eq('id', scheduleId);

      if (error) throw error;
      setSchedules(prev =>
        prev.map(s => s.id === scheduleId ? { ...s, is_active: isActive } : s)
      );
    } catch (error) {
      console.error('Error updating schedule:', error);
      toast.error('Erro ao atualizar agendamento');
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
      const { error } = await supabase
        .from('screen_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;
      setSchedules(prev => prev.filter(s => s.id !== scheduleId));
      toast.success('Agendamento excluído!');
    } catch (error) {
      console.error('Error deleting schedule:', error);
      toast.error('Erro ao excluir agendamento');
    }
  };

  const toggleDay = (day: number) => {
    setNewDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  const formatTime = (time: string) => {
    return time.substring(0, 5); // HH:MM
  };

  const formatDays = (days: number[]) => {
    if (days.length === 7) return 'Todos os dias';
    if (JSON.stringify(days.sort()) === JSON.stringify([1, 2, 3, 4, 5])) return 'Dias úteis';
    if (JSON.stringify(days.sort()) === JSON.stringify([0, 6])) return 'Fins de semana';
    return days.map(d => DAYS_OF_WEEK[d].label).join(', ');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Agendamentos - {screenName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-2 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Existing schedules */}
              {schedules.length === 0 && !showAddForm ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum agendamento configurado</p>
                  <p className="text-sm">A playlist padrão será exibida o tempo todo</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {schedules.map(schedule => (
                    <Card key={schedule.id} className={!schedule.is_active ? 'opacity-60' : ''}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{schedule.name}</h4>
                              {schedule.priority > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  Prioridade {schedule.priority}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {schedule.playlist?.name || 'Playlist não encontrada'}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-sm">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                              </span>
                              <span className="text-muted-foreground">
                                {formatDays(schedule.days_of_week)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={schedule.is_active}
                              onCheckedChange={(v) => handleToggleActive(schedule.id, v)}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteSchedule(schedule.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Add new schedule form */}
              {showAddForm ? (
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <h4 className="font-medium">Novo Agendamento</h4>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="Ex: Horário comercial"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Playlist</Label>
                        <Select value={newPlaylistId} onValueChange={setNewPlaylistId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            {playlists.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Início</Label>
                        <Input
                          type="time"
                          value={newStartTime}
                          onChange={(e) => setNewStartTime(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Fim</Label>
                        <Input
                          type="time"
                          value={newEndTime}
                          onChange={(e) => setNewEndTime(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Prioridade</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={newPriority}
                          onChange={(e) => setNewPriority(parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Dias da semana</Label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map(day => (
                          <div key={day.value} className="flex items-center gap-2">
                            <Checkbox
                              id={`day-${day.value}`}
                              checked={newDays.includes(day.value)}
                              onCheckedChange={() => toggleDay(day.value)}
                            />
                            <Label
                              htmlFor={`day-${day.value}`}
                              className="text-sm cursor-pointer"
                            >
                              {day.fullLabel}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={resetForm} disabled={saving}>
                        Cancelar
                      </Button>
                      <Button onClick={handleAddSchedule} disabled={saving} className="gradient-primary">
                        {saving ? 'Salvando...' : 'Adicionar'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Agendamento
                </Button>
              )}

              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                <p><strong>Como funciona:</strong></p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Se não houver agendamento ativo, a playlist padrão da tela é exibida</li>
                  <li>Agendamentos com maior prioridade têm preferência se houver sobreposição</li>
                  <li>A transição entre playlists ocorre automaticamente no horário definido</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-background mt-auto flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
