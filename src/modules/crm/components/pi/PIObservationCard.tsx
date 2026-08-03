import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Plus, Loader2 } from 'lucide-react';
import { PIObservacaoRecord } from '../../services/pi.service';

interface PIObservationCardProps {
  observacoes: PIObservacaoRecord[];
  onAddObservation: (conteudo: string) => Promise<void>;
}

export function PIObservationCard({ observacoes, onAddObservation }: PIObservationCardProps) {
  const [novoConteudo, setNovoConteudo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!novoConteudo.trim()) return;
    setIsSubmitting(true);
    await onAddObservation(novoConteudo);
    setNovoConteudo('');
    setIsSubmitting(false);
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Observações & Comentários Operacionais ({observacoes.length})
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">
          Instruções de produção, briefing e orientações entre representante e equipe operacional.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="space-y-2">
          <Textarea
            placeholder="Digite uma instrução ou observação operacional..."
            value={novoConteudo}
            onChange={(e) => setNovoConteudo(e.target.value)}
            className="bg-slate-950/80 border-white/10 text-white rounded-xl text-xs min-h-[80px]"
          />
          <div className="flex justify-end">
            <Button
              onClick={handleAdd}
              disabled={!novoConteudo.trim() || isSubmitting}
              className="gradient-primary glow-primary font-bold text-xs px-4 h-9 rounded-xl gap-1.5"
            >
              {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              <span>Adicionar Observação</span>
            </Button>
          </div>
        </div>

        {observacoes.length === 0 ? (
          <div className="text-center py-4 text-slate-500 text-xs">Nenhuma observação registrada.</div>
        ) : (
          <div className="space-y-2">
            {observacoes.map((obs) => (
              <div key={obs.id} className="p-3 rounded-xl bg-slate-950/80 border border-white/5 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-primary">{obs.usuario?.nome || 'Operação SOBRE MÍDIA'}</span>
                  <span className="text-slate-500">{new Date(obs.created_at).toLocaleString('pt-BR')}</span>
                </div>
                <p className="text-xs text-slate-200">{obs.conteudo}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
