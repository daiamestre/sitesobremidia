import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb } from 'lucide-react';

export function RecommendationsDashboard() {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Recomendações de Expansão & Upsell
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-2 text-xs">
        <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
          <div className="flex items-center justify-between">
            <strong className="text-white">Expansão de Inventário em Curitiba</strong>
            <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">Alta Prioridade</Badge>
          </div>
          <p className="text-slate-400 text-[11px]">Instalar 2 novos painéis LED na região central de Curitiba. Retorno estimado em R$ 28.000/mês.</p>
        </div>
      </CardContent>
    </Card>
  );
}
