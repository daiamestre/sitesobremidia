import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { operacaoService, OperacaoCompleta } from '../services/operacao.service';
import { useAuth } from '@/contexts/AuthContext';
import { OperationStatusCard } from '../components/operacao/OperationStatusCard';
import { PlayerHealthPanel } from '../components/operacao/PlayerHealthPanel';
import { AlertList } from '../components/operacao/AlertList';
import { MetricsPanel } from '../components/operacao/MetricsPanel';
import { NetworkMap } from '../components/operacao/NetworkMap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, Loader2, ArrowLeft, RefreshCw } from 'lucide-react';

export default function OperationDashboard() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();
  const [operacoes, setOperacoes] = useState<OperacaoCompleta[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOperacoes = useCallback(async () => {
    setLoading(true);
    const data = await operacaoService.listOperations(empresaOperadoraId || undefined);
    setOperacoes(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchOperacoes();
  }, [fetchOperacoes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const primaryOp = operacoes[0];
  const allPlayers = operacoes.flatMap((o) => o.players || []);
  const allAlertas = operacoes.flatMap((o) => o.alertas || []);
  const allMetricas = operacoes.flatMap((o) => o.metricas || []);

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-emerald-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">
              Centro Operacional da Rede (NOC)
            </h2>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-2">FASE 7.5-D</Badge>
          </div>
          <p className="text-slate-300 text-xs">
            Monitoramento de Players, Heartbeats, Alertas em Tempo Real e KPIs de Exibição
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={fetchOperacoes} variant="outline" className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
            <RefreshCw className="h-4 w-4" />
            Atualizar Status
          </Button>
          <Button variant="outline" onClick={() => navigate('/representantes/dashboard')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao CRM
          </Button>
        </div>
      </div>

      {/* Cards de Resumo Operacional */}
      <OperationStatusCard operacoes={operacoes} />

      {/* Central de Alertas e Heartbeats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertList alertas={allAlertas} onResolveSuccess={fetchOperacoes} />
        <PlayerHealthPanel players={allPlayers} />
      </div>

      {/* KPIs de Exibição */}
      <MetricsPanel metricas={allMetricas} />

      {/* Mapa Hierárquico da Rede */}
      <NetworkMap operacoes={operacoes} />
    </div>
  );
}
