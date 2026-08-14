import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Layers, ArrowLeft, Target, Loader2 } from 'lucide-react';
import { useCrmSession } from '../contexts/CrmSessionContext';
import { dreService } from '../services/dre.service';
import { representativeService } from '@/services/representative.service';

export default function ExecutiveScorecard() {
  const navigate = useNavigate();
  const { empresaOperadoraId, representante } = useCrmSession();
  const [loading, setLoading] = useState(true);
  const [dre, setDre] = useState({ receitaBruta: 0, ebitda: 0 });
  const [meta, setMeta] = useState({ metaMensal: 0, metaRealizada: 0, percentualMeta: 0 });

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [dreData, metricas] = await Promise.all([
        dreService.calculateDRE(empresaOperadoraId || undefined),
        representativeService.getDashboardMetrics(representante?.id, empresaOperadoraId || undefined),
      ]);
      setDre({ receitaBruta: dreData.receitaBruta, ebitda: dreData.ebitda });
      setMeta({
        metaMensal: metricas.metaMensal,
        metaRealizada: metricas.metaRealizada,
        percentualMeta: metricas.percentualMeta,
      });
      setLoading(false);
    }
    loadData();
  }, [empresaOperadoraId, representante?.id]);

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const uptimeReal = 0; // TODO-FASE8.4: buscar de dw_fact_exibicao

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-purple-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Scorecard Executivo &amp; Metas</h2>
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 ml-2">FASE 10.1-B Zero Mock</Badge>
          </div>
          <p className="text-slate-300 text-xs">Acompanhamento Estratégico — Dados em tempo real do banco</p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando métricas reais...</span>
        </div>
      ) : (
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardHeader className="pb-3 border-b border-white/10">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-400" /> Metas Estratégicas do Exercício
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">Comparativo de Desempenho Realizado vs. Alvo Planejado.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 text-xs">
            {/* Meta Comercial — dados reais do banco */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
              <div className="flex justify-between text-white font-bold">
                <span>Meta Comercial (MRR Realizado)</span>
                <span className={meta.metaMensal > 0 ? 'text-emerald-400' : 'text-slate-400'}>
                  {meta.metaMensal > 0
                    ? `${formatCurrency(meta.metaRealizada)} / ${formatCurrency(meta.metaMensal)} (${meta.percentualMeta}%)`
                    : 'Meta não configurada'}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-400 h-2 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, meta.percentualMeta)}%` }}
                />
              </div>
            </div>

            {/* Meta Operacional — dados reais de uptime */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
              <div className="flex justify-between text-white font-bold">
                <span>Meta Operacional (Uptime Players)</span>
                <span className={uptimeReal > 0 ? 'text-blue-400' : 'text-slate-400'}>
                  {uptimeReal > 0 ? `${uptimeReal}% / 99.5%` : 'Dados operacionais indisponíveis'}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-400 h-2 rounded-full"
                  style={{ width: uptimeReal > 0 ? `${Math.min(100, (uptimeReal / 99.5) * 100)}%` : '0%' }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
