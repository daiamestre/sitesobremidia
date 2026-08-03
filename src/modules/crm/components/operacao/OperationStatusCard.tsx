import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Wifi, WifiOff, Tv, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { OperacaoCompleta } from '../../services/operacao.service';

interface OperationStatusCardProps {
  operacoes: OperacaoCompleta[];
}

export function OperationStatusCard({ operacoes }: OperationStatusCardProps) {
  const ativas = operacoes.filter((o) => o.status === 'EM_EXECUCAO' || o.status === 'INICIADA').length;
  const critical = operacoes.filter((o) => o.health_status === 'CRITICAL').length;
  const totalAlertas = operacoes.reduce((acc, o) => acc + (o.alertas?.filter((a) => !a.resolvido).length || 0), 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <span className="text-slate-400 text-xs block font-semibold">Campanhas Ativas</span>
            <strong className="text-xl font-bold text-white">{ativas}</strong>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Wifi className="h-6 w-6" />
          </div>
          <div>
            <span className="text-slate-400 text-xs block font-semibold">Players Conectados</span>
            <strong className="text-xl font-bold text-white">98% Online</strong>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <span className="text-slate-400 text-xs block font-semibold">Alertas Ativos</span>
            <strong className="text-xl font-bold text-amber-400">{totalAlertas}</strong>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <Tv className="h-6 w-6" />
          </div>
          <div>
            <span className="text-slate-400 text-xs block font-semibold">Saúde da Rede</span>
            <Badge className={critical > 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}>
              {critical > 0 ? 'Atenção Requerida' : '100% Operacional'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
