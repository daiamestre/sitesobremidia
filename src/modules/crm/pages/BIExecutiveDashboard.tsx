import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { biService } from '../services/bi.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PieChart, TrendingUp, DollarSign, Users, Tv, Download, Loader2, ArrowLeft, Layers } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function BIExecutiveDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { empresaOperadoraId } = useAuth();
  const [cube, setCube] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchCube = useCallback(async () => {
    setLoading(true);
    const data = await biService.getCommercialCube(empresaOperadoraId || undefined);
    setCube(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchCube();
  }, [fetchCube]);

  if (loading || !cube) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <PieChart className="h-6 w-6 text-purple-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Painel BI Enterprise & Cubos OLAP</h2>
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 ml-2">FASE 9.3 BI</Badge>
          </div>
          <p className="text-slate-300 text-xs">Análises Multidimensionais, Drill-Down Hierárquico e IA Ready</p>
        </div>

        <Button onClick={() => navigate('/representantes/bi/scorecard')} variant="outline" className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 rounded-xl text-xs gap-1.5">
          <Layers className="h-4 w-4" /> Scorecard Executivo
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Conversão de Leads</span>
              <strong className="text-lg font-bold text-white">{cube.conversao}%</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Ticket Médio OLAP</span>
              <strong className="text-lg font-bold text-blue-400">R$ {cube.ticketMedio.toLocaleString('pt-BR')}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">LTV Médio</span>
              <strong className="text-lg font-bold text-emerald-400">R$ {cube.ltv.toLocaleString('pt-BR')}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <Tv className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Taxa de Churn</span>
              <strong className="text-lg font-bold text-rose-400">{cube.churn}%</strong>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
