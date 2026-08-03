import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

export function AnomalyDashboard() {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-blue-400" /> Detecção Inteligente de Anomalias Operacionais
          </span>
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">NOC Monitor</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-2 text-xs">
        <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
          <div className="space-y-0.5">
            <strong className="text-white block font-mono">Queda de Ping em Player #18</strong>
            <span className="text-[10px] text-slate-400">Latência 140ms — Sem perda de Proof-of-Play</span>
          </div>
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
            <ShieldCheck className="h-3 w-3" /> SLA Mantido
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
