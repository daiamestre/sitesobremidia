import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PendingSignatures({ pendentes }: { pendentes: any[] }) {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" /> Contratos Aguardando Assinatura ({pendentes.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-2 text-xs">
        {pendentes.length === 0 ? (
          <div className="text-center py-4 text-slate-500">Nenhuma assinatura pendente.</div>
        ) : (
          pendentes.map((p) => (
            <div key={p.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
              <div>
                <strong className="text-white font-mono block">Envelope #{p.envelope_id}</strong>
                <span className="text-[10px] text-slate-400">Provedor: {p.provedor}</span>
              </div>
              <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-400 rounded-xl text-xs gap-1 h-7">
                <Mail className="h-3 w-3" /> Reenviar
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
