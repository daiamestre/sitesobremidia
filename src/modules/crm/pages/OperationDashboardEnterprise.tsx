import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, ArrowLeft, Tv, ShieldCheck } from 'lucide-react';

export default function OperationDashboardEnterprise() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-blue-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Dashboard Operacional DW & SLA</h2>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 ml-2">FASE 9.2 DW</Badge>
          </div>
          <p className="text-slate-300 text-xs">Proof-of-Play, SLA de Transmissão, Heartbeats e Alertas Operacionais</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/analytics')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Executive
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 space-y-1">
            <span className="text-slate-400 block font-semibold">Total Proof-of-Play (Inserções)</span>
            <strong className="text-xl font-bold text-emerald-400">1.458.900</strong>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 space-y-1">
            <span className="text-slate-400 block font-semibold">SLA de Exibição</span>
            <strong className="text-xl font-bold text-blue-400">99.8%</strong>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 space-y-1">
            <span className="text-slate-400 block font-semibold">Uptime Médio dos Players</span>
            <strong className="text-xl font-bold text-amber-400">99.9%</strong>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
