import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MapPin, Tv, Plus, Trash2, Loader2, Play } from 'lucide-react';
import { PILocalRecord } from '../../services/pi.service';

interface PILocationSelectorProps {
  locais: PILocalRecord[];
  onAddLocation: (unidadeId: string) => Promise<void>;
  onRemoveLocation: (localId: string) => Promise<void>;
}

export function PILocationSelector({ locais, onAddLocation, onRemoveLocation }: PILocationSelectorProps) {
  const [unidades, setUnidades] = useState<Array<{ id: string; nome: string; cidade?: string; estado?: string }>>([]);
  const [selectedUnidadeId, setSelectedUnidadeId] = useState<string>('');
  const [loadingUnidades, setLoadingUnidades] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadUnidades() {
      setLoadingUnidades(true);
      const { data } = await supabase.from('unidades').select('id, nome, cidade, estado').order('nome');
      setUnidades(data || []);
      setLoadingUnidades(false);
    }
    loadUnidades();
  }, []);

  const handleAdd = async () => {
    if (!selectedUnidadeId) return;
    setIsSubmitting(true);
    await onAddLocation(selectedUnidadeId);
    setSelectedUnidadeId('');
    setIsSubmitting(false);
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Mapeamento de Locais & Pontos de Exibição ({locais.length})
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Associe as unidades físicas, telas e redes de player onde a mídia deste PI será veiculada.
          </CardDescription>
        </div>
        <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
          Empresa ➔ Unidade ➔ Tela ➔ Player ➔ Playlist
        </Badge>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Adicionar Novo Local */}
        <div className="flex gap-2">
          <Select value={selectedUnidadeId} onValueChange={setSelectedUnidadeId} disabled={loadingUnidades}>
            <SelectTrigger className="bg-slate-950/80 border-white/10 text-white rounded-xl h-10 text-xs flex-1">
              <SelectValue placeholder="Selecione a Unidade Comercial para Veiculação..." />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-white/10 text-white">
              {unidades.map((u) => (
                <SelectItem key={u.id} value={u.id} className="text-xs">
                  {u.nome} {u.cidade ? `(${u.cidade}/${u.estado})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={handleAdd}
            disabled={!selectedUnidadeId || isSubmitting}
            className="gradient-primary glow-primary font-bold text-xs px-4 h-10 rounded-xl gap-1.5"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span>Adicionar Ponto</span>
          </Button>
        </div>

        {/* Lista de Locais Mapeados */}
        {locais.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-950/40 border border-dashed border-white/10 text-center text-slate-400 text-xs">
            Nenhum local de exibição associado a este PI. Selecione uma unidade acima.
          </div>
        ) : (
          <div className="space-y-2">
            {locais.map((loc) => (
              <div
                key={loc.id}
                className="p-3 rounded-xl bg-slate-950/80 border border-white/10 flex items-center justify-between hover:border-primary/40 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Tv className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      {loc.unidade?.nome || 'Unidade Comercial Registrada'}
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Vínculo Ativo ➔ Grade Mídia Signage HD
                    </span>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRemoveLocation(loc.id)}
                  className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 h-8 px-2"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
