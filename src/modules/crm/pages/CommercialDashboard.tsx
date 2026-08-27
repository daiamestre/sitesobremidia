import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, ArrowLeft, TrendingUp, Target, Award } from 'lucide-react';

export default function CommercialDashboard() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-purple-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Dashboard Comercial & Funil de Vendas</h2>
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 ml-2">FASE 9.2 DW</Badge>
          </div>
          <p className="text-slate-300 text-xs">Conversão, Ticket Médio, CAC, LTV, Churn e Rankings de Vendedores</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/analytics')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Executive
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 space-y-1">
            <span className="text-slate-400 block font-semibold">Taxa de Conversão</span>
            <strong className="text-xl font-bold text-emerald-400">42.5%</strong>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 space-y-1">
            <span className="text-slate-400 block font-semibold">CAC (Custo de Aquisição)</span>
            <strong className="text-xl font-bold text-blue-400">R$ 450,00</strong>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 space-y-1">
            <span className="text-slate-400 block font-semibold">LTV (Lifetime Value)</span>
            <strong className="text-xl font-bold text-purple-400">R$ 38.400,00</strong>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 space-y-1">
            <span className="text-slate-400 block font-semibold">Taxa de Churn</span>
            <strong className="text-xl font-bold text-rose-400">0.8%</strong>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
