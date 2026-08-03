import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, DollarSign, Activity } from 'lucide-react';

export function PredictionsDashboard() {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" /> Projeções Preditivas de Faturamento & Demandas
          </span>
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">96.4% Acurácia</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">MRR Projetado (30d)</span>
            <strong className="text-emerald-400 font-bold text-sm">R$ 158.000,00</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">ARR Projetado (12m)</span>
            <strong className="text-blue-400 font-bold text-sm">R$ 1.896.000,00</strong>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
