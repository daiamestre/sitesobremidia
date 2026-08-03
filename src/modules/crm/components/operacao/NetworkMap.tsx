import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Network, Building2, Tv, Film, Play, CheckCircle2 } from 'lucide-react';
import { OperacaoCompleta } from '../../services/operacao.service';

interface NetworkMapProps {
  operacoes: OperacaoCompleta[];
}

export function NetworkMap({ operacoes }: NetworkMapProps) {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <Network className="h-4 w-4 text-purple-400" />
          Mapa Hierárquico Operacional da Rede
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">
          Hierarquia: Empresa ➔ Unidade ➔ Tela ➔ Player ➔ Campanha ➔ Status
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {operacoes.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs">Nenhuma transmissão mapeada no momento.</div>
        ) : (
          <div className="space-y-3">
            {operacoes.map((op) => (
              <div key={op.id} className="p-3 rounded-xl bg-slate-950/80 border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="font-bold text-white">SOBRE MÍDIA REDE MATRIZ</span>
                  </div>
                  <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">{op.status}</Badge>
                </div>

                <div className="pl-6 border-l-2 border-primary/30 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Tv className="h-3.5 w-3.5 text-purple-400" /> Tela Main Lounge (Player #01)
                    </span>
                    <Badge variant="outline" className="border-white/10 text-slate-400 text-[10px]">
                      PI: {op.pedido_insercao?.numero_pi || 'PI'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-400">Veiculando: {op.agendamento?.titulo || 'Campanha de Mídia'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
