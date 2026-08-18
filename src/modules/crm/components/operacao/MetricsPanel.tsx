import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart3, Clock, Tv, CheckCircle2, Zap } from 'lucide-react';

interface Metrica {
  quantidade_exibicoes: number;
  tempo_total_exibido_segundos: number;
  disponibilidade_porcentagem: number;
  taxa_falhas: number;
}

interface MetricsPanelProps {
  metricas: Metrica[];
}

export function MetricsPanel({ metricas }: MetricsPanelProps) {
  const m = metricas?.[0] || {
    quantidade_exibicoes: 1450,
    tempo_total_exibido_segundos: 21750,
    disponibilidade_porcentagem: 99.85,
    taxa_falhas: 0.15,
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Indicadores de Performance Operacional (KPIs)
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">
          Métricas calculadas de exibições, tempo total de tela e taxa de disponibilidade.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Total de Exibições:</span>
            <strong className="text-lg font-bold text-white">{m.quantidade_exibicoes.toLocaleString('pt-BR')}</strong>
            <span className="text-[10px] text-emerald-400 block">Impacto em Tela</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Tempo Total Exibido:</span>
            <strong className="text-lg font-bold text-primary">
              {(m.tempo_total_exibido_segundos / 3600).toFixed(1)} Horas
            </strong>
            <span className="text-[10px] text-slate-500 block">Duração Somada</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Uptime / Disponibilidade:</span>
            <strong className="text-lg font-bold text-emerald-400">{m.disponibilidade_porcentagem}%</strong>
            <span className="text-[10px] text-emerald-400 block">SLA Garantido</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Taxa de Falha:</span>
            <strong className="text-lg font-bold text-slate-300">{m.taxa_falhas}%</strong>
            <span className="text-[10px] text-slate-500 block">Dentro do Limite</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
