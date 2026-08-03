import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tv, CheckCircle2, MapPin } from 'lucide-react';

export function ProofOfPlayViewer() {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Tv className="h-4 w-4 text-emerald-400" /> Transmissões Ao Vivo & Proof of Play
          </span>
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Rede Ativa</Badge>
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">Comprovação contínua de exibição com fotos e logs de execução.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <strong className="text-white">Painel LED Av. Paulista #04</strong>
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                <MapPin className="h-3 w-3" /> São Paulo - SP
              </span>
            </div>
            <span className="text-[10px] text-slate-500">Última inserção: Hoje às 15:42:10 — 15s HD</span>
          </div>
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Exibido 100%
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
