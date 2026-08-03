import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Route as RouteIcon, MapPin } from 'lucide-react';

export function RouteDashboard() {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <RouteIcon className="h-4 w-4 text-blue-400" /> Rota de Campo Ativa
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-2 text-xs">
        <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
          <div>
            <strong className="text-white block font-mono">3 Pontos de Visita Planejados</strong>
            <span className="text-[10px] text-slate-400">Distância Total: 14.5 km (~40 min)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
