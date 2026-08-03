import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, ArrowLeft, MapPin } from 'lucide-react';

export default function CostCenterPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-purple-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Centros de Custo & Unidades</h2>
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 ml-2">FASE 9.1-B</Badge>
          </div>
          <p className="text-slate-300 text-xs">Mapeamento por Cidade, Unidade, Painel de LED e Departamento</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/financeiro')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Financeiro
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardHeader className="pb-3 border-b border-white/10">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <MapPin className="h-4 w-4 text-purple-400" /> Centro de Custo — Região Sul
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">Pontos de mídia corporativa de Curitiba e Porto Alegre.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-white/5 text-slate-300">
              <span>Código:</span>
              <strong className="text-white font-mono">CC-SUL-01</strong>
            </div>
            <div className="flex justify-between py-1 text-slate-300">
              <span>Status Operacional:</span>
              <Badge className="bg-emerald-500/20 text-emerald-400">Ativo</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardHeader className="pb-3 border-b border-white/10">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <MapPin className="h-4 w-4 text-purple-400" /> Centro de Custo — Região Sudeste
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">Painéis digitais de São Paulo e Rio de Janeiro.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-white/5 text-slate-300">
              <span>Código:</span>
              <strong className="text-white font-mono">CC-SUDESTE-02</strong>
            </div>
            <div className="flex justify-between py-1 text-slate-300">
              <span>Status Operacional:</span>
              <Badge className="bg-emerald-500/20 text-emerald-400">Ativo</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
