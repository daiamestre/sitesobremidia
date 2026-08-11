import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DollarSign, ArrowLeft, Loader2 } from 'lucide-react';
import { useCrmSession } from '../contexts/CrmSessionContext';
import { dreService, DREResult } from '../services/dre.service';

export default function FinancialAnalytics() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useCrmSession();
  const [loading, setLoading] = useState(true);
  const [dre, setDre] = useState<DREResult>({
    receitaBruta: 0, descontos: 0, receitaLiquida: 0,
    custosOperacionais: 0, margemBruta: 0, despesasAdministrativas: 0,
    ebitda: 0, resultadoLiquido: 0,
  });

  useEffect(() => {
    async function loadDRE() {
      setLoading(true);
      const data = await dreService.calculateDRE(empresaOperadoraId || undefined);
      setDre(data);
      setLoading(false);
    }
    loadDRE();
  }, [empresaOperadoraId]);

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const margemEbitda = dre.receitaBruta > 0 ? ((dre.ebitda / dre.receitaBruta) * 100).toFixed(1) : '—';
  const fluxoAnualProjetado = dre.receitaLiquida * 12;

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-emerald-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Analytics Financeiro OLAP</h2>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-2">FASE 10.1-B Zero Mock</Badge>
          </div>
          <p className="text-slate-300 text-xs">Cubo Financeiro, EBITDA, Fluxo e Margem — dados reais do DW</p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Consultando cubo financeiro...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
            <CardContent className="p-4 space-y-1">
              <span className="text-slate-400 block font-semibold">Margem EBITDA</span>
              <strong className={`text-xl font-bold ${dre.ebitda > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                {margemEbitda !== '—' ? `${margemEbitda}%` : 'Sem dados'}
              </strong>
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
            <CardContent className="p-4 space-y-1">
              <span className="text-slate-400 block font-semibold">Previsão Fluxo Anual</span>
              <strong className={`text-xl font-bold ${fluxoAnualProjetado > 0 ? 'text-blue-400' : 'text-slate-500'}`}>
                {fluxoAnualProjetado > 0 ? formatCurrency(fluxoAnualProjetado) : 'Sem dados'}
              </strong>
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
            <CardContent className="p-4 space-y-1">
              <span className="text-slate-400 block font-semibold">Resultado Líquido</span>
              <strong className={`text-xl font-bold ${dre.resultadoLiquido > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                {dre.resultadoLiquido > 0 ? formatCurrency(dre.resultadoLiquido) : 'Sem dados'}
              </strong>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
