import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SignedContracts({ assinados }: { assinados: any[] }) {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Contratos Assinados & PI Liberado ({assinados.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-2 text-xs">
        {assinados.length === 0 ? (
          <div className="text-center py-4 text-slate-500">Nenhum contrato assinado.</div>
        ) : (
          assinados.map((a) => (
            <div key={a.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
              <div>
                <strong className="text-white font-mono block">Envelope #{a.envelope_id}</strong>
                <span className="text-[10px] text-slate-400">Assinado em: {new Date(a.assinado_em || a.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">PI Liberado</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
