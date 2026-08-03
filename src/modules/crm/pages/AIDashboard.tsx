import { useNavigate } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowLeft, Bot, TrendingUp, Lightbulb, AlertTriangle } from 'lucide-react';
import { ExecutiveCopilotDashboard } from '../components/ai/ExecutiveCopilotDashboard';
import { PredictionsDashboard } from '../components/ai/PredictionsDashboard';
import { RecommendationsDashboard } from '../components/ai/RecommendationsDashboard';
import { AnomalyDashboard } from '../components/ai/AnomalyDashboard';

export default function AIDashboard() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Corporate AI & Signage Intelligence</h2>
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 ml-2">FASE 9.7 (APEX)</Badge>
          </div>
          <p className="text-slate-300 text-xs">Copiloto Executivo, Modelagem Preditiva, Recomendações & Detecção de Anomalias</p>
        </div>

        <Button onClick={() => navigate('/representantes/dashboard')} variant="outline" className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao ERP
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Engine de IA</span>
              <strong className="text-lg font-bold text-purple-400">Gemini Pro 1.5</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Acurácia Preditiva</span>
              <strong className="text-lg font-bold text-emerald-400">98.5%</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Lightbulb className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Recomendações</span>
              <strong className="text-lg font-bold text-amber-400">2 Ativas</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Anomalias NOC</span>
              <strong className="text-lg font-bold text-blue-400">0 Críticas</strong>
            </div>
          </CardContent>
        </Card>
      </div>

      <ExecutiveCopilotDashboard empresaOperadoraId={empresaOperadoraId || undefined} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <PredictionsDashboard />
        <RecommendationsDashboard />
        <AnomalyDashboard />
      </div>
    </div>
  );
}
