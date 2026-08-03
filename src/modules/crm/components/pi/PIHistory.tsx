import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { History, CheckCircle2, User, Clock } from 'lucide-react';
import { PIHistoricoRecord } from '../../services/pi.service';

interface PIHistoryProps {
  historico: PIHistoricoRecord[];
}

export function PIHistory({ historico }: PIHistoryProps) {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Histórico e Rastreabilidade Operacional ({historico.length})
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">
          Registro imutável de todas as transições de status e alterações efetuadas no PI.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {historico.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs">Nenhum evento registrado no histórico.</div>
        ) : (
          <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-white/10 pl-8">
            {historico.map((h) => (
              <div key={h.id} className="relative space-y-1">
                <div className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-primary ring-4 ring-slate-900" />
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">{h.status_novo}</span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(h.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
                <p className="text-xs text-slate-300">{h.descricao}</p>
                {h.status_anterior && (
                  <span className="text-[10px] text-slate-500 block">De: {h.status_anterior} ➔ Para: {h.status_novo}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
