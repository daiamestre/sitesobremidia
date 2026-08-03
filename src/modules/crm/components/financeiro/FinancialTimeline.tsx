import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { History, Clock } from 'lucide-react';

interface FinancialTimelineProps {
  auditoria: any[];
}

export function FinancialTimeline({ auditoria }: FinancialTimelineProps) {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <History className="h-4 w-4 text-emerald-400" />
          Rastreabilidade Imutável Financeira ({auditoria.length})
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">Histórico imutável de emissão, recebimento, conciliação e comissões.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {auditoria.length === 0 ? (
          <div className="text-center py-4 text-slate-500 text-xs">Nenhum evento registrado.</div>
        ) : (
          <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-white/10 pl-8">
            {auditoria.map((a) => (
              <div key={a.id} className="relative space-y-1">
                <div className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-emerald-400 ring-4 ring-slate-900" />
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">{a.evento}</span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(a.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
                <p className="text-xs text-slate-300">Evento registrado no módulo financeiro.</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
