import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, AlertTriangle, ArrowLeft, BarChart3, PieChart, Landmark, FileText } from 'lucide-react';

export default function FinanceExecutiveDashboard() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-emerald-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Dashboard Financeiro Executivo</h2>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-2">FASE 9.1-B</Badge>
          </div>
          <p className="text-slate-300 text-xs">Visão Consolidada de MRR, ARR, Inadimplência, Margens e Fluxo Executivo</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => navigate('/representantes/financeiro/dre')} variant="outline" className="border-blue-500/30 text-blue-400 rounded-xl text-xs gap-1.5">
            <FileText className="h-4 w-4" /> DRE
          </Button>
          <Button onClick={() => navigate('/representantes/financeiro/regras-comissao')} variant="outline" className="border-purple-500/30 text-purple-400 rounded-xl text-xs gap-1.5">
            <PieChart className="h-4 w-4" /> Regras Comissão
          </Button>
          <Button onClick={() => navigate('/representantes/financeiro')} variant="outline" className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">MRR (Receita Recorrente Mensal)</span>
              <strong className="text-lg font-bold text-emerald-400">R$ 145.000,00</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">ARR (Receita Anual Projetada)</span>
              <strong className="text-lg font-bold text-blue-400">R$ 1.740.000,00</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Landmark className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Ticket Médio por Contrato</span>
              <strong className="text-lg font-bold text-amber-400">R$ 12.500,00</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Taxa de Inadimplência</span>
              <strong className="text-lg font-bold text-rose-400">1.2%</strong>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
