import { useNavigate } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Layers, ArrowLeft, CheckCircle2, Target } from 'lucide-react';

export default function ExecutiveScorecard() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-purple-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Scorecard Executivo & Metas v2.0</h2>
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 ml-2">FASE 9.3 BI</Badge>
          </div>
          <p className="text-slate-300 text-xs">Acompanhamento Estratégico de Metas Comerciais, Financeiras e Operacionais</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/bi')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao BI
        </Button>
      </div>

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="pb-3 border-b border-white/10">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <Target className="h-4 w-4 text-purple-400" /> Metas Estratégicas do Exercício 2026
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">Comparativo de Desempenho Realizado vs. Alvo Planejado.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
            <div className="flex justify-between text-white font-bold">
              <span>Meta Comercial (Faturamento MRR)</span>
              <span className="text-emerald-400">R$ 145.000 / R$ 150.000 (96.6%)</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div className="bg-emerald-400 h-2 rounded-full w-[96.6%]" />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
            <div className="flex justify-between text-white font-bold">
              <span>Meta Operacional (Uptime Players)</span>
              <span className="text-blue-400">99.9% / 99.5% (Atingida)</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-400 h-2 rounded-full w-[100%]" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
