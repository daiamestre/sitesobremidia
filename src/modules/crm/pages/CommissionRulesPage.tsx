import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PieChart, ArrowLeft, Sliders } from 'lucide-react';

export default function CommissionRulesPage() {
  const navigate = useNavigate();

  const regras = [
    { cargo: 'REPRESENTANTE', tipo: 'PERCENTUAL', percentual: 5.0, descricao: 'Comissão sobre vendas diretas de contratos' },
    { cargo: 'SUPERVISOR', tipo: 'PERCENTUAL', percentual: 2.0, descricao: 'Comissão de supervisão de equipe' },
    { cargo: 'GERENTE', tipo: 'PERCENTUAL', percentual: 1.0, descricao: 'Comissão de gerência de unidade de mídia' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <PieChart className="h-6 w-6 text-purple-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Regras Dinâmicas de Comissão</h2>
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 ml-2">FASE 9.1-B</Badge>
          </div>
          <p className="text-slate-300 text-xs">Configuração por Cargo, Faixa de Faturamento e Produtos</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/financeiro')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Financeiro
        </Button>
      </div>

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="pb-3 border-b border-white/10">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <Sliders className="h-4 w-4 text-purple-400" /> Regras Ativas de Comissão
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">Parâmetros configuráveis sem alteração de código.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {regras.map((r) => (
            <div key={r.cargo} className="p-4 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
              <div>
                <strong className="text-white block text-sm">{r.cargo}</strong>
                <span className="text-slate-400 text-xs">{r.descricao}</span>
              </div>
              <Badge className="bg-purple-500/20 text-purple-300 font-mono text-xs px-3 py-1">
                {r.percentual}% ({r.tipo})
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
