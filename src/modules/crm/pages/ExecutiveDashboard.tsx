import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyticsService, ExecutiveKPIs } from '../services/analytics.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, DollarSign, Users, FileCheck, Tv, Download, Loader2, ArrowLeft, Activity } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { empresaOperadoraId } = useAuth();
  const [kpis, setKpis] = useState<ExecutiveKPIs | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchKPIs = useCallback(async () => {
    setLoading(true);
    const data = await analyticsService.calculateKPIs(empresaOperadoraId || undefined);
    setKpis(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchKPIs();
  }, [fetchKPIs]);

  const handleExport = async (tipo: 'PDF' | 'EXCEL' | 'CSV') => {
    const msg = await analyticsService.exportReport(tipo, 'Dashboard Executivo');
    toast({ title: 'Exportação Concluída!', description: msg });
  };

  if (loading || !kpis) {
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
            <BarChart3 className="h-6 w-6 text-emerald-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Dashboard Executivo Mestre</h2>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-2">FASE 9.2 DW</Badge>
          </div>
          <p className="text-slate-300 text-xs">Visão Unificada de CRM, Operação, NOC, Player Engine e Financeiro</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => handleExport('PDF')} variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl text-xs gap-1">
            <Download className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button onClick={() => handleExport('EXCEL')} variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 rounded-xl text-xs gap-1">
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button onClick={() => handleExport('CSV')} variant="outline" className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 rounded-xl text-xs gap-1">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>

      {/* Grid de KPIs Executivos */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">MRR (Receita Mensal)</span>
              <strong className="text-lg font-bold text-emerald-400">
                R$ {kpis.mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">ARR (Receita Anual)</span>
              <strong className="text-lg font-bold text-blue-400">
                R$ {kpis.arr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Clientes Ativos</span>
              <strong className="text-lg font-bold text-white">{kpis.qtdClientes}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Tv className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Uptime da Rede</span>
              <strong className="text-lg font-bold text-amber-400">{kpis.uptime}%</strong>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Atalhos Rápidos para Dashboards Especializados */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Button onClick={() => navigate('/representantes/analytics/comercial')} variant="outline" className="p-6 h-auto flex flex-col items-center justify-center border-white/10 bg-slate-900/80 hover:bg-white/5 rounded-2xl gap-2">
          <Users className="h-6 w-6 text-purple-400" />
          <span className="text-xs font-bold text-white">Dashboard Comercial</span>
        </Button>

        <Button onClick={() => navigate('/representantes/analytics/financeiro')} variant="outline" className="p-6 h-auto flex flex-col items-center justify-center border-white/10 bg-slate-900/80 hover:bg-white/5 rounded-2xl gap-2">
          <DollarSign className="h-6 w-6 text-emerald-400" />
          <span className="text-xs font-bold text-white">Dashboard Financeiro</span>
        </Button>

        <Button onClick={() => navigate('/representantes/analytics/operacional')} variant="outline" className="p-6 h-auto flex flex-col items-center justify-center border-white/10 bg-slate-900/80 hover:bg-white/5 rounded-2xl gap-2">
          <Activity className="h-6 w-6 text-blue-400" />
          <span className="text-xs font-bold text-white">Dashboard Operacional</span>
        </Button>

        <Button onClick={() => navigate('/representantes/analytics/ocupacao')} variant="outline" className="p-6 h-auto flex flex-col items-center justify-center border-white/10 bg-slate-900/80 hover:bg-white/5 rounded-2xl gap-2">
          <Tv className="h-6 w-6 text-amber-400" />
          <span className="text-xs font-bold text-white">Ocupação de Rede</span>
        </Button>
      </div>
    </div>
  );
}
