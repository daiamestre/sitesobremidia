import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { dreService, DREResult } from '../services/dre.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, ArrowLeft, Loader2, DollarSign } from 'lucide-react';

export default function DREPage() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();
  const [dre, setDre] = useState<DREResult | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDRE = useCallback(async () => {
    setLoading(true);
    const data = await dreService.calculateDRE(empresaOperadoraId || undefined, 2026);
    setDre(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchDRE();
  }, [fetchDRE]);

  if (loading || !dre) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Demonstração do Resultado do Exercício (DRE)</h2>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 ml-2">FASE 9.1-B</Badge>
          </div>
          <p className="text-slate-300 text-xs">Demonstrativo Financeiro Consolidado — Exercício 2026</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/financeiro')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Financeiro
        </Button>
      </div>

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl overflow-hidden">
        <CardHeader className="pb-3 border-b border-white/10 bg-slate-950/60">
          <CardTitle className="text-base font-bold text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-400" /> DRE Gerencial Consolidado
            </span>
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">Apuração de Receita Bruta, Custos, Margem e EBITDA</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-3 text-xs">
          <div className="flex justify-between py-2 border-b border-white/5 font-semibold text-slate-200">
            <span>(+) Receita Bruta de Vendas (Mídia Signage)</span>
            <span className="font-mono text-emerald-400">R$ {dre.receitaBruta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex justify-between py-2 border-b border-white/5 text-slate-400">
            <span>(-) Descontos Concedidos</span>
            <span className="font-mono text-rose-400">R$ {dre.descontos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex justify-between py-2 border-b border-white/10 font-bold text-white bg-slate-950/40 px-3 rounded-lg">
            <span>(=) RECEITA LÍQUIDA DE VENDAS</span>
            <span className="font-mono text-emerald-400">R$ {dre.receitaLiquida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex justify-between py-2 border-b border-white/5 text-slate-400">
            <span>(-) Custos Operacionais NOC & Transmissão (35%)</span>
            <span className="font-mono text-rose-400">R$ {dre.custosOperacionais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex justify-between py-2 border-b border-white/10 font-bold text-white bg-slate-950/40 px-3 rounded-lg">
            <span>(=) MARGEM BRUTA DE LUCRO</span>
            <span className="font-mono text-emerald-400">R$ {dre.margemBruta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex justify-between py-2 border-b border-white/5 text-slate-400">
            <span>(-) Despesas Administrativas & Vendas (15%)</span>
            <span className="font-mono text-rose-400">R$ {dre.despesasAdministrativas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex justify-between py-3 font-extrabold text-sm text-white bg-emerald-950/40 border border-emerald-500/30 p-3 rounded-xl">
            <span>(=) RESULTADO LÍQUIDO DO EXERCÍCIO (EBITDA)</span>
            <span className="font-mono text-emerald-400">R$ {dre.resultadoLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
