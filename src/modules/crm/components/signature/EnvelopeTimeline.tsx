import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { History, Clock } from 'lucide-react';

interface EventoEnvelope {
  id: string;
  evento: string;
  created_at: string;
}

interface EnvelopeTimelineProps {
  eventos: EventoEnvelope[];
}

export function EnvelopeTimeline({ eventos }: EnvelopeTimelineProps) {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <History className="h-4 w-4 text-purple-400" /> Histórico de Assinatura & Eventos ({eventos.length})
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">Acompanhamento em tempo real do ciclo de vida do envelope.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {eventos.length === 0 ? (
          <div className="text-center py-4 text-slate-500 text-xs">Nenhum evento de envelope.</div>
        ) : (
          <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-white/10 pl-8">
            {eventos.map((e) => (
              <div key={e.id} className="relative space-y-1">
                <div className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-purple-400 ring-4 ring-slate-900" />
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">{e.evento}</span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {new Date(e.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
