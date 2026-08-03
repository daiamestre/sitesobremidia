import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeiroService } from '../services/financeiro.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Landmark, ArrowLeft, Loader2, TrendingUp, TrendingDown } from 'lucide-react';

export default function CashFlowDashboard() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();
  const [fluxo, setFluxo] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFluxo = useCallback(async () => {
    setLoading(true);
    const data = await financeiroService.generateCashFlow(empresaOperadoraId || undefined);
    setFluxo(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchFluxo();
  }, [fetchFluxo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalEntradas = fluxo.filter(f => f.tipo === 'ENTRADA').reduce((a, c) => a + Number(c.valor_previsto), 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-display font-extrabold text-white flex items-center gap-2">
            <Landmark className="h-6 w-6 text-blue-400" />
            Dashboard de Fluxo de Caixa (Previsto vs. Realizado)
          </h2>
          <p className="text-xs text-slate-300">Projeções diárias, mensais e anuais de caixa</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/financeiro')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Financeiro
        </Button>
      </div>

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="pb-3 border-b border-white/10">
          <CardTitle className="text-base font-bold text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-blue-400" />
              Lançamentos de Caixa ({fluxo.length})
            </span>
            <Badge className="bg-blue-500/20 text-blue-300">
              Total Entradas: R$ {totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-4">
          {fluxo.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">Nenhum lançamento no fluxo de caixa.</div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow className="border-white/10">
                    <TableHead className="text-slate-300">Descrição</TableHead>
                    <TableHead className="text-slate-300">Categoria</TableHead>
                    <TableHead className="text-slate-300">Data Prevista</TableHead>
                    <TableHead className="text-slate-300">Valor Previsto</TableHead>
                    <TableHead className="text-slate-300">Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fluxo.map((f) => (
                    <TableRow key={f.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="font-bold text-white text-xs">{f.descricao}</TableCell>
                      <TableCell className="text-xs text-slate-400">{f.categoria}</TableCell>
                      <TableCell className="text-xs text-slate-300">
                        {new Date(f.data_prevista).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-emerald-400">
                        R$ {Number(f.valor_previsto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge className={f.tipo === 'ENTRADA' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}>
                          {f.tipo}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
