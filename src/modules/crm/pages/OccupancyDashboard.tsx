import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tv, ArrowLeft, MapPin } from 'lucide-react';

export default function OccupancyDashboard() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Tv className="h-6 w-6 text-amber-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Dashboard de Ocupação da Rede Signage</h2>
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 ml-2">FASE 9.2 DW</Badge>
          </div>
          <p className="text-slate-300 text-xs">Ocupação Percentual, Tempo Livre vs. Ocupado e Receita por Tela/Unidade</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/analytics')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Executive
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 space-y-1">
            <span className="text-slate-400 block font-semibold">Taxa Média de Ocupação da Rede</span>
            <strong className="text-xl font-bold text-amber-400">78.4%</strong>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 space-y-1">
            <span className="text-slate-400 block font-semibold">Tempo Disponível Comercializável</span>
            <strong className="text-xl font-bold text-emerald-400">21.6% (Tempo Livre)</strong>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 space-y-1">
            <span className="text-slate-400 block font-semibold">Receita Médio por Tela</span>
            <strong className="text-xl font-bold text-purple-400">R$ 8.500,00 / mês</strong>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
